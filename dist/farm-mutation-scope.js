import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import { LEGACY_FARM_RECEIPT_SCOPES, FarmWorldMigrationError } from "./farm-world-sqlite-migration.js";
import { FarmWorldPersistenceError } from "./farm-world-sqlite-persistence.js";
import { diffFarmStateRecords, encodeStateRecords, farmRecordPath, stateRecordChanges } from "./farm-state-records.js";

const storage = new AsyncLocalStorage();
let activeScopes = 0;
export const hasActiveFarmMutationScopes = () => activeScopes > 0;
const active = Symbol("activeFarmMutationScope");
const own = (value, key) => Object.hasOwn(value, key);
const record = value => value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function currentFarmMutationScope() {
    const scope = storage.getStore();
    return scope?.[active] ? scope : undefined;
}

// An inherited scope belongs to the outer action. Only that action releases it.
export function withFarmMutationScope(operation) {
    if (typeof operation !== "function") throw new TypeError("farm_mutation_operation_required");
    if (currentFarmMutationScope()) return operation();
    const scope = { farms: new Map(), components: new Map(), [active]: true };
    activeScopes++;
    const release = () => {
        activeScopes--;
        scope[active] = false;
        scope.farms.clear();
        scope.components.clear();
    };
    return storage.run(scope, () => {
        try {
            const result = operation();
            if (result && typeof result.then === "function") return Promise.resolve(result).finally(release);
            release();
            return result;
        } catch (error) {
            release();
            throw error;
        }
    });
}

function ledgerFor(farm, descriptor) {
    let owner = farm;
    for (const key of descriptor.path.slice(0, -1)) {
        if (!record(owner) || !own(owner, key)) return undefined;
        owner = owner[key];
    }
    const scope = farmRecordPath(descriptor.path);
    if (!record(owner)) {
        throw new FarmWorldMigrationError("farm_receipt_ledger_invalid", `Farm ${farm.id} receipt parent is invalid: ${scope}`);
    }
    const key = descriptor.path.at(-1);
    if (!own(owner, key)) return undefined;
    if (!record(owner[key])) {
        throw new FarmWorldMigrationError("farm_receipt_ledger_invalid", `Farm ${farm.id} receipt ledger is invalid: ${scope}`);
    }
    return owner[key];
}

// Clone only the ancestors of a present receipt ledger. Other farm objects and
// immutable receipt payloads remain ordinary references until record encoding.
function farmParts(farm, copyMutableReceipts, collectReceipts = true) {
    if (!record(farm) || typeof farm.id !== "string" || farm.id.length === 0) {
        throw new FarmWorldMigrationError("farm_world_invalid", "A persisted farm must have a valid id");
    }
    const state = { ...farm };
    const receiptEntries = new Map();
    for (const descriptor of LEGACY_FARM_RECEIPT_SCOPES) {
        const ledger = ledgerFor(farm, descriptor);
        if (ledger === undefined) continue;
        if (collectReceipts) {
            const entries = new Map();
            for (const key of Object.keys(ledger)) {
                entries.set(key, copyMutableReceipts && descriptor.kind === "chef_store"
                    ? structuredClone(ledger[key]) : ledger[key]);
            }
            receiptEntries.set(farmRecordPath(descriptor.path), entries);
        }
        let original = farm, shadow = state;
        for (const key of descriptor.path.slice(0, -1)) {
            if (shadow[key] === original[key]) shadow[key] = { ...original[key] };
            original = original[key];
            shadow = shadow[key];
        }
        delete shadow[descriptor.path.at(-1)];
    }
    return { state, receiptEntries };
}

// Working copies own their state and ledger key maps. Immutable receipts can
// be shared; Chef order receipts advance in place and need independent copies.
export function cloneFarmForMutation(farm) {
    const { state, receiptEntries } = farmParts(farm, true);
    const working = structuredClone(state);
    for (const descriptor of LEGACY_FARM_RECEIPT_SCOPES) {
        const entries = receiptEntries.get(farmRecordPath(descriptor.path));
        if (!entries) continue;
        let owner = working;
        for (const key of descriptor.path.slice(0, -1)) owner = owner[key];
        owner[descriptor.path.at(-1)] = Object.fromEntries(entries);
    }
    return working;
}

export function snapshotFarmMutation(farm, records) {
    if (records !== undefined && !(records instanceof Map)) throw new TypeError("farm_mutation_records_required");
    const parts = farmParts(farm, true);
    return { records, state: records === undefined ? structuredClone(parts.state) : undefined,
        receiptEntries: parts.receiptEntries };
}

export function captureFarmMutation(farm) {
    const scope = currentFarmMutationScope();
    if (!scope) return undefined;
    if (scope.farms.has(farm.id)) return scope.farms.get(farm.id);
    const captured = snapshotFarmMutation(farm);
    scope.farms.set(farm.id, captured);
    return captured;
}

export function captureComponentMutation(key, value) {
    const scope = currentFarmMutationScope();
    if (!scope) return undefined;
    if (scope.components.has(key)) return scope.components.get(key);
    const records = encodeStateRecords(value);
    scope.components.set(key, records);
    return records;
}

function selectedReceiptKeys(farm, keys) {
    if (!Array.isArray(keys)) throw new TypeError("Farm receipt keys must be an array");
    const seen = new Map();
    for (const entry of keys) {
        const descriptor = record(entry) && LEGACY_FARM_RECEIPT_SCOPES.find(
            candidate => farmRecordPath(candidate.path) === entry.scope,
        );
        if (!descriptor || typeof entry.receiptKey !== "string" || !entry.receiptKey)
            throw new TypeError("Invalid farm receipt key");
        const ledger = ledgerFor(farm, descriptor);
        if (!ledger || !own(ledger, entry.receiptKey))
            throw new FarmWorldMigrationError("farm_receipt_missing", "Selected farm receipt is missing");
        const scopeKeys = seen.get(entry.scope) ?? new Set();
        if (scopeKeys.has(entry.receiptKey))
            throw new FarmWorldMigrationError("farm_receipt_duplicate", "Farm receipt key is duplicated");
        scopeKeys.add(entry.receiptKey);
        seen.set(entry.scope, scopeKeys);
    }
    return keys;
}

function changedReceiptKeys(parts, before) {
    const previous = before?.receiptEntries ?? new Map();
    if (!(previous instanceof Map)) throw new TypeError("farm_mutation_snapshot_invalid");
    for (const [scope, entries] of previous) {
        const current = parts.receiptEntries.get(scope);
        for (const key of entries.keys()) {
            if (!current?.has(key)) {
                throw new FarmWorldPersistenceError("farm_receipt_removal_forbidden", `Farm receipt cannot be removed: ${scope}/${key}`);
            }
        }
    }
    const receiptKeys = [];
    for (const [scope, entries] of parts.receiptEntries) {
        const old = previous.get(scope);
        for (const [key, receipt] of entries) {
            if (!old?.has(key) || !isDeepStrictEqual(old.get(key), receipt)) {
                receiptKeys.push({ scope, receiptKey: key });
            }
        }
    }
    return receiptKeys;
}

function mutationParts(farm, before, explicitReceiptKeys) {
    // Declared keys are the complete receipt write set for a scoped action.
    // Legacy actions still discover additions from their request snapshot.
    const selected = explicitReceiptKeys === undefined ? null : selectedReceiptKeys(farm, explicitReceiptKeys);
    const parts = farmParts(farm, false, !selected || !before);
    return {
        state: parts.state,
        receiptKeys: selected && before ? selected : changedReceiptKeys(parts, before),
    };
}

// Only the actual writer needs an encoded delta. The economy coordinator may
// still change balance/counter fields after this dirty-farm selection.
export function farmMutationChanged(farm, before, explicitReceiptKeys) {
    if (!before) return true;
    const parts = mutationParts(farm, before, explicitReceiptKeys);
    if (parts.receiptKeys.length) return true;
    if (before.state !== undefined) return !isDeepStrictEqual(before.state,parts.state);
    return stateRecordChanges(before.records,encodeStateRecords(parts.state)).length > 0;
}

export function planFarmMutation(farm, before, explicitReceiptKeys) {
    const { state, receiptKeys } = mutationParts(farm, before, explicitReceiptKeys);
    if (before?.state !== undefined) {
        const recordChanges = diffFarmStateRecords(before.state,state);
        return {recordChanges, receiptKeys, messagesBefore:before.state.messages ?? []};
    }
    const beforeRecords = before?.records ?? new Map();
    const records = encodeStateRecords(state);
    return {recordChanges:stateRecordChanges(beforeRecords,records), beforeRecords, records, receiptKeys};
}

// A direct field writer calls this only after its outer transaction commits
// and the corresponding fields have been published to the live farm.
export function acceptCommittedFarmRecords(farm, changes, receipts=[]) {
    const before=currentFarmMutationScope()?.farms.get(farm.id);
    if (!before) return;
    if (changes.length) {
        before.records ??= encodeStateRecords(before.state);
        before.state = undefined;
        for (const change of changes) {
            if (change.after) before.records.set(change.path,change.after);
            else before.records.delete(change.path);
        }
    }
    for (const {scope,receiptKey} of receipts) {
        const descriptor=LEGACY_FARM_RECEIPT_SCOPES.find(item=>farmRecordPath(item.path)===scope);
        if (!descriptor) throw new TypeError("farm_receipt_scope_invalid");
        const receipt=ledgerFor(farm,descriptor)?.[receiptKey];
        if (!before.receiptEntries.has(scope)) before.receiptEntries.set(scope,new Map());
        before.receiptEntries.get(scope).set(receiptKey,descriptor.kind==="chef_store" ? structuredClone(receipt) : receipt);
    }
}
