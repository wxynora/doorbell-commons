import { NPC_ID } from "../config.js";
import { economyGoldSpentToday } from "../daily-spend.js";
import { buildLeaderboards } from "../leaderboard.js";
import { currentDayIndex } from "../time.js";
import { equippedTitle } from "../titles.js";

const DAILY_KEYS = ["tasks", "logins", "messages", "events", "stolen", "watered", "coinSpend", "oddDishes"];
const VALUE_KEYS = [...DAILY_KEYS, "raidIncome", "raidLoss"];
const COLUMNS = ["day_index", "farm_id", "farm_order", "name", "title", "title_color", "resident_id", "binding_reference", ...VALUE_KEYS];

export function installReporterBoardSnapshotSchema(database) {
    database.exec(`CREATE TABLE IF NOT EXISTS career_reporter_board_snapshots (
      day_index INTEGER NOT NULL, farm_id TEXT NOT NULL, farm_order INTEGER NOT NULL,
      name TEXT NOT NULL, title TEXT, title_color TEXT, resident_id TEXT, binding_reference TEXT,
      tasks INTEGER NOT NULL, logins INTEGER NOT NULL, messages INTEGER NOT NULL, events INTEGER NOT NULL,
      stolen INTEGER NOT NULL, watered INTEGER NOT NULL, coinSpend INTEGER NOT NULL, oddDishes INTEGER NOT NULL,
      raidIncome INTEGER NOT NULL, raidLoss INTEGER NOT NULL,
      PRIMARY KEY(day_index, farm_id)
    );
    CREATE TABLE IF NOT EXISTS career_reporter_board_snapshot_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      open_day INTEGER NOT NULL
    )`);
}

function applyDayCounters(row, farm, day) {
    if (farm.daily?.day === day)
        for (const key of DAILY_KEYS) row[key] = farm.daily[key] ?? 0;
    for (const key of ["raidIncome", "raidLoss"])
        if (farm.ranch?.[key]?.day === day) row[key] = farm.ranch[key].n ?? 0;
    return row;
}

// Read before the first new-day farm write can replace yesterday's counters.
function sealCommittedDay(database, day) {
    const rows = database.prepare(`SELECT f.farm_id, f.position,
      json_extract(f.state_json, '$.name') AS name,
      json_extract(f.state_json, '$.daily') AS daily,
      json_extract(f.state_json, '$.ranch.raidIncome') AS raid_income,
      json_extract(f.state_json, '$.ranch.raidLoss') AS raid_loss,
      json_extract(f.state_json, '$.titleEquipped') AS equipped,
      json_extract(f.state_json, '$.titles') AS titles,
      json_extract(f.state_json, '$.doorbellMcpMigration.residentId') AS resident_id,
      json_extract(f.state_json, '$.doorbellMcpMigration.migrationId') AS binding_reference
      FROM farm_states f WHERE f.farm_id <> ? ORDER BY f.position`).all(NPC_ID);
    const parse = value => value === null ? undefined : JSON.parse(value);
    const write = database.prepare(`INSERT INTO career_reporter_board_snapshots (${COLUMNS.join(",")})
      VALUES (${COLUMNS.map(() => "?").join(",")}) ON CONFLICT(day_index, farm_id) DO UPDATE SET
      ${COLUMNS.filter(key => !["day_index", "farm_id"].includes(key)).map(key => `${key}=excluded.${key}`).join(",")}`);
    for (const source of rows) {
        const farm = {
            daily: parse(source.daily),
            ranch: { raidIncome: parse(source.raid_income), raidLoss: parse(source.raid_loss) },
            titleEquipped: source.equipped, titles: parse(source.titles),
        };
        const title = equippedTitle(farm);
        const row = applyDayCounters({
            day_index: day, farm_id: source.farm_id, farm_order: source.position, name: source.name,
            title: title?.name ?? null, title_color: title?.color ?? null,
            resident_id: source.resident_id, binding_reference: source.binding_reference,
            ...Object.fromEntries(VALUE_KEYS.map(key => [key, 0])),
        }, farm, day);
        write.run(...COLUMNS.map(key => row[key]));
    }
}

// The existing midnight duty cycle and first cross-day commit use the same
// transaction-owned boundary. The marker rolls back with its archived rows.
export function advanceReporterBoardSnapshotDay(database, now) {
    const today = currentDayIndex(now);
    let state = database.prepare("SELECT open_day FROM career_reporter_board_snapshot_state WHERE singleton = 1").get();
    if (!state) {
        // Preserve existing rolling snapshots on upgrade, but never invent a
        // day for a fresh installation whose counters may already be reset.
        const legacy = database.prepare("SELECT MAX(day_index) AS day FROM career_reporter_board_snapshots WHERE day_index <= ?").get(today);
        state = { open_day: legacy.day ?? today };
        database.prepare("INSERT INTO career_reporter_board_snapshot_state (singleton, open_day) VALUES (1, ?)").run(state.open_day);
    }
    if (state.open_day >= today) return;
    if (state.open_day >= today - 2) sealCommittedDay(database, state.open_day);
    // A stopped server has no saved counters for intervening unobserved days.
    database.prepare("DELETE FROM career_reporter_board_snapshots WHERE day_index < ?").run(today - 2);
    database.prepare("UPDATE career_reporter_board_snapshot_state SET open_day = ? WHERE singleton = 1").run(today);
}

// An action timestamped before midnight can commit after the boundary. Only
// its actually persisted farms may amend an existing retained day, never seed
// missing history or roll the whole server's boards forward on every action.
export function amendReporterBoardSnapshotsForCommittedFarms(database, farms, now) {
    const today = currentDayIndex(now);
    const read = database.prepare("SELECT * FROM career_reporter_board_snapshots WHERE day_index = ? AND farm_id = ?");
    const update = database.prepare(`UPDATE career_reporter_board_snapshots
      SET ${VALUE_KEYS.map(key => `${key} = ?`).join(",")}
      WHERE day_index = ? AND farm_id = ?`);
    for (const farm of farms) {
        if (!farm || farm.id === NPC_ID) continue;
        const days = new Set([farm.daily?.day, farm.ranch?.raidIncome?.day, farm.ranch?.raidLoss?.day]);
        for (const day of days) {
            if (!Number.isInteger(day) || day < today - 2 || day >= today) continue;
            const previous = read.get(day, farm.id);
            if (!previous) continue;
            const row = applyDayCounters({ ...previous }, farm, day);
            if (VALUE_KEYS.some(key => row[key] !== previous[key]))
                update.run(...VALUE_KEYS.map(key => row[key]), day, farm.id);
        }
    }
}

export function readReporterBoardSnapshot(database, day, now) {
    const today = currentDayIndex(now);
    if (day < today - 2 || day >= today) return {};
    const rows = database.prepare("SELECT * FROM career_reporter_board_snapshots WHERE day_index = ? ORDER BY farm_order").all(day);
    const instant = day * 86_400_000 - 8 * 3_600_000;
    const farms = rows.map(row => ({
        id: row.farm_id, name: row.name,
        daily: { day, ...Object.fromEntries(DAILY_KEYS.map(key => [key, row[key]])),
            // Only the previous calendar day's immutable ledger charges count.
            coinSpend: row.coinSpend + economyGoldSpentToday({ doorbellMcpMigration: {
                residentId: row.resident_id, migrationId: row.binding_reference,
            } }, instant, database),
        },
        ranch: { raidIncome: { day, n: row.raidIncome }, raidLoss: { day, n: row.raidLoss } },
    }));
    const boards = buildLeaderboards(farms, [], instant);
    const metadata = new Map(rows.map(row => [row.farm_id, row]));
    for (const entries of Object.values(boards)) for (const entry of entries) {
        const stored = metadata.get(entry.code);
        entry.title = stored?.title ?? undefined;
        entry.titleColor = stored?.title_color ?? undefined;
    }
    return boards;
}
