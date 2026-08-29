import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const directory = mkdtempSync(join(tmpdir(), "doorbell-lingye-readiness-"));
process.env.AIFARM_DATA_DIR = directory;
process.env.AIFARM_NATURE_ACTIVATION_DATE = "2026-09-01";
process.env.AIFARM_NATURE_SEED = "readiness-test-seed";

const { activateStoredNatureWorld } = await import("../dist/store.js");
const { curriculumCatalogAvailability } = await import("../dist/career/curriculum.js");

const catalog = curriculumCatalogAvailability();
const publicLevels = Object.entries(catalog).flatMap(([career, entry]) =>
  entry.exams
    .filter((exam) => exam.available && [1, 2, 3].every((courseIndex) =>
      entry.courses.some((course) =>
        course.level === exam.level && course.courseIndex === courseIndex && course.available)))
    .map((exam) => ({ career, level: exam.level })));
const bankPath = join(directory, "private-exam-bank.json");
writeFileSync(bankPath, JSON.stringify({
  schemaVersion: 1,
  version: "readiness-test-v1",
  exams: publicLevels.map(({ career, level }) => ({
    career,
    level,
    questions: Array.from({ length: 20 }, (_, index) => ({
      id: `${career}-${level}-${index + 1}`,
      stem: "test",
      options: { A: "A", B: "B", C: "C", D: "D" },
      answer: ["A"],
      explanation: "test",
    })),
  })),
}));
process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH = bankPath;

const { lingyeRuntimeReadiness } = await import("../dist/server/doorbell/lingye.js");
const activationAt = Date.parse("2026-09-01T00:00:00+08:00");
activateStoredNatureWorld({ now: activationAt, seed: process.env.AIFARM_NATURE_SEED });

const RULES = {
  minimumSystemLoanCreditDays: 7,
  restrictedDailyGoldLimit: 200_000,
  restrictedDailySilverLimit: 400,
};

test("Lingye readiness requires the approved public levels, matching private exams, rules and nature runtime", () => {
  try {
    const ready = lingyeRuntimeReadiness(RULES);
    assert.equal(ready.ready, true);
    assert.deepEqual(ready.missing, []);
    assert.equal(ready.operations.length, 8);
    assert.equal(ready.exams.public_ready_levels.length, 8);
    assert.equal(ready.exams.private_ready_levels.length, 8);
    assert.equal(ready.exams.private_ready_levels.every((entry) =>
      entry.question_count === 20 && entry.pass_count === 18), true);
    assert.deepEqual(ready.capabilities, {
      player_loans: true,
      multi_select_assessments: true,
      kitchen_methods: true,
      kitchen_tools: true,
      chef_original_recipes: true,
      chef_store: true,
      commission_messages: true,
      commission_npc_transfer: true,
      commission_notifications: true,
    });
    assert.deepEqual(ready.nature_runtime, {
      adapter_version: 1,
      configured: true,
      ready: true,
      status: "ready",
      activation_date: "2026-09-01",
      activation_day: ready.nature_runtime.activation_day,
      persisted_status: "active",
    });

    delete process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH;
    const missingBank = lingyeRuntimeReadiness(RULES);
    assert.equal(missingBank.ready, false);
    assert.deepEqual(missingBank.missing, ["private_exam_bank", "required_exam_levels"]);
    process.env.AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH = bankPath;

    const missingRule = lingyeRuntimeReadiness({ ...RULES, restrictedDailySilverLimit: null });
    assert.equal(missingRule.ready, false);
    assert.equal(missingRule.missing.includes("restricted_daily_silver_limit"), true);

    delete process.env.AIFARM_NATURE_ACTIVATION_DATE;
    delete process.env.AIFARM_NATURE_SEED;
    const missingNature = lingyeRuntimeReadiness(RULES);
    assert.equal(missingNature.ready, false);
    assert.equal(missingNature.missing.includes("nature_runtime"), true);
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
