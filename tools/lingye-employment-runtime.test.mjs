import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLingyeWorldBackend,
  openLingyeWorldDatabase,
  registerLingyeResidentReference,
} from "../dist/lingye-world-database.js";

const RULES = {
  minimumSystemLoanCreditDays: 7,
  restrictedDailyGoldLimit: 200_000,
  restrictedDailySilverLimit: 400,
};

test("employment runtime generates next duty and settles completed duty base wage exactly once", () => {
  const directory = mkdtempSync(join(tmpdir(), "lingye-employment-runtime-"));
  const database = openLingyeWorldDatabase(join(directory, "lingye-world.sqlite"));
  const clock = { now: Date.parse("2026-09-01T12:00:00+08:00") };
  let sequence = 0;
  const backend = createLingyeWorldBackend(database, {
    economyRules: RULES,
    now: () => clock.now,
    generateId: () => `employment-runtime-${++sequence}`,
  });
  try {
    registerLingyeResidentReference(database, {
      residentId: "resident-reporter",
      bindingReference: "migration-reporter",
      registeredAt: clock.now,
    });
    backend.trustedSystemCommands.importLegacyBalances({
      residentId: "resident-reporter",
      gold: 10_000,
      silver: 0,
      migrationId: "migration-reporter",
      idempotencyKey: "migration-reporter",
    });
    database.prepare(`
      INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
      VALUES (?, 'reporter', 1, ?)
    `).run("resident-reporter", clock.now);
    database.prepare(`
      INSERT INTO career_certificates (
        resident_id, career, qualification_level, status,
        source_attempt_id, issued_at, effective_at
      ) VALUES (?, 'reporter', 1, 'active', ?, ?, ?)
    `).run("resident-reporter", "attempt-reporter", clock.now, clock.now);
    backend.trustedSystemCommands.hireResident({
      residentId: "resident-reporter",
      career: "reporter",
      institution: "lingye_daily",
    });

    const first = backend.trustedSystemCommands.advanceEmploymentDays();
    assert.equal(first.generated.length, 1);
    assert.equal(first.generated[0].dutyDate, "2026-09-02");
    assert.deepEqual(first.settled, []);

    clock.now = Date.parse("2026-09-03T00:01:00+08:00");
    const settled = backend.trustedSystemCommands.advanceEmploymentDays();
    assert.equal(settled.generated.some((entry) => entry.dutyDate === "2026-09-04"), true);
    assert.deepEqual(settled.settled.map((entry) => ({
      dutyId: entry.dutyId,
      baseGold: entry.baseGold,
      performanceGold: entry.performanceGold,
      totalGold: entry.totalGold,
    })), [{
      dutyId: first.generated[0].dutyId,
      baseGold: 2_000,
      performanceGold: 0,
      totalGold: 2_000,
    }]);
    assert.equal(backend.trustedQueries.getAccount("resident-reporter").availableGold, 12_000);

    const replay = backend.trustedSystemCommands.advanceEmploymentDays();
    assert.deepEqual(replay.settled, []);
    assert.equal(backend.trustedQueries.getAccount("resident-reporter").availableGold, 12_000);
  }
  finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
