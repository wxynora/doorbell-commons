import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommunityDatabase,
  FARM_PLANT_REQUEST_TTL_MS,
  FarmPlantRequestIdempotencyConflictError,
} from "./community-database.js";
import { FarmHarvestRequestService } from "./farm-harvest-request-service.js";
import {
  buildFarmPlantNotificationText,
  FarmPlantRequestService,
} from "./farm-plant-request-service.js";

const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000101";

function registeredDatabase(): CommunityDatabase {
  const database = new CommunityDatabase(":memory:", {
    generateAccountId: () => "account-1",
    generateHomeId: () => "home-1",
    generateResidentId: () => "resident-1",
    generateSessionToken: () => "session-1",
  });
  database.createHumanSession("10001", 1_000, {
    farmDoorplate: "FARM-1",
    farmHumanKey: "human-key-1",
    homeName: "小屋",
    residentName: "小机",
  });
  return database;
}

function createService(database: CommunityDatabase, now = () => 10_000) {
  return new FarmPlantRequestService({
    database,
    now,
    generateRequestId: () => "plant-request-1",
    generateWakeId: () => "plant-wake-1",
  });
}

const INPUT = {
  residentId: "resident-1",
  homeId: "home-1",
  humanName: "辛玥",
  fieldRevision: "field-v1:before",
  emptyPlotCount: 3,
  idempotencyKey: IDEMPOTENCY_KEY,
};

test("a plant request persists the confirmed notification and one pending Bell wake", () => {
  const database = registeredDatabase();
  try {
    const result = createService(database).create(INPUT);
    assert.equal(result.created, true);
    assert.equal(result.request.emptyPlotCount, 3);
    assert.equal(result.request.expiresAt, 10_000 + FARM_PLANT_REQUEST_TTL_MS);
    assert.equal(result.notificationText, "【📢来自铃野的通知】\n你的人类辛玥喊你来农场种菜。");
    assert.equal(result.notificationText, buildFarmPlantNotificationText("辛玥"));
    assert.deepEqual(
      database.listPendingBellWakes("resident-1").map((wake) => ({
        wakeId: wake.wakeId,
        reason: wake.reason,
        payload: wake.payload,
      })),
      [
        {
          wakeId: "plant-wake-1",
          reason: "farm_plant_request",
          payload: { text: result.notificationText },
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("same UUID replays one plant request while changed content conflicts", () => {
  const database = registeredDatabase();
  try {
    const service = createService(database);
    const first = service.create(INPUT);
    const replay = service.replay({
      residentId: INPUT.residentId,
      fieldRevision: INPUT.fieldRevision,
      idempotencyKey: INPUT.idempotencyKey,
    });
    assert.equal(replay?.created, false);
    assert.equal(replay?.request.requestId, first.request.requestId);
    assert.throws(
      () =>
        service.replay({
          residentId: INPUT.residentId,
          fieldRevision: "field-v1:changed",
          idempotencyKey: INPUT.idempotencyKey,
        }),
      FarmPlantRequestIdempotencyConflictError,
    );
    assert.equal(database.listPendingBellWakes("resident-1").length, 1);
  } finally {
    database.close();
  }
});

test("plant and harvest requests keep independent idempotency and wake state", () => {
  const database = registeredDatabase();
  try {
    createService(database).create(INPUT);
    new FarmHarvestRequestService({
      database,
      now: () => 10_000,
      generateRequestId: () => "harvest-request-1",
      generateWakeId: () => "harvest-wake-1",
    }).create({
      residentId: INPUT.residentId,
      homeId: INPUT.homeId,
      humanName: INPUT.humanName,
      fieldRevision: INPUT.fieldRevision,
      maturePlotCount: 2,
      idempotencyKey: INPUT.idempotencyKey,
    });
    assert.deepEqual(
      database
        .listPendingBellWakes("resident-1")
        .map((wake) => wake.reason)
        .sort(),
      ["farm_harvest_request", "farm_plant_request"],
    );
    assert.equal(database.acknowledgeBellWake("resident-1", "plant-wake-1", 11_000), "acked");
    assert.deepEqual(
      database.listPendingBellWakes("resident-1").map((wake) => wake.wakeId),
      ["harvest-wake-1"],
    );
  } finally {
    database.close();
  }
});

test("expiry and blocked delivery settle only the matching plant request", () => {
  const database = registeredDatabase();
  try {
    const now = { value: 10_000 };
    const service = createService(database, () => now.value);
    service.create(INPUT);
    assert.equal(
      database.blockBellWake("resident-1", "plant-wake-1", 11_000, "delivery", "failed"),
      "blocked",
    );
    assert.equal(
      service.replay({
        residentId: INPUT.residentId,
        fieldRevision: INPUT.fieldRevision,
        idempotencyKey: INPUT.idempotencyKey,
      })?.request.status,
      "failed",
    );

    const second = new FarmPlantRequestService({
      database,
      now: () => now.value,
      generateRequestId: () => "plant-request-2",
      generateWakeId: () => "plant-wake-2",
    });
    second.create({ ...INPUT, idempotencyKey: "00000000-0000-4000-8000-000000000102" });
    now.value += FARM_PLANT_REQUEST_TTL_MS;
    assert.equal(second.get("resident-1", "plant-request-2")?.status, "expired");
    assert.equal(database.getBellWake("resident-1", "plant-wake-2")?.status, "cancelled");
  } finally {
    database.close();
  }
});
