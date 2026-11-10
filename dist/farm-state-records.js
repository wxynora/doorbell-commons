import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
export {writeFarmStatePaths,readFarmStateRevision,findFarmIdByHumanKey,appendFarmStateItems} from "./farm-state-writer.js";

// Each row is one entity's scalar fields, a collection, or a scalar value.
// Nested objects/collections have their own rows; an entire farm/world is
// never serialized into one value. Stable members keep deletion of one fish
// from renumbering and rewriting every remaining inventory entry.
const own = (value, key) => Object.hasOwn(value, key);
const scalar = value => value === null || typeof value === "string" ||
    typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
const token = value => String(value).replaceAll("~", "~0").replaceAll("/", "~1");
export const farmRecordPath = parts => parts.length ? "/" + parts.map(token).join("/") : "";
const childPath = (parent, key) => `${parent}/${token(key)}`;
const canonical = value => Array.isArray(value) ? value.map(canonical) :
    value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function memberIdentity(value) {
    if (value && typeof value === "object" && !Array.isArray(value) && own(value, "id") && scalar(value.id))
        return `id:${JSON.stringify(value.id)}`;
    return "value:" + createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

const objectFields = value => Object.fromEntries(Object.keys(value).sort()
    .filter(key => scalar(value[key])).map(key => [key, value[key]]));
const plainObject = value => value != null && typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Compare first; only changed branches need the durable record encoding.
export function diffFarmStateRecords(before, after) {
    const changes = [];
    const branch = (value, path, parent, member) => new Map(
        [...encodeStateRecords(value)].map(([relative, row]) => {
            const key = path + relative;
            return [key, {...row, path:key, parent:relative ? path + row.parent : parent,
                member:relative ? row.member : member}];
        }),
    );
    const visit = (left, right, path, parent, member) => {
        if (isDeepStrictEqual(left, right)) return;
        if (plainObject(left) && plainObject(right)) {
            const row = value => ({path,parent,member,previous:null,kind:"object",fieldsJson:JSON.stringify(objectFields(value))});
            const a = row(left), b = row(right);
            if (a.fieldsJson !== b.fieldsJson) changes.push({path,before:a,after:b});
            for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
                const a = own(left,key) && !scalar(left[key]);
                const b = own(right,key) && !scalar(right[key]);
                if (b && right[key] === undefined && (!a || left[key] !== undefined)) throw new TypeError("farm_state_not_json");
                if (a || b) visit(a ? left[key] : undefined,b ? right[key] : undefined,childPath(path,key),path,key);
            }
            return;
        }
        for (const change of stateRecordChanges(
            left === undefined ? new Map() : branch(left,path,parent,member),
            right === undefined ? new Map() : branch(right,path,parent,member),
        )) changes.push(change);
    };
    visit(before, after, "", null, null);
    return changes;
}

export function encodeStateRecords(value) {
    const rows = new Map(), ancestors = new Set();
    const visit = (value, path, parent, member, previous) => {
        let kind, fields;
        if (scalar(value)) { kind = "value"; fields = value; }
        else {
            if (!value || typeof value !== "object" || ancestors.has(value) ||
                (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))))
                throw new TypeError("farm_state_not_json");
            kind = Array.isArray(value) ? "array" : "object";
            fields = kind === "array" ? null : objectFields(value);
        }
        rows.set(path, { path, parent, member, previous, kind, fieldsJson: JSON.stringify(fields) });
        if (kind === "value") return;
        ancestors.add(value);
        if (kind === "array") {
            const occurrences = new Map();
            let previousMember = null;
            for (const entry of value) {
                const identity = memberIdentity(entry), occurrence = occurrences.get(identity) ?? 0;
                occurrences.set(identity, occurrence + 1);
                const key = `${identity}#${occurrence}`;
                visit(entry, childPath(path, key), path, key, previousMember);
                previousMember = key;
            }
            rows.get(path).fieldsJson = JSON.stringify({length:value.length,tail:previousMember});
        } else {
            for (const key of Object.keys(value).sort()) {
                if (!scalar(value[key])) visit(value[key], childPath(path, key), path, key, null);
            }
        }
        ancestors.delete(value);
    };
    visit(value, "", null, null, null);
    return rows;
}

export function decodeStateRecords(rows, root = "") {
    const children = new Map();
    for (const row of rows.values()) {
        if (!children.has(row.parent)) children.set(row.parent, []);
        children.get(row.parent).push(row);
    }
    const active = new Set();
    const visit = path => {
        const row = rows.get(path);
        if (!row || active.has(path)) throw new Error("farm_state_record_corrupt");
        active.add(path);
        const entries = children.get(path) ?? [];
        let value;
        if (row.kind === "value") {
            value = JSON.parse(row.fieldsJson);
            if (!scalar(value) || entries.length) throw new Error("farm_state_record_corrupt");
        } else if (row.kind === "object") {
            value = JSON.parse(row.fieldsJson);
            if (!value || Array.isArray(value) || typeof value !== "object" || Object.values(value).some(v => !scalar(v)))
                throw new Error("farm_state_record_corrupt");
            for (const child of entries) {
                if (own(value, child.member)) throw new Error("farm_state_record_corrupt");
                Object.defineProperty(value, child.member, {value: visit(child.path), writable: true, enumerable: true, configurable: true});
            }
        } else if (row.kind === "array") {
            value = [];
            const byPrevious = new Map();
            for (const child of entries) {
                if (byPrevious.has(child.previous)) throw new Error("farm_state_record_order_corrupt");
                byPrevious.set(child.previous, child);
            }
            let previous = null;
            for (let index = 0; index < entries.length; index++) {
                const child = byPrevious.get(previous);
                if (!child) throw new Error("farm_state_record_order_corrupt");
                value.push(visit(child.path)); previous = child.member;
            }
            if (byPrevious.has(previous)) throw new Error("farm_state_record_order_corrupt");
        } else throw new Error("farm_state_record_corrupt");
        active.delete(path);
        return value;
    };
    return visit(root);
}

export function sameStateRecord(left, right) {
    return left?.kind === right?.kind && left?.parent === right?.parent && left?.member === right?.member &&
        left?.previous === right?.previous && left?.fieldsJson === right?.fieldsJson;
}
export function stateRecordChanges(before, after) {
    const changes = [];
    for (const [path, row] of after) if (!sameStateRecord(before.get(path), row)) changes.push({path, before: before.get(path), after: row});
    for (const [path, row] of before) if (!after.has(path)) changes.push({path, before: row, after: undefined});
    return changes;
}

export const FARM_RECORD_SCHEMA_SQL = `
  CREATE TABLE farm_domain_records (
    farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE CASCADE,
    record_path TEXT NOT NULL, parent_path TEXT, member_key TEXT, previous_key TEXT,
    record_kind TEXT NOT NULL CHECK(record_kind IN ('object','array','value')),
    fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
    PRIMARY KEY(farm_id,record_path)
  ) WITHOUT ROWID;
  CREATE INDEX farm_domain_records_parent ON farm_domain_records(farm_id,parent_path,previous_key);
  CREATE INDEX farm_domain_records_human_key ON farm_domain_records(json_extract(fields_json,'$.humanKey')) WHERE record_path='';
  CREATE TABLE world_domain_records (
    component_key TEXT NOT NULL REFERENCES world_components(component_key) ON DELETE CASCADE,
    record_path TEXT NOT NULL, parent_path TEXT, member_key TEXT, previous_key TEXT,
    record_kind TEXT NOT NULL CHECK(record_kind IN ('object','array','value')),
    fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
    PRIMARY KEY(component_key,record_path)
  ) WITHOUT ROWID;
  CREATE INDEX world_domain_records_parent ON world_domain_records(component_key,parent_path,previous_key);
`;

const columns = "record_path,parent_path,member_key,previous_key,record_kind,fields_json";
export const recordFromRow = row => ({path: row.record_path, parent: row.parent_path, member: row.member_key,
    previous: row.previous_key, kind: row.record_kind, fieldsJson: row.fields_json});
const storage = type => type === "farm" ? ["farm_domain_records", "farm_id"] : ["world_domain_records", "component_key"];

export function readStoredRecords(database, type, owner, path = "") {
    const [table, key] = storage(type);
    const prefix = path + "/";
    const rows = path === "" ? database.prepare(`SELECT ${columns} FROM ${table} WHERE ${key}=?`).all(owner)
        : database.prepare(`SELECT ${columns} FROM ${table} WHERE ${key}=? AND
            (record_path=? OR (record_path>=? AND record_path<?))`).all(owner, path, prefix, path + "0");
    return new Map(rows.map(row => [row.record_path, recordFromRow(row)]));
}

// Path reads return only the requested field/subtree. Scalar fields live in
// their owning entity row, so an inventory query never loads unrelated state.
export function readFarmStatePath(database, farmId, parts = []) {
    return readStatePath(database, "farm", farmId, parts);
}
export function readWorldStatePath(database, component, parts = []) {
    return readStatePath(database, "world", component, parts);
}
export function readFarmStatePaths(database, farmId, paths) {
    return readStatePaths(database, "farm", farmId, paths);
}
export function readWorldStatePaths(database, component, paths) {
    return readStatePaths(database, "world", component, paths);
}
export function readFarmStatePathsForFarms(database, farmIds, paths) {
    const queries = [], parameters = [], exact = new Set();
    const add = (condition, values) => {
        queries.push(`SELECT farm_id,${columns} FROM farm_domain_records
          WHERE farm_id IN (SELECT value FROM json_each(?)) AND ${condition}`);
        parameters.push(JSON.stringify(farmIds), ...values);
    };
    for (const parts of paths) {
        const path = farmRecordPath(parts); exact.add(path);
        if (parts.length) exact.add(farmRecordPath(parts.slice(0, -1)));
        add("record_path>=? AND record_path<?", [path + "/", path + "0"]);
    }
    for (const path of exact) add("record_path=?", [path]);
    const byFarm = new Map(farmIds.map(id => [id, new Map()]));
    if (queries.length && farmIds.length) for (const row of database.prepare(queries.join(" UNION ALL ")).all(...parameters))
        byFarm.get(row.farm_id).set(row.record_path, recordFromRow(row));
    return new Map([...byFarm].map(([id, rows]) => [id, projectPaths(rows, paths)]));
}
function readStatePaths(database, type, owner, paths) {
    return projectPaths(readStateRecordPaths(database,type,owner,paths),paths);
}
export function readStateRecordPaths(database, type, owner, paths) {
    const [table, key] = storage(type), queries = [], parameters = [];
    const add = (condition, values) => {
        queries.push(`SELECT ${columns} FROM ${table} WHERE ${key}=? AND ${condition}`);
        parameters.push(owner, ...values);
    };
    const exact = new Set();
    for (const parts of paths) {
        const path = farmRecordPath(parts);
        exact.add(path);
        for (let depth=0;depth<parts.length;depth++) exact.add(farmRecordPath(parts.slice(0,depth)));
        if (path) add("record_path>=? AND record_path<?", [path + "/", path + "0"]);
        else add("record_path>=?", [""]);
    }
    for (const path of exact) add("record_path=?", [path]);
    if (!queries.length) return new Map();
    const rows = new Map(database.prepare(queries.join(" UNION ALL ")).all(...parameters)
        .map(row => [row.record_path, recordFromRow(row)]));
    return rows;
}
function projectPaths(rows, paths) {
    let result = {};
    for (const parts of paths) {
        const path = farmRecordPath(parts);
        const parent = rows.get(farmRecordPath(parts.slice(0, -1)));
        const value = rows.has(path) ? decodeStateRecords(rows, path) : parent?.kind === "object"
            ? JSON.parse(parent.fieldsJson)[parts.at(-1)] : undefined;
        if (value === undefined) continue;
        if (!parts.length) { result = value; continue; }
        let target = result;
        for (const part of parts.slice(0, -1)) {
            if (!own(target, part)) Object.defineProperty(target, part, {value: {}, writable: true, enumerable: true, configurable: true});
            target = target[part];
        }
        Object.defineProperty(target, parts.at(-1), {value, writable: true, enumerable: true, configurable: true});
    }
    return result;
}

export function readFarmCollectionItem(database, farmId, parts, selector) {
    const parent = farmRecordPath(parts);
    let path;
    if (own(selector, "id")) path = childPath(parent, `id:${JSON.stringify(selector.id)}#0`);
    else if (Number.isSafeInteger(selector.index) && selector.index >= 0) {
        const row = database.prepare(`WITH RECURSIVE ordered(record_path,member_key,n) AS (
          SELECT record_path,member_key,0 FROM farm_domain_records
          WHERE farm_id=? AND parent_path=? AND previous_key IS NULL
          UNION ALL SELECT next.record_path,next.member_key,ordered.n+1 FROM farm_domain_records next
          JOIN ordered ON next.previous_key=ordered.member_key
          WHERE next.farm_id=? AND next.parent_path=? AND ordered.n<?
        ) SELECT record_path FROM ordered WHERE n=?`).get(farmId, parent, farmId, parent, selector.index, selector.index);
        path = row?.record_path;
    } else throw new TypeError("invalid_farm_collection_selector");
    if (!path) return undefined;
    const rows = readStoredRecords(database, "farm", farmId, path);
    return rows.has(path) ? decodeStateRecords(rows, path) : undefined;
}

export function findFarmStateEntries(database, farmId, parts, filters = {}) {
    return findStateEntries(database, "farm", farmId, parts, filters);
}
export function findWorldStateEntries(database, component, parts, filters = {}) {
    return findStateEntries(database, "world", component, parts, filters);
}
function findStateEntries(database, type, owner, parts, filters) {
    const [table, key] = storage(type);
    const clauses = [`${key}=?`, "parent_path=?"], parameters = [owner, farmRecordPath(parts)];
    for (const [group, op] of [["eq", "="], ["gte", ">="], ["lt", "<"]]) {
        for (const [field, value] of Object.entries(filters[group] ?? {})) {
            clauses.push(`json_extract(fields_json,?) ${op} ?`);
            parameters.push(`$.${JSON.stringify(field)}`, typeof value === "boolean" ? Number(value) : value);
        }
    }
    const recordsByMatch=new Map();
    const rows=database.prepare(`WITH matches AS MATERIALIZED (
      SELECT ${columns} FROM ${table} WHERE ${clauses.join(" AND ")}
    ) SELECT record_path AS match_path,${columns} FROM matches
    UNION ALL SELECT m.record_path AS match_path,${columns.split(",").map(column=>"r."+column).join(",")}
      FROM matches m JOIN ${table} r ON r.${key}=?
       AND r.record_path>=m.record_path||'/' AND r.record_path<m.record_path||'0'`).all(...parameters,owner);
    for (const row of rows) {
        if (!recordsByMatch.has(row.match_path)) recordsByMatch.set(row.match_path,new Map());
        recordsByMatch.get(row.match_path).set(row.record_path,recordFromRow(row));
    }
    return [...recordsByMatch].map(([path,records])=>decodeStateRecords(records,path));
}
function readStatePath(database, type, owner, parts) {
    const path = farmRecordPath(parts), rows = readStoredRecords(database, type, owner, path);
    if (rows.has(path)) return decodeStateRecords(rows, path);
    if (!parts.length) return undefined;
    const [table, key] = storage(type);
    const parent = database.prepare(`SELECT fields_json,record_kind FROM ${table} WHERE ${key}=? AND record_path=?`)
        .get(owner, farmRecordPath(parts.slice(0, -1)));
    if (!parent || parent.record_kind !== "object") return undefined;
    return JSON.parse(parent.fields_json)[parts.at(-1)];
}

export function writeRecordChanges(database, type, owner, changes) {
    const [table, key] = storage(type);
    const upsert = database.prepare(`INSERT INTO ${table}(${key},${columns}) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(${key},record_path) DO UPDATE SET parent_path=excluded.parent_path,
        member_key=excluded.member_key,previous_key=excluded.previous_key,
        record_kind=excluded.record_kind,fields_json=excluded.fields_json`);
    const remove = database.prepare(`DELETE FROM ${table} WHERE ${key}=? AND record_path=?`);
    for (const change of changes) {
        const row = change.after;
        if (row) upsert.run(owner, row.path, row.parent, row.member, row.previous, row.kind, row.fieldsJson);
        else remove.run(owner, change.path);
    }
}
