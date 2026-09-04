import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-career-diagnostic-flow-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const RULES = {
  minimumSystemLoanCreditDays: 5,
  restrictedDailyGoldLimit: 1_000_000,
  restrictedDailySilverLimit: 1_000,
};

const AGRONOMY_CHECK_LABELS = Object.freeze({
  leaf: "检查叶片",
  soil: "检查土壤",
  "pest-trace": "检查虫迹",
  root: "检查根部",
  "treatment-history": "检查近期处理记录",
});
const AGRONOMY_TREATMENT_LABELS = Object.freeze({
  "water-retaining-cover": "按缺水处理（保水覆盖物）",
  "drainage-material": "按普通积水处理（排水材料）",
  "insect-trap": "按局部虫害处理（诱虫板）",
  "pest-net": "按传播虫害处理（防虫网）",
  "soil-conditioner": "按营养失衡处理（土壤调理剂）",
  "root-treatment": "按根部受损处理（护根剂）",
});
const VETERINARIAN_CHECK_LABELS = Object.freeze({
  "feed-history": "检查近期饲料",
  abdomen: "检查腹部状态",
  injury: "检查伤处",
  "activity-history": "检查活动记录",
  temperature: "检查体温",
  bedding: "检查垫料",
  breathing: "检查呼吸",
  "water-intake": "检查饮水",
  hydration: "检查补水状态",
});
const VETERINARIAN_TREATMENT_LABELS = Object.freeze({
  "stomach-powder": "按食滞治疗（理胃粉）",
  "wound-cleanser+bandage": "按轻微外伤治疗（伤口清洗剂＋包扎材料）",
  "dry-bedding+warm-compress": "按湿冷症治疗（干燥垫料＋温敷包）",
  "rehydration-salt": "按脱水治疗（补液盐）",
  "respiratory-medicine": "按呼吸道感染治疗（呼吸药剂）",
  "antipyretic+rehydration-salt+respiratory-medicine":
    "按复合高热治疗（退热剂＋补液盐＋呼吸药剂）",
});

const { makeFarm } = await import("../dist/game.js");
const {
  createLingyeWorldBackend,
  openLingyeWorldDatabase,
  registerLingyeResidentReference,
} = await import("../dist/lingye-world-database.js");
const { createLingyeActionExecutor } = await import("../dist/server/doorbell/lingye.js");
const { beijingDay } = await import("../dist/career/p3-world.js");
const { HOSPITAL_BASE_FEE_GOLD } = await import("../dist/career/p3-commission-runtime.js");
const {
  getFarm,
  insertFarm,
  restoreWorldSnapshotInMemory,
  snapshotWorldForRollback,
} = await import("../dist/store.js");
const cleanWorld = snapshotWorldForRollback();

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function createHarness(t, prefix) {
  restoreWorldSnapshotInMemory(cleanWorld);
  const database = openLingyeWorldDatabase(":memory:");
  let sequence = 0;
  const backend = createLingyeWorldBackend(database, {
    economyRules: RULES,
    generateId: () => `${prefix}-${++sequence}`,
    now: () => NOW,
  });
  const executor = createLingyeActionExecutor({
    database,
    backend,
    economyRules: RULES,
    now: () => NOW,
  });
  t.after(() => database.close());
  return { database, backend, executor };
}

function registerResident(database, backend, residentId, bindingReference, gold = 0, silver = 0) {
  registerLingyeResidentReference(database, { residentId, bindingReference, registeredAt: NOW });
  backend.trustedSystemCommands.importLegacyBalances({
    residentId,
    gold,
    silver,
    migrationId: `economy:${bindingReference}`,
    idempotencyKey: `economy:${bindingReference}`,
  });
}

function certify(database, residentId, career, level = 4) {
  database.prepare(`
    INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
    VALUES (?, ?, 1, ?)
  `).run(residentId, career, NOW);
  database.prepare(`
    INSERT INTO career_certificates (
      resident_id, career, qualification_level, status,
      source_attempt_id, issued_at, effective_at
    ) VALUES (?, ?, ?, 'active', ?, ?, ?)
  `).run(residentId, career, level, `certificate:${residentId}:${career}`, NOW, NOW);
}

function scheduleVeterinarianDuty(database, residentId) {
  const employmentId = `employment:${residentId}:veterinarian`;
  database.prepare(`
    INSERT INTO career_employments (
      employment_id, resident_id, career, institution, seat_number,
      status, availability, hired_at
    ) VALUES (?, ?, 'veterinarian', 'animal_hospital', 1, 'active', 'available', ?)
  `).run(employmentId, residentId, NOW);
  database.prepare(`
    INSERT INTO career_duty_days (
      duty_id, employment_id, resident_id, career, institution, duty_date,
      qualification_level, base_wage_gold, status, generated_at
    ) VALUES (?, ?, ?, 'veterinarian', 'animal_hospital', '2026-09-01', 4, 2000, 'scheduled', ?)
  `).run(`duty:${residentId}:veterinarian`, employmentId, residentId, NOW);
}

function execute(executor, residentId, bindingReference, op, args, farm) {
  return executor.execute({ residentId, bindingReference, op, args, farm });
}

function optionHandle(database, residentId, operation, internalOption) {
  const row = database.prepare(`
    SELECT handle FROM lingye_option_handles
    WHERE resident_id = ? AND operation = ? AND internal_option = ?
  `).get(residentId, operation, internalOption);
  assert.ok(row, `missing public option for ${internalOption}`);
  return row.handle;
}

function assertLabeledOption(view, database, residentId, operation, internalOption, label) {
  const handle = optionHandle(database, residentId, operation, internalOption);
  assert.equal(
    view.data.options.find((entry) => entry.option === handle)?.label,
    label,
    `unexpected label for ${internalOption}`,
  );
  return handle;
}

function agronomyFarm(id, migrationId, sourceId, condition = "drought", requiredTreatment) {
  const farm = makeFarm(`Diagnostic agronomy ${id}`, 711);
  farm.id = id;
  farm.doorbellMcpMigration = { migrationId };
  farm.plots[0].crop = {
    seedType: "common",
    progress: 1,
    growTicks: 10,
    waterCount: 0,
    ripe: false,
    lingyeAgronomy: {
      sourceId,
      condition,
      ...(requiredTreatment ? { requiredTreatment } : {}),
      status: "open",
      generatedDay: beijingDay(NOW),
      generatedAt: NOW,
      checks: [],
      treatments: [],
      qualityPenalty: true,
    },
  };
  farm.lingyeP3 = {
    version: 1,
    lastAdvancedDay: beijingDay(NOW),
    lastAnimalRecoveryDay: null,
    history: [],
    actionReceipts: {},
  };
  insertFarm(farm);
  return getFarm(id);
}

function veterinarianFarm(id, migrationId, sourceId, condition = "indigestion") {
  const farm = makeFarm(`Diagnostic veterinarian ${id}`, 712);
  farm.id = id;
  farm.doorbellMcpMigration = { migrationId };
  farm.ranch = {
    animals: [{
      kindId: "chicken",
      ticksSinceProduce: 0,
      pending: 0,
      lingyeHealth: {
        sourceId,
        condition,
        status: "open",
        generatedDay: beijingDay(NOW),
        generatedAt: NOW,
        checks: [],
        treatments: [],
        recoveryUntilDay: null,
      },
    }],
    coins: 0,
    raids: [],
    raidDebts: [],
    pets: [],
  };
  farm.lingyeP3 = {
    version: 1,
    lastAdvancedDay: beijingDay(NOW),
    lastAnimalRecoveryDay: null,
    history: [],
    actionReceipts: {},
  };
  insertFarm(farm);
  return getFarm(id);
}

function completePlayerVeterinarianService({
  database,
  backend,
  executor,
  owner,
  worker,
  migration,
  farmId,
  certifyOwner = false,
}) {
  const workerBinding = `binding:${worker}`;
  const operation = "go.hospital.commission";
  registerResident(database, backend, owner, migration, 100_000, 0);
  registerResident(database, backend, worker, workerBinding);
  if (certifyOwner) certify(database, owner, "veterinarian", 1);
  certify(database, worker, "veterinarian", 1);
  scheduleVeterinarianDuty(database, worker);
  const farm = veterinarianFarm(farmId, migration, `p3:animal:${farmId}:fee`);
  const initialGold = backend.forResident(owner).getOwnAccount().availableGold;
  const view = execute(executor, owner, migration, operation, {}, farm);
  const sourceId = view.data.sources[0].sourceId;
  const published = execute(executor, owner, migration, operation, {
    option: optionHandle(database, owner, operation, `commission:publish:${sourceId}`),
  }, getFarm(farmId));
  const jobId = published.data.result.jobId;
  execute(executor, worker, workerBinding, operation, {});
  assert.equal(execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, `commission:accept:${jobId}`),
  }).ok, true);
  execute(executor, worker, workerBinding, operation, {});
  assert.equal(execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, `commission:check:${jobId}:feed-history`),
  }).ok, true);
  execute(executor, worker, workerBinding, operation, {});
  const completed = execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, `commission:treat:${jobId}:stomach-powder`),
  });
  assert.equal(completed.ok, true, JSON.stringify(completed));
  assert.equal(completed.data.world.materialGold, 3_000);
  assert.equal(completed.data.result.status, "completed");
  const baseReservation = database.prepare(`SELECT amount FROM economy_system_gold_reservations
    WHERE business_reference = ?`).get(`career-service:${sourceId}:base-fee`);
  const materialReservation = database.prepare(`SELECT amount FROM economy_system_gold_reservations
    WHERE business_reference LIKE ?`).get(`career-job:${jobId}:materials:%`);
  return {
    baseGold: baseReservation.amount,
    materialGold: materialReservation.amount,
    totalGold: initialGold - backend.forResident(owner).getOwnAccount().availableGold,
  };
}

test("public agronomy keeps diagnostic choices, conversations, recovery, and completion intact", (t) => {
  const { database, backend, executor } = createHarness(t, "diagnostic-agronomy");
  const owner = "019ffc21-49cd-7020-84af-3d04fb1ed03d";
  const worker = "019ffc21-49cd-7020-94af-3d04fb1ed03d";
  const migration = "019ffc21-49cd-7020-a4af-3d04fb1ed03d";
  const workerBinding = `binding:${worker}`;
  const farmId = "DAG234";
  const operation = "go.farm.commission";
  registerResident(database, backend, owner, migration, 500_000, 500);
  registerResident(database, backend, worker, workerBinding);
  certify(database, worker, "agronomist");
  const farm = agronomyFarm(farmId, migration, `p3:agronomy:${farmId}:diagnostic`, "drought");

  const ownerView = execute(executor, owner, migration, operation, {}, farm);
  const source = ownerView.data.sources[0];
  const published = execute(executor, owner, migration, operation, {
    option: optionHandle(database, owner, operation, `commission:publish:${source.sourceId}`),
  }, getFarm(farmId));
  const jobId = published.data.result.jobId;
  execute(executor, worker, workerBinding, operation, {});
  const accepted = execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, `commission:accept:${jobId}`),
  });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));

  let workerView = execute(executor, worker, workerBinding, operation, {});
  let refreshedOwnerView = execute(executor, owner, migration, operation, {}, getFarm(farmId));
  assertLabeledOption(workerView, database, worker, operation, `commission:reply:${jobId}`, "回复委托消息");
  assertLabeledOption(refreshedOwnerView, database, owner, operation, `commission:reply:${jobId}`, "回复委托消息");
  for (const [check, label] of Object.entries(AGRONOMY_CHECK_LABELS)) {
    assertLabeledOption(workerView, database, worker, operation, `commission:check:${jobId}:${check}`, label);
  }

  const ownerReply = execute(executor, owner, migration, operation, {
    option: optionHandle(database, owner, operation, `commission:reply:${jobId}`),
    text: "请按检查结果判断，不要猜。",
  }, getFarm(farmId));
  assert.deepEqual(
    ownerReply.notifications.map(({ kind, recipient_resident_id, message_text }) => ({
      kind,
      recipient_resident_id,
      message_text,
    })),
    [{ kind: "commission_reply", recipient_resident_id: worker, message_text: "请按检查结果判断，不要猜。" }],
  );
  const workerReply = execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, `commission:reply:${jobId}`),
    text: "我会先检查叶片和土壤。",
  });
  assert.deepEqual(
    workerReply.notifications.map(({ kind, recipient_resident_id, message_text }) => ({
      kind,
      recipient_resident_id,
      message_text,
    })),
    [{ kind: "commission_reply", recipient_resident_id: owner, message_text: "我会先检查叶片和土壤。" }],
  );
  workerView = execute(executor, worker, workerBinding, operation, {});
  refreshedOwnerView = execute(executor, owner, migration, operation, {}, getFarm(farmId));
  const workerMessages = workerView.data.jobs.find((job) => job.jobId === jobId).messages;
  const ownerMessages = refreshedOwnerView.data.jobs.find((job) => job.jobId === jobId).messages;
  assert.deepEqual(new Set(workerMessages.map((message) => message.body)), new Set([
    "请按检查结果判断，不要猜。",
    "我会先检查叶片和土壤。",
  ]));
  assert.deepEqual(new Set(ownerMessages.map((message) => message.body)), new Set([
    "请按检查结果判断，不要猜。",
    "我会先检查叶片和土壤。",
  ]));
  assert.equal(workerMessages.some((message) => message.sender === "self" && message.recipient === "counterparty"), true);
  assert.equal(workerMessages.some((message) => message.sender === "counterparty" && message.recipient === "self"), true);
  assert.equal(ownerMessages.some((message) => message.sender === "self" && message.recipient === "counterparty"), true);
  assert.equal(ownerMessages.some((message) => message.sender === "counterparty" && message.recipient === "self"), true);

  const runWorkerOption = (internalOption) => execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, internalOption),
  });
  assert.equal(runWorkerOption(`commission:check:${jobId}:leaf`).ok, true);
  workerView = execute(executor, worker, workerBinding, operation, {});
  for (const [treatment, label] of Object.entries(AGRONOMY_TREATMENT_LABELS)) {
    assertLabeledOption(
      workerView,
      database,
      worker,
      operation,
      `commission:treat:${jobId}:${treatment}`,
      label,
    );
  }

  const firstWrong = runWorkerOption(`commission:treat:${jobId}:insect-trap`);
  assert.equal(firstWrong.ok, true, JSON.stringify(firstWrong));
  assert.equal(firstWrong.data.world.resolved, false);
  assert.equal(firstWrong.data.result.status, "active");
  workerView = execute(executor, worker, workerBinding, operation, {});
  assertLabeledOption(
    workerView,
    database,
    worker,
    operation,
    `commission:treat:${jobId}:water-retaining-cover`,
    AGRONOMY_TREATMENT_LABELS["water-retaining-cover"],
  );

  assert.equal(runWorkerOption(`commission:check:${jobId}:soil`).ok, true);
  assert.equal(runWorkerOption(`commission:treat:${jobId}:pest-net`).data.world.resolved, false);
  assert.equal(backend.trustedQueries.getJob(jobId).decisionCount, 4);
  workerView = execute(executor, worker, workerBinding, operation, {});
  const recoveryHandle = assertLabeledOption(
    workerView,
    database,
    worker,
    operation,
    `commission:treat:${jobId}:water-retaining-cover`,
    AGRONOMY_TREATMENT_LABELS["water-retaining-cover"],
  );
  const completed = execute(executor, worker, workerBinding, operation, { option: recoveryHandle });
  assert.equal(completed.ok, true, JSON.stringify(completed));
  assert.equal(completed.data.result.status, "completed");
  assert.equal(completed.data.world.resolved, true);
  assert.equal(backend.trustedQueries.getJob(jobId).decisionCount, 4);
  assert.deepEqual(
    completed.notifications.map(({ kind, recipient_resident_id }) => ({ kind, recipient_resident_id })),
    [{ kind: "commission_completed", recipient_resident_id: owner }],
  );
});

test("public veterinarian options allow an unresolved diagnosis before the correct treatment", (t) => {
  const { database, backend, executor } = createHarness(t, "diagnostic-veterinarian");
  const owner = "019ffc22-49cd-7020-84af-3d04fb1ed03d";
  const worker = "019ffc22-49cd-7020-94af-3d04fb1ed03d";
  const migration = "019ffc22-49cd-7020-a4af-3d04fb1ed03d";
  const workerBinding = `binding:${worker}`;
  const farmId = "DVT234";
  const operation = "go.hospital.commission";
  registerResident(database, backend, owner, migration, 2_000_000, 0);
  registerResident(database, backend, worker, workerBinding);
  certify(database, worker, "veterinarian");
  scheduleVeterinarianDuty(database, worker);
  const farm = veterinarianFarm(farmId, migration, `p3:animal:${farmId}:diagnostic`);

  const ownerView = execute(executor, owner, migration, operation, {}, farm);
  const source = ownerView.data.sources[0];
  const published = execute(executor, owner, migration, operation, {
    option: optionHandle(database, owner, operation, `commission:publish:${source.sourceId}`),
  }, getFarm(farmId));
  const jobId = published.data.result.jobId;
  const acceptingView = execute(executor, worker, workerBinding, operation, {});
  assert.equal(
    acceptingView.data.options.some((entry) => entry.label === "接取委托"),
    true,
    JSON.stringify(acceptingView.data),
  );
  assert.equal(execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, `commission:accept:${jobId}`),
  }).ok, true);

  let workerView = execute(executor, worker, workerBinding, operation, {});
  for (const [check, label] of Object.entries(VETERINARIAN_CHECK_LABELS)) {
    assertLabeledOption(workerView, database, worker, operation, `commission:check:${jobId}:${check}`, label);
  }
  const runWorkerOption = (internalOption) => execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, internalOption),
  });
  assert.equal(runWorkerOption(`commission:check:${jobId}:feed-history`).ok, true);
  workerView = execute(executor, worker, workerBinding, operation, {});
  for (const [treatment, label] of Object.entries(VETERINARIAN_TREATMENT_LABELS)) {
    assertLabeledOption(
      workerView,
      database,
      worker,
      operation,
      `commission:treat:${jobId}:${treatment}`,
      label,
    );
  }

  const wrong = runWorkerOption(`commission:treat:${jobId}:wound-cleanser+bandage`);
  assert.equal(wrong.ok, true, JSON.stringify(wrong));
  assert.equal(wrong.data.world.resolved, false);
  assert.equal(wrong.data.result.status, "active");
  workerView = execute(executor, worker, workerBinding, operation, {});
  const correctHandle = assertLabeledOption(
    workerView,
    database,
    worker,
    operation,
    `commission:treat:${jobId}:stomach-powder`,
    VETERINARIAN_TREATMENT_LABELS["stomach-powder"],
  );
  const completed = execute(executor, worker, workerBinding, operation, { option: correctHandle });
  assert.equal(completed.ok, true, JSON.stringify(completed));
  assert.equal(completed.data.result.status, "completed");
  assert.equal(completed.data.world.resolved, true);
});

test("self agronomy never exposes its unexecutable transfer option", (t) => {
  const { database, backend, executor } = createHarness(t, "diagnostic-self");
  const residentId = "019ffc23-49cd-7020-84af-3d04fb1ed03d";
  const binding = `binding:${residentId}`;
  const farmId = "DSF234";
  const sourceId = `p4:agronomy:pest:${farmId}:plot:1`;
  const operation = "go.farm.commission";
  registerResident(database, backend, residentId, binding, 500_000, 0);
  certify(database, residentId, "agronomist", 2);
  const farm = agronomyFarm(farmId, binding, sourceId, "local_pest", "pest-net");
  const view = execute(executor, residentId, binding, operation, {}, farm);
  const started = execute(executor, residentId, binding, operation, {
    option: optionHandle(database, residentId, operation, `commission:self:${sourceId}`),
  }, getFarm(farmId));
  const jobId = started.data.result.jobId;

  let active = execute(executor, residentId, binding, operation, {}, getFarm(farmId));
  assert.equal(active.data.options.some((entry) => entry.label === "转交委托"), false);
  assert.equal(execute(executor, residentId, binding, operation, {
    option: optionHandle(database, residentId, operation, `commission:check:${jobId}:leaf`),
  }, getFarm(farmId)).ok, true);
  active = execute(executor, residentId, binding, operation, {}, getFarm(farmId));
  assert.equal(active.data.options.some((entry) => entry.label === "转交委托"), false);
  assert.equal(
    database.prepare(`SELECT 1 FROM lingye_option_handles
      WHERE resident_id = ? AND operation = ? AND internal_option = ?`)
      .get(residentId, operation, `commission:transfer:${jobId}`),
    undefined,
  );
});

test("an over-level diagnosis leaves transfer and owner-authorized NPC fallback available", (t) => {
  const { database, backend, executor } = createHarness(t, "diagnostic-transfer");
  const owner = "019ffc24-49cd-7020-84af-3d04fb1ed03d";
  const worker = "019ffc24-49cd-7020-94af-3d04fb1ed03d";
  const migration = "019ffc24-49cd-7020-a4af-3d04fb1ed03d";
  const workerBinding = `binding:${worker}`;
  const farmId = "DTR234";
  const sourceId = `p4:agronomy:pest:${farmId}:plot:1`;
  const operation = "go.farm.commission";
  registerResident(database, backend, owner, migration, 500_000, 500);
  registerResident(database, backend, worker, workerBinding, 50_000, 0);
  certify(database, worker, "agronomist", 1);
  const farm = agronomyFarm(farmId, migration, sourceId, "local_pest", "pest-net");

  execute(executor, owner, migration, operation, {}, farm);
  const published = execute(executor, owner, migration, operation, {
    option: optionHandle(database, owner, operation, `commission:publish:${sourceId}`),
  }, getFarm(farmId));
  const jobId = published.data.result.jobId;
  // Preserve a legacy accepted-level job whose later diagnosis needs a level-2 treatment.
  database.prepare("UPDATE career_jobs SET required_level = 1 WHERE job_id = ?").run(jobId);
  execute(executor, worker, workerBinding, operation, {});
  assert.equal(execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, `commission:accept:${jobId}`),
  }).ok, true);
  execute(executor, worker, workerBinding, operation, {});
  assert.equal(execute(executor, worker, workerBinding, operation, {
    option: optionHandle(database, worker, operation, `commission:check:${jobId}:leaf`),
  }).ok, true);

  const workerView = execute(executor, worker, workerBinding, operation, {});
  for (const treatment of ["water-retaining-cover", "insect-trap"]) {
    assertLabeledOption(
      workerView,
      database,
      worker,
      operation,
      `commission:treat:${jobId}:${treatment}`,
      AGRONOMY_TREATMENT_LABELS[treatment],
    );
  }
  for (const treatment of ["drainage-material", "pest-net", "soil-conditioner", "root-treatment"]) {
    assert.equal(
      workerView.data.options.some(
        (entry) => entry.label === AGRONOMY_TREATMENT_LABELS[treatment],
      ),
      false,
    );
  }
  const transferHandle = assertLabeledOption(
    workerView,
    database,
    worker,
    operation,
    `commission:transfer:${jobId}`,
    "转交委托",
  );
  assert.equal(
    workerView.data.options.some((entry) => entry.label === "把委托转交给机构 NPC"),
    false,
  );
  const workerGoldBeforeTransfer = backend.forResident(worker).getOwnAccount().availableGold;
  const ownerGoldBeforeTransfer = backend.forResident(owner).getOwnAccount().availableGold;
  const transferred = execute(executor, worker, workerBinding, operation, { option: transferHandle });
  assert.equal(transferred.ok, true, JSON.stringify(transferred));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_npc_service_settlements").get().count, 0);
  assert.equal(backend.forResident(worker).getOwnAccount().availableGold, workerGoldBeforeTransfer);
  assert.equal(backend.forResident(owner).getOwnAccount().availableGold, ownerGoldBeforeTransfer);

  const successorJobId = transferred.data.successor.jobId;
  const ownerAfterTransfer = execute(executor, owner, migration, operation, {}, getFarm(farmId));
  const npcHandle = assertLabeledOption(
    ownerAfterTransfer,
    database,
    owner,
    operation,
    `commission:npc-job:${successorJobId}`,
    "转交机构 NPC：第1块地",
  );
  assert.equal(
    database.prepare(`SELECT 1 FROM lingye_option_handles
      WHERE resident_id = ? AND operation = ? AND internal_option = ?`)
      .get(worker, operation, `commission:npc-job:${successorJobId}`),
    undefined,
  );
  const completedByNpc = execute(
    executor,
    owner,
    migration,
    operation,
    { option: npcHandle },
    getFarm(farmId),
  );
  assert.equal(completedByNpc.ok, true, JSON.stringify(completedByNpc));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM career_npc_service_settlements").get().count, 1);
  assert.equal(backend.forResident(worker).getOwnAccount().availableGold, workerGoldBeforeTransfer);
  assert.ok(backend.forResident(owner).getOwnAccount().availableGold < ownerGoldBeforeTransfer);
});

test("veterinarian service fees discount only the certified owner's human base fee", async (t) => {
  assert.deepEqual(HOSPITAL_BASE_FEE_GOLD, {
    1: 3_000,
    2: 9_000,
    3: 24_000,
    4: 60_000,
  });

  await t.test("ordinary level-one player service charges base plus full-price material", (child) => {
    const harness = createHarness(child, "fee-ordinary");
    assert.deepEqual(completePlayerVeterinarianService({
      ...harness,
      owner: "019ffc31-49cd-7020-84af-3d04fb1ed03d",
      worker: "019ffc31-49cd-7020-94af-3d04fb1ed03d",
      migration: "019ffc31-49cd-7020-a4af-3d04fb1ed03d",
      farmId: "DFO234",
    }), {
      baseGold: 3_000,
      materialGold: 3_000,
      totalGold: 6_000,
    });
  });

  await t.test("certified doctor owner receives only the approved human base discount", (child) => {
    const harness = createHarness(child, "fee-certified-owner");
    assert.deepEqual(completePlayerVeterinarianService({
      ...harness,
      owner: "019ffc32-49cd-7020-84af-3d04fb1ed03d",
      worker: "019ffc32-49cd-7020-94af-3d04fb1ed03d",
      migration: "019ffc32-49cd-7020-a4af-3d04fb1ed03d",
      farmId: "DFC234",
      certifyOwner: true,
    }), {
      baseGold: 2_250,
      materialGold: 3_000,
      totalGold: 5_250,
    });
  });

  await t.test("level-one NPC triples the base while keeping material at full price", (child) => {
    const { database, backend, executor } = createHarness(child, "fee-npc");
    const owner = "019ffc33-49cd-7020-84af-3d04fb1ed03d";
    const migration = "019ffc33-49cd-7020-a4af-3d04fb1ed03d";
    const farmId = "DFN234";
    const operation = "go.hospital.commission";
    registerResident(database, backend, owner, migration, 100_000, 0);
    const farm = veterinarianFarm(farmId, migration, `p3:animal:${farmId}:fee`);
    const beforeGold = backend.forResident(owner).getOwnAccount().availableGold;
    const view = execute(executor, owner, migration, operation, {}, farm);
    const sourceId = view.data.sources[0].sourceId;
    const completed = execute(executor, owner, migration, operation, {
      option: optionHandle(database, owner, operation, `commission:npc:${sourceId}`),
    }, getFarm(farmId));
    assert.equal(completed.ok, true, JSON.stringify(completed));
    assert.deepEqual(completed.data.result.fee, {
      baseGold: 9_000,
      materialGold: 3_000,
      totalGold: 12_000,
    });
    assert.equal(
      beforeGold - backend.forResident(owner).getOwnAccount().availableGold,
      12_000,
    );
  });
});
