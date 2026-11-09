import { measureFarmPhase } from "./server/farm-request-timing.js";
import {wakeGuestbookJudgments,enqueueGuestbookMessageChanges} from './server/doorbell/guestbook-judgments.mjs';
import {encodeStateRecords,decodeStateRecords,stateRecordChanges,readStoredRecords,writeRecordChanges} from './farm-state-records.js';
import {snapshotFarmMutation,planFarmMutation} from './farm-mutation-scope.js';
import {
    canonicalFarmWorldJson,
    decomposeFarmForPersistence,
    exportFarmWorldFromDatabase,
} from "./farm-world-sqlite-migration.js";
import { runLingyeWorldTransaction } from "./lingye-world-database.js";

const REQUIRED_WORLD_COMPONENT_KEYS = Object.freeze([
    "maintenanceGrantIds",
    "doorbellWelcomeRewardGrants",
    "doorbellFarmCreations",
    "ugc",
    "glimmer",
    "publicExpedition",
    "qixiLantern2026",
    "nature",
]);

const CHEF_STORE_SCOPE = "/chefStoreOrderReceipts";
const DEFERRED_CROSS_DOMAIN_SCOPES = new Set([
    "/doorbellMomentsRaffleReceipts",
    "/doorbellMomentsGiftReceipts",
    "/doorbellHumanMarketActionReceipts",
    "/doorbellHumanNeighborhoodMessageReceipts",
    "/doorbellHumanOriginalPlantActionReceipts",
    "/doorbellHumanRanchInteractionActionReceipts",
]);

export class FarmWorldPersistenceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "FarmWorldPersistenceError";
        this.code = code;
    }
}

function fail(code, message) {
    throw new FarmWorldPersistenceError(code, message);
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text, label) {
    try {
        return JSON.parse(text);
    }
    catch {
        fail("farm_persistence_corrupt", `Stored JSON is invalid: ${label}`);
    }
}

function sameJson(left, right) {
    const canonicalLeft = canonicalFarmWorldJson(parseJson(left, "comparison:left"));
    if (typeof left === "string" && left === right) return true;
    return canonicalLeft === canonicalFarmWorldJson(parseJson(right, "comparison:right"));
}

function assertDatabase(database) {
    if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function")
        fail("farm_persistence_database_required", "Farm persistence requires the shared Lingye DatabaseSync");
    const journalMode = database.prepare("PRAGMA journal_mode").get()?.journal_mode;
    if (journalMode !== "delete")
        fail("farm_persistence_journal_mode_invalid", "Farm persistence requires rollback-journal DELETE mode");
}

function receiptKey(receipt) {
    return `${receipt.scope}\u0000${receipt.receiptKey}`;
}

function readReceiptRows(database, farmId) {
    return database.prepare(`
      SELECT farm_id, scope, receipt_key, payload_hash, result_json
      FROM farm_action_receipts
      WHERE farm_id = ?
      ORDER BY scope, receipt_key
    `).all(farmId);
}

// Compare already validated, freshly serialized receipts inside SQLite. Only
// differences cross back into JS; no historical result cache is kept. The PK
// lookup remains (farm_id, scope, receipt_key), including for a new receipt.
function receiptDifferences(database, farmId, receipts, partial = false) {
    if (partial && receipts.length === 0) return [];
    const candidates = new Map();
    for (const receipt of receipts) {
        const key = receiptKey(receipt);
        if (candidates.has(key))
            fail("farm_receipt_duplicate", `Farm receipt is duplicated: ${receipt.scope}/${receipt.receiptKey}`);
        candidates.set(key, receipt);
    }
    const rows = database.prepare(`
      WITH incoming AS MATERIALIZED (
        SELECT json_extract(value, '$[0]') AS scope,
               json_extract(value, '$[1]') AS receipt_key,
               json_extract(value, '$[2]') AS payload_hash,
               json_extract(value, '$[3]') AS result_json
        FROM json_each(?)
      )
      SELECT incoming.scope, incoming.receipt_key, stored.farm_id,
             stored.payload_hash, stored.result_json
      FROM incoming LEFT JOIN farm_action_receipts AS stored
        ON stored.farm_id = ? AND stored.scope = incoming.scope
          AND stored.receipt_key = incoming.receipt_key
      WHERE stored.farm_id IS NULL OR stored.payload_hash != incoming.payload_hash
         OR stored.result_json != incoming.result_json
    `).all(JSON.stringify(receipts.map(r => [r.scope, r.receiptKey, r.payloadHash, r.resultJson])), farmId);
    const count = partial ? null : database.prepare("SELECT COUNT(*) AS count FROM farm_action_receipts WHERE farm_id = ?").get(farmId).count;
    const additions = rows.filter(row => row.farm_id === null).length;
    if (!partial && count !== receipts.length - additions) {
        const keys = database.prepare("SELECT scope, receipt_key FROM farm_action_receipts WHERE farm_id = ?").all(farmId);
        const removed = keys.find(row => !candidates.has(`${row.scope}\u0000${row.receipt_key}`));
        if (removed)
            fail("farm_receipt_removal_forbidden", `Farm receipt cannot be removed: ${removed.scope}/${removed.receipt_key}`);
    }
    return rows.map(row => ({ receipt: candidates.get(`${row.scope}\u0000${row.receipt_key}`),
        existing: row.farm_id === null ? undefined : row }));
}

function sameReceiptMetadata(existing, candidate) {
    return existing.payload_hash === candidate.payloadHash;
}

function failDeferredReceiptScope(scope, options = {}) {
    if (DEFERRED_CROSS_DOMAIN_SCOPES.has(scope) && options.allowCrossDomain !== true)
        fail("farm_cross_domain_scope_unsupported", `Farm cross-domain receipt scope is not connected in Phase 2: ${scope}`);
}

function chefStoreState(resultJson, label) {
    const result = parseJson(resultJson, label);
    return isRecord(result) && typeof result.state === "string" ? result.state : null;
}

function assertChefStoreTransition(existing, receipt, options) {
    const nextState = chefStoreState(receipt.resultJson, `chef-store:${receipt.receiptKey}:next`);
    if (!existing) {
        if (nextState !== "pending" || options.durableBoundary !== true)
            fail("farm_chef_store_transition_forbidden", "A Chef store receipt must begin as a standalone pending checkpoint");
        return;
    }
    const currentState = chefStoreState(existing.result_json, `chef-store:${receipt.receiptKey}:current`);
    if (currentState === "pending" && nextState === "inventory_applied") {
        if (options.durableBoundary !== true || options.mutationFarmCount < 2)
            fail("farm_chef_store_transition_forbidden", "Chef store inventory_applied requires a standalone multi-farm checkpoint");
        return;
    }
    if ((currentState === "inventory_applied" || currentState === "completed") && nextState === "completed")
        return;
    fail("farm_chef_store_transition_forbidden", `Invalid Chef store receipt transition: ${currentState} -> ${nextState}`);
}

function synchronizeReceipts(database, farmId, receipts, options = {}) {
    let compared;
    if (options.validatedReceipts === true) {
        compared = receiptDifferences(database, farmId, receipts, options.partialReceipts === true);
    } else {
        // Public commitMutation may supply a pre-decomposed entry. Keep the
        // original parser/validation path for that untrusted representation.
        const existingRows = readReceiptRows(database, farmId);
        const existingByKey = new Map(existingRows.map(row => [`${row.scope}\u0000${row.receipt_key}`, row]));
        const candidates = new Map();
        for (const receipt of receipts) {
            const key = receiptKey(receipt);
            if (candidates.has(key))
                fail("farm_receipt_duplicate", `Farm receipt is duplicated: ${receipt.scope}/${receipt.receiptKey}`);
            candidates.set(key, receipt);
        }
        for (const existing of existingRows) {
            if (!candidates.has(`${existing.scope}\u0000${existing.receipt_key}`))
                fail("farm_receipt_removal_forbidden", `Farm receipt cannot be removed: ${existing.scope}/${existing.receipt_key}`);
        }
        compared = receipts.map(receipt => ({receipt, existing: existingByKey.get(receiptKey(receipt))}));
    }
    const insert = database.prepare(`
      INSERT INTO farm_action_receipts (
        farm_id, scope, receipt_key, payload_hash, result_json
      ) VALUES (?, ?, ?, ?, ?)
    `);
    const update = database.prepare(`
      UPDATE farm_action_receipts
      SET result_json = ?
      WHERE farm_id = ? AND scope = ? AND receipt_key = ?
        AND payload_hash = ? AND result_json = ?
    `);
    for (const { receipt, existing } of compared) {
        if (!existing) {
            if (options.durableBoundary === false && receipt.scope !== CHEF_STORE_SCOPE)
                fail("farm_durable_checkpoint_nested_forbidden", "A farm receipt checkpoint cannot be created inside an older outer transaction");
            if (receipt.scope === CHEF_STORE_SCOPE)
                assertChefStoreTransition(null, receipt, options);
            else
                failDeferredReceiptScope(receipt.scope, options);
            insert.run(
                farmId,
                receipt.scope,
                receipt.receiptKey,
                receipt.payloadHash,
                receipt.resultJson,
            );
            continue;
        }
        if (!sameReceiptMetadata(existing, receipt))
            fail("farm_receipt_conflict", `Farm receipt metadata changed: ${receipt.scope}/${receipt.receiptKey}`);
        if (sameJson(existing.result_json, receipt.resultJson))
            continue;
        if (options.durableBoundary === false && receipt.scope !== CHEF_STORE_SCOPE)
            fail("farm_durable_checkpoint_nested_forbidden", "A farm receipt checkpoint cannot change inside an older outer transaction");
        if (receipt.scope === CHEF_STORE_SCOPE) {
            assertChefStoreTransition(existing, receipt, options);
            const updated = update.run(
                receipt.resultJson,
                farmId,
                receipt.scope,
                receipt.receiptKey,
                receipt.payloadHash,
                existing.result_json,
            );
            if (updated.changes !== 1)
                fail("farm_receipt_conflict", `Chef store receipt transition lost its compare-and-set: ${receipt.receiptKey}`);
            continue;
        }
        failDeferredReceiptScope(receipt.scope, options);
        fail("farm_receipt_conflict", `Immutable farm receipt changed: ${receipt.scope}/${receipt.receiptKey}`);
    }
}

function farmPosition(database, farmId, requestedPosition) {
    const existing = database
        .prepare("SELECT position FROM farm_states WHERE farm_id = ?")
        .get(farmId);
    if (existing !== undefined) {
        if (requestedPosition !== undefined && requestedPosition !== existing.position)
            fail("farm_position_conflict", `Farm position changed: ${farmId}`);
        return { position: existing.position, exists: true };
    }
    if (!Number.isSafeInteger(requestedPosition) || requestedPosition < 0)
        fail("farm_position_required", `A new farm requires its world position: ${farmId}`);
    const occupied = database
        .prepare("SELECT farm_id FROM farm_states WHERE position = ?")
        .get(requestedPosition);
    if (occupied !== undefined)
        fail("farm_position_conflict", `Farm position is already occupied: ${requestedPosition}`);
    return { position: requestedPosition, exists: false };
}

function materializeFarm(database,entry,explicitReceipts) {
    const position=farmPosition(database,entry.id,entry.position);
    let plan;
    if (entry.before!==undefined || !position.exists) {
        const before=entry.before===null || !position.exists ? null : entry.before?.records ? entry.before : snapshotFarmMutation(entry.before);
        plan=planFarmMutation(entry.state,before,explicitReceipts);
    } else {
        // Explicit legacy mutation callers (for example an excluded activity)
        // still work; they read only the submitted farm, never the world.
        const decomposed=entry.decomposed??decomposeFarmForPersistence(entry.state,explicitReceipts);
        const beforeRecords=readStoredRecords(database,"farm",entry.id);
        const records=encodeStateRecords(decomposed.state);
        plan={beforeRecords,records,recordChanges:stateRecordChanges(beforeRecords,records),receipts:decomposed.receipts};
    }
    const receipts=plan.receipts??decomposeFarmForPersistence(entry.state,plan.receiptKeys,{receiptsOnly:true}).receipts;
    return {...entry,...plan,receipts,position,partialReceipts:plan.receipts===undefined || explicitReceipts!==undefined};
}

export function createFarmWorldSqlitePersistence(database) {
    assertDatabase(database);
    const commitEntries = input => {
        if (!isRecord(input)||!Array.isArray(input.farms)||!Array.isArray(input.components))
            throw new TypeError("Farm persistence mutation requires farms and components arrays");
        const durableBoundary=input.durableBoundary??!database.isTransaction;
        return runLingyeWorldTransaction(database,()=>{
            const farms=input.farms.map(entry=>{
                if (!isRecord(entry)||!isRecord(entry.state)||entry.state.id!==entry.id)
                    throw new TypeError("Farm persistence mutation has an invalid farm entry");
                return materializeFarm(database,entry,entry.receiptKeys);
            });
            const components=input.components.map(entry=>{
                if (!isRecord(entry)||typeof entry.key!=="string"||!entry.key||entry.key==="farms")
                    throw new TypeError("Farm persistence mutation has an invalid component entry");
                const value=entry.stateJson===undefined ? entry.value : parseJson(entry.stateJson,`component:${entry.key}`);
                const records=encodeStateRecords(value);
                const beforeRecords=entry.before===null ? new Map() : entry.before instanceof Map ? entry.before
                    : entry.before!==undefined ? encodeStateRecords(entry.before) : readStoredRecords(database,"world",entry.key);
                return {...entry,records,beforeRecords,changes:stateRecordChanges(beforeRecords,records)};
            });
            if (!durableBoundary && (farms.some(entry=>entry.recordChanges.length) || components.some(entry=>entry.changes.length)))
                fail("farm_durable_checkpoint_nested_forbidden","Only a receipt-only Chef completion may run inside an older outer transaction");
            const farmPlans=new Map(),componentPlans=new Map();
            for (const entry of farms) {
                const residentId=entry.state.doorbellMcpMigration?.residentId??null;
                if (!entry.position.exists)
                    database.prepare("INSERT INTO farm_states(farm_id,position,resident_id) VALUES(?,?,?)").run(entry.id,entry.position.position,residentId);
                else if (entry.recordChanges.length)
                    database.prepare("UPDATE farm_states SET resident_id=?,state_revision=state_revision+1 WHERE farm_id=?").run(residentId,entry.id);
                if (entry.position.exists && entry.recordChanges.some(change=>change.path==="/messages"||change.path.startsWith("/messages/"))) {
                    const beforeMessages=entry.beforeRecords.has("/messages") ? decodeStateRecords(entry.beforeRecords,"/messages") : [];
                    enqueueGuestbookMessageChanges(database,entry.id,beforeMessages,entry.state.messages??[]);
                }
                writeRecordChanges(database,"farm",entry.id,entry.recordChanges);
                measureFarmPhase("receiptSync",()=>synchronizeReceipts(database,entry.id,entry.receipts,{
                    allowCrossDomain:input.allowCrossDomain===true,durableBoundary,mutationFarmCount:farms.length,
                    validatedReceipts:entry.decomposed===undefined,partialReceipts:entry.partialReceipts,
                }));
                farmPlans.set(entry.id,entry.records);
            }
            for (const entry of components) {
                if (entry.changes.length) {
                    database.prepare("INSERT OR IGNORE INTO world_components(component_key) VALUES(?)").run(entry.key);
                    writeRecordChanges(database,"world",entry.key,entry.changes);
                }
                componentPlans.set(entry.key,entry.records);
            }
            return {farms:farms.map(entry=>entry.id),components:components.map(entry=>entry.key),durableBoundary,farmPlans,componentPlans};
        });
    };
    return Object.freeze({
        loadLegacyWorld(options={}) {
            const keys=database.prepare("SELECT component_key FROM world_components").all().map(row=>row.component_key);
            if (!keys.length) fail("farm_persistence_not_migrated","Farm world has not been imported into Lingye SQLite");
            const missing=REQUIRED_WORLD_COMPONENT_KEYS.filter(key=>!keys.includes(key));
            if (missing.length) fail("farm_persistence_corrupt",`Farm world is missing required components: ${missing.join(", ")}`);
            return exportFarmWorldFromDatabase(database,options);
        },
        commitMutation(input) {
            const result=commitEntries(input);
            wakeGuestbookJudgments(database);
            return result;
        },
        commitLegacySnapshot(world,hints) {
            if (!hints || !Array.isArray(hints.farmIds)||!Array.isArray(hints.componentKeys))
                throw new TypeError("Farm commit requires the current mutation scope");
            const byId=new Map(world.farms.map((farm,position)=>[farm.id,{state:farm,position}]));
            const farms=[...new Set(hints.farmIds)].map(id=>{
                const entry=byId.get(id);
                if (!entry) fail("farm_persistence_hint_invalid","Farm persistence hint does not resolve");
                if (!(hints.farmBefore instanceof Map)||!hints.farmBefore.has(id))
                    throw new Error(`farm_mutation_before_missing:${id}`);
                return {id,...entry,before:hints.farmBefore.get(id),receiptKeys:hints.receiptKeysByFarm?.[id]};
            });
            const components=[...new Set(hints.componentKeys)].map(key=>{
                if (!Object.hasOwn(world,key)) fail("farm_persistence_hint_invalid","Farm component hint does not resolve");
                if (!(hints.componentBefore instanceof Map)||!hints.componentBefore.has(key))
                    throw new Error(`farm_component_before_missing:${key}`);
                return {key,value:world[key],before:hints.componentBefore.get(key)};
            });
            const result=commitEntries({farms,components,allowCrossDomain:hints.allowCrossDomain,durableBoundary:hints.durableBoundary});
            wakeGuestbookJudgments(database);
            return result;
        },
    });
}
