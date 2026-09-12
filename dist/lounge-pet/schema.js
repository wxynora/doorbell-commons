export function installLoungePetSchema(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS lounge_pet_receipts (
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        request_id TEXT NOT NULL,
        farm_id TEXT NOT NULL,
        pet TEXT NOT NULL CHECK (pet IN ('cat', 'dog')),
        reward_day TEXT NOT NULL,
        reward_silver INTEGER NOT NULL CHECK (reward_silver IN (0, 5)),
        result_json TEXT NOT NULL,
        PRIMARY KEY (resident_id, request_id)
      );
      CREATE INDEX IF NOT EXISTS lounge_pet_rewards_by_day
        ON lounge_pet_receipts(resident_id, reward_day, reward_silver);
    `);
}
