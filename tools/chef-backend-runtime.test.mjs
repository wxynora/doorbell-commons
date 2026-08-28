import assert from "node:assert/strict";
import test from "node:test";
import {
  createLingyeWorldBackend,
  openLingyeWorldDatabase,
  registerLingyeResidentReference,
} from "../dist/lingye-world-database.js";
import {
  CHEF_FARM_INVENTORY_RECEIPTS_FIELD,
  createChefFarmInventoryAdapter,
} from "../dist/career/chef-farm-inventory-adapter.js";

const NOW = Date.parse("2026-09-01T08:00:00+08:00");
const RULES = {
  minimumSystemLoanCreditDays: null,
  restrictedDailyGoldLimit: null,
  restrictedDailySilverLimit: null,
};

function seedResident(database, residentId, level = null) {
  registerLingyeResidentReference(database, {
    residentId,
    bindingReference: `chef-runtime:${residentId}`,
    registeredAt: NOW - 1_000,
  });
  if (level === null) return;
  database.prepare(`
    INSERT INTO career_tracks (resident_id, career, track_order, selected_at)
    VALUES (?, 'chef', 1, ?)
  `).run(residentId, NOW - 900);
  database.prepare(`
    INSERT INTO career_certificates (
      resident_id, career, qualification_level, status,
      source_attempt_id, issued_at, effective_at
    ) VALUES (?, 'chef', ?, 'active', ?, ?, ?)
  `).run(residentId, level, `chef-runtime-attempt:${residentId}`, NOW - 800, NOW - 700);
}

function importBalance(backend, residentId, gold, silver) {
  backend.trustedSystemCommands.importLegacyBalances({
    residentId,
    gold,
    silver,
    migrationId: `chef-runtime-balance:${residentId}`,
    idempotencyKey: `chef-runtime-import:${residentId}`,
  });
}

function seedOriginalRecipe(database) {
  database.prepare(`
    INSERT INTO career_chef_original_recipes (
      recipe_id, identity_key, resident_id, recipe_name, ingredients_json,
      method_id, recipe_version, quality_version, base_score, pair_score,
      method_score, structure_score, quality_score, total_score, rarity, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "chef-original-runtime",
    "beef:1|butter:1|pan-fry",
    "chef-author-runtime",
    "运行时原创菜",
    JSON.stringify([{ id: "beef", quantity: 1 }, { id: "butter", quantity: 1 }]),
    "pan-fry",
    "chef-quality-v1",
    1,
    100,
    100,
    100,
    100,
    100,
    "R",
    NOW,
  );
}

test("Lingye backend installs chef schemas and keeps chef mutations resident-bound", () => {
  const database = openLingyeWorldDatabase(":memory:");
  let now = NOW;
  const callbackCalls = [];
  let cookingReceiptIsOriginal = true;
  try {
    seedResident(database, "chef-author-runtime");
    seedResident(database, "chef-owner-runtime", 3);
    seedResident(database, "chef-buyer-runtime");
    seedResident(database, "chef-research-runtime", 1);
    seedOriginalRecipe(database);
    const backend = createLingyeWorldBackend(database, {
      economyRules: RULES,
      now: () => now,
      generateId: (() => {
        let sequence = 0;
        return () => `chef-runtime-id:${++sequence}`;
      })(),
      random: (() => {
        let sequence = 0;
        return () => [0, 1][sequence++] ?? 1;
      })(),
      chefAuthority: {
        createRecipeInventoryAdapter({ residentId }) {
          callbackCalls.push(["recipe-inventory", residentId]);
          return {
            isMethodAvailable: () => true,
            consumeIngredients(input) {
              callbackCalls.push(["recipe-consume", input]);
              return { ok: true, receipt: { receiptId: `recipe-consume:${input.operationId}` } };
            },
            refundIngredient() {
              return { ok: false, code: "refund_not_eligible" };
            },
          };
        },
        prepareOpeningListing(input) {
          callbackCalls.push(["listing", input]);
          return { listingReceiptId: `listing:${input.leaseId}` };
        },
        rollbackOpeningListing(input) {
          callbackCalls.push(["rollback", input]);
        },
        executeOrder(input) {
          callbackCalls.push(["order", input]);
          return {
            inventoryReceiptId: `inventory:${input.orderId}`,
            paymentReceiptId: `farm-payment:${input.orderId}`,
          };
        },
        resolveCookingReceipt(receiptId) {
          callbackCalls.push(["cook-receipt", receiptId]);
          return {
            receiptId,
            cookResidentId: "chef-buyer-runtime",
            recipeId: "chef-original-runtime",
            success: true,
            original: cookingReceiptIsOriginal,
          };
        },
      },
    });
    importBalance(backend, "chef-author-runtime", 100_000, 0);
    importBalance(backend, "chef-owner-runtime", 1_000_000, 0);
    importBalance(backend, "chef-buyer-runtime", 100_000, 1_000);

    for (const table of [
      "career_chef_original_recipes",
      "chef_commerce_action_receipts",
      "chef_recipe_purchases",
      "chef_recipe_entitlements",
      "chef_recipe_production_commissions",
      "chef_store_action_receipts",
      "chef_store_leases",
      "chef_store_orders",
    ]) {
      assert.equal(
        database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined,
        true,
        table,
      );
    }
    assert.equal(Object.hasOwn(backend.trustedSystemCommands, "openChefStore"), false);
    assert.equal(Object.hasOwn(backend.trustedSystemCommands, "purchaseChefOriginalRecipe"), false);
    assert.equal(Object.hasOwn(backend.trustedSystemCommands, "reconcileChefStoreLease"), true);

    const buyer = backend.forResident("chef-buyer-runtime");
    assert.throws(
      () => buyer.purchaseChefOriginalRecipe({
        buyerResidentId: "chef-author-runtime",
        recipeId: "chef-original-runtime",
        purchaseId: "chef-runtime-purchase",
        idempotencyKey: "chef-runtime-buy-spoof",
      }),
      (error) => error?.code === "chef_identity_fields_forbidden",
    );
    const purchase = buyer.purchaseChefOriginalRecipe({
      recipeId: "chef-original-runtime",
      purchaseId: "chef-runtime-purchase",
      idempotencyKey: "chef-runtime-buy",
    });
    assert.equal(purchase.recipeUnlockReceiptId, null);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count
      FROM chef_recipe_entitlements
      WHERE resident_id = ? AND recipe_id = ? AND source_kind = 'purchase' AND revoked_at IS NULL
    `).get("chef-buyer-runtime", "chef-original-runtime").count, 1);
    assert.equal(buyer.canUseOwnChefRecipe("chef-original-runtime"), true);
    assert.equal(backend.forResident("chef-buyer-runtime").purchaseChefOriginalRecipe({
      recipeId: "chef-original-runtime",
      purchaseId: "chef-runtime-purchase",
      idempotencyKey: "chef-runtime-buy",
    }).purchaseId, purchase.purchaseId);
    const refunded = buyer.refundChefOriginalRecipePurchase({
      purchaseId: purchase.purchaseId,
      idempotencyKey: "chef-runtime-refund",
    });
    assert.equal(refunded.recipeRevokeReceiptId, null);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count
      FROM chef_recipe_entitlements
      WHERE resident_id = ? AND recipe_id = ? AND source_kind = 'purchase' AND revoked_at IS NULL
    `).get("chef-buyer-runtime", "chef-original-runtime").count, 0);
    assert.equal(buyer.canUseOwnChefRecipe("chef-original-runtime"), false);
    assert.equal(backend.forResident("chef-buyer-runtime").getOwnAccount().availableSilver, 1_000);

    const commission = buyer.recordChefOriginalRecipeProduction({
      cookingReceiptId: "chef-runtime-cook-receipt",
      idempotencyKey: "chef-runtime-commission",
    });
    assert.equal(commission.authorResidentId, "chef-author-runtime");
    assert.equal(buyer.canUseOwnChefRecipe("chef-original-runtime"), true);
    assert.equal(buyer.listOwnChefRecipes().some((recipe) => recipe.recipeId === "chef-original-runtime"), true);
    assert.equal(backend.forResident("chef-author-runtime").canUseOwnChefRecipe("chef-original-runtime"), true);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count
      FROM chef_recipe_entitlements
      WHERE resident_id = ? AND recipe_id = ? AND source_kind = 'discovery' AND revoked_at IS NULL
    `).get("chef-buyer-runtime", "chef-original-runtime").count, 1);

    const researcher = backend.forResident("chef-research-runtime");
    assert.throws(
      () => researcher.researchOwnChefRecipe({
        residentId: "chef-buyer-runtime",
        operationId: "chef-runtime-research-spoof",
        idempotencyKey: "chef-runtime-research-spoof",
        recipeName: "伪造身份菜",
        methodId: "pan-fry",
        ingredients: [{ id: "beef", quantity: 1 }, { id: "butter", quantity: 1 }],
      }),
      (error) => error?.code === "chef_identity_fields_forbidden",
    );
    const researched = researcher.researchOwnChefRecipe({
      operationId: "chef-runtime-research",
      idempotencyKey: "chef-runtime-research",
      recipeName: "运行时研究菜",
      methodId: "pan-fry",
      ingredients: [{ id: "beef", quantity: 1 }, { id: "butter", quantity: 1 }],
    });
    assert.equal(researched.status, "succeeded");
    assert.equal(researched.residentId, "chef-research-runtime");
    assert.equal(callbackCalls.find(([kind]) => kind === "recipe-consume")[1].residentId, "chef-research-runtime");
    assert.throws(
      () => buyer.recoverOwnChefRecipeResearch(researched.operationId),
      (error) => error?.code === "chef_recipe_operation_not_found",
    );
    assert.equal(backend.forResident("chef-author-runtime").getOwnAccount().availableGold, 100_300);
    assert.throws(
      () => buyer.recordChefOriginalRecipeProduction({
        cookingReceiptId: "chef-runtime-cook-receipt-2",
        recipeId: "not-authoritative-client-recipe",
        idempotencyKey: "chef-runtime-commission-2",
      }),
      (error) => error?.code === "chef_identity_fields_forbidden" || error?.code === "chef_commerce_cooking_receipt_not_found",
    );
    cookingReceiptIsOriginal = false;
    assert.throws(
      () => buyer.recordChefOriginalRecipeProduction({
        cookingReceiptId: "chef-runtime-non-original",
        idempotencyKey: "chef-runtime-non-original",
      }),
      (error) => error?.code === "chef_commerce_cooking_receipt_not_found",
    );

    const owner = backend.forResident("chef-owner-runtime");
    const opened = owner.openChefStore({
      grade: "high",
      listingReference: "farm-listing-runtime",
      idempotencyKey: "chef-runtime-open",
    });
    assert.equal(opened.state, "active");
    assert.match(opened.leaseId, /^chef-store-lease:[0-9a-f]{64}$/);
    assert.equal(owner.openChefStore({
      grade: "high",
      listingReference: "farm-listing-runtime",
      idempotencyKey: "chef-runtime-open",
    }).leaseId, opened.leaseId);
    const order = buyer.placeChefStoreOrder({
      leaseId: opened.leaseId,
      productId: "dish-runtime",
      quantity: 1,
      idempotencyKey: "chef-runtime-order",
    });
    assert.equal(order.inventoryReceiptId, "inventory:chef-store-order:chef-runtime-order");
    assert.equal(callbackCalls.find(([kind]) => kind === "order")[1].ownerResidentId, "chef-owner-runtime");
    assert.equal(callbackCalls.find(([kind]) => kind === "order")[1].buyerResidentId, "chef-buyer-runtime");

    now = opened.nextRentDueAt + 7 * 24 * 60 * 60 * 1_000;
    assert.equal(backend.trustedSystemCommands.reconcileChefStoreLease(opened.leaseId).state, "terminated");
  } finally {
    if (database.isOpen) database.close();
  }
});

test("chef backend fails closed when cooking receipt, listing, or farm order authority is absent", () => {
  const database = openLingyeWorldDatabase(":memory:");
  try {
    seedResident(database, "chef-owner-fail-closed", 3);
    seedResident(database, "chef-buyer-fail-closed");
    const backend = createLingyeWorldBackend(database, { economyRules: RULES, now: () => NOW });
    importBalance(backend, "chef-owner-fail-closed", 1_000_000, 0);
    importBalance(backend, "chef-buyer-fail-closed", 100_000, 1_000);
    const owner = backend.forResident("chef-owner-fail-closed");
    assert.throws(
      () => owner.openChefStore({ grade: "high", idempotencyKey: "chef-fail-open" }),
      (error) => error?.code === "chef_store_opening_listing_authority_unavailable",
    );
    assert.throws(
      () => backend.forResident("chef-buyer-fail-closed").placeChefStoreOrder({
        leaseId: "missing-lease",
        productId: "dish",
        quantity: 1,
        idempotencyKey: "chef-fail-order",
      }),
      (error) => error?.code === "chef_store_order_authority_unavailable" || error?.code === "chef_store_lease_not_found",
    );
    assert.throws(
      () => backend.forResident("chef-buyer-fail-closed").recordChefOriginalRecipeProduction({
        cookingReceiptId: "chef-fail-cooking-receipt",
        idempotencyKey: "chef-fail-cooking",
      }),
      (error) => error?.code === "chef_commerce_cooking_receipt_authority_unavailable",
    );
  } finally {
    if (database.isOpen) database.close();
  }
});

test("recipe research keeps a durable farm receipt across a failed SQLite phase and recovers without a second consume", () => {
  const database = openLingyeWorldDatabase(":memory:");
  const residentId = "chef-research-fault-runtime";
  const migrationId = `chef-runtime:${residentId}`;
  let currentFarm = {
    id: "chef-fault-farm",
    doorbellMcpMigration: { migrationId },
    ranch: {
      kitchen: {
        ownedTools: ["fryer"],
        products: [{ id: "chef-fault-beef-1", itemId: "beef", value: 10 }],
        ingredients: { butter: 1 },
        dishes: [],
        knownRecipes: [],
      },
    },
    fishing: { catchInventory: [] },
  };
  let replaceCalls = 0;
  try {
    seedResident(database, residentId, 1);
    const backend = createLingyeWorldBackend(database, {
      economyRules: RULES,
      now: () => NOW,
      random: (() => {
        let sequence = 0;
        return () => [0, 1][sequence++] ?? 1;
      })(),
      chefAuthority: {
        createRecipeInventoryAdapter({ residentId: factoryResidentId }) {
          assert.equal(factoryResidentId, residentId);
          return createChefFarmInventoryAdapter({
            database,
            residentId: factoryResidentId,
            now: () => NOW,
            listFarms: () => [currentFarm],
            replaceFarm: (_farmId, nextFarm) => {
              replaceCalls += 1;
              currentFarm = nextFarm;
            },
          });
        },
      },
    });
    const researcher = backend.forResident(residentId);
    database.exec(`
      CREATE TRIGGER chef_runtime_fail_after_farm_consume
      BEFORE UPDATE OF status ON career_chef_recipe_research_operations
      WHEN NEW.status = 'consumed'
      BEGIN
        SELECT RAISE(ABORT, 'injected recipe phase failure');
      END;
    `);
    assert.throws(() => researcher.researchOwnChefRecipe({
      operationId: "chef-runtime-research-fault",
      idempotencyKey: "chef-runtime-research-fault",
      recipeName: "故障恢复菜",
      methodId: "pan-fry",
      ingredients: [{ id: "beef", quantity: 1 }, { id: "butter", quantity: 1 }],
    }));
    assert.equal(database.prepare(`
      SELECT status FROM career_chef_recipe_research_operations
      WHERE operation_id = ?
    `).get("chef-runtime-research-fault").status, "pending");
    assert.equal(currentFarm.ranch.kitchen.products.length, 0);
    assert.equal(currentFarm.ranch.kitchen.ingredients.butter, undefined);
    assert.ok(currentFarm[CHEF_FARM_INVENTORY_RECEIPTS_FIELD]);
    assert.equal(replaceCalls, 1);

    database.exec("DROP TRIGGER chef_runtime_fail_after_farm_consume");
    const recovered = researcher.recoverOwnChefRecipeResearch("chef-runtime-research-fault");
    assert.equal(recovered.status, "succeeded");
    assert.equal(replaceCalls, 1);
    assert.equal(currentFarm.ranch.kitchen.products.length, 0);
    assert.equal(currentFarm.ranch.kitchen.ingredients.butter, undefined);
  } finally {
    if (database.isOpen) database.close();
  }
});

test("farm-store runtime assembly recovers a completed farm order into SQLite on restart", () => {
  const database = openLingyeWorldDatabase(":memory:");
  const farms = new Map([
    ["chef-store-owner-farm", {
      id: "chef-store-owner-farm",
      doorbellMcpMigration: { migrationId: "chef-runtime:chef-store-owner" },
      market: [{ kind: "ingredient", id: "salt", qty: 2, price: 10, listedAt: NOW }],
      ranch: { kitchen: { ingredients: {}, dishes: [], products: [] } },
      silver: 0,
    }],
    ["chef-store-buyer-farm", {
      id: "chef-store-buyer-farm",
      doorbellMcpMigration: { migrationId: "chef-runtime:chef-store-buyer" },
      market: [],
      ranch: { kitchen: { ingredients: {}, dishes: [], products: [] } },
      silver: 0,
    }],
  ]);
  const farmStoreOptions = {
    listFarms: () => [...farms.values()],
    replaceFarm: (farmId, nextFarm) => farms.set(farmId, structuredClone(nextFarm)),
    replaceFarmsAtomic: (replacements) => {
      const next = new Map(farms);
      for (const replacement of replacements) next.set(replacement.id, structuredClone(replacement.farm));
      for (const [farmId, farm] of next) farms.set(farmId, farm);
    },
  };
  try {
    seedResident(database, "chef-store-owner", 3);
    seedResident(database, "chef-store-buyer");
    const first = createLingyeWorldBackend(database, {
      economyRules: RULES,
      now: () => NOW,
      chefAuthority: { useFarmStore: true, farmStoreOptions },
    });
    importBalance(first, "chef-store-owner", 1_000_000, 0);
    importBalance(first, "chef-store-buyer", 100_000, 100);
    const lease = first.forResident("chef-store-owner").openChefStore({
      grade: "high",
      listingReference: "market:ingredient:salt",
      idempotencyKey: "chef-store-runtime-open",
    });
    database.exec(`
      CREATE TRIGGER fail_runtime_store_order
      BEFORE INSERT ON chef_store_orders
      BEGIN
        SELECT RAISE(ABORT, 'injected runtime store failure');
      END
    `);
    assert.throws(() => first.forResident("chef-store-buyer").placeChefStoreOrder({
      leaseId: lease.leaseId,
      productId: "salt",
      quantity: 1,
      idempotencyKey: "chef-store-runtime-order",
    }));
    assert.equal(farms.get("chef-store-buyer-farm").ranch.kitchen.ingredients.salt, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM chef_store_orders").get().count, 0);
    database.exec("DROP TRIGGER fail_runtime_store_order");

    const restarted = createLingyeWorldBackend(database, {
      economyRules: RULES,
      now: () => NOW,
      chefAuthority: { useFarmStore: true, farmStoreOptions },
    });
    const recovered = restarted.forResident("chef-store-buyer")
      .getOwnChefStoreOrder("chef-store-order:chef-store-runtime-order");
    assert.equal(recovered.state, "completed");
    assert.equal(farms.get("chef-store-buyer-farm").ranch.kitchen.ingredients.salt, 1);
    assert.equal(restarted.forResident("chef-store-buyer").getOwnAccount().availableSilver, 90);
    assert.equal(restarted.forResident("chef-store-owner").getOwnAccount().availableSilver, 9);
  } finally {
    if (database.isOpen) database.close();
  }
});
