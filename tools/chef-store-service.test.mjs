import assert from "node:assert/strict";
import test from "node:test";
import { EconomyService } from "../dist/economy/economy-service.js";
import {
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} from "../dist/lingye-world-database.js";
import {
    CHEF_STORE_DAY_MS,
    CHEF_STORE_OPENING_GOLD,
    CHEF_STORE_RENT_GOLD,
    ChefStoreService,
} from "../dist/career/chef-store-service.js";

const START = Date.parse("2026-09-01T08:00:00+08:00");
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};

function harness(ownerGold = 1_000_000) {
    const database = openLingyeWorldDatabase(":memory:");
    for (const residentId of ["store-owner", "store-buyer", "store-stranger"]) {
        registerLingyeResidentReference(database, {
            residentId,
            bindingReference: `store-binding:${residentId}`,
            registeredAt: START,
        });
    }
    let now = START;
    let economySequence = 0;
    const economy = new EconomyService(database, {
        rules: ECONOMY_RULES,
        now: () => now,
        generateId: () => `chef-store-economy:${++economySequence}`,
    });
    economy.importLegacyBalances({
        residentId: "store-owner",
        gold: ownerGold,
        silver: 0,
        migrationId: "store-migration:owner",
        idempotencyKey: "store-import:owner",
    });
    for (const residentId of ["store-buyer", "store-stranger"]) {
        economy.importLegacyBalances({
            residentId,
            gold: 100_000,
            silver: 1_000,
            migrationId: `store-migration:${residentId}`,
            idempotencyKey: `store-import:${residentId}`,
        });
    }
    let serviceSequence = 0;
    let listingSequence = 0;
    let orderSequence = 0;
    let listingPrepareCalls = 0;
    let listingRollbackCalls = 0;
    let orderCalls = 0;
    const service = new ChefStoreService(database, {
        economy,
        now: () => now,
        generateId: () => `chef-store:${++serviceSequence}`,
        prepareOpeningListing: ({ leaseId }) => {
            listingPrepareCalls += 1;
            return { listingReceiptId: `listing:${leaseId}:${++listingSequence}` };
        },
        rollbackOpeningListing: () => {
            listingRollbackCalls += 1;
        },
        isRealResident: (residentId) => ["store-owner", "store-buyer"].includes(residentId),
        executeOrder: ({ orderId }) => {
            orderCalls += 1;
            return {
                orderReceiptId: `order-receipt:${orderId}:${++orderSequence}`,
                paymentReceiptId: `payment:${orderId}`,
            };
        },
    });
    return {
        database,
        economy,
        service,
        get now() {
            return now;
        },
        setNow(value) {
            now = value;
        },
        get listingPrepareCalls() {
            return listingPrepareCalls;
        },
        get listingRollbackCalls() {
            return listingRollbackCalls;
        },
        get orderCalls() {
            return orderCalls;
        },
    };
}

test("opening a high-grade store charges 500000 deposit plus 100000 first rent and requires a real listing", () => {
    const harnessState = harness();
    const { economy, service } = harnessState;
    const opened = service.openStore({
        ownerResidentId: "store-owner",
        grade: "high",
        leaseId: "store-lease-1",
        listingReference: "dish-1",
        idempotencyKey: "store-open-1",
    });
    assert.equal(opened.depositGold, 500_000);
    assert.equal(opened.rentGold, CHEF_STORE_RENT_GOLD);
    assert.equal(opened.state, "active");
    assert.equal(opened.openingListingReceiptId, "listing:store-lease-1:1");
    assert.equal(economy.getAccount("store-owner").availableGold, 1_000_000 - CHEF_STORE_OPENING_GOLD);
    assert.equal(service.openStore({
        ownerResidentId: "store-owner",
        grade: "high",
        leaseId: "store-lease-1",
        listingReference: "dish-1",
        idempotencyKey: "store-open-1",
    }).leaseId, "store-lease-1");
    assert.equal(harnessState.listingPrepareCalls, 1);
    assert.throws(() => service.openStore({
        ownerResidentId: "store-owner",
        grade: "special",
        idempotencyKey: "store-open-duplicate",
    }), (error) => error?.code === "chef_store_one_live_store_per_resident");
    assert.throws(() => service.openStore({
        ownerResidentId: "store-buyer",
        grade: "ordinary",
        idempotencyKey: "store-open-forbidden-grade",
    }), (error) => error?.code === "chef_store_grade_forbidden");
});

test("rent grace suspends only new orders, rent payment resumes the lease, and order replay does not duplicate callback work", () => {
    const harnessState = harness();
    const { service } = harnessState;
    const opened = service.openStore({
        ownerResidentId: "store-owner",
        grade: "special",
        leaseId: "store-lease-2",
        idempotencyKey: "store-open-2",
    });
    const firstOrder = service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "dish-1",
        quantity: 1,
        idempotencyKey: "store-order-1:place",
    });
    assert.equal(firstOrder.state, "completed");
    assert.deepEqual(service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "dish-1",
        quantity: 1,
        idempotencyKey: "store-order-1:place",
    }), firstOrder);
    assert.equal(harnessState.orderCalls, 1);

    harnessState.setNow(opened.nextRentDueAt + 3 * CHEF_STORE_DAY_MS);
    const suspended = service.reconcileLease(opened.leaseId);
    assert.equal(suspended.state, "suspended");
    assert.equal(suspended.arrearsGold, CHEF_STORE_RENT_GOLD);
    assert.deepEqual(service.getOrder(firstOrder.orderId), firstOrder);
    assert.throws(() => service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "dish-2",
        quantity: 1,
        idempotencyKey: "store-order-2:place",
    }), (error) => error?.code === "chef_store_new_orders_suspended");

    const paid = service.payRent({
        leaseId: opened.leaseId,
        ownerResidentId: "store-owner",
        idempotencyKey: "store-lease-2:rent-1",
    });
    assert.equal(paid.state, "active");
    assert.equal(paid.arrearsGold, 0);
    assert.equal(paid.rentPaymentReceiptId.length > 0, true);
    const secondOrder = service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "dish-2",
        quantity: 2,
        idempotencyKey: "store-order-3:place",
    });
    assert.equal(secondOrder.state, "completed");
    assert.equal(harnessState.orderCalls, 2);
    assert.throws(() => service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-stranger",
        productId: "dish-3",
        quantity: 1,
        idempotencyKey: "store-order-stranger",
    }), (error) => error?.code === "chef_store_real_resident_required");
});

test("seven overdue days terminate the lease, apply deposit to rent, and refund the remainder", () => {
    const harnessState = harness();
    const { economy, service } = harnessState;
    const opened = service.openStore({
        ownerResidentId: "store-owner",
        grade: "high",
        leaseId: "store-lease-3",
        idempotencyKey: "store-open-3",
    });
    const dueAt = opened.nextRentDueAt;
    const before = economy.getAccount("store-owner").availableGold;
    harnessState.setNow(dueAt + 7 * CHEF_STORE_DAY_MS);
    const terminated = service.reconcileLease({ leaseId: opened.leaseId });
    assert.equal(terminated.state, "terminated");
    assert.equal(terminated.terminationDepositAppliedGold, CHEF_STORE_RENT_GOLD);
    assert.equal(terminated.terminationRefundGold, 400_000);
    assert.equal(terminated.debtGold, 0);
    assert.equal(terminated.terminationRefundReceiptId.length > 0, true);
    assert.equal(economy.getAccount("store-owner").availableGold, before + 400_000);
});

test("failed opening charge rolls back the real listing reservation and does not create a lease", () => {
    const harnessState = harness(500_000);
    assert.throws(() => harnessState.service.openStore({
        ownerResidentId: "store-owner",
        grade: "high",
        leaseId: "store-lease-failed",
        idempotencyKey: "store-open-failed",
    }));
    assert.equal(harnessState.economy.getAccount("store-owner").availableGold, 500_000);
    assert.equal(harnessState.database.prepare("SELECT COUNT(*) AS count FROM chef_store_leases").get().count, 0);
    assert.equal(harnessState.listingRollbackCalls, 1);
});
