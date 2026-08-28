import assert from "node:assert/strict";
import test from "node:test";
import { EconomyService } from "../dist/economy/economy-service.js";
import {
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} from "../dist/lingye-world-database.js";
import {
    CHEF_STORE_FARM_RECEIPT_VERSION,
    CHEF_STORE_LISTINGS_FIELD,
    CHEF_STORE_ORDER_RECEIPTS_FIELD,
    createChefStoreFarmAdapter,
} from "../dist/career/chef-store-farm-adapter.js";
import { ChefStoreService } from "../dist/career/chef-store-service.js";

const START = Date.parse("2026-09-01T08:00:00+08:00");
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};

function farm(id, binding, extra = {}) {
    return {
        id,
        name: id,
        doorbellMcpMigration: { migrationId: binding },
        market: [
            { kind: "ingredient", id: "salt", qty: 3, price: 10, listedAt: START },
            {
                kind: "dish",
                id: "dish-1",
                qty: 1,
                price: 20,
                dish: { id: "dish-1", recipeId: "recipe-1", name: "盐焗菜", value: 3 },
                listedAt: START,
            },
            { kind: "ingredient", id: "unrelated", qty: 4, price: 7, listedAt: START },
        ],
        ranch: { kitchen: { ingredients: {}, dishes: [], products: [] } },
        silver: 0,
        ...extra,
    };
}

function harness({ failSettle = false } = {}) {
    const database = openLingyeWorldDatabase(":memory:");
    for (const residentId of ["store-owner", "store-buyer", "store-other"]) {
        registerLingyeResidentReference(database, {
            residentId,
            bindingReference: `store-binding:${residentId}`,
            registeredAt: START,
        });
    }
    const farms = new Map([
        ["FARM-A", farm("FARM-A", "store-binding:store-owner")],
        ["FARM-B", farm("FARM-B", "store-binding:store-buyer")],
        ["FARM-C", farm("FARM-C", "store-binding:store-other")],
    ]);
    let now = START;
    let economySequence = 0;
    const baseEconomy = new EconomyService(database, {
        rules: ECONOMY_RULES,
        now: () => now,
        generateId: () => `chef-store-farm-economy:${++economySequence}`,
    });
    for (const [residentId, gold, silver] of [
        ["store-owner", 1_000_000, 0],
        ["store-buyer", 100_000, 100],
        ["store-other", 100_000, 100],
    ]) {
        baseEconomy.importLegacyBalances({
            residentId,
            gold,
            silver,
            migrationId: `store-farm-migration:${residentId}`,
            idempotencyKey: `store-farm-import:${residentId}`,
        });
    }
    const economy = {
        createTrade: (...args) => baseEconomy.createTrade(...args),
        confirmTrade: (...args) => baseEconomy.confirmTrade(...args),
        settleTrade: (...args) => {
            if (failSettle && !economy.settleFailed) {
                economy.settleFailed = true;
                throw new Error("injected settlement failure");
            }
            return baseEconomy.settleTrade(...args);
        },
        chargeToSystem: (...args) => baseEconomy.chargeToSystem(...args),
        creditFromSystem: (...args) => baseEconomy.creditFromSystem(...args),
        importLegacyBalances: (...args) => baseEconomy.importLegacyBalances(...args),
        getAccount: (...args) => baseEconomy.getAccount(...args),
        settleFailed: false,
    };
    const adapter = createChefStoreFarmAdapter({
        database,
        economy,
        now: () => now,
        listFarms: () => [...farms.values()],
        replaceFarm: (id, next) => {
            if (!farms.has(id))
                throw new Error("farm not found");
            farms.set(id, structuredClone(next));
        },
        replaceFarmsAtomic: (replacements) => {
            const next = new Map(farms);
            for (const replacement of replacements) {
                if (!next.has(replacement.id))
                    throw new Error("farm not found");
                next.set(replacement.id, structuredClone(replacement.farm));
            }
            for (const [id, value] of next)
                farms.set(id, value);
        },
    });
    const service = new ChefStoreService(database, {
        economy,
        now: () => now,
        generateId: (() => {
            let sequence = 0;
            return () => `chef-store-service:${++sequence}`;
        })(),
        prepareOpeningListing: adapter.prepareOpeningListing,
        rollbackOpeningListing: adapter.rollbackOpeningListing,
        executeOrder: adapter.executeOrder,
        isRealResident: (residentId) => ["store-owner", "store-buyer", "store-other"].includes(residentId),
    });
    return {
        database,
        farms,
        economy,
        adapter,
        service,
        setNow(value) {
            now = value;
        },
    };
}

function openStore(harnessState, idempotencyKey = "store-open") {
    return harnessState.service.openStore({
        ownerResidentId: "store-owner",
        grade: "high",
        leaseId: "store-lease",
        listingReference: "market:ingredient:salt",
        idempotencyKey,
    });
}

test("opening reserves the owner's real market listing and rejects fake identity or listing references", () => {
    const state = harness();
    const opened = openStore(state);
    const owner = state.farms.get("FARM-A");
    assert.equal(opened.openingListingReceiptId, "chef-store-listing:store-lease");
    assert.equal(owner.market.some((entry) => entry.kind === "ingredient" && entry.id === "salt"), false);
    assert.equal(owner.market.some((entry) => entry.id === "unrelated"), true);
    assert.equal(owner[CHEF_STORE_LISTINGS_FIELD][opened.openingListingReceiptId].quantity, 3);
    assert.equal(owner[CHEF_STORE_LISTINGS_FIELD][opened.openingListingReceiptId].price, 10);
    assert.throws(() => state.adapter.prepareOpeningListing({
        leaseId: "other-lease",
        ownerResidentId: "store-owner",
        listingReference: "market:ingredient:missing",
    }), (error) => error?.code === "chef_store_farm_listing_not_found");
    assert.throws(() => state.adapter.prepareOpeningListing({
        leaseId: "identity-lease",
        ownerResidentId: "store-owner",
        listingReference: "market:ingredient:salt",
        farmId: "FARM-C",
    }), (error) => error?.code === "chef_store_farm_client_identity_forbidden");
});

test("order transfers real ingredient inventory and settles through SQLite economy, not farm silver", () => {
    const state = harness();
    const opened = openStore(state);
    const first = state.service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "salt",
        quantity: 2,
        idempotencyKey: "store-order-1",
    });
    assert.equal(first.state, "completed");
    assert.equal(state.farms.get("FARM-B").ranch.kitchen.ingredients.salt, 2);
    assert.equal(state.farms.get("FARM-A")[CHEF_STORE_LISTINGS_FIELD][opened.openingListingReceiptId].quantity, 1);
    assert.equal(state.economy.getAccount("store-buyer").availableSilver, 80);
    assert.equal(state.economy.getAccount("store-owner").availableSilver, 18);
    assert.equal(state.farms.get("FARM-B").silver, 0);
    assert.equal(state.farms.get("FARM-A").silver, 0);
    assert.deepEqual(state.service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "salt",
        quantity: 2,
        idempotencyKey: "store-order-1",
    }), first);
    assert.equal(state.farms.get("FARM-B").ranch.kitchen.ingredients.salt, 2);
});

test("a suspended lease rejects new orders but allows an existing order receipt to be recovered", () => {
    const state = harness();
    const opened = openStore(state);
    const first = state.service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "salt",
        quantity: 1,
        idempotencyKey: "store-order-suspended-replay",
    });
    state.database.prepare(
        "DELETE FROM chef_store_action_receipts WHERE action_key = ?",
    ).run("store-order-suspended-replay");
    state.setNow(opened.nextRentDueAt + 3 * 24 * 60 * 60 * 1_000);
    assert.equal(state.service.reconcileLease(opened.leaseId).state, "suspended");
    const replay = state.service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "salt",
        quantity: 1,
        idempotencyKey: "store-order-suspended-replay",
    });
    assert.deepEqual(replay, first);
    assert.throws(() => state.service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "salt",
        quantity: 1,
        idempotencyKey: "store-order-new-while-suspended",
    }), (error) => error?.code === "chef_store_new_orders_suspended");
});

test("restart recovery persists a completed farm receipt into SQLite without duplicate inventory", () => {
    const state = harness();
    const opened = openStore(state);
    state.database.exec(`
      CREATE TRIGGER fail_chef_store_order_insert
      BEFORE INSERT ON chef_store_orders
      BEGIN
        SELECT RAISE(ABORT, 'injected chef order database failure');
      END
    `);
    assert.throws(() => state.service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "salt",
        quantity: 1,
        idempotencyKey: "store-order-db-failure",
    }));
    assert.equal(state.farms.get("FARM-B").ranch.kitchen.ingredients.salt, 1);
    assert.equal(state.farms.get("FARM-A")[CHEF_STORE_ORDER_RECEIPTS_FIELD]["chef-store-order:store-order-db-failure"].state, "completed");
    assert.equal(state.economy.getAccount("store-buyer").availableSilver, 100);
    state.database.exec("DROP TRIGGER fail_chef_store_order_insert");
    assert.deepEqual(state.adapter.recoverPendingOrders({
        completeOrder: (input) => state.service.placeOrder(input),
    }), { recovered: 1 });
    const replay = state.service.getOrder("chef-store-order:store-order-db-failure");
    assert.equal(replay.state, "completed");
    assert.deepEqual(state.service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "salt",
        quantity: 1,
        idempotencyKey: "store-order-db-failure",
    }), replay);
    assert.deepEqual(state.adapter.recoverPendingOrders({
        completeOrder: (input) => state.service.placeOrder(input),
    }), { recovered: 0 });
    assert.equal(state.farms.get("FARM-B").ranch.kitchen.ingredients.salt, 1);
    assert.equal(state.economy.getAccount("store-buyer").availableSilver, 90);
    assert.equal(state.farms.get("FARM-A")[CHEF_STORE_ORDER_RECEIPTS_FIELD][replay.orderId].paymentReceiptId, replay.paymentReceiptId);
});

test("startup recovery restores an opening listing whose SQLite lease was never committed", () => {
    const state = harness();
    const prepared = state.adapter.prepareOpeningListing({
        leaseId: "orphaned-opening",
        ownerResidentId: "store-owner",
        listingReference: "market:ingredient:salt",
    });
    assert.equal(prepared.listingReceiptId, "chef-store-listing:orphaned-opening");
    assert.equal(state.farms.get("FARM-A").market.some((entry) => entry.id === "salt"), false);
    assert.deepEqual(state.adapter.recoverOrphanedListings(), { restoredListings: 1 });
    assert.equal(state.farms.get("FARM-A").market.find((entry) => entry.id === "salt").qty, 3);
    assert.deepEqual(state.adapter.recoverOrphanedListings(), { restoredListings: 0 });
});

test("inventory transfer is a durable saga stage when settlement fails, and restart-style recovery completes it once", () => {
    const state = harness({ failSettle: true });
    const opened = openStore(state);
    assert.throws(() => state.service.placeOrder({
        leaseId: opened.leaseId,
        buyerResidentId: "store-buyer",
        productId: "salt",
        quantity: 1,
        idempotencyKey: "store-order-settle-failure",
    }));
    const pending = state.farms.get("FARM-A")[CHEF_STORE_ORDER_RECEIPTS_FIELD]["chef-store-order:store-order-settle-failure"];
    assert.equal(pending.state, "inventory_applied");
    assert.equal(state.farms.get("FARM-B").ranch.kitchen.ingredients.salt, 1);
    assert.equal(state.economy.getAccount("store-buyer").availableSilver, 100);
    const recovered = state.adapter.recoverPendingOrders();
    assert.equal(recovered.recovered, 1);
    assert.equal(state.farms.get("FARM-B").ranch.kitchen.ingredients.salt, 1);
    assert.equal(state.economy.getAccount("store-buyer").availableSilver, 90);
    assert.equal(state.farms.get("FARM-A")[CHEF_STORE_ORDER_RECEIPTS_FIELD]["chef-store-order:store-order-settle-failure"].state, "completed");
    assert.equal(state.adapter.recoverPendingOrders().recovered, 0);
});

test("termination restores only the lease listing and leaves unrelated market entries intact", () => {
    const state = harness();
    const opened = openStore(state);
    state.setNow(opened.nextRentDueAt + 7 * 24 * 60 * 60 * 1_000);
    const terminated = state.service.reconcileLease(opened.leaseId);
    assert.equal(terminated.state, "terminated");
    const result = state.adapter.reconcileTerminatedLeases();
    assert.equal(result.restoredListings, 1);
    const owner = state.farms.get("FARM-A");
    assert.equal(owner[CHEF_STORE_LISTINGS_FIELD]?.[opened.openingListingReceiptId], undefined);
    assert.equal(owner.market.filter((entry) => entry.id === "salt").length, 1);
    assert.equal(owner.market.find((entry) => entry.id === "salt").qty, 3);
    assert.equal(owner.market.find((entry) => entry.id === "unrelated").qty, 4);
    assert.equal(CHEF_STORE_FARM_RECEIPT_VERSION, 1);
});
