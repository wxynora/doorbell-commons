import { runInTransaction } from "../career/persistence.js";
import { collectReporterFarmFacts } from "../career/reporter-farm-facts.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const FACTS_TTL_MS = 48 * 60 * 60 * 1_000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1_000;

function issueWindow(issueDate, window) {
    if (typeof issueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(issueDate))
        throw new TypeError("Invalid reporter farm issue date");
    const endMs = Date.parse(`${issueDate}T05:00:00+08:00`);
    if (!Number.isSafeInteger(endMs) ||
        new Date(endMs + BEIJING_OFFSET_MS).toISOString().slice(0, 10) !== issueDate)
        throw new TypeError("Invalid reporter farm issue date");
    const startMs = endMs - DAY_MS;
    if (window?.startMs !== startMs || window?.endMs !== endMs)
        throw new TypeError("Reporter farm issue window mismatch");
    return { startMs, endMs, expiresAt: endMs + FACTS_TTL_MS };
}

export function installReporterFarmFactsSchema(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS reporter_farm_fact_snapshots (
        issue_date TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL CHECK (window_start >= 0),
        window_end INTEGER NOT NULL CHECK (window_end > window_start),
        expires_at INTEGER NOT NULL CHECK (expires_at = window_end + 172800000),
        collected_at INTEGER NOT NULL CHECK (collected_at >= window_end)
      );
      CREATE TABLE IF NOT EXISTS reporter_farm_facts (
        issue_date TEXT NOT NULL REFERENCES reporter_farm_fact_snapshots(issue_date) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        id TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source_id TEXT,
        PRIMARY KEY (issue_date, ordinal)
      );
      CREATE INDEX IF NOT EXISTS reporter_farm_fact_snapshots_expiry
        ON reporter_farm_fact_snapshots(expires_at, issue_date);
      CREATE INDEX IF NOT EXISTS reporter_farm_facts_issue_order
        ON reporter_farm_facts(issue_date, ordinal);
    `);
}

export function pruneExpiredReporterFarmFacts(database, now = Date.now()) {
    return Number(database.prepare(
        "DELETE FROM reporter_farm_fact_snapshots WHERE expires_at <= ?",
    ).run(now).changes ?? 0);
}

function readSnapshot(database, issueDate, expectedWindow, now) {
    const header = database.prepare(`SELECT window_start, window_end, expires_at
      FROM reporter_farm_fact_snapshots WHERE issue_date = ?`).get(issueDate);
    if (!header) return undefined;
    if (header.window_start !== expectedWindow.startMs ||
        header.window_end !== expectedWindow.endMs ||
        header.expires_at !== expectedWindow.expiresAt)
        throw new Error("Reporter farm fact snapshot conflicts with its issue window");
    if (header.expires_at <= now) return null;
    return database.prepare(`SELECT id, category, occurred_at, title, content, source_id
      FROM reporter_farm_facts WHERE issue_date = ? ORDER BY ordinal`).all(issueDate).map(row => ({
        id: row.id,
        category: row.category,
        occurredAt: row.occurred_at,
        title: row.title,
        content: row.content,
        sourceId: row.source_id,
    }));
}

function normalizeFacts(issueDate, facts) {
    if (!Array.isArray(facts)) throw new TypeError("Reporter farm facts must be an array");
    return facts.map((fact, ordinal) => {
        if (!fact || typeof fact !== "object" || Array.isArray(fact) ||
            typeof fact.category !== "string" ||
            !Number.isSafeInteger(fact.occurredAt) || fact.occurredAt < 0 ||
            typeof fact.title !== "string" || typeof fact.content !== "string" ||
            (fact.sourceId !== undefined && fact.sourceId !== null && typeof fact.sourceId !== "string"))
            throw new TypeError("Reporter farm fact has an invalid shape");
        return {
            id: `farm-fact:${issueDate}:${ordinal}`,
            category: fact.category,
            occurredAt: fact.occurredAt,
            title: fact.title,
            content: fact.content,
            sourceId: fact.sourceId ?? null,
        };
    });
}

export function readOrCreateReporterFarmFacts(database, issueDate, window, now = Date.now(), collectFacts = collectReporterFarmFacts) {
    if (!Number.isSafeInteger(now) || now < 0)
        throw new TypeError("Invalid reporter farm snapshot time");
    const expectedWindow = issueWindow(issueDate, window);
    const existing = readSnapshot(database, issueDate, expectedWindow, now);
    if (existing !== undefined) return existing;
    if (now < expectedWindow.endMs || expectedWindow.expiresAt <= now) return null;

    return runInTransaction(database, () => {
        const current = readSnapshot(database, issueDate, expectedWindow, now);
        if (current !== undefined) return current;
        const materials = normalizeFacts(issueDate, collectFacts(database, {
            periodStart: expectedWindow.startMs,
            periodEnd: expectedWindow.endMs,
        }));
        database.prepare(`INSERT INTO reporter_farm_fact_snapshots (
          issue_date, window_start, window_end, expires_at, collected_at
        ) VALUES (?, ?, ?, ?, ?)`).run(issueDate, expectedWindow.startMs,
            expectedWindow.endMs, expectedWindow.expiresAt, now);
        const insert = database.prepare(`INSERT INTO reporter_farm_facts (
          issue_date, ordinal, id, category, occurred_at, title, content, source_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        materials.forEach((material, ordinal) => insert.run(issueDate, ordinal,
            material.id, material.category, material.occurredAt, material.title,
            material.content, material.sourceId));
        return materials;
    });
}
