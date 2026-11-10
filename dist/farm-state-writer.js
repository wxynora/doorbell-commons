import { encodeStateRecords, farmRecordPath, stateRecordChanges, writeRecordChanges, readStateRecordPaths, recordFromRow } from "./farm-state-records.js";

let sequence = 0;
export function readFarmStateRevision(database, farmId) {
    return database.prepare("SELECT state_revision FROM farm_states WHERE farm_id=?").get(farmId)?.state_revision;
}
export function findFarmIdByHumanKey(database, humanKey) {
    return database.prepare(`SELECT f.farm_id FROM farm_domain_records r JOIN farm_states f ON f.farm_id=r.farm_id
      WHERE r.record_path='' AND json_extract(r.fields_json,'$.humanKey')=? ORDER BY f.position LIMIT 1`).get(humanKey)?.farm_id;
}

// The local before-images contain only this mutation's paths. Nothing is
// retained between calls; no gameplay read is routed through this writer.
export function writeFarmStatePaths(database, farmId, updates, options = {}) {
    const nested=database.isTransaction, savepoint=`farm_fields_${++sequence}`;
    database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
        const metadata=database.prepare("SELECT resident_id,state_revision FROM farm_states WHERE farm_id=?").get(farmId);
        if (!metadata) throw new Error("farm_state_unavailable");
        if (options.expectedRevision!==undefined && metadata.state_revision!==options.expectedRevision) throw new Error("farm_state_conflict");
        const previous=readStateRecordPaths(database,"farm",farmId,updates.map(update=>update.path));
        const next=new Map(previous);
        for (const {path:parts,value} of updates) {
            if (!Array.isArray(parts)||!parts.length) throw new TypeError("farm_field_path_required");
            if (value===undefined && !next.has(farmRecordPath(parts.slice(0,-1)))) continue;
            for (let depth=1;depth<parts.length;depth++) {
                const path=farmRecordPath(parts.slice(0,depth));
                if (!next.has(path)) {
                    const parent=next.get(farmRecordPath(parts.slice(0,depth-1)));
                    if (!parent || parent.kind!=="object" || Object.hasOwn(JSON.parse(parent.fieldsJson),parts[depth-1]))
                        throw new Error("farm_state_parent_unavailable");
                    next.set(path,{path,parent:parent.path,member:parts[depth-1],previous:null,kind:"object",fieldsJson:"{}"});
                }
            }
            const path=farmRecordPath(parts),parentPath=farmRecordPath(parts.slice(0,-1));
            const parent=next.get(parentPath);
            if (!parent||parent.kind!=="object") throw new Error("farm_state_parent_unavailable");
            const fields=JSON.parse(parent.fieldsJson);
            delete fields[parts.at(-1)];
            for (const key of next.keys()) if (key===path||key.startsWith(path+"/")) next.delete(key);
            if (typeof value==="number" && !Number.isFinite(value)) throw new TypeError("farm_state_not_json");
            if (value===null || ["string","number","boolean"].includes(typeof value))
                Object.defineProperty(fields,parts.at(-1),{value,writable:true,enumerable:true,configurable:true});
            else if (value!==undefined) for (const [key,row] of encodeStateRecords(value,{path,parent:parentPath,member:parts.at(-1)}))
                next.set(key,row);
            next.set(parentPath,{...parent,fieldsJson:JSON.stringify(Object.fromEntries(Object.keys(fields).sort().map(key=>[key,fields[key]])))});
        }
        const insertOnly=[];
        for (const {path:parts,values} of options.appendItems??[]) {
            if (!values.length) continue;
            const path=farmRecordPath(parts);
            if (!next.has(path)) {
                const raw=database.prepare(`SELECT record_path,parent_path,member_key,previous_key,record_kind,fields_json
                    FROM farm_domain_records WHERE farm_id=? AND record_path=?`).get(farmId,path);
                if (raw) {const row=recordFromRow(raw);previous.set(path,row);next.set(path,row);}
            }
            const collection=next.get(path);
            if (collection?.kind!=="array") throw new Error("farm_collection_unavailable");
            const old=JSON.parse(collection.fieldsJson),added=encodeStateRecords(values);
            const info=JSON.parse(added.get("").fieldsJson);
            for (const row of added.values()) {
                if (!row.path) continue;
                const top=row.parent==="";
                insertOnly.push({...row,path:path+row.path,parent:path+row.parent,
                    previous:top&&row.previous===null ? old.tail : row.previous});
            }
            next.set(path,{...collection,fieldsJson:JSON.stringify({length:old.length+values.length,tail:info.tail})});
        }
        const changes=stateRecordChanges(previous,next);
        if (changes.length || insertOnly.length) {
            const binding=next.get("/doorbellMcpMigration");
            const residentId=binding?.kind==="object" ? JSON.parse(binding.fieldsJson).residentId??null : metadata.resident_id;
            const result=database.prepare(`UPDATE farm_states SET state_revision=state_revision+1,resident_id=? WHERE farm_id=? AND state_revision=?`)
                .run(residentId,farmId,metadata.state_revision);
            if (result.changes!==1) throw new Error("farm_state_conflict");
            writeRecordChanges(database,"farm",farmId,changes);
            if (insertOnly.length) {
                const insert=database.prepare(`INSERT INTO farm_domain_records(farm_id,record_path,parent_path,member_key,previous_key,record_kind,fields_json) VALUES(?,?,?,?,?,?,?)`);
                for (const row of insertOnly) insert.run(farmId,row.path,row.parent,row.member,row.previous,row.kind,row.fieldsJson);
            }
        }
        database.exec(nested ? `RELEASE ${savepoint}` : "COMMIT");
        return {changed:changes.length+insertOnly.length,revision:metadata.state_revision+Number(Boolean(changes.length||insertOnly.length)),
            recordChanges:[...changes,...insertOnly.map(after=>({path:after.path,after}))]};
    } catch (error) {
        database.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : "ROLLBACK");
        throw error;
    }
}
export function appendFarmStateItems(database,farmId,path,values,options={}) {
    return writeFarmStatePaths(database,farmId,[],{...options,appendItems:[{path,values}]});
}
