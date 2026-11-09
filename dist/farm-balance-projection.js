// Pending entries belong to the same SQLite transaction as the ledger change.
export function installFarmBalanceProjectionTracking(database) {
    const installed = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'farm_balance_projection_pending'").get();
    database.exec('SAVEPOINT farm_balance_projection_install');
    try {
        database.exec(`
      CREATE TABLE IF NOT EXISTS farm_balance_projection_pending (
        resident_id TEXT PRIMARY KEY REFERENCES economy_accounts(resident_id) ON DELETE CASCADE
      ) WITHOUT ROWID;
      CREATE TRIGGER IF NOT EXISTS farm_balance_projection_account_insert
      AFTER INSERT ON economy_accounts BEGIN
        INSERT OR IGNORE INTO farm_balance_projection_pending (resident_id) VALUES (NEW.resident_id);
      END;
      CREATE TRIGGER IF NOT EXISTS farm_balance_projection_account_update
      AFTER UPDATE OF available_gold, available_silver ON economy_accounts
      WHEN OLD.available_gold IS NOT NEW.available_gold OR OLD.available_silver IS NOT NEW.available_silver
      BEGIN
        INSERT OR IGNORE INTO farm_balance_projection_pending (resident_id) VALUES (NEW.resident_id);
      END;
    `);
        // An existing database has no markers for balances changed before this
        // feature existed. Seed once, atomically with installing the triggers.
        if (!installed)
            database.exec('INSERT INTO farm_balance_projection_pending SELECT resident_id FROM economy_accounts');
        database.exec('RELEASE SAVEPOINT farm_balance_projection_install');
    } catch (error) {
        database.exec('ROLLBACK TO SAVEPOINT farm_balance_projection_install');
        database.exec('RELEASE SAVEPOINT farm_balance_projection_install');
        throw error;
    }
}

export function synchronizeFarmBalanceProjections(database, listFarms, save) {
    return withFarmMutationScope(() => {
    const pending = database.prepare('SELECT resident_id FROM farm_balance_projection_pending').all();
    if (pending.length === 0) return;
    const residents = new Set(pending.map(row => row.resident_id));
    const affected = listFarms().filter(farm => residents.has(farm?.doorbellMcpMigration?.residentId));
    for (const farm of affected) captureFarmMutation(farm);
    const farmIds = affected.map(farm => farm.id);
    if (farmIds.length > 0)
        save({ farmIds, componentKeys: [], pendingBalanceProjection: true });
    });
}

// Call only after the candidate farms are written, inside their owning
// transaction. A later account change leaves its marker intact.
export function clearCommittedFarmBalanceProjections(database, farms, committedFarmIds) {
    const clear = database.prepare(`
      DELETE FROM farm_balance_projection_pending
      WHERE resident_id = ? AND EXISTS (
        SELECT 1 FROM economy_accounts
        WHERE resident_id = ? AND available_gold = ? AND available_silver = ?
      )
    `);
    for (const farm of farms) {
        if (!committedFarmIds.has(farm.id)) continue;
        const residentId = farm.doorbellMcpMigration?.residentId;
        if (typeof residentId !== 'string' || !residentId) continue;
        clear.run(residentId, residentId, farm.coins, farm.silver);
    }
}
import { withFarmMutationScope, captureFarmMutation } from './farm-mutation-scope.js';
