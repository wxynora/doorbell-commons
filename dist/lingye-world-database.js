import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CareerEmploymentService } from "./career/employment-service.js";
import { CareerJobService } from "./career/job-service.js";
import { installCareerSchema } from "./career/schema.js";
import { CareerSchoolService } from "./career/school-service.js";
import { installEconomySchema } from "./economy/economy-schema.js";
import { EconomyService } from "./economy/economy-service.js";

export const LINGYE_WORLD_SCHEMA_VERSION = 1;

const DEFAULT_DATA_DIR = process.env.AIFARM_DATA_DIR
    ? resolve(process.env.AIFARM_DATA_DIR)
    : resolve(dirname(fileURLToPath(import.meta.url)), "../data");

export const DEFAULT_LINGYE_WORLD_DATABASE_PATH = resolve(DEFAULT_DATA_DIR, "lingye-world.sqlite");

export function runLingyeWorldTransaction(database, operation) {
    if (database.isTransaction)
        return operation();
    database.exec("BEGIN IMMEDIATE");
    try {
        const result = operation();
        database.exec("COMMIT");
        return result;
    }
    catch (error) {
        if (database.isTransaction)
            database.exec("ROLLBACK");
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
          schema_version INTEGER NOT NULL CHECK (schema_version = ${LINGYE_WORLD_SCHEMA_VERSION})
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
      `);
        });
    }
    const version = database
        .prepare("SELECT schema_version FROM lingye_world_schema_meta WHERE singleton_id = 1")
        .get();
    if (version?.schema_version !== LINGYE_WORLD_SCHEMA_VERSION)
        throw new Error(`Unsupported Lingye world schema version: ${version?.schema_version ?? "missing"}`);
    installEconomySchema(database);
    installCareerSchema(database);
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

export function createLingyeWorldServices(database, options) {
    if (!options?.economyRules)
        throw new Error("Lingye economy rules are required");
    const shared = {
        database,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
    };
    return {
        economy: new EconomyService(database, {
            rules: options.economyRules,
            ...(options.now === undefined ? {} : { now: options.now }),
            ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
        }),
        career: {
            school: new CareerSchoolService(shared),
            employment: new CareerEmploymentService(shared),
            jobs: new CareerJobService(shared),
        },
    };
}
