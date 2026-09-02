import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CareerEmploymentService } from "./career/employment-service.js";
import { CareerAuthorityAssignmentService } from "./career/authority-assignment.js";
import { CareerDomainError } from "./career/contracts.js";
import { CareerJobService } from "./career/job-service.js";
import { beijingDate, EXAM_SESSION_DURATION_MS } from "./career/persistence.js";
import { installCareerSchema } from "./career/schema.js";
import { CareerSchoolService } from "./career/school-service.js";
import { nextReporterEvaluationDueAt } from "./career/reporter-evaluation-window.js";
import {
    ChefCommerceService,
    ensureChefCommerceSchema,
    hasChefRecipeEntitlement,
} from "./career/chef-commerce-service.js";
import {
    ensureChefRecipeSchema,
    getChefRecipe,
    getChefRecipeResearch,
    listChefRecipes,
    recoverChefRecipeResearch,
    researchChefRecipe,
} from "./career/chef-recipe-service.js";
import { createChefFarmInventoryAdapter } from "./career/chef-farm-inventory-adapter.js";
import {
    ChefStoreService,
    ensureChefStoreSchema,
} from "./career/chef-store-service.js";
import { createChefStoreFarmAdapter } from "./career/chef-store-farm-adapter.js";
import { installEconomySchema } from "./economy/economy-schema.js";
import { EconomyError } from "./economy/economy-errors.js";
import { EconomyService } from "./economy/economy-service.js";
import { installSecuritySchema, LingyeSecurityService } from "./security/index.js";
import {
    claimReporterMaterialPack,
    createReporterSection,
    dueReporterEvaluationJobIds,
    createReporterCorrection,
    createReporterMaterialPack,
    getReporterArticle,
    getReporterEvaluationQuote,
    getReporterMaterialPack,
    getReporterPublication,
    getReporterSourceFact,
    listReporterSections,
    listReporterPublicationsForHuman,
    listReporterPublicationsForResident,
    publishReporterArticle,
    quoteReporterEvaluation,
    recordReporterLike,
    recordReporterHumanLike,
    registerReporterSourceFact,
    returnReporterMaterialPack,
    reviewReporterArticle,
    settleReporterEvaluation,
    submitReporterArticle,
    submitReporterSupplement,
} from "./career/reporter-service.js";
import { reporterWorkflowForJob } from "./career/reporter-newsroom-service.js";
import { captureReporterBoardSnapshots, installReporterBoardSnapshotSchema, seedReporterBoardSnapshotsFromCommittedWorld } from "./career/reporter-board-snapshot.js";

export const LINGYE_WORLD_SCHEMA_VERSION = 2;

const FARM_WORLD_PERSISTENCE_SCHEMA_SQL = `
  CREATE TABLE farm_states (
    farm_id TEXT PRIMARY KEY CHECK (length(farm_id) > 0),
    position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
    state_json TEXT NOT NULL CHECK (json_valid(state_json))
  );

  CREATE TABLE farm_action_receipts (
    farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE RESTRICT,
    scope TEXT NOT NULL CHECK (length(scope) > 0),
    receipt_key TEXT NOT NULL,
    payload_hash TEXT NOT NULL CHECK (length(payload_hash) > 0),
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    PRIMARY KEY (farm_id, scope, receipt_key)
  ) WITHOUT ROWID;

  CREATE TABLE world_components (
    component_key TEXT PRIMARY KEY CHECK (length(component_key) > 0 AND component_key <> 'farms'),
    state_json TEXT NOT NULL CHECK (json_valid(state_json))
  );
`;

const FARM_WORLD_PERSISTENCE_TABLES = Object.freeze({
    farm_states: Object.freeze(["farm_id", "position", "state_json"]),
    farm_action_receipts: Object.freeze([
        "farm_id",
        "scope",
        "receipt_key",
        "payload_hash",
        "result_json",
    ]),
    world_components: Object.freeze(["component_key", "state_json"]),
});

function assertFarmWorldPersistenceSchema(database) {
    for (const [table, expectedColumns] of Object.entries(FARM_WORLD_PERSISTENCE_TABLES)) {
        const tableEntry = database
            .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get(table);
        if (typeof tableEntry?.sql !== "string")
            throw new Error(`Lingye farm persistence table is missing: ${table}`);
        const actualColumns = database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
        if (actualColumns.length !== expectedColumns.length ||
            actualColumns.some((column, index) => column !== expectedColumns[index])) {
            throw new Error(`Lingye farm persistence table is incompatible: ${table}`);
        }
    }
}

function migrateLingyeWorldSchemaV1ToV2(database) {
    runLingyeWorldTransaction(database, () => {
        database.exec(`
          ALTER TABLE lingye_world_schema_meta RENAME TO lingye_world_schema_meta_v1;
          CREATE TABLE lingye_world_schema_meta (
            singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
            schema_version INTEGER NOT NULL CHECK (schema_version >= 1)
          );
          INSERT INTO lingye_world_schema_meta (singleton_id, schema_version)
          VALUES (1, ${LINGYE_WORLD_SCHEMA_VERSION});
          DROP TABLE lingye_world_schema_meta_v1;
          ${FARM_WORLD_PERSISTENCE_SCHEMA_SQL}
        `);
    });
}

const DEFAULT_DATA_DIR = process.env.AIFARM_DATA_DIR
    ? resolve(process.env.AIFARM_DATA_DIR)
    : resolve(dirname(fileURLToPath(import.meta.url)), "../data");

export const DEFAULT_LINGYE_WORLD_DATABASE_PATH = resolve(DEFAULT_DATA_DIR, "lingye-world.sqlite");

let lingyeWorldTransactionSequence = 0;

export function runLingyeWorldTransaction(database, operation) {
    const nested = database.isTransaction;
    const savepoint = `lingye_world_tx_${++lingyeWorldTransactionSequence}`;
    database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
        const result = operation();
        database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
        return result;
    }
    catch (error) {
        if (nested) {
            database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            database.exec(`RELEASE SAVEPOINT ${savepoint}`);
        }
        else if (database.isTransaction) {
            database.exec("ROLLBACK");
        }
        throw error;
    }
}

export function installLingyeWorldSchema(database) {
    const metadata = database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lingye_world_schema_meta'")
        .get();
    if (metadata === undefined) {
        runLingyeWorldTransaction(database, () => {
            database.exec(`
        CREATE TABLE lingye_world_schema_meta (
          singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
          schema_version INTEGER NOT NULL CHECK (schema_version >= 1)
        );
        INSERT INTO lingye_world_schema_meta (singleton_id, schema_version)
        VALUES (1, ${LINGYE_WORLD_SCHEMA_VERSION});

        -- This is only the stable Doorbell identity reference used by the Lingye world.
        -- Human names, QQ numbers, homes and community sessions remain in Doorbell Commons.
        CREATE TABLE residents (
          resident_id TEXT PRIMARY KEY,
          binding_reference TEXT NOT NULL UNIQUE,
          registered_at INTEGER NOT NULL
        );

        ${FARM_WORLD_PERSISTENCE_SCHEMA_SQL}
      `);
        });
    }
    let version = database
        .prepare("SELECT schema_version FROM lingye_world_schema_meta WHERE singleton_id = 1")
        .get();
    if (version?.schema_version === 1) {
        migrateLingyeWorldSchemaV1ToV2(database);
        version = database
            .prepare("SELECT schema_version FROM lingye_world_schema_meta WHERE singleton_id = 1")
            .get();
    }
    if (version?.schema_version !== LINGYE_WORLD_SCHEMA_VERSION)
        throw new Error(`Unsupported Lingye world schema version: ${version?.schema_version ?? "missing"}`);
    assertFarmWorldPersistenceSchema(database);
    database.exec(`
      CREATE TABLE IF NOT EXISTS lingye_school_action_receipts (
        action_key TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        payload_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lingye_school_action_receipts_resident
        ON lingye_school_action_receipts(resident_id, created_at, action_key);
      CREATE TABLE IF NOT EXISTS lingye_commission_action_receipts (
        action_key TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        career TEXT NOT NULL CHECK (career IN ('agronomist', 'veterinarian', 'reporter', 'constable')),
        payload_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lingye_commission_action_receipts_resident
        ON lingye_commission_action_receipts(resident_id, created_at, action_key);
      CREATE TABLE IF NOT EXISTS lingye_option_handles (
        handle TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        operation TEXT NOT NULL,
        internal_option TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        UNIQUE (resident_id, operation, internal_option)
      );
      CREATE INDEX IF NOT EXISTS lingye_option_handles_resident_operation
        ON lingye_option_handles(resident_id, operation, issued_at, handle);
      CREATE TABLE IF NOT EXISTS lingye_cross_store_operations (
        action_key TEXT PRIMARY KEY,
        operation_kind TEXT NOT NULL CHECK (operation_kind IN ('commission_check', 'commission_treatment', 'npc_service')),
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE RESTRICT,
        career TEXT NOT NULL CHECK (career IN ('agronomist', 'veterinarian')),
        job_id TEXT,
        source_json TEXT,
        action_value TEXT NOT NULL,
        option_reference TEXT NOT NULL,
        qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
        payload_hash TEXT NOT NULL,
        reservation_id TEXT,
        gold_amount INTEGER NOT NULL CHECK (gold_amount >= 0),
        world_result_json TEXT,
        result_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'world_applied', 'completed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (
          (operation_kind = 'commission_check' AND job_id IS NOT NULL AND source_json IS NULL
            AND reservation_id IS NULL AND gold_amount = 0)
          OR
          (operation_kind = 'commission_treatment' AND job_id IS NOT NULL AND source_json IS NULL
            AND reservation_id IS NOT NULL AND gold_amount > 0)
          OR
          (operation_kind = 'npc_service' AND job_id IS NULL AND source_json IS NOT NULL
            AND reservation_id IS NOT NULL AND gold_amount > 0)
        ),
        CHECK (
          (status = 'pending' AND world_result_json IS NULL AND result_json IS NULL)
          OR
          (status = 'world_applied' AND world_result_json IS NOT NULL AND result_json IS NULL)
          OR
          (status = 'completed' AND world_result_json IS NOT NULL AND result_json IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS lingye_cross_store_operations_pending
        ON lingye_cross_store_operations(status, created_at, action_key);
    `);
    installEconomySchema(database);
    installCareerSchema(database);
    installSecuritySchema(database);
    ensureChefRecipeSchema(database);
    ensureChefCommerceSchema(database);
    ensureChefStoreSchema(database);
    installReporterBoardSnapshotSchema(database);
}

export function openLingyeWorldDatabase(databasePath = DEFAULT_LINGYE_WORLD_DATABASE_PATH) {
    const resolvedPath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
    if (resolvedPath !== ":memory:")
        mkdirSync(dirname(resolvedPath), { recursive: true });
    const database = new DatabaseSync(resolvedPath);
    try {
        database.exec("PRAGMA foreign_keys = ON");
        installLingyeWorldSchema(database);
        return database;
    }
    catch (error) {
        database.close();
        throw error;
    }
}

export function registerLingyeResidentReference(database, input) {
    const residentId = String(input.residentId ?? "").trim();
    const bindingReference = String(input.bindingReference ?? "").trim();
    if (!residentId || !bindingReference || !Number.isSafeInteger(input.registeredAt))
        throw new Error("Invalid Lingye resident reference");
    return runLingyeWorldTransaction(database, () => {
        const byResident = database
            .prepare("SELECT resident_id, binding_reference, registered_at FROM residents WHERE resident_id = ?")
            .get(residentId);
        if (byResident !== undefined) {
            if (byResident.binding_reference !== bindingReference)
                throw new Error("Lingye resident binding conflict");
            return {
                residentId: byResident.resident_id,
                bindingReference: byResident.binding_reference,
                registeredAt: byResident.registered_at,
            };
        }
        const byBinding = database
            .prepare("SELECT resident_id FROM residents WHERE binding_reference = ?")
            .get(bindingReference);
        if (byBinding !== undefined)
            throw new Error("Lingye resident binding conflict");
        database
            .prepare("INSERT INTO residents (resident_id, binding_reference, registered_at) VALUES (?, ?, ?)")
            .run(residentId, bindingReference, input.registeredAt);
        return { residentId, bindingReference, registeredAt: input.registeredAt };
    });
}

export function createLingyeFarmBalanceCoordinator(database, backend, options = {}) {
    const generateOperationId = options.generateOperationId ?? randomUUID;
    return (world, context, writeWorld, persistenceHints = null) => {
        const ownsDurableTransaction = !database.isTransaction;
        const publications = [];
        const result = runLingyeWorldTransaction(database, () => {
            const candidateFarmIds = Array.isArray(persistenceHints?.farmIds)
                ? new Set(persistenceHints.farmIds)
                : null;
            world.farms = world.farms.map((farm) => {
                if (!farm?.doorbellMcpMigration?.migrationId ||
                    (candidateFarmIds && !candidateFarmIds.has(farm.id)))
                    return farm;
                const staged = structuredClone(farm);
                publications.push({ target: farm, staged });
                return staged;
            });
            const migrated = world.farms.filter((farm) => farm?.doorbellMcpMigration?.migrationId);
            const byResident = new Set();
            for (const farm of migrated) {
                const migration = farm.doorbellMcpMigration;
                const residentId = String(migration.residentId ?? "").trim();
                const bindingReference = String(migration.migrationId ?? "").trim();
                if (!residentId || byResident.has(residentId))
                    throw new Error("Migrated farm resident binding is unavailable or duplicated");
                byResident.add(residentId);
                const registeredAt = Number.isFinite(Date.parse(migration.revokedAt))
                    ? Date.parse(migration.revokedAt)
                    : Date.now();
                registerLingyeResidentReference(database, { residentId, bindingReference, registeredAt });
                const account = database.prepare("SELECT resident_id FROM economy_accounts WHERE resident_id = ?").get(residentId);
                if (account === undefined) {
                    backend.trustedSystemCommands.importLegacyBalances({
                        residentId,
                        gold: migration.legacyGold,
                        silver: migration.legacySilver,
                        migrationId: bindingReference,
                        idempotencyKey: `farm-migration:${bindingReference}:legacy-balances`,
                    });
                }
            }
            const ledgerAuthority = context?.balanceAuthority === "ledger";
            const changes = [];
            const farmChanges = [];
            const persistenceFarmIds = new Set();
            for (const farm of migrated) {
                const migration = farm.doorbellMcpMigration;
                const residentId = migration.residentId;
                const account = backend.trustedQueries.getAccount(residentId);
                if (ledgerAuthority) {
                    // A caller-owned SQL transaction may contain only the
                    // receipt-only Chef completion. Balance projection waits
                    // until that transaction commits and the server performs
                    // its explicit post-commit sync.
                    if (!ownsDurableTransaction)
                        continue;
                    farm.coins = account.availableGold;
                    farm.silver = account.availableSilver;
                    migration.balanceProjection = {
                        authority: "ledger",
                        operationId: String(context?.operationId ?? generateOperationId()),
                        gold: account.availableGold,
                        silver: account.availableSilver,
                    };
                    persistenceFarmIds.add(farm.id);
                    continue;
                }
                const projection = migration.balanceProjection;
                const rolledBackLedgerProjection = projection?.authority === "ledger" &&
                    (projection.gold !== account.availableGold || projection.silver !== account.availableSilver);
                if (rolledBackLedgerProjection) {
                    farm.coins = account.availableGold;
                    farm.silver = account.availableSilver;
                    migration.balanceProjection = {
                        authority: "ledger",
                        operationId: String(projection.operationId),
                        gold: account.availableGold,
                        silver: account.availableSilver,
                    };
                    persistenceFarmIds.add(farm.id);
                    continue;
                }
                if (farm.coins !== account.availableGold || farm.silver !== account.availableSilver) {
                    changes.push({ residentId, gold: farm.coins, silver: farm.silver });
                    farmChanges.push(farm);
                }
                else if (!projection) {
                    migration.balanceProjection = {
                        authority: "farm",
                        operationId: String(migration.migrationId),
                        gold: farm.coins,
                        silver: farm.silver,
                    };
                    persistenceFarmIds.add(farm.id);
                }
            }
            if (changes.length > 0) {
                const operationId = generateOperationId();
                backend.trustedSystemCommands.applyFarmBalanceChanges({
                    actor: context?.actor ?? "human",
                    changes,
                    businessReference: `farm-balance:${operationId}`,
                    idempotencyKey: `farm-balance:${operationId}`,
                });
                for (const farm of farmChanges) {
                    farm.doorbellMcpMigration.balanceProjection = {
                        authority: "farm",
                        operationId: String(operationId),
                        gold: farm.coins,
                        silver: farm.silver,
                    };
                    persistenceFarmIds.add(farm.id);
                }
            }
            captureReporterBoardSnapshots(database, world.farms, options.now?.() ?? Date.now());
            return writeWorld({
                farmIds: [...persistenceFarmIds],
                componentKeys: [],
                durableBoundary: ownsDurableTransaction,
            });
        });
        for (const { target, staged } of publications) {
            for (const key of Object.keys(target))
                delete target[key];
            Object.assign(target, staged);
        }
        return result;
    };
}

const CHEF_CLIENT_IDENTITY_FIELDS = Object.freeze([
    "ownerResidentId",
    "owner_resident_id",
    "buyerResidentId",
    "buyer_resident_id",
    "cookResidentId",
    "cook_resident_id",
    "residentId",
    "resident_id",
    "actor",
    "actorResidentId",
    "actor_resident_id",
    "authorResidentId",
    "author_resident_id",
    "workerResidentId",
    "worker_resident_id",
]);

function assertChefClientInput(input, extraFields = []) {
    if (input === null || typeof input !== "object" || Array.isArray(input))
        return;
    const forbidden = [...CHEF_CLIENT_IDENTITY_FIELDS, ...extraFields]
        .find((field) => Object.hasOwn(input, field));
    if (forbidden)
        throw new CareerDomainError(
            "chef_identity_fields_forbidden",
            "Chef commands derive resident identity from the authenticated backend session",
        );
}

function registeredLingyeResident(database, residentId) {
    return database
        .prepare("SELECT 1 FROM residents WHERE resident_id = ?")
        .get(residentId) !== undefined;
}

function activeChefQualificationLevel(database, residentId, now) {
    const row = database.prepare(`
      SELECT MAX(qualification_level) AS qualification_level
      FROM career_certificates
      WHERE resident_id = ? AND career = 'chef' AND status = 'active'
        AND (effective_at IS NULL OR effective_at <= ?)
    `).get(residentId, now);
    return Number.isSafeInteger(row?.qualification_level) ? row.qualification_level : 0;
}

function chefStoreQualification(database, { ownerResidentId, grade, now }) {
    const requiredLevel = grade === "special" ? 4 : 3;
    return activeChefQualificationLevel(database, ownerResidentId, now) >= requiredLevel;
}

function chefRecipeAccess(database, residentId, recipeId) {
    const recipe = getChefRecipe(database, recipeId);
    if (!recipe)
        return false;
    return recipe.authorResidentId === residentId || hasChefRecipeEntitlement(database, residentId, recipe.recipeId);
}

function accessibleChefRecipes(database, residentId) {
    if (!registeredLingyeResident(database, residentId))
        throw new CareerDomainError("chef_resident_not_registered", "The authenticated resident is not registered in Lingye");
    const rows = database.prepare(`
      SELECT DISTINCT recipe.recipe_id
      FROM career_chef_original_recipes AS recipe
      LEFT JOIN chef_recipe_entitlements AS entitlement
        ON entitlement.recipe_id = recipe.recipe_id
       AND entitlement.resident_id = ?
       AND entitlement.revoked_at IS NULL
      WHERE recipe.resident_id = ? OR entitlement.resident_id IS NOT NULL
      ORDER BY recipe.created_at, recipe.recipe_id
    `).all(residentId, residentId);
    return rows.map(({ recipe_id }) => getChefRecipe(database, recipe_id));
}

function stableChefStoreOpeningInput(input, residentId) {
    const payload = { ...(input ?? {}) };
    if (payload.leaseId === undefined &&
        typeof payload.idempotencyKey === "string" &&
        payload.idempotencyKey.length > 0 &&
        payload.idempotencyKey.trim() === payload.idempotencyKey) {
        const suffix = createHash("sha256")
            .update(`${residentId}\u0000${payload.idempotencyKey}`, "utf8")
            .digest("hex");
        payload.leaseId = `chef-store-lease:${suffix}`;
    }
    return payload;
}

function chefAuthorityOption(options, authority, ...names) {
    for (const name of names) {
        if (typeof authority?.[name] === "function")
            return authority[name];
        if (typeof options?.[name] === "function")
            return options[name];
    }
    return undefined;
}

export function createLingyeWorldBackend(database, options) {
    if (!options?.economyRules)
        throw new Error("Lingye economy rules are required");
    const shared = {
        database,
        ...(options.curriculum === undefined ? {} : { curriculum: options.curriculum }),
        ...(options.constableInterviewBank === undefined ? {} : { constableInterviewBank: options.constableInterviewBank }),
        ...(options.constableExamEligibility === undefined ? {} : { constableExamEligibility: options.constableExamEligibility }),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
    };
    const economy = new EconomyService(database, {
        rules: options.economyRules,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
    });
    const securityAuthority = options.securityAuthority ?? {};
    const security = new LingyeSecurityService(database, {
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
        ...(securityAuthority.getCaughtCropTheftFact === undefined
            ? {}
            : { getCaughtCropTheftFact: securityAuthority.getCaughtCropTheftFact }),
        authorizeConstableCatch: securityAuthority.authorizeConstableCatch ?? ((input) => Boolean(database.prepare(`
          SELECT 1
          FROM career_jobs AS job
          JOIN career_duty_days AS duty
            ON duty.resident_id = job.worker_resident_id
           AND duty.career = 'constable'
           AND duty.institution = 'public_security'
          WHERE job.worker_resident_id = ?
            AND job.career = 'constable'
            AND job.status IN ('accepted', 'assigned', 'active')
            AND job.decision_count >= 1
            AND (job.source_id = ? OR job.object_id = ?)
            AND duty.status = 'scheduled'
            AND duty.duty_date = ?
          LIMIT 1
        `).get(input.actorResidentId, input.sourceId, input.sourceId, beijingDate(input.caughtAt)))),
        listPunishableSystemLoanFacts: (input) => economy.listPunishableSystemLoanFacts(input),
        getPunishableSystemLoanFact: (input) => economy.getPunishableSystemLoanFact(input),
        payDetentionEarlyRelease: (input) => economy.payDetentionEarlyRelease(input),
    });
    const school = new CareerSchoolService(shared);
    const employment = new CareerEmploymentService(shared);
    const jobs = new CareerJobService(shared);
    const authorityAssignment = new CareerAuthorityAssignmentService({ ...shared, jobs });
    const atomic = (operation) => {
        const ownsTransaction = !database.isTransaction;
        return runLingyeWorldTransaction(database, () => {
            const result = operation();
            if (ownsTransaction) seedReporterBoardSnapshotsFromCommittedWorld(database, options.now?.() ?? Date.now());
            return result;
        });
    };
    const chefAuthority = options.chefAuthority ?? options.chef ?? {};
    const chefNow = options.now ?? Date.now;
    const configuredOriginalRecipeResolver = chefAuthorityOption(
        options,
        chefAuthority,
        "resolveOriginalRecipe",
        "resolveChefOriginalRecipe",
    );
    const configuredCookingReceiptResolver = chefAuthorityOption(
        options,
        chefAuthority,
        "resolveCookingReceipt",
        "resolveChefCookingReceipt",
    );
    const configuredRecipeInventoryFactory = chefAuthorityOption(
        options,
        chefAuthority,
        "createRecipeInventoryAdapter",
        "createChefFarmInventoryAdapter",
    );
    const configuredResidentResolver = chefAuthorityOption(
        options,
        chefAuthority,
        "isRealResident",
        "resolveResident",
    );
    const configuredListingPreparer = chefAuthorityOption(
        options,
        chefAuthority,
        "prepareOpeningListing",
        "prepareChefStoreListing",
    );
    const configuredListingRollback = chefAuthorityOption(
        options,
        chefAuthority,
        "rollbackOpeningListing",
        "rollbackChefStoreListing",
    );
    const configuredOrderExecutor = chefAuthorityOption(
        options,
        chefAuthority,
        "executeOrder",
        "executeChefStoreOrder",
    );
    const configuredDebtRecorder = chefAuthorityOption(
        options,
        chefAuthority,
        "recordDebt",
        "recordChefStoreDebt",
    );
    const farmStoreOptions = chefAuthority.farmStoreOptions &&
        typeof chefAuthority.farmStoreOptions === "object" &&
        !Array.isArray(chefAuthority.farmStoreOptions)
        ? chefAuthority.farmStoreOptions
        : {};
    const farmStoreAuthority = chefAuthority.useFarmStore === true || options.useChefFarmStore === true
        ? createChefStoreFarmAdapter({ ...farmStoreOptions, database, economy, now: chefNow })
        : null;
    const listingPreparer = configuredListingPreparer ?? farmStoreAuthority?.prepareOpeningListing;
    const listingRollback = configuredListingRollback ?? farmStoreAuthority?.rollbackOpeningListing;
    const orderExecutor = configuredOrderExecutor ?? farmStoreAuthority?.executeOrder;
    const orderCompleter = configuredOrderExecutor === undefined
        ? farmStoreAuthority?.completeOrder
        : undefined;
    const resolveChefOriginalRecipe = (recipeId) => {
        const recipe = configuredOriginalRecipeResolver
            ? configuredOriginalRecipeResolver(recipeId)
            : getChefRecipe(database, recipeId);
        if (!recipe)
            return null;
        const authorResidentId = recipe.authorResidentId ?? recipe.authorId ?? recipe.residentId;
        return typeof authorResidentId === "string" && registeredLingyeResident(database, authorResidentId)
            ? recipe
            : null;
    };
    const resolveChefCookingReceipt = configuredCookingReceiptResolver
        ? (cookingReceiptId) => {
            const receipt = configuredCookingReceiptResolver(cookingReceiptId);
            if (!receipt || typeof receipt !== "object" || Array.isArray(receipt))
                return receipt;
            if (receipt.original === false || receipt.isOriginal === false || receipt.originalRecipe === false)
                return null;
            const rawRecipe = receipt.originalRecipe && typeof receipt.originalRecipe === "object"
                ? receipt.originalRecipe
                : receipt.recipe && typeof receipt.recipe === "object"
                    ? receipt.recipe
                    : receipt;
            const recipeId = receipt.recipeId ?? rawRecipe.recipeId ?? rawRecipe.id;
            if (typeof recipeId !== "string" || recipeId.length === 0)
                return null;
            const originalRecipe = resolveChefOriginalRecipe(recipeId);
            if (!originalRecipe)
                return null;
            return {
                ...receipt,
                original: true,
                originalRecipe,
            };
        }
        : undefined;
    const recipeInventoryForResident = (residentId) => {
        if (configuredRecipeInventoryFactory) {
            const inventory = configuredRecipeInventoryFactory({ database, residentId, now: chefNow });
            if (!inventory || typeof inventory !== "object")
                throw new CareerDomainError("chef_inventory_required", "The chef recipe inventory authority is unavailable");
            return inventory;
        }
        return createChefFarmInventoryAdapter({ database, residentId, now: chefNow });
    };
    const chefCommerce = new ChefCommerceService(database, {
        economy,
        now: chefNow,
        ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
        resolveOriginalRecipe: resolveChefOriginalRecipe,
        resolveCookingReceipt: resolveChefCookingReceipt,
    });
    const chefStore = new ChefStoreService(database, {
        economy,
        now: chefNow,
        ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
        ...(listingPreparer === undefined ? {} : { prepareOpeningListing: listingPreparer }),
        ...(listingRollback === undefined ? {} : { rollbackOpeningListing: listingRollback }),
        isRealResident: (residentId) => {
            if (!registeredLingyeResident(database, residentId))
                return false;
            return configuredResidentResolver ? configuredResidentResolver(residentId) : true;
        },
        ...(orderExecutor === undefined ? {} : { executeOrder: orderExecutor }),
        ...(orderCompleter === undefined ? {} : { completeOrder: orderCompleter }),
        ...(configuredDebtRecorder === undefined ? {} : { recordDebt: configuredDebtRecorder }),
        assertActiveChefQualification: (input) => chefStoreQualification(database, input),
    });
    const recoverChefStoreFarmState = () => {
        if (!farmStoreAuthority)
            return { orphanedListings: 0, pendingOrders: 0, restoredListings: 0 };
        const orphaned = farmStoreAuthority.recoverOrphanedListings();
        const pending = farmStoreAuthority.recoverPendingOrders({
            completeOrder: (input) => chefStore.placeOrder(input),
        });
        const terminated = farmStoreAuthority.reconcileTerminatedLeases();
        return {
            orphanedListings: orphaned.restoredListings,
            pendingOrders: pending.recovered,
            restoredListings: terminated.restoredListings,
        };
    };
    if (options.deferChefFarmRecovery !== true)
        recoverChefStoreFarmState();
    const reconcileChefStoreFarmListings = () =>
        farmStoreAuthority?.reconcileTerminatedLeases();
    const expireDueExamAttempts = (residentId) => {
        const now = options.now?.() ?? Date.now();
        const attempts = database
            .prepare(`SELECT attempt.attempt_id, attempt.registration_status,
                     reservation.reservation_id
              FROM career_exam_attempts AS attempt
              LEFT JOIN economy_system_gold_reservations AS reservation
                ON reservation.reserve_journal_id = attempt.reservation_receipt_id
              WHERE attempt.resident_id = ?
                AND attempt.registration_status IN ('registered', 'active')
                AND attempt.scheduled_at + ? <= ?
              ORDER BY attempt.scheduled_at, attempt.attempt_id`)
            .all(residentId, EXAM_SESSION_DURATION_MS, now);
        return attempts.map((attempt) => {
            if (attempt.registration_status === "active")
                return school.expireMissedExam(attempt.attempt_id);
            if (!attempt.reservation_id)
                throw new CareerDomainError("exam_expiry_settlement_required", "A missed registration fee has no reservation");
            const idempotencyKey = `career-exam:${attempt.attempt_id}:expire`;
            const settled = economy.settleSystemGoldReservation({
                reservationId: attempt.reservation_id,
                businessReference: idempotencyKey,
                idempotencyKey,
            });
            return school.expireMissedExam(attempt.attempt_id, settled.financialReceipt);
        });
    };
    const economyCommands = {
            importLegacyBalances: (input) => atomic(() => economy.importLegacyBalances(input)),
            creditFromSystem: (input) => atomic(() => economy.creditFromSystem(input)),
            chargeToSystem: (input) => atomic(() => economy.chargeToSystem(input)),
            reserveSystemGold: (input) => atomic(() => economy.reserveSystemGold(input)),
            settleSystemGoldReservation: (input) => atomic(() => economy.settleSystemGoldReservation(input)),
            releaseSystemGoldReservation: (input) => atomic(() => economy.releaseSystemGoldReservation(input)),
            setSilverAgentLock: (input) => atomic(() => economy.setSilverAgentLock(input)),
            depositDemandGold: (input) => atomic(() => economy.depositDemandGold(input)),
            withdrawDemandGold: (input) => atomic(() => economy.withdrawDemandGold(input)),
            accrueDemandInterest: (input) => atomic(() => economy.accrueDemandInterest(input)),
            openTermDeposit: (input) => atomic(() => economy.openTermDeposit(input)),
            closeTermDeposit: (input) => atomic(() => economy.closeTermDeposit(input)),
            exchangeGoldForSilver: (input) => atomic(() => economy.exchangeGoldForSilver(input)),
            createTrade: (input) => atomic(() => economy.createTrade(input)),
            confirmTrade: (input) => atomic(() => economy.confirmTrade(input)),
            settleTrade: (input) => atomic(() => economy.settleTrade(input)),
            cancelTrade: (input) => atomic(() => economy.cancelTrade(input)),
            refundTrade: (input) => atomic(() => economy.refundTrade(input)),
            reserveSilverEscrow: (input) => atomic(() => economy.reserveSilverEscrow(input)),
            settleSilverEscrowToResident: (input) => atomic(() => economy.settleSilverEscrowToResident(input)),
            releaseSilverEscrow: (input) => atomic(() => economy.releaseSilverEscrow(input)),
            openSystemLoan: (input) => atomic(() => economy.openSystemLoan(input)),
            repaySystemLoan: (input) => atomic(() => economy.repaySystemLoan(input)),
            proposePlayerLoan: (input) => atomic(() => economy.proposePlayerLoan(input)),
            confirmPlayerLoan: (input) => atomic(() => economy.confirmPlayerLoan(input)),
            cancelPlayerLoan: (input) => atomic(() => economy.cancelPlayerLoan(input)),
            repayPlayerLoan: (input) => atomic(() => economy.repayPlayerLoan(input)),
            refreshDebtStatus: (input) => atomic(() => economy.refreshDebtStatus(input)),
    };
    const careerCommands = {
            selectCareer: (residentId, career) => atomic(() => school.selectCareer(residentId, career)),
            enrollCourse: (input) => atomic(() => {
                const businessReference = `career-course:${input.residentId}:${input.career}:${input.level}:${input.courseIndex}`;
                const charged = economy.chargeToSystem({
                    residentId: input.residentId,
                    currency: "gold",
                    amount: input.amount,
                    actor: input.actor,
                    businessType: "career_tuition",
                    businessRef: businessReference,
                    idempotencyKey: input.idempotencyKey,
                });
                return school.enrollCourse({
                    residentId: input.residentId,
                    career: input.career,
                    level: input.level,
                    courseIndex: input.courseIndex,
                    tuitionReceipt: charged.financialReceipt,
                });
            }),
            markCourseContentRead: (input) => atomic(() => school.markCourseContentRead(input)),
            submitCoursePractice: (input) => atomic(() => school.submitCoursePractice(input)),
            registerExam: (input) => atomic(() => {
                expireDueExamAttempts(input.residentId);
                const businessReference = `career-exam:${input.attemptId}:reserve`;
                const reserved = economy.reserveSystemGold({
                    residentId: input.residentId,
                    amount: input.amount,
                    actor: input.actor,
                    businessReference,
                    idempotencyKey: input.idempotencyKey,
                });
                const registration = school.registerExam({
                    attemptId: input.attemptId,
                    residentId: input.residentId,
                    career: input.career,
                    level: input.level,
                    reservationReceipt: reserved.financialReceipt,
                });
                return {
                    ...registration,
                    reservationId: reserved.reservation_id,
                    reservationReceiptId: reserved.financialReceipt.receiptId,
                };
            }),
            expireDueExamAttempts: (residentId) => atomic(() => expireDueExamAttempts(residentId)),
            startExam: (input) => atomic(() => {
                const settled = economy.settleSystemGoldReservation({
                    reservationId: input.reservationId,
                    businessReference: `career-exam:${input.attemptId}:settle`,
                    idempotencyKey: input.idempotencyKey,
                });
                const paper = school.startExam(input.attemptId, settled.financialReceipt);
                return {
                    attemptId: input.attemptId,
                    reservationId: input.reservationId,
                    settlementReceiptId: settled.financialReceipt.receiptId,
                    ...paper,
                };
            }),
            releaseUnstartedExam: (input) => atomic(() => {
                const released = economy.releaseSystemGoldReservation({
                    reservationId: input.reservationId,
                    businessReference: `career-exam:${input.attemptId}:release`,
                    idempotencyKey: input.idempotencyKey,
                });
                school.releaseUnstartedExam(input.attemptId, released.financialReceipt);
                return {
                    attemptId: input.attemptId,
                    reservationId: input.reservationId,
                    releaseReceiptId: released.financialReceipt.receiptId,
                };
            }),
            submitWrittenExam: (input) => atomic(() => school.submitWrittenExam(input)),
            scheduleConstableInterview: (attemptId, scheduledAt) => atomic(() => school.scheduleConstableInterview(attemptId, scheduledAt)),
            signupConstableExaminer: (input) => atomic(() => school.signupConstableExaminer(input)),
            confirmConstableExaminerAttendance: (input) => atomic(() => school.confirmConstableExaminerAttendance(input)),
            finalizeConstableExaminerPanel: (interviewId) => atomic(() => school.finalizeConstableExaminerPanel(interviewId)),
            submitConstableInterviewScore: (input) => atomic(() => school.submitConstableInterviewScore(input)),
            advanceConstableInterviews: (now) => atomic(() => school.advanceConstableInterviews(now)),
            openConstablePublicNotice: (interviewId, eligibleVoterResidentIds, candidateResidentName) => atomic(() => school.openConstablePublicNotice(interviewId, eligibleVoterResidentIds, candidateResidentName)),
            voteConstablePublicNotice: (noticeId, residentId, choice) => atomic(() => school.voteConstablePublicNotice(noticeId, residentId, choice)),
            finalizeConstablePublicNotice: (noticeId, reviewPolicy) => atomic(() => school.finalizeConstablePublicNotice(noticeId, reviewPolicy)),
            hire: (input) => atomic(() => employment.hire(input)),
            hireResident: (input) => atomic(() => employment.hireResident(input)),
            setAvailability: (employmentId, availability) => atomic(() => employment.setAvailability(employmentId, availability)),
            endEmployment: (employmentId) => atomic(() => employment.endEmployment(employmentId)),
            generateNextDutyDays: () => atomic(() => employment.generateNextDutyDays()),
            advanceEmploymentDays: () => atomic(() => {
                const generated = employment.generateNextDutyDays();
                const settled = employment.dueDutyWages().map((quote) => {
                    const credited = economy.creditFromSystem({
                        residentId: quote.residentId,
                        currency: "gold",
                        amount: quote.totalGold,
                        businessType: "career_wage",
                        businessRef: `career-duty:${quote.dutyId}:wage`,
                        idempotencyKey: `career-duty:${quote.dutyId}:wage`,
                    });
                    return {
                        dutyId: quote.dutyId,
                        ...employment.settleDutyDay(quote.dutyId, credited.financialReceipt),
                    };
                });
                return { generated, settled };
            }),
            settleDutyDay: (input) => atomic(() => {
                const credited = economy.creditFromSystem({
                    residentId: input.residentId,
                    currency: "gold",
                    amount: input.amount,
                    businessType: "career_wage",
                    businessRef: `career-duty:${input.dutyId}:wage`,
                    idempotencyKey: input.idempotencyKey,
                });
                return employment.settleDutyDay(input.dutyId, credited.financialReceipt);
            }),
            createJob: (input) => atomic(() => jobs.createJob(input)),
            acceptJob: (jobId, workerResidentId) => atomic(() => jobs.acceptJob(jobId, workerResidentId)),
            assignAuthorityJob: (input) => atomic(() => authorityAssignment.assignJob(input)),
            recordDecision: (input) => atomic(() => jobs.recordDecision(input)),
            completeJob: (input) => atomic(() => {
                if (Object.hasOwn(input, "paymentReceipt") || Object.hasOwn(input, "expectedSilverPayment"))
                    throw new Error("Paid jobs must use completePaidJob");
                return jobs.completeJob(input);
            }),
            completePaidJob: (input) => atomic(() => {
                const settled = economy.settleTrade({
                    tradeId: input.tradeId,
                    idempotencyKey: input.tradeSettlementIdempotencyKey,
                });
                return jobs.completeJob({
                    ...input.completion,
                    paymentReceipt: settled.financialReceipt,
                    expectedSilverPayment: input.expectedSilverPayment,
                });
            }),
            cancelJob: (jobId) => atomic(() => jobs.cancelJob(jobId)),
            expireJob: (jobId, demandStillExists) => atomic(() => jobs.expireJob(jobId, demandStillExists)),
            transferJob: (input) => atomic(() => jobs.transferJob(input)),
            addReporterLikePerformance: (input) => atomic(() => {
                if (input.validLikes < 5) {
                    return jobs.addReporterLikePerformance({
                        idempotencyKey: input.idempotencyKey,
                        jobId: input.jobId,
                        validLikes: input.validLikes,
                        sourceReference: input.sourceReference,
                    });
                }
                const credited = economy.creditFromSystem({
                    residentId: input.residentId,
                    currency: "gold",
                    amount: input.amount,
                    businessType: "career_wage",
                    businessRef: `career-job:${input.jobId}:evaluation-performance`,
                    idempotencyKey: input.idempotencyKey,
                });
                return jobs.addReporterLikePerformance({
                    idempotencyKey: input.idempotencyKey,
                    jobId: input.jobId,
                    validLikes: input.validLikes,
                    sourceReference: input.sourceReference,
                    wageReceipt: credited.financialReceipt,
                });
            }),
    };
    const reporterNow = () => options.now?.() ?? Date.now();
    const reporterWithClock = (input) => ({ ...(input ?? {}), now: reporterNow() });
    const reporterWithResident = (input, residentId) => ({
        ...(input ?? {}),
        residentId,
        now: reporterNow(),
    });
    const assertReporterSettlementInput = (input) => {
        const payload = input ?? {};
        for (const field of [
            "validLikes",
            "amount",
            "residentId",
            "authorResidentId",
            "authorId",
            "financialReceipt",
            "wageReceipt",
        ]) {
            if (Object.hasOwn(payload, field))
                throw new CareerDomainError("reporter_authoritative_settlement_required", "Reporter evaluation is authoritative in the world backend");
        }
    };
    const publishReporterArticleAndComplete = (input) => {
        const publication = atomic(() => {
            const publicationNow = input?.publishedAt ?? reporterNow();
            const { publishedAt: _publishedAt, ...publicationInput } = input ?? {};
            const published = publishReporterArticle(database, {
                ...publicationInput,
                now: publicationNow,
            });
            const job = jobs.getJob(published.jobId);
            if (job.status !== "completed") {
                jobs.completeJob({
                    jobId: published.jobId,
                    workerResidentId: published.residentId,
                    validationPassed: true,
                    worldResultReference: `reporter-publication:${published.publicationId}`,
                });
            }
            else if (!database.prepare(`
          SELECT 1 FROM career_work_records
          WHERE job_id = ? AND resident_id = ? AND record_kind = 'completed'
            `).get(published.jobId, published.residentId)) {
                throw new CareerDomainError("reporter_work_record_missing", "The completed reporter work record is missing");
            }
            return published;
        });
        options.onReporterPublication?.(publication);
        return publication;
    };
    const reporterCommands = {
        registerReporterSourceFact: (input) => atomic(() => registerReporterSourceFact(database, reporterWithClock(input))),
        createReporterMaterialPack: (input) => atomic(() => createReporterMaterialPack(database, reporterWithClock(input))),
        reviewReporterArticle: (input) => atomic(() => reviewReporterArticle(database, {
            ...reporterWithClock(input),
            trustedReview: true,
        })),
        publishReporterArticle: publishReporterArticleAndComplete,
        quoteReporterEvaluation: (input) => atomic(() => {
            assertReporterSettlementInput(input);
            return quoteReporterEvaluation(database, reporterWithClock(input));
        }),
        settleReporterEvaluation: (input) => atomic(() => {
            assertReporterSettlementInput(input);
            const now = reporterNow();
            const quote = quoteReporterEvaluation(database, { ...(input ?? {}), now });
            let writerSettlement;
            if (quote.performanceUnits === 0) {
                writerSettlement = settleReporterEvaluation(database, {
                    jobId: quote.jobId,
                    publicationId: quote.publicationId,
                    now,
                });
            }
            else {
                const credited = economy.creditFromSystem({
                    residentId: quote.residentId,
                    currency: "gold",
                    amount: quote.performanceGold,
                    businessType: "career_wage",
                    businessRef: `career-job:${quote.jobId}:evaluation-performance`,
                    idempotencyKey: `reporter-evaluation:${quote.jobId}:credit`,
                });
                writerSettlement = settleReporterEvaluation(database, {
                    jobId: quote.jobId,
                    publicationId: quote.publicationId,
                    financialReceipt: credited.financialReceipt,
                    now,
                });
            }
            const workflow = reporterWorkflowForJob(database, quote.jobId);
            const collaborators = workflow
                ? [
                    ["selector", workflow.selectorJobId],
                    ["reviewer", workflow.reviewerJobId],
                ].map(([role, jobId]) => {
                    const collaborator = jobs.quoteReporterLikePerformance(jobId, quote.validLikes);
                    const idempotencyKey = `reporter-evaluation:${jobId}:credit`;
                    const sourceReference = `reporter:evaluation:${jobId}`;
                    if (collaborator.units === 0) {
                        return {
                            role,
                            ...jobs.addReporterLikePerformance({
                                idempotencyKey,
                                jobId,
                                validLikes: quote.validLikes,
                                sourceReference,
                            }),
                        };
                    }
                    const credited = economy.creditFromSystem({
                        residentId: collaborator.residentId,
                        currency: "gold",
                        amount: collaborator.performanceGold,
                        businessType: "career_wage",
                        businessRef: `career-job:${jobId}:evaluation-performance`,
                        idempotencyKey,
                    });
                    return {
                        role,
                        ...jobs.addReporterLikePerformance({
                            idempotencyKey,
                            jobId,
                            validLikes: quote.validLikes,
                            sourceReference,
                            wageReceipt: credited.financialReceipt,
                        }),
                    };
                })
                : [];
            return { ...writerSettlement, collaborators };
        }),
        settleDueReporterEvaluations: () =>
            dueReporterEvaluationJobIds(database, reporterNow()).map((jobId) =>
                reporterCommands.settleReporterEvaluation({ jobId })),
        recordReporterHumanLike: (input) => atomic(() =>
            recordReporterHumanLike(database, reporterWithClock(input))),
    };
    // Only commands whose services already verify an explicit resident actor belong here.
    // Future HTTP/MCP adapters must still inject that actor from authenticated identity.
    const residentCommands = Object.freeze({
        closeTermDeposit: economyCommands.closeTermDeposit,
        confirmTrade: economyCommands.confirmTrade,
        proposePlayerLoan: economyCommands.proposePlayerLoan,
        confirmPlayerLoan: economyCommands.confirmPlayerLoan,
        cancelPlayerLoan: economyCommands.cancelPlayerLoan,
        repayPlayerLoan: economyCommands.repayPlayerLoan,
        repaySystemLoan: economyCommands.repaySystemLoan,
    });
    const trustedSystemCommands = Object.freeze({
        importLegacyBalances: economyCommands.importLegacyBalances,
        applyFarmBalanceChanges: (input) => atomic(() => economy.applyFarmBalanceChanges(input)),
        creditFromSystem: economyCommands.creditFromSystem,
        chargeToSystem: economyCommands.chargeToSystem,
        reserveSystemGold: economyCommands.reserveSystemGold,
        settleSystemGoldReservation: economyCommands.settleSystemGoldReservation,
        releaseSystemGoldReservation: economyCommands.releaseSystemGoldReservation,
        setSilverAgentLock: economyCommands.setSilverAgentLock,
        depositDemandGold: economyCommands.depositDemandGold,
        withdrawDemandGold: economyCommands.withdrawDemandGold,
        accrueDemandInterest: economyCommands.accrueDemandInterest,
        openTermDeposit: economyCommands.openTermDeposit,
        exchangeGoldForSilver: economyCommands.exchangeGoldForSilver,
        createTrade: economyCommands.createTrade,
        settleTrade: economyCommands.settleTrade,
        cancelTrade: economyCommands.cancelTrade,
        refundTrade: economyCommands.refundTrade,
        reserveSilverEscrow: economyCommands.reserveSilverEscrow,
        settleSilverEscrowToResident: economyCommands.settleSilverEscrowToResident,
        releaseSilverEscrow: economyCommands.releaseSilverEscrow,
        openSystemLoan: economyCommands.openSystemLoan,
        refreshDebtStatus: economyCommands.refreshDebtStatus,
        runNpcLoanPatrol: (input) => security.runNpcLoanPatrol(input),
        catchCropTheft: (input) => atomic(() => security.catchCropTheft(input)),
        catchPunishableSystemLoan: (input) => atomic(() => security.catchPunishableSystemLoan(input)),
        ...careerCommands,
        ...reporterCommands,
        // Store expiry is the only chef mutation exposed to the trusted
        // system surface. Resident-initiated opening, rent, orders, recipe
        // purchases and production settlement stay behind forResident.
        reconcileChefStoreLease: (leaseId) => {
            const result = atomic(() => chefStore.reconcileLease(leaseId));
            reconcileChefStoreFarmListings();
            return result;
        },
        recoverChefStoreFarmState,
    });
    const trustedQueries = Object.freeze({
        getAccount: (residentId) => economy.getAccount(residentId),
        listPunishableSystemLoanFacts: (input = {}) => economy.listPunishableSystemLoanFacts(input),
        getPunishableSystemLoanFact: (input) => economy.getPunishableSystemLoanFact(input),
        getSecurityPatrolStatus: (input) => security.getPatrolStatus(input),
        getResidentDetention: (residentId, input) => security.getResidentDetention(residentId, input),
        listResidentDetentions: (residentId, input) => security.listResidentDetentions(residentId, input),
        isResidentDetained: (residentId, input) => security.isResidentDetained(residentId, input),
        quoteDetentionEarlyRelease: (input) => security.quoteEarlyRelease(input),
        getFinancialReceipt: (receiptId) => economy.getFinancialReceipt(receiptId),
        getSilverEscrow: (escrowId) => economy.getSilverEscrow(escrowId),
        getSilverEscrowReceipt: (receiptId) => economy.getSilverEscrowReceipt(receiptId),
        previewExchange: (residentId, goldPrincipal, at) => economy.previewExchange(residentId, goldPrincipal, at),
        getCourseContent: (input) => school.getCourseContent(input),
        courseAvailable: (career, level, courseIndex) => school.courseAvailable(career, level, courseIndex),
        examAvailable: (career, level) => school.examAvailable(career, level),
        getWrittenExamPaper: (attemptId) => school.getWrittenExamPaper(attemptId),
        getConstableInterviewMaterial: (interviewId) => school.getConstableInterviewMaterial(interviewId),
        constableExaminerEligible: (interviewId, residentId) => school.constableExaminerEligible(interviewId, residentId),
        hasScheduledDuty: (residentId, career, dutyDate) => employment.hasScheduledDuty(residentId, career, dutyDate),
        getJob: (jobId) => jobs.getJob(jobId),
        getReporterSourceFact: (sourceId) => getReporterSourceFact(database, sourceId),
        getReporterMaterialPack: (packId) => getReporterMaterialPack(database, packId),
        getReporterArticle: (articleId) => getReporterArticle(database, articleId),
        getReporterPublication: (publicationId) => getReporterPublication(database, publicationId),
        listReporterSections: () => listReporterSections(database),
        getReporterEvaluationQuote: (jobId) => getReporterEvaluationQuote(database, jobId),
        nextReporterEvaluationDueAt: () => nextReporterEvaluationDueAt(database),
        listReporterPublicationsForHuman: (input) =>
            listReporterPublicationsForHuman(database, reporterWithClock(input)),
        listReporterPublicationsForResident: (input) =>
            listReporterPublicationsForResident(database, reporterWithClock(input)),
        getChefRecipe: (recipeId) => getChefRecipe(database, recipeId),
        listChefRecipes: (residentId) => listChefRecipes(database, residentId),
        listAccessibleChefRecipes: (residentId) => accessibleChefRecipes(database, residentId),
        canUseChefRecipe: (residentId, recipeId) => chefRecipeAccess(database, residentId, recipeId),
        getChefRecipeResearch: (selector) => getChefRecipeResearch(database, selector),
        getChefStoreOrder: (orderId) => chefStore.getOrder(orderId),
    });
    const chefResidentInput = (input, field, residentId, extraFields = []) => {
        assertChefClientInput(input, extraFields);
        if (!registeredLingyeResident(database, residentId))
            throw new CareerDomainError("chef_resident_not_registered", "The authenticated resident is not registered in Lingye");
        return { ...(input ?? {}), [field]: residentId };
    };
    const ownChefStoreLease = (leaseId, residentId) => {
        const row = database.prepare(`
          SELECT owner_resident_id FROM chef_store_leases WHERE lease_id = ?
        `).get(leaseId);
        if (!row)
            throw new CareerDomainError("chef_store_lease_not_found", "The chef store lease was not found");
        if (row.owner_resident_id !== residentId)
            throw new CareerDomainError("chef_store_owner_mismatch", "The chef store lease belongs to another resident");
        const lease = chefStore.getLease(leaseId);
        reconcileChefStoreFarmListings();
        return lease;
    };
    const ownChefStoreOrder = (orderId, residentId) => {
        const order = chefStore.getOrder(orderId);
        if (!order || (order.ownerResidentId !== residentId && order.buyerResidentId !== residentId))
            throw new CareerDomainError("chef_store_order_not_found", "The chef store order was not found");
        return order;
    };
    const ownChefRecipeResearch = (operationId, residentId) => {
        if (typeof operationId !== "string" || operationId.length === 0 || operationId.trim() !== operationId)
            throw new CareerDomainError("chef_recipe_operation_not_found", "The chef recipe research operation was not found");
        const row = database.prepare(`
          SELECT resident_id FROM career_chef_recipe_research_operations
          WHERE operation_id = ?
        `).get(operationId);
        if (!row || row.resident_id !== residentId)
            throw new CareerDomainError("chef_recipe_operation_not_found", "The chef recipe research operation was not found");
    };
    const forResident = (authenticatedResidentId) => {
        if (typeof authenticatedResidentId !== "string" || authenticatedResidentId.length === 0)
            throw new Error("Authenticated resident id is required");
        const residentFacade = {
            acceptOwnJob: (jobId) => careerCommands.acceptJob(jobId, authenticatedResidentId),
            confirmTrade: (input) => residentCommands.confirmTrade({ ...input, actorResidentId: authenticatedResidentId }),
            closeOwnTermDeposit: (input) => residentCommands.closeTermDeposit({ ...input, actorResidentId: authenticatedResidentId }),
            proposePlayerLoan: (input) => residentCommands.proposePlayerLoan({ ...input, actorResidentId: authenticatedResidentId }),
            confirmPlayerLoan: (input) => residentCommands.confirmPlayerLoan({ ...input, actorResidentId: authenticatedResidentId }),
            cancelPlayerLoan: (input) => residentCommands.cancelPlayerLoan({ ...input, actorResidentId: authenticatedResidentId }),
            repayPlayerLoan: (input) => residentCommands.repayPlayerLoan({ ...input, actorResidentId: authenticatedResidentId }),
            repayOwnSystemLoan: (input) => residentCommands.repaySystemLoan({ ...input, actorResidentId: authenticatedResidentId }),
            getOwnDetention: (input) => security.getResidentDetention(authenticatedResidentId, input),
            listOwnDetentions: (input) => security.listResidentDetentions(authenticatedResidentId, input),
            quoteOwnDetentionEarlyRelease: (input) => security.quoteEarlyRelease({
                ...input,
                residentId: authenticatedResidentId,
            }),
            releaseOwnDetentionEarly: (input) => atomic(() => security.releaseEarly({
                ...input,
                residentId: authenticatedResidentId,
            })),
            recordOwnJobDecision: (input) => careerCommands.recordDecision({ ...input, workerResidentId: authenticatedResidentId }),
            transferOwnJob: (input) => careerCommands.transferJob({ ...input, workerResidentId: authenticatedResidentId }),
            getOwnAccount: () => economy.getAccount(authenticatedResidentId),
            getOwnFinancialReceipt: (receiptId) => {
                const receipt = economy.getFinancialReceipt(receiptId);
                if (receipt.residentId !== authenticatedResidentId)
                    throw new EconomyError("FINANCIAL_RECEIPT_NOT_FOUND", { receiptId });
                return receipt;
            },
            previewOwnExchange: (goldPrincipal, at) => economy.previewExchange(authenticatedResidentId, goldPrincipal, at),
            hasOwnScheduledDuty: (career, dutyDate) => employment.hasScheduledDuty(authenticatedResidentId, career, dutyDate),
            getVisibleJob: (jobId) => {
                const job = jobs.getJob(jobId);
                if (job.ownerResidentId !== authenticatedResidentId &&
                    job.workerResidentId !== authenticatedResidentId) {
                    throw new CareerDomainError("job_not_found", "Job not found");
                }
                return job;
            },
        };
        Object.defineProperties(residentFacade, {
            openChefStore: {
                value: (input) => {
                    const result = chefStore.openStore(
                        stableChefStoreOpeningInput(
                            chefResidentInput(input, "ownerResidentId", authenticatedResidentId),
                            authenticatedResidentId,
                        ),
                    );
                    reconcileChefStoreFarmListings();
                    return result;
                },
            },
            payChefStoreRent: {
                value: (input) => atomic(() => chefStore.payRent(
                    chefResidentInput(input, "ownerResidentId", authenticatedResidentId),
                )),
            },
            getOwnChefStoreLease: {
                value: (leaseId) => ownChefStoreLease(leaseId, authenticatedResidentId),
            },
            placeChefStoreOrder: {
                value: (input) => chefStore.placeOrder(
                    chefResidentInput(input, "buyerResidentId", authenticatedResidentId),
                ),
            },
            getOwnChefStoreOrder: {
                value: (orderId) => ownChefStoreOrder(orderId, authenticatedResidentId),
            },
            listOwnChefRecipes: {
                value: () => accessibleChefRecipes(database, authenticatedResidentId),
            },
            canUseOwnChefRecipe: {
                value: (recipeId) => chefRecipeAccess(database, authenticatedResidentId, recipeId),
            },
            researchOwnChefRecipe: {
                // Recipe research owns its own pending -> consumed -> final
                // transactions because inventory lives in the farm store.
                // Do not wrap the phase machine in the world transaction:
                // a farm receipt must survive a later SQLite phase failure so
                // recovery can replay it without consuming twice.
                value: (input) => researchChefRecipe(
                    database,
                    chefResidentInput(input, "residentId", authenticatedResidentId),
                    {
                        now: chefNow,
                        ...(typeof options.random === "function" ? { random: options.random } : {}),
                        inventory: recipeInventoryForResident(authenticatedResidentId),
                    },
                ),
            },
            recoverOwnChefRecipeResearch: {
                value: (operationId) => {
                    ownChefRecipeResearch(operationId, authenticatedResidentId);
                    return recoverChefRecipeResearch(database, operationId, {
                        now: chefNow,
                        ...(typeof options.random === "function" ? { random: options.random } : {}),
                        inventory: recipeInventoryForResident(authenticatedResidentId),
                    });
                },
            },
            purchaseChefOriginalRecipe: {
                value: (input) => atomic(() => chefCommerce.purchaseOriginalRecipe(
                    chefResidentInput(input, "buyerResidentId", authenticatedResidentId),
                )),
            },
            refundChefOriginalRecipePurchase: {
                value: (input) => atomic(() => chefCommerce.refundOriginalRecipePurchase(
                    chefResidentInput(input, "buyerResidentId", authenticatedResidentId),
                )),
            },
            recordChefOriginalRecipeProduction: {
                value: (input) => atomic(() => chefCommerce.recordOriginalRecipeProduction(
                    chefResidentInput(input, "cookResidentId", authenticatedResidentId, [
                        "recipeId",
                        "recipe_id",
                        "originalRecipe",
                        "original_recipe",
                        "recipe",
                        "success",
                        "successful",
                        "status",
                    ]),
                )),
            },
            claimReporterMaterialPack: {
                value: (input) => atomic(() => claimReporterMaterialPack(
                    database,
                    reporterWithResident(input, authenticatedResidentId),
                )),
            },
            returnReporterMaterialPack: {
                value: (input) => atomic(() => returnReporterMaterialPack(
                    database,
                    reporterWithResident(input, authenticatedResidentId),
                )),
            },
            submitReporterArticle: {
                value: (input) => atomic(() => submitReporterArticle(
                    database,
                    reporterWithResident(input, authenticatedResidentId),
                )),
            },
            submitReporterSupplement: {
                value: (input) => atomic(() => submitReporterSupplement(
                    database,
                    reporterWithResident(input, authenticatedResidentId),
                )),
            },
            createReporterCorrection: {
                value: (input) => atomic(() => createReporterCorrection(
                    database,
                    reporterWithResident(input, authenticatedResidentId),
                )),
            },
            createReporterSection: {
                value: (input) => atomic(() => createReporterSection(
                    database,
                    reporterWithResident(input, authenticatedResidentId),
                )),
            },
            recordReporterLike: {
                value: (input) => atomic(() => recordReporterLike(database, {
                    ...reporterWithResident(input, authenticatedResidentId),
                    actorKind: "resident",
                })),
            },
        });
        return Object.freeze(residentFacade);
    };
    const backend = { forResident, trustedSystemCommands, trustedQueries };
    if (options.exposeInternalsForTesting) {
        backend.testing = Object.freeze({
            economy,
            career: Object.freeze({ school, employment, jobs }),
            chef: Object.freeze({ commerce: chefCommerce, store: chefStore }),
        });
    }
    return Object.freeze(backend);
}
