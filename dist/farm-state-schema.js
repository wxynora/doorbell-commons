import {FARM_RECORD_SCHEMA_SQL,encodeStateRecords,decodeStateRecords,writeRecordChanges} from "./farm-state-records.js";

export const FARM_IDENTITY_SCHEMA_SQL = `
  CREATE TABLE farm_states (
    farm_id TEXT PRIMARY KEY CHECK(length(farm_id)>0),
    position INTEGER NOT NULL UNIQUE CHECK(position>=0),
    resident_id TEXT, state_revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX farm_states_resident ON farm_states(resident_id);
  CREATE TABLE farm_action_receipts (
    farm_id TEXT NOT NULL REFERENCES farm_states(farm_id) ON DELETE RESTRICT,
    scope TEXT NOT NULL CHECK(length(scope)>0), receipt_key TEXT NOT NULL,
    payload_hash TEXT NOT NULL CHECK(length(payload_hash)>0),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    PRIMARY KEY(farm_id,scope,receipt_key)
  ) WITHOUT ROWID;
  CREATE TABLE world_components(component_key TEXT PRIMARY KEY CHECK(length(component_key)>0 AND component_key<>'farms'));
  ${FARM_RECORD_SCHEMA_SQL}
`;

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
function convert(database, type, owner, value) {
    const records = encodeStateRecords(value);
    if (JSON.stringify(canonical(value)) !== JSON.stringify(canonical(decodeStateRecords(records))))
        throw new Error("farm_record_migration_mismatch");
    writeRecordChanges(database,type,owner,[...records].map(([path,after])=>({path,after})));
}

// Called inside the schema owner's transaction. The old columns are removed
// only after every farm/component has been losslessly decomposed.
export function migrateFarmRecordsV3ToV4(database) {
    database.exec(FARM_RECORD_SCHEMA_SQL);
    database.exec(`ALTER TABLE farm_states ADD COLUMN resident_id TEXT;
      ALTER TABLE farm_states ADD COLUMN state_revision INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX farm_states_resident ON farm_states(resident_id);`);
    for (const row of database.prepare("SELECT farm_id,state_json FROM farm_states").all()) {
        const farm = JSON.parse(row.state_json);
        convert(database,"farm",row.farm_id,farm);
        database.prepare("UPDATE farm_states SET resident_id=? WHERE farm_id=?")
            .run(farm.doorbellMcpMigration?.residentId ?? null,row.farm_id);
    }
    for (const row of database.prepare("SELECT component_key,state_json FROM world_components").all())
        convert(database,"world",row.component_key,JSON.parse(row.state_json));
    // Triggers referencing the old aggregate column are reinstalled by their
    // own domain installers after the structural migration.
    for (const row of database.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all()) {
        if (/\bfarm_states\b/.test(row.sql) && /\bstate_json\b/.test(row.sql))
            database.exec(`DROP TRIGGER "${row.name.replaceAll('"','""')}"`);
    }
    database.exec("ALTER TABLE farm_states DROP COLUMN state_json; ALTER TABLE world_components DROP COLUMN state_json;");
    database.prepare("UPDATE lingye_world_schema_meta SET schema_version=4 WHERE singleton_id=1").run();
}
