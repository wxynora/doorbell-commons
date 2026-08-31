import { createHash, randomUUID } from "node:crypto";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import {
    LINGYE_WORLD_SCHEMA_VERSION,
    openLingyeWorldDatabase,
    runLingyeWorldTransaction,
} from "./lingye-world-database.js";
import { normalizeMinimalHumanActionReceipt } from "./minimal-action-receipt.js";

const WORLD_FORMAT = "aifarm-world";
const WORLD_VERSION = 1;

const HUMAN_RECEIPT_FIELDS = Object.freeze([
    "doorbellHumanCropCodexActionReceipts",
    "doorbellHumanExpeditionActionReceipts",
    "doorbellHumanFarmSettingsActionReceipts",
    "doorbellHumanFarmShopOpenReceipts",
    "doorbellHumanHarvestReceipts",
    "doorbellHumanKitchenCookReceipts",
    "doorbellHumanKitchenInventoryActionReceipts",
    "doorbellHumanKitchenPurchaseReceipts",
    "doorbellHumanKitchenShopOpenReceipts",
    "doorbellHumanKitchenShopRefreshReceipts",
    "doorbellHumanLandUpgradeReceipts",
    "doorbellHumanMarketActionReceipts",
    "doorbellHumanNeighborhoodMessageReceipts",
    "doorbellHumanOriginalPlantActionReceipts",
    "doorbellHumanRanchCollectionReceipts",
    "doorbellHumanRanchDecorationActionReceipts",
    "doorbellHumanRanchInteractionActionReceipts",
    "doorbellHumanRanchResidentActionReceipts",
    "doorbellHumanSmeltingActionReceipts",
]);

export const LEGACY_FARM_RECEIPT_SCOPES = Object.freeze([
    ...HUMAN_RECEIPT_FIELDS.map((field) => Object.freeze({
        path: Object.freeze([field]),
        kind: "human",
    })),
    Object.freeze({
        path: Object.freeze(["doorbellHumanBulletinReadState", "receipts"]),
        kind: "human",
    }),
    Object.freeze({
        path: Object.freeze(["chefRecipeInventoryActionReceipts"]),
        kind: "chef_inventory",
    }),
    Object.freeze({
        path: Object.freeze(["chefStoreOrderReceipts"]),
        kind: "chef_store",
    }),
    Object.freeze({
        path: Object.freeze(["chefOriginalCookingReceipts"]),
        kind: "original_cook",
    }),
    Object.freeze({
        path: Object.freeze(["lingyeP3", "actionReceipts"]),
        kind: "p3",
    }),
]);

export class FarmWorldMigrationError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "FarmWorldMigrationError";
        this.code = code;
    }
}

function fail(code, message) {
    throw new FarmWorldMigrationError(code, message);
}

function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function requiredPath(value, label) {
    if (typeof value !== "string" || value.length === 0)
        fail("farm_path_required", `${label} path is required`);
    return resolve(value);
}

function canonicalValue(value) {
    if (Array.isArray(value))
        return value.map(canonicalValue);
    if (!isRecord(value))
        return value;
    const output = {};
    for (const key of Object.keys(value).sort())
        output[key] = canonicalValue(value[key]);
    return output;
}

export function assertJsonCompatible(value, path = "$") {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail("farm_world_invalid", `Farm world contains a non-finite number at ${path}`);
        return;
    }
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            if (!Object.hasOwn(value, index))
                fail("farm_world_invalid", `Farm world contains a sparse array at ${path}`);
            assertJsonCompatible(value[index], `${path}[${index}]`);
        }
        return;
    }
    if (isRecord(value)) {
        for (const [key, entry] of Object.entries(value))
            assertJsonCompatible(entry, `${path}.${key}`);
        return;
    }
    fail("farm_world_invalid", `Farm world contains a non-JSON value at ${path}`);
}

export function canonicalFarmWorldJson(value) {
    return JSON.stringify(canonicalValue(value));
}

function digestJson(value) {
    return createHash("sha256").update(canonicalFarmWorldJson(value), "utf8").digest("hex");
}

function validateWorld(value) {
    assertJsonCompatible(value);
    if (!isRecord(value) || value.format !== WORLD_FORMAT || value.version !== WORLD_VERSION || !Array.isArray(value.farms))
        fail("farm_world_invalid", "Expected an aifarm-world version 1 object with a farms array");
    const farmIds = new Set();
    for (const [position, farm] of value.farms.entries()) {
        if (!isRecord(farm) || typeof farm.id !== "string" || farm.id.length === 0)
            fail("farm_world_invalid", `Farm at position ${position} has no valid id`);
        if (farmIds.has(farm.id))
            fail("farm_world_duplicate_farm", `Farm id is duplicated: ${farm.id}`);
        farmIds.add(farm.id);
    }
    return value;
}

export function parseFarmWorldJson(text) {
    if (typeof text !== "string")
        fail("farm_world_invalid", "Farm world source must be JSON text");
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        fail("farm_world_invalid_json", "Farm world source is not valid JSON");
    }
    return validateWorld(parsed);
}

export function readFarmWorldJson(sourcePath) {
    const resolvedPath = requiredPath(sourcePath, "Farm world source");
    try {
        return parseFarmWorldJson(readFileSync(resolvedPath, "utf8"));
    }
    catch (error) {
        if (error instanceof FarmWorldMigrationError)
            throw error;
        fail("farm_world_read_failed", `Could not read farm world source: ${resolvedPath}`);
    }
}

function pointerToken(value) {
    return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function pointer(tokens) {
    return `/${tokens.map(pointerToken).join("/")}`;
}

function optionalString(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function receiptPayloadHash(kind, receipt, fallback) {
    const entry = isRecord(receipt) ? receipt : {};
    let payloadHash = null;
    if (kind === "human")
        payloadHash = optionalString(entry.fingerprint);
    else if (kind === "chef_inventory")
        payloadHash = optionalString(entry.requestFingerprint);
    else if (kind === "chef_store")
        payloadHash = optionalString(entry.requestFingerprint);
    else if (kind === "original_cook")
        payloadHash = optionalString(entry.requestFingerprint);
    else if (kind === "p3")
        payloadHash = optionalString(entry.payloadHash);
    return payloadHash ?? fallback ?? digestJson(receipt);
}

function locateLedger(farm, scope) {
    let owner = farm;
    for (let index = 0; index < scope.path.length - 1; index += 1) {
        if (!isRecord(owner) || !Object.hasOwn(owner, scope.path[index]))
            return null;
        owner = owner[scope.path[index]];
    }
    if (!isRecord(owner))
        fail("farm_receipt_ledger_invalid", `Farm ${farm.id} receipt parent is invalid: ${pointer(scope.path)}`);
    const key = scope.path.at(-1);
    if (!Object.hasOwn(owner, key))
        return null;
    const ledger = owner[key];
    if (!isRecord(ledger))
        fail("farm_receipt_ledger_invalid", `Farm ${farm.id} receipt ledger is invalid: ${pointer(scope.path)}`);
    return { owner, key, ledger };
}

export function decomposeFarmForPersistence(farm) {
    if (!isRecord(farm) || typeof farm.id !== "string" || farm.id.length === 0)
        fail("farm_world_invalid", "A persisted farm must have a valid id");
    assertJsonCompatible(farm);
    const state = structuredClone(farm);
    const receipts = [];
    for (const scope of LEGACY_FARM_RECEIPT_SCOPES) {
        const located = locateLedger(state, scope);
        if (!located)
            continue;
        for (const [receiptKey, receipt] of Object.entries(located.ledger)) {
            const persistedReceipt = scope.kind === "human"
                ? normalizeMinimalHumanActionReceipt(receipt)
                : receipt;
            receipts.push({
                farmId: farm.id,
                scope: pointer(scope.path),
                receiptKey,
                resultJson: JSON.stringify(
                    scope.kind === "human" ? persistedReceipt.result : persistedReceipt,
                ),
                payloadHash: receiptPayloadHash(scope.kind, receipt),
            });
        }
        delete located.owner[located.key];
    }
    return { state, receipts };
}

function assertDatabaseIntegrity(database) {
    const quickCheck = database.prepare("PRAGMA quick_check").all();
    if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== "ok")
        fail("farm_database_corrupt", "Lingye database quick_check failed");
    const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyFailures.length > 0)
        fail("farm_database_corrupt", "Lingye database foreign_key_check failed");
}

function assertPersistenceSchema(database) {
    const metadata = database
        .prepare("SELECT schema_version FROM lingye_world_schema_meta WHERE singleton_id = 1")
        .get();
    if (metadata?.schema_version !== LINGYE_WORLD_SCHEMA_VERSION)
        fail("farm_schema_incompatible", "Lingye farm persistence schema is unavailable");
    for (const table of ["farm_states", "farm_action_receipts", "world_components"]) {
        const row = database
            .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get(table);
        if (row === undefined)
            fail("farm_schema_incompatible", `Lingye farm persistence table is unavailable: ${table}`);
    }
}

function persistenceCounts(database) {
    return {
        farms: database.prepare("SELECT COUNT(*) AS count FROM farm_states").get().count,
        receipts: database.prepare("SELECT COUNT(*) AS count FROM farm_action_receipts").get().count,
        components: database.prepare("SELECT COUNT(*) AS count FROM world_components").get().count,
    };
}

function parseStoredJson(text, label) {
    try {
        return JSON.parse(text);
    }
    catch {
        fail("farm_database_corrupt", `Stored JSON is invalid: ${label}`);
    }
}

function ledgerForScope(farm, scopePath) {
    const scope = LEGACY_FARM_RECEIPT_SCOPES.find((candidate) => pointer(candidate.path) === scopePath);
    if (!scope)
        fail("farm_receipt_scope_invalid", `Farm receipt scope is unknown: ${scopePath}`);
    let owner = farm;
    for (let index = 0; index < scope.path.length - 1; index += 1) {
        const key = scope.path[index];
        if (!Object.hasOwn(owner, key) || !isRecord(owner[key]))
            fail("farm_database_corrupt", `Farm receipt scope parent is missing or invalid: ${scopePath}`);
        owner = owner[key];
    }
    const key = scope.path.at(-1);
    if (!Object.hasOwn(owner, key))
        owner[key] = {};
    if (!isRecord(owner[key]))
        fail("farm_receipt_scope_invalid", `Farm receipt scope is invalid: ${scopePath}`);
    return { ledger: owner[key], kind: scope.kind };
}

function assignReceipt(worldFarm, row) {
    const { ledger, kind } = ledgerForScope(worldFarm, row.scope);
    if (Object.hasOwn(ledger, row.receipt_key))
        fail("farm_receipt_scope_invalid", `Farm receipt key is duplicated: ${row.scope}/${row.receipt_key}`);
    const storedResult = parseStoredJson(row.result_json, `receipt:${row.farm_id}:${row.scope}:${row.receipt_key}`);
    const receipt = kind === "human"
        ? { fingerprint: row.payload_hash, result: storedResult }
        : storedResult;
    if (kind !== "human" && receiptPayloadHash(kind, receipt) !== row.payload_hash) {
        fail("farm_receipt_corrupt", `Farm receipt metadata does not match: ${row.scope}/${row.receipt_key}`);
    }
    ledger[row.receipt_key] = receipt;
}

export function exportFarmWorldFromDatabase(database, options = {}) {
    if (options.checkIntegrity !== false)
        assertDatabaseIntegrity(database);
    assertPersistenceSchema(database);
    const world = { format: WORLD_FORMAT, version: WORLD_VERSION };
    const components = database
        .prepare("SELECT component_key, state_json FROM world_components ORDER BY component_key")
        .all();
    for (const row of components) {
        if (Object.hasOwn(world, row.component_key) || row.component_key === "farms")
            fail("farm_database_corrupt", `Duplicate or reserved world component: ${row.component_key}`);
        world[row.component_key] = parseStoredJson(row.state_json, `component:${row.component_key}`);
    }
    const farms = database
        .prepare("SELECT farm_id, state_json FROM farm_states ORDER BY position")
        .all()
        .map((row) => {
            const farm = parseStoredJson(row.state_json, `farm:${row.farm_id}`);
            if (!isRecord(farm) || farm.id !== row.farm_id)
                fail("farm_database_corrupt", `Stored farm identity does not match: ${row.farm_id}`);
            return farm;
        });
    const farmById = new Map(farms.map((farm) => [farm.id, farm]));
    const receipts = database
        .prepare(`SELECT farm_id, scope, receipt_key, payload_hash, result_json
                  FROM farm_action_receipts
                  ORDER BY farm_id, scope, receipt_key`)
        .all();
    for (const row of receipts) {
        const farm = farmById.get(row.farm_id);
        if (!farm)
            fail("farm_database_corrupt", `Farm receipt has no farm: ${row.farm_id}`);
        assignReceipt(farm, row);
    }
    world.farms = farms;
    return validateWorld(world);
}

function sameWorld(left, right) {
    return canonicalFarmWorldJson(left) === canonicalFarmWorldJson(right);
}

export function minimalizeLegacyHumanReceipts(world) {
    const compacted = structuredClone(validateWorld(world));
    for (const farm of compacted.farms) {
        for (const scope of LEGACY_FARM_RECEIPT_SCOPES) {
            const located = locateLedger(farm, scope);
            if (!located)
                continue;
            const entries = Object.entries(located.ledger);
            if (entries.length === 0) {
                delete located.owner[located.key];
                continue;
            }
            if (scope.kind === "human") {
                located.owner[located.key] = Object.fromEntries(
                    entries.map(([key, receipt]) => [
                        key,
                        normalizeMinimalHumanActionReceipt(receipt),
                    ]),
                );
            }
        }
    }
    return compacted;
}

export function verifyFarmWorldMigration(database, sourceWorld) {
    const source = minimalizeLegacyHumanReceipts(sourceWorld);
    const exported = exportFarmWorldFromDatabase(database);
    if (!sameWorld(source, exported))
        fail("farm_world_mismatch", "SQLite export does not match the source farm world");
    const counts = persistenceCounts(database);
    return {
        ok: true,
        digest: digestJson(exported),
        farms: counts.farms,
        receipts: counts.receipts,
        components: counts.components,
    };
}

export function importFarmWorldToDatabase(database, sourceWorld) {
    const source = minimalizeLegacyHumanReceipts(sourceWorld);
    assertDatabaseIntegrity(database);
    assertPersistenceSchema(database);
    const before = persistenceCounts(database);
    if (before.farms !== 0 || before.receipts !== 0 || before.components !== 0) {
        let existing;
        try {
            existing = exportFarmWorldFromDatabase(database, { checkIntegrity: false });
        }
        catch {
            fail("farm_world_import_conflict", "Farm persistence tables are already populated incompletely");
        }
        if (!sameWorld(existing, source))
            fail("farm_world_import_conflict", "Farm persistence tables already contain another world");
        return { imported: false, reason: "already_imported", ...verifyFarmWorldMigration(database, source) };
    }
    const components = Object.entries(source)
        .filter(([key]) => !["format", "version", "farms"].includes(key))
        .map(([key, value]) => ({ key, value }));
    const farms = source.farms.map((farm, position) => ({
        position,
        ...decomposeFarmForPersistence(farm),
    }));
    const insertComponent = database.prepare(`
      INSERT INTO world_components (component_key, state_json)
      VALUES (?, ?)
    `);
    const insertFarm = database.prepare(`
      INSERT INTO farm_states (farm_id, position, state_json)
      VALUES (?, ?, ?)
    `);
    const insertReceipt = database.prepare(`
      INSERT INTO farm_action_receipts (
        farm_id, scope, receipt_key, payload_hash, result_json
      ) VALUES (?, ?, ?, ?, ?)
    `);
    runLingyeWorldTransaction(database, () => {
        for (const component of components)
            insertComponent.run(component.key, JSON.stringify(component.value));
        for (const farm of farms) {
            insertFarm.run(farm.state.id, farm.position, JSON.stringify(farm.state));
            for (const receipt of farm.receipts) {
                insertReceipt.run(
                    receipt.farmId,
                    receipt.scope,
                    receipt.receiptKey,
                    receipt.payloadHash,
                    receipt.resultJson,
                );
            }
        }
        const exported = exportFarmWorldFromDatabase(database, { checkIntegrity: false });
        if (!sameWorld(exported, source))
            fail("farm_world_mismatch", "SQLite import did not preserve the canonical farm world");
    });
    const verified = verifyFarmWorldMigration(database, source);
    return { imported: true, ...verified };
}

export function openFarmWorldMigrationDatabase(databasePath) {
    const database = openLingyeWorldDatabase(requiredPath(databasePath, "Lingye database"));
    try {
        const journalMode = database.prepare("PRAGMA journal_mode = DELETE").get()?.journal_mode;
        if (journalMode !== "delete")
            fail("farm_database_journal_mode_invalid", "Farm migration requires SQLite rollback-journal DELETE mode");
        assertDatabaseIntegrity(database);
        return database;
    }
    catch (error) {
        database.close();
        throw error;
    }
}

export function openFarmWorldDatabaseReadOnly(databasePath) {
    const resolvedPath = requiredPath(databasePath, "Lingye database");
    if (!existsSync(resolvedPath))
        fail("farm_database_missing", `Lingye database does not exist: ${resolvedPath}`);
    const database = new DatabaseSync(resolvedPath, { readOnly: true });
    try {
        database.exec("PRAGMA foreign_keys = ON");
        assertDatabaseIntegrity(database);
        assertPersistenceSchema(database);
        return database;
    }
    catch (error) {
        database.close();
        throw error;
    }
}

export function writeFarmWorldJsonAtomic(outputPath, world) {
    const validated = validateWorld(world);
    const resolvedPath = requiredPath(outputPath, "Farm world output");
    if (existsSync(resolvedPath))
        fail("farm_world_output_exists", `Refusing to overwrite existing farm world output: ${resolvedPath}`);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    const temporaryPath = resolve(dirname(resolvedPath), `.${basename(resolvedPath)}.${process.pid}.${randomUUID()}.tmp`);
    try {
        writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
        const written = readFarmWorldJson(temporaryPath);
        if (!sameWorld(validated, written))
            fail("farm_world_output_mismatch", "Farm world output failed canonical verification");
        renameSync(temporaryPath, resolvedPath);
    }
    catch (error) {
        rmSync(temporaryPath, { force: true });
        throw error;
    }
    return resolvedPath;
}

export async function backupFarmWorldDatabase(database, destinationPath) {
    const resolvedPath = requiredPath(destinationPath, "Lingye database backup");
    if (existsSync(resolvedPath))
        fail("farm_database_backup_exists", `Refusing to overwrite existing database backup: ${resolvedPath}`);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    const temporaryPath = resolve(dirname(resolvedPath), `.${basename(resolvedPath)}.${process.pid}.${randomUUID()}.tmp`);
    try {
        assertDatabaseIntegrity(database);
        await backup(database, temporaryPath);
        const copy = new DatabaseSync(temporaryPath, { readOnly: true });
        try {
            assertDatabaseIntegrity(copy);
        }
        finally {
            copy.close();
        }
        renameSync(temporaryPath, resolvedPath);
    }
    catch (error) {
        rmSync(temporaryPath, { force: true });
        throw error;
    }
    return resolvedPath;
}
