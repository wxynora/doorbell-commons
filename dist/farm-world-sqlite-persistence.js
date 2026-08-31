import {
    canonicalFarmWorldJson,
    decomposeFarmForPersistence,
    exportFarmWorldFromDatabase,
} from "./farm-world-sqlite-migration.js";
import { runLingyeWorldTransaction } from "./lingye-world-database.js";

const DEFERRED_SAGA_SCOPES = new Set([
    "/chefRecipeInventoryActionReceipts",
    "/chefOriginalCookingReceipts",
]);
const CHEF_STORE_SCOPE = "/chefStoreOrderReceipts";
const DEFERRED_CROSS_DOMAIN_SCOPES = new Set([
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
    return canonicalFarmWorldJson(parseJson(left, "comparison:left")) ===
        canonicalFarmWorldJson(parseJson(right, "comparison:right"));
}

function assertDatabase(database) {
    if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function")
        fail("farm_persistence_database_required", "Farm persistence requires the shared Lingye DatabaseSync");
    const journalMode = database.prepare("PRAGMA journal_mode").get()?.journal_mode;
    if (journalMode !== "delete")
        fail("farm_persistence_journal_mode_invalid", "Farm persistence requires rollback-journal DELETE mode");
    const quickCheck = database.prepare("PRAGMA quick_check").all();
    if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== "ok")
        fail("farm_persistence_corrupt", "Lingye database quick_check failed");
    if (database.prepare("PRAGMA foreign_key_check").all().length > 0)
        fail("farm_persistence_corrupt", "Lingye database foreign_key_check failed");
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

function sameReceiptMetadata(existing, candidate) {
    return existing.payload_hash === candidate.payloadHash;
}

function failDeferredReceiptScope(scope, options = {}) {
    if (DEFERRED_SAGA_SCOPES.has(scope))
        fail("farm_saga_scope_unsupported", `Farm saga receipt scope is not connected in Phase 2: ${scope}`);
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
    const existingRows = readReceiptRows(database, farmId);
    const existingByKey = new Map(existingRows.map((row) => [
        `${row.scope}\u0000${row.receipt_key}`,
        row,
    ]));
    const candidateByKey = new Map();
    for (const receipt of receipts) {
        const key = receiptKey(receipt);
        if (candidateByKey.has(key))
            fail("farm_receipt_duplicate", `Farm receipt is duplicated: ${receipt.scope}/${receipt.receiptKey}`);
        candidateByKey.set(key, receipt);
    }
    for (const existing of existingRows) {
        const key = `${existing.scope}\u0000${existing.receipt_key}`;
        if (!candidateByKey.has(key))
            fail("farm_receipt_removal_forbidden", `Farm receipt cannot be removed: ${existing.scope}/${existing.receipt_key}`);
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
    for (const receipt of receipts) {
        const existing = existingByKey.get(receiptKey(receipt));
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

function sameReceiptRows(existingRows, receipts) {
    if (existingRows.length !== receipts.length)
        return false;
    const existingByKey = new Map(existingRows.map((row) => [
        `${row.scope}\u0000${row.receipt_key}`,
        row,
    ]));
    return receipts.every((receipt) => {
        const existing = existingByKey.get(receiptKey(receipt));
        return existing !== undefined &&
            sameReceiptMetadata(existing, receipt) &&
            sameJson(existing.result_json, receipt.resultJson);
    });
}

function farmChanged(database, entry) {
    const stored = database
        .prepare("SELECT position, state_json FROM farm_states WHERE farm_id = ?")
        .get(entry.id);
    if (!stored)
        return true;
    return stored.position !== entry.position ||
        !sameJson(stored.state_json, JSON.stringify(entry.decomposed.state)) ||
        !sameReceiptRows(readReceiptRows(database, entry.id), entry.decomposed.receipts);
}

function componentChanged(database, entry) {
    const stored = database
        .prepare("SELECT state_json FROM world_components WHERE component_key = ?")
        .get(entry.key);
    return !stored || !sameJson(stored.state_json, entry.stateJson);
}

function legacyWorldProjection(world) {
    if (!isRecord(world) || world.format !== "aifarm-world" || world.version !== 1 || !Array.isArray(world.farms))
        throw new TypeError("A valid legacy farm world is required");
    const farmIds = new Set();
    const farms = world.farms.map((farm, position) => {
        if (!isRecord(farm) || typeof farm.id !== "string" || farm.id.length === 0 || farmIds.has(farm.id))
            throw new TypeError("Legacy farm world contains an invalid or duplicate farm");
        farmIds.add(farm.id);
        return {
            id: farm.id,
            state: farm,
            position,
            decomposed: decomposeFarmForPersistence(farm),
        };
    });
    const components = Object.entries(world)
        .filter(([key]) => !["format", "version", "farms"].includes(key))
        .map(([key, value]) => {
            const stateJson = JSON.stringify(value);
            if (stateJson === undefined)
                throw new TypeError(`World component is not JSON-compatible: ${key}`);
            return { key, value, stateJson };
        });
    return { farms, components };
}

function selectedProjection(projection, hints, database) {
    if (hints === null || hints === undefined) {
        const persistedFarmIds = database.prepare("SELECT farm_id FROM farm_states").all().map((row) => row.farm_id);
        const candidateFarmIds = new Set(projection.farms.map((entry) => entry.id));
        if (persistedFarmIds.some((farmId) => !candidateFarmIds.has(farmId)))
            fail("farm_removal_unsupported", "Legacy dirty-diff cannot remove a farm");
        const persistedComponents = database.prepare("SELECT component_key FROM world_components").all().map((row) => row.component_key);
        const candidateComponents = new Set(projection.components.map((entry) => entry.key));
        if (persistedComponents.some((key) => !candidateComponents.has(key)))
            fail("farm_component_removal_unsupported", "Legacy dirty-diff cannot remove a world component");
        return {
            farms: projection.farms.filter((entry) => farmChanged(database, entry)),
            components: projection.components.filter((entry) => componentChanged(database, entry)),
            allowCrossDomain: false,
            durableBoundary: !database.isTransaction,
        };
    }
    if (!isRecord(hints) || !Array.isArray(hints.farmIds) || !Array.isArray(hints.componentKeys))
        throw new TypeError("Farm persistence hints require farmIds and componentKeys arrays");
    const farmIds = new Set(hints.farmIds);
    const componentKeys = new Set(hints.componentKeys);
    const farms = projection.farms.filter((entry) => farmIds.has(entry.id));
    const components = projection.components.filter((entry) => componentKeys.has(entry.key));
    if (farms.length !== farmIds.size || components.length !== componentKeys.size)
        fail("farm_persistence_hint_invalid", "Farm persistence hint does not resolve in the candidate world");
    return {
        farms,
        components,
        allowCrossDomain: hints.allowCrossDomain === true,
        durableBoundary: hints.durableBoundary ?? !database.isTransaction,
    };
}

export function createFarmWorldSqlitePersistence(database) {
    assertDatabase(database);
    const commitEntries = (input) => {
        if (!isRecord(input) || !Array.isArray(input.farms) || !Array.isArray(input.components))
            throw new TypeError("Farm persistence mutation requires farms and components arrays");
        const durableBoundary = input.durableBoundary ?? !database.isTransaction;
        const farms = input.farms.map((entry) => {
            if (!isRecord(entry) || !isRecord(entry.state) || entry.state.id !== entry.id)
                throw new TypeError("Farm persistence mutation has an invalid farm entry");
            return {
                ...entry,
                decomposed: entry.decomposed ?? decomposeFarmForPersistence(entry.state),
            };
        });
        const components = input.components.map((entry) => {
            if (!isRecord(entry) || typeof entry.key !== "string" || entry.key.length === 0 || entry.key === "farms")
                throw new TypeError("Farm persistence mutation has an invalid component entry");
            const stateJson = entry.stateJson ?? JSON.stringify(entry.value);
            if (stateJson === undefined)
                throw new TypeError(`World component is not JSON-compatible: ${entry.key}`);
            return { ...entry, stateJson };
        });
        if (durableBoundary === false && components.length > 0)
            fail("farm_durable_checkpoint_nested_forbidden", "World components cannot publish inside an older outer transaction");
        return runLingyeWorldTransaction(database, () => {
            const committedFarms = [];
            for (const entry of farms) {
                const position = farmPosition(database, entry.id, entry.position);
                const stateJson = JSON.stringify(entry.decomposed.state);
                if (durableBoundary === false) {
                    const storedState = database
                        .prepare("SELECT state_json FROM farm_states WHERE farm_id = ?")
                        .get(entry.id);
                    if (!storedState || !sameJson(storedState.state_json, stateJson)) {
                        fail(
                            "farm_durable_checkpoint_nested_forbidden",
                            "Only a receipt-only Chef completion may run inside an older outer transaction",
                        );
                    }
                }
                if (position.exists) {
                    database.prepare(`
                      UPDATE farm_states SET state_json = ? WHERE farm_id = ?
                    `).run(stateJson, entry.id);
                }
                else {
                    database.prepare(`
                      INSERT INTO farm_states (farm_id, position, state_json)
                      VALUES (?, ?, ?)
                    `).run(entry.id, position.position, stateJson);
                }
                synchronizeReceipts(database, entry.id, entry.decomposed.receipts, {
                    allowCrossDomain: input.allowCrossDomain === true,
                    durableBoundary,
                    mutationFarmCount: farms.length,
                });
                committedFarms.push(entry.id);
            }
            const committedComponents = [];
            for (const entry of components) {
                const exists = database
                    .prepare("SELECT 1 FROM world_components WHERE component_key = ?")
                    .get(entry.key) !== undefined;
                if (exists) {
                    database.prepare(`
                      UPDATE world_components SET state_json = ? WHERE component_key = ?
                    `).run(entry.stateJson, entry.key);
                }
                else {
                    database.prepare(`
                      INSERT INTO world_components (component_key, state_json)
                      VALUES (?, ?)
                    `).run(entry.key, entry.stateJson);
                }
                committedComponents.push(entry.key);
            }
            return { farms: committedFarms, components: committedComponents };
        });
    };
    return Object.freeze({
        loadLegacyWorld() {
            assertDatabase(database);
            const farms = database.prepare("SELECT COUNT(*) AS count FROM farm_states").get().count;
            const components = database.prepare("SELECT COUNT(*) AS count FROM world_components").get().count;
            if (farms === 0 || components === 0)
                fail("farm_persistence_not_migrated", "Farm world has not been imported into Lingye SQLite");
            return exportFarmWorldFromDatabase(database);
        },
        commitMutation(input) {
            return commitEntries(input);
        },
        commitLegacySnapshot(world, hints = null) {
            const projection = legacyWorldProjection(world);
            const selected = selectedProjection(projection, hints, database);
            if (selected.farms.length === 0 && selected.components.length === 0)
                return { farms: [], components: [] };
            return commitEntries(selected);
        },
    });
}
