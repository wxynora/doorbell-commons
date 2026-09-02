import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { LingyeSecurityService } from "../dist/security/service.js";

const HOUR_MS = 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;

test("repeated crop theft uses the confirmed 72-hour detention tiers and fixed release rate", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE residents (resident_id TEXT PRIMARY KEY);
    INSERT INTO residents (resident_id) VALUES ('resident-a');
  `);

  let now = Date.parse("2026-09-02T00:00:00Z");
  let sequence = 0;
  const service = new LingyeSecurityService(database, {
    now: () => now,
    generateId: () => `security-${++sequence}`,
    authorizeConstableCatch: () => true,
    getCaughtCropTheftFact: ({ sourceId }) => ({
      sourceId,
      residentId: "resident-a",
      kind: "stolen",
      successful: true,
      occurredAt: now - 1,
    }),
  });

  const expectedHours = [4, 4, 4, 12, 12, 12, 12, 48, 48, 48, 48, 72];
  for (let index = 0; index < expectedHours.length; index += 1) {
    const result = service.catchCropTheft({
      sourceId: `theft-${index + 1}`,
      caughtBy: "human_constable",
      actorResidentId: "constable-a",
    });
    assert.equal(result.violation.repetitionIndex, index + 1);
    assert.equal(
      result.detention.scheduledReleaseAt - result.detention.startedAt,
      expectedHours[index] * HOUR_MS,
    );
    assert.equal(result.detention.hourlyReleaseRateGold, 500);
    now += MINUTE_MS;
  }
});
