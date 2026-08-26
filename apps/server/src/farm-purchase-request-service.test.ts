import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommunityDatabase,
  FARM_PURCHASE_REQUEST_TTL_MS,
  FarmPurchaseRequestIdempotencyConflictError,
} from "./community-database.js";
import {
  buildFarmPurchaseNotificationText,
  FarmPurchaseRequestService,
} from "./farm-purchase-request-service.js";

const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000001";

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

function createService(
  database: CommunityDatabase,
  bellNotifier?: {
    notifyResident(residentId: string): void;
    cancelWake(residentId: string, wakeId: string, now?: number): void;
  },
): FarmPurchaseRequestService {
  const options = {
    database,
    now: () => 10_000,
    generateRequestId: () => "request-1",
    generateWakeId: () => "wake-1",
    ...(bellNotifier ? { bellNotifier } : {}),
  };
  return new FarmPurchaseRequestService(options);
}

test("a farm purchase request persists one wake, stable item snapshots, and the exact notification", () => {
  const database = registeredDatabase();
  try {
    const notifications: string[] = [];
    const service = createService(database, {
      notifyResident: (residentId) => notifications.push(residentId),
      cancelWake: () => undefined,
    });
    const result = service.create({
      residentId: "resident-1",
      homeId: "home-1",
      humanName: "辛玥",
      shop: "field",
      shopRevision: "shop-v1",
      idempotencyKey: IDEMPOTENCY_KEY,
      items: [
        { kind: "seed", itemId: "speed_potion", qty: 1, displayName: "加速药水" },
        { kind: "seed", itemId: "ordinary_seed", qty: 2, displayName: "普通种子" },
      ],
    });
    assert.equal(result.created, true);
    assert.equal(result.request.requestId, "request-1");
    assert.equal(result.request.wakeId, "wake-1");
    assert.equal(result.request.expiresAt, 10_000 + FARM_PURCHASE_REQUEST_TTL_MS);
    assert.deepEqual(
      result.request.items.map((item) => ({
        itemId: item.itemId,
        kind: item.kind,
        qty: item.qty,
        displayName: item.displayName,
      })),
      [
        { itemId: "ordinary_seed", kind: "seed", qty: 2, displayName: "普通种子" },
        { itemId: "speed_potion", kind: "seed", qty: 1, displayName: "加速药水" },
      ],
    );
    assert.equal(
      result.notificationText,
      buildFarmPurchaseNotificationText("辛玥", "field", [
        { kind: "seed", itemId: "ordinary_seed", qty: 2, displayName: "普通种子" },
        { kind: "seed", itemId: "speed_potion", qty: 1, displayName: "加速药水" },
      ]),
    );
    assert.equal(
      result.notificationText,
      "【📢来自铃野的通知】\n你的人类辛玥想要你给她买农场商店的普通种子 × 2、加速药水 × 1。",
    );
    assert.deepEqual(notifications, ["resident-1"]);
    assert.deepEqual(
      database.listPendingBellWakes("resident-1").map((wake) => ({
        wakeId: wake.wakeId,
        reason: wake.reason,
        purchaseRequestId: wake.purchaseRequestId,
        payload: wake.payload,
      })),
      [
        {
          wakeId: "wake-1",
          reason: "farm_purchase_request",
          purchaseRequestId: "request-1",
          payload: { text: result.notificationText },
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("same resident and UUID replays one canonical request, while changed content conflicts", () => {
  const database = registeredDatabase();
  try {
    let nextRequest = 0;
    let nextWake = 0;
    const service = new FarmPurchaseRequestService({
      database,
      now: () => 20_000,
      generateRequestId: () => `request-${++nextRequest}`,
      generateWakeId: () => `wake-${++nextWake}`,
    });
    const input = {
      residentId: "resident-1",
      homeId: "home-1",
      humanName: "辛玥",
      shop: "ranch" as const,
      shopRevision: "shop-v2",
      idempotencyKey: IDEMPOTENCY_KEY,
      items: [{ kind: "animal", itemId: "duck", qty: 1, displayName: "鸭子" }],
    };
    const first = service.create(input);
    const replay = service.replay({
      residentId: input.residentId,
      shop: input.shop,
      shopRevision: input.shopRevision,
      idempotencyKey: input.idempotencyKey,
      items: input.items,
    });
    assert.equal(first.created, true);
    assert.ok(replay);
    assert.equal(replay.created, false);
    assert.equal(replay.request.requestId, first.request.requestId);
    assert.equal(replay.request.wakeId, first.request.wakeId);
    const renamedReplay = service.replay({
      residentId: input.residentId,
      shop: input.shop,
      shopRevision: input.shopRevision,
      idempotencyKey: input.idempotencyKey,
      items: [{ kind: "animal", itemId: "duck", qty: 1 }],
    });
    assert.ok(renamedReplay);
    assert.equal(renamedReplay.created, false);
    assert.equal(renamedReplay.notificationText, first.notificationText);
    assert.equal(database.listPendingBellWakes("resident-1").length, 1);
    const firstItem = input.items[0];
    assert.ok(firstItem);
    assert.throws(
      () =>
        service.replay({
          residentId: input.residentId,
          shop: input.shop,
          shopRevision: input.shopRevision,
          idempotencyKey: input.idempotencyKey,
          items: [{ ...firstItem, qty: 2 }],
        }),
      FarmPurchaseRequestIdempotencyConflictError,
    );
    assert.equal(
      service.get("resident-1", first.request.requestId)?.requestId,
      first.request.requestId,
    );
  } finally {
    database.close();
  }
});

test("a request expires from its persisted timestamp and cancels its pending wake", () => {
  const database = registeredDatabase();
  try {
    const cancellations: string[] = [];
    const service = createService(database, {
      notifyResident: () => undefined,
      cancelWake: (_residentId, wakeId) => cancellations.push(wakeId),
    });
    service.create({
      residentId: "resident-1",
      homeId: "home-1",
      humanName: "辛玥",
      shop: "field",
      shopRevision: "shop-v1",
      idempotencyKey: "00000000-0000-4000-8000-000000000002",
      items: [{ kind: "seed", itemId: "ordinary_seed", qty: 1, displayName: "普通种子" }],
    });
    const expired = service.get("resident-1", "request-1", 10_000 + FARM_PURCHASE_REQUEST_TTL_MS);
    assert.equal(expired?.status, "expired");
    assert.deepEqual(cancellations, ["wake-1"]);
    assert.equal(database.listPendingBellWakes("resident-1").length, 0);
  } finally {
    database.close();
  }
});

test("replay expires a stale request before returning its authoritative state", () => {
  const database = registeredDatabase();
  try {
    const now = { value: 10_000 };
    const cancellations: string[] = [];
    const service = new FarmPurchaseRequestService({
      database,
      now: () => now.value,
      generateRequestId: () => "request-1",
      generateWakeId: () => "wake-1",
      bellNotifier: {
        notifyResident: () => undefined,
        cancelWake: (_residentId, wakeId) => cancellations.push(wakeId),
      },
    });
    const input = {
      residentId: "resident-1",
      homeId: "home-1",
      humanName: "辛玥",
      shop: "field" as const,
      shopRevision: "shop-v1",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      items: [{ kind: "seed", itemId: "ordinary_seed", qty: 1, displayName: "普通种子" }],
    };
    service.create(input);

    now.value += FARM_PURCHASE_REQUEST_TTL_MS;
    const replay = service.replay({
      residentId: input.residentId,
      shop: input.shop,
      shopRevision: input.shopRevision,
      idempotencyKey: input.idempotencyKey,
      items: input.items,
    });

    assert.equal(replay?.request.status, "expired");
    assert.deepEqual(cancellations, ["wake-1"]);
    assert.equal(database.listPendingBellWakes("resident-1").length, 0);
  } finally {
    database.close();
  }
});
