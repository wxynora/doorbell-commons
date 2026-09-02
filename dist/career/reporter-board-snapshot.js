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
    )`);
}

// Called inside the existing world/economy transaction, never from a new timer.
export function captureReporterBoardSnapshots(database, farms, now) {
    const today = currentDayIndex(now);
    database.prepare("DELETE FROM career_reporter_board_snapshots WHERE day_index < ?").run(today - 2);
    const read = database.prepare("SELECT * FROM career_reporter_board_snapshots WHERE day_index = ? AND farm_id = ?");
    const write = database.prepare(`INSERT INTO career_reporter_board_snapshots (${COLUMNS.join(",")})
      VALUES (${COLUMNS.map(() => "?").join(",")}) ON CONFLICT(day_index, farm_id) DO UPDATE SET
      ${COLUMNS.filter(key => !["day_index", "farm_id"].includes(key)).map(key => `${key}=excluded.${key}`).join(",")}`);
    farms.forEach((farm, index) => {
        if (!farm || farm.id === NPC_ID) return;
        const days = new Set([today, farm.daily?.day, farm.ranch?.raidIncome?.day, farm.ranch?.raidLoss?.day]);
        for (const day of days) {
            if (!Number.isInteger(day) || day < today - 2 || day > today) continue;
            const previous = read.get(day, farm.id);
            // Deployment cannot reconstruct an already lost day. An operation
            // begun just before midnight may still finish its existing day row.
            if (day !== today && !previous) continue;
            const title = equippedTitle(farm);
            const row = day !== today ? { ...previous } : {
                day_index: day, farm_id: farm.id, farm_order: index, name: farm.name,
                title: title?.name ?? null, title_color: title?.color ?? null,
                resident_id: farm.doorbellMcpMigration?.residentId ?? null,
                binding_reference: farm.doorbellMcpMigration?.migrationId ?? null,
                ...Object.fromEntries(VALUE_KEYS.map(key => [key, previous?.[key] ?? 0])),
            };
            if (farm.daily?.day === day) for (const key of DAILY_KEYS) row[key] = farm.daily[key] ?? 0;
            for (const key of ["raidIncome", "raidLoss"])
                if (farm.ranch?.[key]?.day === day) row[key] = farm.ranch[key].n ?? 0;
            write.run(...COLUMNS.map(key => row[key]));
        }
    });
}

// A ledger-only operation may be the first activity of a day. Seed missing
// rows from committed farm state, not the mutable in-memory world of another
// operation. Existing rows are untouched; final ledger totals are read by day.
export function seedReporterBoardSnapshotsFromCommittedWorld(database, now) {
    const day = currentDayIndex(now);
    const rows = database.prepare(`SELECT f.farm_id, f.position,
      json_extract(f.state_json, '$.name') AS name,
      json_extract(f.state_json, '$.daily') AS daily,
      json_extract(f.state_json, '$.ranch.raidIncome') AS raid_income,
      json_extract(f.state_json, '$.ranch.raidLoss') AS raid_loss,
      json_extract(f.state_json, '$.titleEquipped') AS equipped,
      json_extract(f.state_json, '$.titles') AS titles,
      json_extract(f.state_json, '$.doorbellMcpMigration.residentId') AS resident_id,
      json_extract(f.state_json, '$.doorbellMcpMigration.migrationId') AS binding_reference
      FROM farm_states f WHERE f.farm_id <> ? AND NOT EXISTS (
        SELECT 1 FROM career_reporter_board_snapshots s WHERE s.day_index = ? AND s.farm_id = f.farm_id
      ) ORDER BY f.position`).all(NPC_ID, day);
    const parse = value => value === null ? undefined : JSON.parse(value);
    captureReporterBoardSnapshots(database, rows.map(row => ({
        id: row.farm_id, name: row.name, daily: parse(row.daily),
        ranch: { raidIncome: parse(row.raid_income), raidLoss: parse(row.raid_loss) },
        titleEquipped: row.equipped, titles: parse(row.titles),
        doorbellMcpMigration: { residentId: row.resident_id, migrationId: row.binding_reference },
    })), now);
    for (const row of rows) database.prepare("UPDATE career_reporter_board_snapshots SET farm_order = ? WHERE farm_id = ? AND day_index = ?")
        .run(row.position, row.farm_id, day);
}

export function readReporterBoardSnapshot(database, day, now) {
    const today = currentDayIndex(now);
    database.prepare("DELETE FROM career_reporter_board_snapshots WHERE day_index < ?").run(today - 2);
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
