import { createHash, randomUUID } from "node:crypto";
import { CareerDomainError } from "./contracts.js";
import { runInTransaction } from "./persistence.js";

export const CHEF_ORIGINAL_RECIPE_SILVER_PRICE = Object.freeze({
    N: 100,
    R: 300,
    SR: 800,
    SSR: 1_500,
});

export const CHEF_ORIGINAL_RECIPE_GOLD_COMMISSION = Object.freeze({
    N: 100,
    R: 300,
    SR: 800,
    SSR: 1_500,
});

export const CHEF_RECIPE_RARITIES = Object.freeze(Object.keys(CHEF_ORIGINAL_RECIPE_SILVER_PRICE));

function fail(code, message = code) {
    throw new CareerDomainError(code, message);
}

function assertDatabase(database) {
    if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function")
        fail("chef_commerce_database_required");
}

function identifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`chef_commerce_invalid_${field}`);
    return value;
}

function positiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0)
        fail(`chef_commerce_invalid_${field}`);
    return value;
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(`chef_commerce_invalid_${field}`);
    return value;
}

function nowOf(options) {
    const value = options?.now ? options.now() : Date.now();
    return timestamp(value, "timestamp");
}

function canonical(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail("chef_commerce_invalid_payload");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map((item) => canonical(item)).join(",")}]`;
    if (value && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => {
            if (["__proto__", "prototype", "constructor"].includes(key))
                fail("chef_commerce_invalid_payload");
            return `${JSON.stringify(key)}:${canonical(value[key])}`;
        }).join(",")}}`;
    }
    fail("chef_commerce_invalid_payload");
}

function digest(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
    return canonical(value);
}

function parseJson(value, code = "chef_commerce_corrupt_json") {
    try {
        return JSON.parse(value);
    }
    catch {
        fail(code);
    }
}

function recipeRarity(value) {
    if (!CHEF_RECIPE_RARITIES.includes(value))
        fail("chef_commerce_recipe_rarity_unavailable");
    return value;
}

function normalizeRecipe(value, expectedRecipeId) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        fail("chef_commerce_original_recipe_not_found");
    const recipeId = identifier(value.recipeId ?? value.id ?? expectedRecipeId, "recipe_id");
    if (recipeId !== expectedRecipeId)
        fail("chef_commerce_original_recipe_conflict");
    const authorResidentId = identifier(
        value.authorResidentId ?? value.authorId ?? value.ownerResidentId,
        "author_resident_id",
    );
    const rarity = recipeRarity(value.rarity);
    return {
        recipeId,
        authorResidentId,
        rarity,
    };
}

function normalizeReceipt(value, expectedReceiptId, residentId) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        fail("chef_commerce_cooking_receipt_not_found");
    const receiptId = identifier(value.receiptId ?? value.cookingReceiptId ?? expectedReceiptId, "cooking_receipt_id");
    if (receiptId !== expectedReceiptId)
        fail("chef_commerce_cooking_receipt_conflict");
    const cookResidentId = identifier(
        value.cookResidentId ?? value.residentId ?? value.workerResidentId,
        "cook_resident_id",
    );
    if (cookResidentId !== residentId)
        fail("chef_commerce_cooking_resident_conflict");
    const successful = value.success === true || value.successful === true || value.status === "completed";
    if (!successful)
        fail("chef_commerce_cooking_not_successful");
    const rawRecipe = value.originalRecipe && typeof value.originalRecipe === "object"
        ? value.originalRecipe
        : value.recipe && typeof value.recipe === "object"
            ? value.recipe
            : value;
    const recipe = normalizeRecipe(
        rawRecipe,
        identifier(value.recipeId ?? rawRecipe.recipeId ?? rawRecipe.id, "recipe_id"),
    );
    if (value.original === false || value.isOriginal === false || value.originalRecipe === false)
        fail("chef_commerce_original_recipe_required");
    return {
        receiptId,
        cookResidentId,
        recipeId: recipe.recipeId,
        authorResidentId: recipe.authorResidentId,
        rarity: recipe.rarity,
    };
}

function mapPurchase(row) {
    return {
        purchaseId: row.purchase_id,
        buyerResidentId: row.buyer_resident_id,
        recipeId: row.recipe_id,
        authorResidentId: row.author_resident_id,
        rarity: row.rarity,
        priceSilver: row.price_silver,
        authorShareSilver: row.author_share_silver,
        systemShareSilver: row.system_share_silver,
        authorTradeId: row.author_trade_id,
        authorPaymentReceiptId: row.author_payment_receipt_id,
        recipeUnlockReceiptId: row.recipe_unlock_receipt_id ?? null,
        state: row.state,
        createdAt: row.created_at,
        refundedAt: row.refunded_at,
        refundSystemCreditReference: row.refund_system_credit_reference,
        recipeRevokeReceiptId: row.recipe_revoke_receipt_id ?? null,
    };
}

function ensurePurchaseEntitlement(database, row, now) {
    database.prepare(`
      INSERT INTO chef_recipe_entitlements (
        resident_id, recipe_id, source_kind, source_reference,
        purchase_id, cooking_receipt_id, created_at, revoked_at
      ) VALUES (?, ?, 'purchase', ?, ?, NULL, ?, NULL)
      ON CONFLICT (resident_id, recipe_id, source_kind, source_reference)
      DO UPDATE SET revoked_at = NULL
    `).run(row.buyer_resident_id, row.recipe_id, row.purchase_id, row.purchase_id, now);
}

function ensureDiscoveryEntitlement(database, residentId, recipeId, cookingReceiptId, now) {
    database.prepare(`
      INSERT INTO chef_recipe_entitlements (
        resident_id, recipe_id, source_kind, source_reference,
        purchase_id, cooking_receipt_id, created_at, revoked_at
      ) VALUES (?, ?, 'discovery', ?, NULL, ?, ?, NULL)
      ON CONFLICT (resident_id, recipe_id, source_kind, source_reference)
      DO UPDATE SET revoked_at = NULL
    `).run(residentId, recipeId, cookingReceiptId, cookingReceiptId, now);
}

function mapCommission(row) {
    return {
        cookingReceiptId: row.cooking_receipt_id,
        cookResidentId: row.cook_resident_id,
        recipeId: row.recipe_id,
        authorResidentId: row.author_resident_id,
        rarity: row.rarity,
        commissionGold: row.commission_gold,
        settlement: row.settlement,
        financialReceiptId: row.financial_receipt_id,
        createdAt: row.created_at,
    };
}

function ensureActionReplay(database, actionKey, operationKind, residentId, payloadHash) {
    const existing = database.prepare(`
      SELECT operation_kind, resident_id, payload_hash, result_json
      FROM chef_commerce_action_receipts
      WHERE action_key = ?
    `).get(actionKey);
    if (!existing)
        return null;
    if (existing.operation_kind !== operationKind ||
        existing.resident_id !== residentId ||
        existing.payload_hash !== payloadHash) {
        fail("chef_commerce_idempotency_conflict");
    }
    return parseJson(existing.result_json);
}

function recordAction(database, actionKey, operationKind, residentId, payloadHash, result, now) {
    database.prepare(`
      INSERT INTO chef_commerce_action_receipts (
        action_key, operation_kind, resident_id, payload_hash, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(actionKey, operationKind, residentId, payloadHash, canonicalJson(result), now);
}

function assertEconomy(economy) {
    if (!economy || typeof economy.createTrade !== "function" ||
        typeof economy.confirmTrade !== "function" ||
        typeof economy.settleTrade !== "function" ||
        typeof economy.refundTrade !== "function" ||
        typeof economy.chargeToSystem !== "function" ||
        typeof economy.creditFromSystem !== "function") {
        fail("chef_commerce_economy_authority_unavailable");
    }
}

export const CHEF_COMMERCE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS chef_commerce_action_receipts (
    action_key TEXT PRIMARY KEY,
    operation_kind TEXT NOT NULL CHECK (operation_kind IN ('purchase', 'refund', 'production_commission')),
    resident_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chef_recipe_purchases (
    purchase_id TEXT PRIMARY KEY,
    buyer_resident_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    author_resident_id TEXT NOT NULL,
    rarity TEXT NOT NULL CHECK (rarity IN ('N', 'R', 'SR', 'SSR')),
    price_silver INTEGER NOT NULL CHECK (price_silver > 0),
    author_share_silver INTEGER NOT NULL CHECK (author_share_silver > 0),
    system_share_silver INTEGER NOT NULL CHECK (system_share_silver > 0),
    author_trade_id TEXT NOT NULL UNIQUE,
    author_payment_receipt_id TEXT NOT NULL,
    recipe_unlock_receipt_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('settled', 'refunded')),
    created_at INTEGER NOT NULL,
    refunded_at INTEGER,
    refund_system_credit_reference TEXT,
    recipe_revoke_receipt_id TEXT,
    CHECK (buyer_resident_id != author_resident_id),
    CHECK (author_share_silver + system_share_silver = price_silver),
    CHECK ((state = 'settled' AND refunded_at IS NULL AND refund_system_credit_reference IS NULL)
      OR (state = 'refunded' AND refunded_at IS NOT NULL AND refund_system_credit_reference IS NOT NULL))
  );

  CREATE TABLE IF NOT EXISTS chef_recipe_entitlements (
    resident_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('purchase', 'discovery')),
    source_reference TEXT NOT NULL,
    purchase_id TEXT,
    cooking_receipt_id TEXT,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER,
    PRIMARY KEY (resident_id, recipe_id, source_kind, source_reference),
    CHECK ((source_kind = 'purchase' AND purchase_id IS NOT NULL AND cooking_receipt_id IS NULL)
      OR (source_kind = 'discovery' AND purchase_id IS NULL AND cooking_receipt_id IS NOT NULL))
  );

  CREATE INDEX IF NOT EXISTS chef_recipe_entitlements_active
    ON chef_recipe_entitlements(resident_id, recipe_id, revoked_at);

  CREATE INDEX IF NOT EXISTS chef_recipe_purchases_author
    ON chef_recipe_purchases(author_resident_id, created_at, purchase_id);

  CREATE UNIQUE INDEX IF NOT EXISTS chef_recipe_one_settled_purchase
    ON chef_recipe_purchases(buyer_resident_id, recipe_id)
    WHERE state = 'settled';

  CREATE TABLE IF NOT EXISTS chef_recipe_production_commissions (
    cooking_receipt_id TEXT PRIMARY KEY,
    cook_resident_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    author_resident_id TEXT NOT NULL,
    rarity TEXT NOT NULL CHECK (rarity IN ('N', 'R', 'SR', 'SSR')),
    commission_gold INTEGER NOT NULL CHECK (commission_gold >= 0),
    settlement TEXT NOT NULL CHECK (settlement IN ('author_commission', 'author_self')),
    financial_receipt_id TEXT,
    created_at INTEGER NOT NULL,
    CHECK ((settlement = 'author_commission' AND commission_gold > 0 AND financial_receipt_id IS NOT NULL)
      OR (settlement = 'author_self' AND commission_gold = 0 AND financial_receipt_id IS NULL))
  );

  CREATE INDEX IF NOT EXISTS chef_recipe_production_commissions_author
    ON chef_recipe_production_commissions(author_resident_id, created_at, cooking_receipt_id);
`;

export function ensureChefCommerceSchema(database) {
    assertDatabase(database);
    database.exec(CHEF_COMMERCE_SCHEMA_SQL);
    const columns = new Set(database.prepare("PRAGMA table_info(chef_recipe_purchases)").all().map((row) => row.name));
    if (!columns.has("recipe_unlock_receipt_id"))
        database.exec("ALTER TABLE chef_recipe_purchases ADD COLUMN recipe_unlock_receipt_id TEXT");
    if (!columns.has("recipe_revoke_receipt_id"))
        database.exec("ALTER TABLE chef_recipe_purchases ADD COLUMN recipe_revoke_receipt_id TEXT");
    return database;
}

export function hasChefRecipeEntitlement(database, residentId, recipeId) {
    assertDatabase(database);
    return database.prepare(`
      SELECT 1 FROM chef_recipe_entitlements
      WHERE resident_id = ? AND recipe_id = ? AND revoked_at IS NULL
      LIMIT 1
    `).get(residentId, recipeId) !== undefined;
}

export class ChefCommerceService {
    constructor(database, options = {}) {
        ensureChefCommerceSchema(database);
        this.database = database;
        this.economy = options.economy;
        this.now = options.now ?? Date.now;
        this.generateId = options.generateId ?? randomUUID;
        this.resolveOriginalRecipe = options.resolveOriginalRecipe;
        this.resolveCookingReceipt = options.resolveCookingReceipt;
    }

    purchaseOriginalRecipe(input) {
        assertEconomy(this.economy);
        const buyerResidentId = identifier(input?.buyerResidentId, "buyer_resident_id");
        const recipeId = identifier(input?.recipeId, "recipe_id");
        const idempotencyKey = identifier(input?.idempotencyKey, "idempotency_key");
        const payload = {
            buyerResidentId,
            recipeId,
            ...(input?.purchaseId === undefined ? {} : {
                purchaseId: identifier(input.purchaseId, "purchase_id"),
            }),
        };
        const payloadHash = digest(canonicalJson(payload));
        const now = nowOf(this);
        return runInTransaction(this.database, () => {
            const replay = ensureActionReplay(this.database, idempotencyKey, "purchase", buyerResidentId, payloadHash);
            if (replay)
                return replay;
            if (typeof this.resolveOriginalRecipe !== "function")
                fail("chef_commerce_original_recipe_authority_unavailable");
            const recipe = normalizeRecipe(this.resolveOriginalRecipe(recipeId), recipeId);
            if (recipe.authorResidentId === buyerResidentId)
                fail("chef_commerce_author_purchase_forbidden");
            const existing = this.database.prepare(`
              SELECT * FROM chef_recipe_purchases
              WHERE buyer_resident_id = ? AND recipe_id = ? AND state = 'settled'
            `).get(buyerResidentId, recipeId);
            if (existing) {
                if (existing.author_resident_id !== recipe.authorResidentId || existing.rarity !== recipe.rarity)
                    fail("chef_commerce_original_recipe_conflict");
                ensurePurchaseEntitlement(this.database, existing, now);
                const result = mapPurchase(existing);
                recordAction(this.database, idempotencyKey, "purchase", buyerResidentId, payloadHash, result, now);
                return result;
            }

            const priceSilver = CHEF_ORIGINAL_RECIPE_SILVER_PRICE[recipe.rarity];
            const authorShareSilver = Math.floor(priceSilver * 70 / 100);
            const systemShareSilver = priceSilver - authorShareSilver;
            const purchaseId = identifier(input?.purchaseId ?? this.generateId(), "purchase_id");
            const purchaseRef = `chef-recipe-purchase:${purchaseId}`;
            const trade = this.economy.createTrade({
                payerResidentId: buyerResidentId,
                payeeResidentId: recipe.authorResidentId,
                currency: "silver",
                amount: authorShareSilver,
                businessType: "chef_original_recipe_purchase_author_share",
                businessRef: `${purchaseRef}:author-share`,
                idempotencyKey: `${purchaseRef}:trade-create`,
            });
            this.economy.confirmTrade({
                tradeId: trade.trade_id,
                actorResidentId: buyerResidentId,
                idempotencyKey: `${purchaseRef}:trade-confirm-buyer`,
            });
            this.economy.confirmTrade({
                tradeId: trade.trade_id,
                actorResidentId: recipe.authorResidentId,
                idempotencyKey: `${purchaseRef}:trade-confirm-author`,
            });
            const settled = this.economy.settleTrade({
                tradeId: trade.trade_id,
                idempotencyKey: `${purchaseRef}:trade-settle`,
            });
            this.economy.chargeToSystem({
                residentId: buyerResidentId,
                currency: "silver",
                amount: systemShareSilver,
                actor: "agent",
                businessType: "chef_original_recipe_purchase_system_share",
                businessRef: `${purchaseRef}:system-share`,
                idempotencyKey: `${purchaseRef}:system-charge`,
            });
            // Recipe access is granted by the SQLite entitlement row below.
            // Farm state is a separate store and is never treated as part of
            // this transaction's rollback boundary.
            const recipeUnlockReceiptId = null;
            const result = {
                purchaseId,
                buyerResidentId,
                recipeId,
                authorResidentId: recipe.authorResidentId,
                rarity: recipe.rarity,
                priceSilver,
                authorShareSilver,
                systemShareSilver,
                authorTradeId: settled.trade_id,
                authorPaymentReceiptId: settled.financialReceipt?.receiptId ?? null,
                recipeUnlockReceiptId,
                state: "settled",
                createdAt: now,
                refundedAt: null,
                refundSystemCreditReference: null,
            };
            if (!result.authorPaymentReceiptId)
                fail("chef_commerce_payment_receipt_unavailable");
            this.database.prepare(`
              INSERT INTO chef_recipe_purchases (
                purchase_id, buyer_resident_id, recipe_id, author_resident_id, rarity,
                price_silver, author_share_silver, system_share_silver, author_trade_id,
                author_payment_receipt_id, recipe_unlock_receipt_id, state, created_at, refunded_at,
                refund_system_credit_reference, recipe_revoke_receipt_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'settled', ?, NULL, NULL, NULL)
            `).run(purchaseId, buyerResidentId, recipeId, recipe.authorResidentId, recipe.rarity,
                priceSilver, authorShareSilver, systemShareSilver, settled.trade_id,
                result.authorPaymentReceiptId, recipeUnlockReceiptId, now);
            ensurePurchaseEntitlement(this.database, {
                buyer_resident_id: buyerResidentId,
                recipe_id: recipeId,
                purchase_id: purchaseId,
            }, now);
            recordAction(this.database, idempotencyKey, "purchase", buyerResidentId, payloadHash, result, now);
            return result;
        });
    }

    refundOriginalRecipePurchase(input) {
        assertEconomy(this.economy);
        const purchaseId = identifier(input?.purchaseId, "purchase_id");
        const buyerResidentId = identifier(input?.buyerResidentId, "buyer_resident_id");
        const idempotencyKey = identifier(input?.idempotencyKey, "idempotency_key");
        const payload = { purchaseId, buyerResidentId };
        const payloadHash = digest(canonicalJson(payload));
        const now = nowOf(this);
        return runInTransaction(this.database, () => {
            const replay = ensureActionReplay(this.database, idempotencyKey, "refund", buyerResidentId, payloadHash);
            if (replay)
                return replay;
            const row = this.database.prepare(`
              SELECT * FROM chef_recipe_purchases WHERE purchase_id = ?
            `).get(purchaseId);
            if (!row)
                fail("chef_commerce_purchase_not_found");
            if (row.buyer_resident_id !== buyerResidentId)
                fail("chef_commerce_purchase_buyer_mismatch");
            if (row.state === "refunded") {
                const result = mapPurchase(row);
                recordAction(this.database, idempotencyKey, "refund", buyerResidentId, payloadHash, result, now);
                return result;
            }
            this.economy.refundTrade({
                tradeId: row.author_trade_id,
                amount: row.author_share_silver,
                idempotencyKey: `chef-recipe-purchase:${purchaseId}:refund-author-share`,
            });
            const refundSystemCreditReference = `chef-recipe-purchase:${purchaseId}:refund-system-share`;
            this.economy.creditFromSystem({
                residentId: buyerResidentId,
                currency: "silver",
                amount: row.system_share_silver,
                businessType: "chef_original_recipe_purchase_refund_system_share",
                businessRef: refundSystemCreditReference,
                idempotencyKey: `chef-recipe-purchase:${purchaseId}:refund-system-credit`,
            });
            // Refund revokes only the purchase entitlement source. A discovery
            // source remains valid if the cook legitimately discovered it.
            const recipeRevokeReceiptId = null;
            const entitlement = this.database.prepare(`
              SELECT resident_id, recipe_id, source_kind, source_reference
              FROM chef_recipe_entitlements
              WHERE resident_id = ? AND recipe_id = ? AND source_kind = 'purchase'
                AND source_reference = ? AND revoked_at IS NULL
            `).get(buyerResidentId, row.recipe_id, purchaseId);
            if (!entitlement) {
                ensurePurchaseEntitlement(this.database, row, now);
            }
            this.database.prepare(`
              UPDATE chef_recipe_purchases
              SET state = 'refunded', refunded_at = ?, refund_system_credit_reference = ?,
                  recipe_revoke_receipt_id = ?
              WHERE purchase_id = ? AND state = 'settled'
            `).run(now, refundSystemCreditReference, recipeRevokeReceiptId, purchaseId);
            this.database.prepare(`
              UPDATE chef_recipe_entitlements
              SET revoked_at = ?
              WHERE resident_id = ? AND recipe_id = ? AND source_kind = 'purchase'
                AND source_reference = ? AND revoked_at IS NULL
            `).run(now, buyerResidentId, row.recipe_id, purchaseId);
            const updated = this.database.prepare(`
              SELECT * FROM chef_recipe_purchases WHERE purchase_id = ?
            `).get(purchaseId);
            if (!updated || updated.state !== "refunded" || !updated.refund_system_credit_reference)
                fail("chef_commerce_refund_authority_unavailable");
            const result = mapPurchase(updated);
            recordAction(this.database, idempotencyKey, "refund", buyerResidentId, payloadHash, result, now);
            return result;
        });
    }

    recordOriginalRecipeProduction(input) {
        assertEconomy(this.economy);
        const cookingReceiptId = identifier(input?.cookingReceiptId ?? input?.receiptId, "cooking_receipt_id");
        const cookResidentId = identifier(input?.cookResidentId ?? input?.residentId, "cook_resident_id");
        const idempotencyKey = identifier(input?.idempotencyKey, "idempotency_key");
        const payload = { cookingReceiptId, cookResidentId };
        const payloadHash = digest(canonicalJson(payload));
        const now = nowOf(this);
        return runInTransaction(this.database, () => {
            const replay = ensureActionReplay(this.database, idempotencyKey, "production_commission", cookResidentId, payloadHash);
            if (replay)
                return replay;
            const existing = this.database.prepare(`
              SELECT * FROM chef_recipe_production_commissions
              WHERE cooking_receipt_id = ?
            `).get(cookingReceiptId);
            if (existing) {
                if (existing.cook_resident_id !== cookResidentId)
                    fail("chef_commerce_cooking_resident_conflict");
                const result = mapCommission(existing);
                recordAction(this.database, idempotencyKey, "production_commission", cookResidentId, payloadHash, result, now);
                return result;
            }
            if (typeof this.resolveCookingReceipt !== "function")
                fail("chef_commerce_cooking_receipt_authority_unavailable");
            const receipt = normalizeReceipt(
                this.resolveCookingReceipt(cookingReceiptId),
                cookingReceiptId,
                cookResidentId,
            );
            const purchased = hasChefRecipeEntitlement(this.database, cookResidentId, receipt.recipeId);
            if (!purchased)
                ensureDiscoveryEntitlement(this.database, cookResidentId, receipt.recipeId, cookingReceiptId, now);
            const commissionRateGold = CHEF_ORIGINAL_RECIPE_GOLD_COMMISSION[receipt.rarity];
            let financialReceiptId = null;
            let settlement = "author_self";
            if (receipt.authorResidentId !== cookResidentId) {
                const credited = this.economy.creditFromSystem({
                    residentId: receipt.authorResidentId,
                    currency: "gold",
                    amount: commissionRateGold,
                    businessType: "chef_original_recipe_production_commission",
                    businessRef: `chef-recipe-production:${cookingReceiptId}:author-commission`,
                    idempotencyKey: `chef-recipe-production:${cookingReceiptId}:author-commission`,
                });
                financialReceiptId = credited.financialReceipt?.receiptId ?? null;
                if (!financialReceiptId)
                    fail("chef_commerce_commission_receipt_unavailable");
                settlement = "author_commission";
            }
            const result = {
                cookingReceiptId,
                cookResidentId,
                recipeId: receipt.recipeId,
                authorResidentId: receipt.authorResidentId,
                rarity: receipt.rarity,
                commissionGold: settlement === "author_self" ? 0 : commissionRateGold,
                settlement,
                financialReceiptId,
                createdAt: now,
            };
            this.database.prepare(`
              INSERT INTO chef_recipe_production_commissions (
                cooking_receipt_id, cook_resident_id, recipe_id, author_resident_id,
                rarity, commission_gold, settlement, financial_receipt_id, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(cookingReceiptId, cookResidentId, receipt.recipeId, receipt.authorResidentId,
                receipt.rarity, settlement === "author_self" ? 0 : commissionRateGold,
                settlement, financialReceiptId, now);
            recordAction(this.database, idempotencyKey, "production_commission", cookResidentId, payloadHash, result, now);
            return result;
        });
    }

    getPurchase(purchaseId) {
        const id = identifier(purchaseId, "purchase_id");
        const row = this.database.prepare("SELECT * FROM chef_recipe_purchases WHERE purchase_id = ?").get(id);
        return row ? mapPurchase(row) : null;
    }

    getProductionCommission(cookingReceiptId) {
        const id = identifier(cookingReceiptId, "cooking_receipt_id");
        const row = this.database.prepare("SELECT * FROM chef_recipe_production_commissions WHERE cooking_receipt_id = ?").get(id);
        return row ? mapCommission(row) : null;
    }
}

export function createChefCommerceService(database, options = {}) {
    return new ChefCommerceService(database, options);
}

export function purchaseChefOriginalRecipe(database, input, options = {}) {
    return new ChefCommerceService(database, options).purchaseOriginalRecipe(input);
}

export function refundChefOriginalRecipePurchase(database, input, options = {}) {
    return new ChefCommerceService(database, options).refundOriginalRecipePurchase(input);
}

export function recordChefOriginalRecipeProduction(database, input, options = {}) {
    return new ChefCommerceService(database, options).recordOriginalRecipeProduction(input);
}
