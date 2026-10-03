export const COUNTERS = Object.freeze({
  theft: { table: "annual_theft_statistics", keys: ["actor_id", "target_id"], values: ["attempts", "successes", "dog_blocks", "crop_value"] },
  watering: { table: "annual_watering_statistics", keys: ["actor_id", "target_id"], values: ["actions", "plots"] },
  cooking: { table: "annual_cooking_statistics", keys: ["actor_id", "recipe_id"], values: ["cooked", "unlocked", "odd"] },
  dispatch: { table: "annual_dispatch_statistics", keys: ["actor_id", "target_id", "animal_kind"], values: ["dispatched", "returned", "caught", "goose_blocks", "earned_gold", "compensation_gold"] },
  work: { table: "annual_work_statistics", keys: ["resident_id", "career"], values: ["duty_days", "accepted_jobs", "accepted_commissions", "completed_jobs", "completed_commissions"] },
});

export function installAnnualStatisticsSchema(database) {
  for (const spec of Object.values(COUNTERS)) {
    database.exec(`CREATE TABLE IF NOT EXISTS ${spec.table} (
      year INTEGER NOT NULL,
      ${spec.keys.map(key => `${key} TEXT NOT NULL`).join(",")},
      ${spec.values.map(key => `${key} INTEGER NOT NULL DEFAULT 0 CHECK (${key} >= 0)`).join(",")},
      first_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
      PRIMARY KEY (year, ${spec.keys.join(",")})
    )`);
  }
  const year = field => `CAST(strftime('%Y', ${field} / 1000.0, 'unixepoch', '+8 hours') AS INTEGER)`;
  const accepted = (row, at) => `
    INSERT INTO annual_work_statistics
      (year,resident_id,career,accepted_jobs,accepted_commissions,first_at,last_at)
    VALUES (${year(at)},${row}.worker_resident_id,${row}.career,1,${row}.service_commission,${at},${at})
    ON CONFLICT(year,resident_id,career) DO UPDATE SET
      accepted_jobs=accepted_jobs+1,accepted_commissions=accepted_commissions+excluded.accepted_commissions,
      first_at=min(first_at,excluded.first_at),last_at=max(last_at,excluded.last_at);`;
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS annual_cooking_original_recipe AFTER INSERT ON career_chef_original_recipes
    BEGIN
      INSERT INTO annual_cooking_statistics (year,actor_id,recipe_id,unlocked,first_at,last_at)
      SELECT ${year("NEW.created_at")},farm_id,NEW.recipe_id,1,NEW.created_at,NEW.created_at
      FROM farm_states WHERE json_extract(state_json,'$.doorbellMcpMigration.residentId')=NEW.resident_id
      ON CONFLICT(year,actor_id,recipe_id) DO UPDATE SET unlocked=max(unlocked,1),
        first_at=min(first_at,excluded.first_at),last_at=max(last_at,excluded.last_at);
    END;
    CREATE TRIGGER IF NOT EXISTS annual_cooking_original_unlock AFTER INSERT ON chef_recipe_entitlements
    WHEN NOT EXISTS (SELECT 1 FROM chef_recipe_entitlements AS prior
      WHERE prior.resident_id=NEW.resident_id AND prior.recipe_id=NEW.recipe_id
        AND (prior.source_kind<>NEW.source_kind OR prior.source_reference<>NEW.source_reference))
      AND NOT EXISTS (SELECT 1 FROM career_chef_original_recipes
        WHERE resident_id=NEW.resident_id AND recipe_id=NEW.recipe_id)
    BEGIN
      INSERT INTO annual_cooking_statistics (year,actor_id,recipe_id,unlocked,first_at,last_at)
      SELECT ${year("NEW.created_at")},farm_id,NEW.recipe_id,1,NEW.created_at,NEW.created_at
      FROM farm_states WHERE json_extract(state_json,'$.doorbellMcpMigration.residentId')=NEW.resident_id
      ON CONFLICT(year,actor_id,recipe_id) DO UPDATE SET unlocked=max(unlocked,1),
        first_at=min(first_at,excluded.first_at),last_at=max(last_at,excluded.last_at);
    END;
    CREATE TRIGGER IF NOT EXISTS annual_work_accept_insert AFTER INSERT ON career_jobs
    WHEN NEW.worker_resident_id IS NOT NULL AND NEW.status IN ('accepted','assigned','active')
    BEGIN ${accepted("NEW", "coalesce(NEW.accepted_at, NEW.created_at)")} END;
    CREATE TRIGGER IF NOT EXISTS annual_work_accept_update AFTER UPDATE ON career_jobs
    WHEN NEW.worker_resident_id IS NOT NULL AND NEW.status IN ('accepted','assigned','active')
      AND (OLD.worker_resident_id IS NOT NEW.worker_resident_id OR
           (OLD.status NOT IN ('accepted','assigned','active') AND NEW.status IN ('accepted','assigned','active')))
    BEGIN ${accepted("NEW", "coalesce(NEW.accepted_at, NEW.updated_at)")} END;
    CREATE TRIGGER IF NOT EXISTS annual_work_complete AFTER INSERT ON career_work_records
    WHEN NEW.record_kind='completed'
    BEGIN
      INSERT INTO annual_work_statistics
        (year,resident_id,career,completed_jobs,completed_commissions,first_at,last_at)
      VALUES (${year("NEW.recorded_at")},NEW.resident_id,NEW.career,1,
        (SELECT service_commission FROM career_jobs WHERE job_id=NEW.job_id),NEW.recorded_at,NEW.recorded_at)
      ON CONFLICT(year,resident_id,career) DO UPDATE SET
        completed_jobs=completed_jobs+1,completed_commissions=completed_commissions+excluded.completed_commissions,
        first_at=min(first_at,excluded.first_at),last_at=max(last_at,excluded.last_at);
    END;
    CREATE TRIGGER IF NOT EXISTS annual_work_duty AFTER UPDATE OF status ON career_duty_days
    WHEN OLD.status='scheduled' AND NEW.status='settled'
    BEGIN
      INSERT INTO annual_work_statistics (year,resident_id,career,duty_days,first_at,last_at)
      VALUES (CAST(substr(NEW.duty_date,1,4) AS INTEGER),NEW.resident_id,NEW.career,1,
        CAST(strftime('%s',NEW.duty_date || 'T00:00:00+08:00') AS INTEGER)*1000,
        CAST(strftime('%s',NEW.duty_date || 'T00:00:00+08:00') AS INTEGER)*1000)
      ON CONFLICT(year,resident_id,career) DO UPDATE SET duty_days=duty_days+1,
        first_at=min(first_at,excluded.first_at),last_at=max(last_at,excluded.last_at);
    END;
  `);
}
