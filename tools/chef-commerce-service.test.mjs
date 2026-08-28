import assert from "node:assert/strict";
import test from "node:test";
import { EconomyService } from "../dist/economy/economy-service.js";
import {
    openLingyeWorldDatabase,
    registerLingyeResidentReference,
} from "../dist/lingye-world-database.js";
import {
    CHEF_ORIGINAL_RECIPE_GOLD_COMMISSION,
    CHEF_ORIGINAL_RECIPE_SILVER_PRICE,
    ChefCommerceService,
} from "../dist/career/chef-commerce-service.js";

const START = Date.parse("2026-09-01T08:00:00+08:00");
const ECONOMY_RULES = {
    minimumSystemLoanCreditDays: null,
    restrictedDailyGoldLimit: null,
    restrictedDailySilverLimit: null,
};

function harness() {
    const database = openLingyeWorldDatabase(":memory:");
    for (const residentId of ["chef-author", "chef-buyer", "chef-other"]) {
        registerLingyeResidentReference(database, {
            residentId,
            bindingReference: `chef-binding:${residentId}`,
            registeredAt: START,
        });
    }
    let now = START;
    let economySequence = 0;
    const economy = new EconomyService(database, {
        rules: ECONOMY_RULES,
        now: () => now,
        generateId: () => `chef-commerce-economy:${++economySequence}`,
    });
    for (const [residentId, gold, silver] of [
        ["chef-author", 100_000, 0],
        ["chef-buyer", 100_000, 1_000],
        ["chef-other", 100_000, 1_000],
    ]) {
        economy.importLegacyBalances({
            residentId,
            gold,
            silver,
            migrationId: `chef-migration:${residentId}`,
            idempotencyKey: `chef-import:${residentId}`,
        });
    }
    const recipes = new Map([
        ["recipe-r", { recipeId: "recipe-r", authorResidentId: "chef-author", rarity: "R" }],
        ["recipe-ssr", { recipeId: "recipe-ssr", authorResidentId: "chef-author", rarity: "SSR" }],
    ]);
    const receipts = new Map();
    let serviceSequence = 0;
    const service = new ChefCommerceService(database, {
        economy,
        now: () => now,
        generateId: () => `chef-commerce:${++serviceSequence}`,
        resolveOriginalRecipe: (recipeId) => recipes.get(recipeId) ?? null,
        resolveCookingReceipt: (receiptId) => receipts.get(receiptId) ?? null,
    });
    return {
        database,
        economy,
        service,
        receipts,
        setNow(value) {
            now = value;
        },
    };
}

test("original recipe purchase uses the locked 70/30 silver split and refunds the original purchase exactly", () => {
    const { database, economy, service } = harness();
    const purchase = service.purchaseOriginalRecipe({
        buyerResidentId: "chef-buyer",
        recipeId: "recipe-r",
        purchaseId: "chef-purchase-r",
        idempotencyKey: "chef-purchase-r:buy",
    });
    assert.deepEqual({
        priceSilver: purchase.priceSilver,
        authorShareSilver: purchase.authorShareSilver,
        systemShareSilver: purchase.systemShareSilver,
    }, {
        priceSilver: CHEF_ORIGINAL_RECIPE_SILVER_PRICE.R,
        authorShareSilver: 210,
        systemShareSilver: 90,
    });
    assert.equal(economy.getAccount("chef-buyer").availableSilver, 700);
    assert.equal(economy.getAccount("chef-author").availableSilver, 210);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM economy_trades WHERE state = 'settled'").get().count, 1);
    assert.deepEqual(service.purchaseOriginalRecipe({
        buyerResidentId: "chef-buyer",
        recipeId: "recipe-r",
        purchaseId: "chef-purchase-r",
        idempotencyKey: "chef-purchase-r:buy",
    }), purchase);
    assert.equal(economy.getAccount("chef-buyer").availableSilver, 700);

    const refunded = service.refundOriginalRecipePurchase({
        buyerResidentId: "chef-buyer",
        purchaseId: purchase.purchaseId,
        idempotencyKey: "chef-purchase-r:refund",
    });
    assert.equal(refunded.state, "refunded");
    assert.equal(refunded.refundSystemCreditReference, "chef-recipe-purchase:chef-purchase-r:refund-system-share");
    assert.equal(economy.getAccount("chef-buyer").availableSilver, 1_000);
    assert.equal(economy.getAccount("chef-author").availableSilver, 0);
    assert.equal(database.prepare("SELECT refunded_amount FROM economy_trades WHERE trade_id = ?")
        .get(purchase.authorTradeId).refunded_amount, 210);
    assert.deepEqual(service.refundOriginalRecipePurchase({
        buyerResidentId: "chef-buyer",
        purchaseId: purchase.purchaseId,
        idempotencyKey: "chef-purchase-r:refund",
    }), refunded);
});

test("a real successful production pays the original author once, including accidental discovery without a purchase", () => {
    const { economy, service, receipts } = harness();
    receipts.set("cooking-discovery", {
        receiptId: "cooking-discovery",
        cookResidentId: "chef-other",
        recipeId: "recipe-ssr",
        authorResidentId: "chef-author",
        rarity: "SSR",
        success: true,
        original: true,
    });
    const first = service.recordOriginalRecipeProduction({
        cookingReceiptId: "cooking-discovery",
        cookResidentId: "chef-other",
        idempotencyKey: "cooking-discovery:commission",
    });
    assert.equal(first.commissionGold, CHEF_ORIGINAL_RECIPE_GOLD_COMMISSION.SSR);
    assert.equal(first.settlement, "author_commission");
    assert.equal(economy.getAccount("chef-author").availableGold, 101_500);
    assert.deepEqual(service.recordOriginalRecipeProduction({
        cookingReceiptId: "cooking-discovery",
        cookResidentId: "chef-other",
        idempotencyKey: "cooking-discovery:commission",
    }), first);
    assert.equal(economy.getAccount("chef-author").availableGold, 101_500);

    receipts.set("cooking-self", {
        receiptId: "cooking-self",
        cookResidentId: "chef-author",
        recipeId: "recipe-r",
        authorResidentId: "chef-author",
        rarity: "R",
        success: true,
        original: true,
    });
    const self = service.recordOriginalRecipeProduction({
        cookingReceiptId: "cooking-self",
        cookResidentId: "chef-author",
        idempotencyKey: "cooking-self:commission",
    });
    assert.equal(self.commissionGold, 0);
    assert.equal(self.settlement, "author_self");
    assert.equal(economy.getAccount("chef-author").availableGold, 101_500);
});

test("production commission fails closed without a successful authoritative cooking receipt", () => {
    const { service, receipts } = harness();
    receipts.set("cooking-failed", {
        receiptId: "cooking-failed",
        cookResidentId: "chef-other",
        recipeId: "recipe-r",
        authorResidentId: "chef-author",
        rarity: "R",
        success: false,
        original: true,
    });
    assert.throws(() => service.recordOriginalRecipeProduction({
        cookingReceiptId: "cooking-failed",
        cookResidentId: "chef-other",
        idempotencyKey: "cooking-failed:commission",
    }), (error) => error?.code === "chef_commerce_cooking_not_successful");
});
