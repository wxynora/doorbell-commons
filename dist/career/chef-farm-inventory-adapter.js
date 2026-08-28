import { createHash } from "node:crypto";
import { cookingIngredientById, cookingProductById, fishingFishById } from "../content.js";
import { ensureFishing } from "../fishing.js";
import { replaceFarm as defaultReplaceFarm, allFarms as defaultListFarms } from "../store.js";
import { CareerDomainError } from "./contracts.js";
import { ensureKitchen } from "../domain/ranch/state.js";
import {
    kitchenMethodDefinition,
    kitchenToolIsOwned,
} from "../domain/kitchen/chef.js";

export const CHEF_FARM_INVENTORY_RECEIPTS_FIELD = "chefRecipeInventoryActionReceipts";
export const CHEF_FARM_INVENTORY_RECEIPT_VERSION = 1;

const CONSUME_RECEIPT_KIND = "chef_recipe_research_consume";
const REFUND_RECEIPT_KIND = "chef_recipe_research_refund";
const FORBIDDEN_CLIENT_IDENTITY_FIELDS = new Set([
    "farmId",
    "farm_id",
    "farmDoorplate",
    "farm_doorplate",
    "doorplate",
    "humanKey",
    "human_key",
    "farmHumanKey",
    "farm_human_key",
]);

function fail(code, message = code) {
    throw new CareerDomainError(code, message);
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredId(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`chef_inventory_invalid_${field}`, `Invalid chef inventory ${field}`);
    return value;
}

function safeQuantity(value, field = "quantity") {
    if (!Number.isSafeInteger(value) || value < 1)
        fail(`chef_inventory_invalid_${field}`, `Invalid chef inventory ${field}`);
    return value;
}

function safeTimestamp(value) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail("chef_inventory_invalid_timestamp", "Invalid chef inventory timestamp");
    return value;
}

function resolveTimestamp(clock) {
    const value = typeof clock === "function" ? clock() : clock ?? Date.now();
    return safeTimestamp(value);
}

function canonical(value) {
    if (value === null)
        return "null";
    if (typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail("chef_inventory_invalid_receipt", "The chef inventory receipt contains a non-finite number");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (isRecord(value)) {
        return `{${Object.keys(value).sort().map((key) => {
            if (["__proto__", "prototype", "constructor"].includes(key))
                fail("chef_inventory_invalid_receipt", "The chef inventory receipt contains a forbidden key");
            return `${JSON.stringify(key)}:${canonical(value[key])}`;
        }).join(",")}}`;
    }
    fail("chef_inventory_invalid_receipt", "The chef inventory receipt is not JSON-compatible");
}

function digest(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertNoClientIdentityOverride(input) {
    if (!isRecord(input))
        fail("chef_inventory_invalid_request", "A chef inventory request is required");
    for (const field of FORBIDDEN_CLIENT_IDENTITY_FIELDS) {
        if (Object.hasOwn(input, field))
            fail("chef_inventory_client_identity_forbidden", "Chef inventory is bound to the server resident, not browser farm credentials");
    }
}

function normalizeIngredients(raw) {
    if (!Array.isArray(raw) || raw.length === 0)
        fail("chef_inventory_invalid_ingredients", "Chef inventory ingredients are required");
    const counts = new Map();
    for (const entry of raw) {
        if (!isRecord(entry))
            fail("chef_inventory_invalid_ingredients", "Chef inventory ingredients are invalid");
        const id = requiredId(entry.id, "ingredient_id");
        const quantity = safeQuantity(entry.quantity, "ingredient_quantity");
        const next = (counts.get(id) ?? 0) + quantity;
        if (!Number.isSafeInteger(next))
            fail("chef_inventory_invalid_ingredient_quantity", "Chef inventory ingredient quantity is too large");
        counts.set(id, next);
    }
    return [...counts.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([id, quantity]) => ({ id, quantity }));
}

function normalizeConsumeInput(input) {
    assertNoClientIdentityOverride(input);
    const operationId = requiredId(input.operationId, "operation_id");
    const idempotencyKey = requiredId(input.idempotencyKey, "idempotency_key");
    const residentId = requiredId(input.residentId, "resident_id");
    const methodId = requiredId(input.methodId, "method_id");
    if (!kitchenMethodDefinition(methodId))
        fail("chef_inventory_method_unavailable", "The selected cooking method is unavailable");
    const ingredients = normalizeIngredients(input.ingredients);
    return {
        operationId,
        idempotencyKey,
        residentId,
        methodId,
        ingredients,
        requestFingerprint: digest(canonical({
            operationId,
            idempotencyKey,
            residentId,
            methodId,
            ingredients,
        })),
    };
}

function normalizeRefundInput(input) {
    assertNoClientIdentityOverride(input);
    const operationId = requiredId(input.operationId, "operation_id");
    const idempotencyKey = requiredId(input.idempotencyKey, "idempotency_key");
    const residentId = requiredId(input.residentId, "resident_id");
    const methodId = requiredId(input.methodId, "method_id");
    const ingredientId = requiredId(input.ingredientId, "ingredient_id");
    const quantity = safeQuantity(input.quantity, "refund_quantity");
    if (quantity !== 1)
        fail("chef_inventory_refund_quantity_invalid", "Chef recipe research can approve only one returned ingredient");
    if (idempotencyKey !== `${operationId}:refund`)
        fail("chef_inventory_refund_idempotency_invalid", "The approved refund idempotency key is invalid");
    if (!kitchenMethodDefinition(methodId))
        fail("chef_inventory_method_unavailable", "The selected cooking method is unavailable");
    return { operationId, idempotencyKey, residentId, methodId, ingredientId, quantity };
}

function receiptsOnFarm(farm) {
    const value = farm?.[CHEF_FARM_INVENTORY_RECEIPTS_FIELD];
    if (value === undefined)
        return {};
    if (!isRecord(value))
        fail("chef_inventory_receipt_unavailable", "The chef inventory receipt ledger is invalid");
    return value;
}

function receiptEntries(receipts) {
    return Object.values(receipts).filter((entry) => isRecord(entry));
}

function receiptKey(kind, value) {
    return `${kind}:${value}`;
}

function receiptMatches(receipt, input, farmId) {
    return isRecord(receipt) &&
        receipt.version === CHEF_FARM_INVENTORY_RECEIPT_VERSION &&
        receipt.kind === CONSUME_RECEIPT_KIND &&
        receipt.operationId === input.operationId &&
        receipt.idempotencyKey === input.idempotencyKey &&
        receipt.residentId === input.residentId &&
        receipt.farmId === farmId &&
        receipt.methodId === input.methodId &&
        receipt.requestFingerprint === input.requestFingerprint;
}

function findConsumeReceipt(receipts, input, farmId) {
    const keyReceipt = receipts[receiptKey("consume", input.idempotencyKey)];
    const operationReceipt = receiptEntries(receipts)
        .find((entry) => entry.kind === CONSUME_RECEIPT_KIND && entry.operationId === input.operationId);
    const matching = keyReceipt ?? operationReceipt;
    if (!matching)
        return null;
    if (!receiptMatches(matching, input, farmId))
        fail("chef_inventory_idempotency_conflict", "The chef inventory operation is already bound to different parameters");
    if (keyReceipt && operationReceipt && keyReceipt !== operationReceipt &&
        !receiptMatches(keyReceipt, input, farmId))
        fail("chef_inventory_idempotency_conflict", "The chef inventory idempotency key is already bound to another operation");
    return matching;
}

function findReceiptByOperation(receipts, operationId, kind) {
    return receiptEntries(receipts)
        .find((entry) => entry.kind === kind && entry.operationId === operationId) ?? null;
}

function ensureFarmReceiptTarget(receipt, input, farm) {
    if (!receipt || receipt.residentId !== input.residentId || receipt.farmId !== farm.id)
        fail("chef_inventory_receipt_target_conflict", "The chef inventory receipt is bound to another server farm");
}

function cloneFarm(farm) {
    try {
        return structuredClone(farm);
    }
    catch {
        fail("chef_inventory_unavailable", "The farm inventory could not be staged");
    }
}

function setReceipt(working, key, receipt) {
    const existing = receiptsOnFarm(working);
    working[CHEF_FARM_INVENTORY_RECEIPTS_FIELD] = {
        ...existing,
        [key]: structuredClone(receipt),
    };
}

function inventoryCount(value) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail("chef_inventory_state_invalid", "The kitchen ingredient inventory is invalid");
    return value;
}

function validInstanceId(value) {
    return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function productInstances(kitchen, productId, quantity) {
    if (!Array.isArray(kitchen.products))
        fail("chef_inventory_state_invalid", "The kitchen product inventory is invalid");
    const matches = kitchen.products.filter((item) =>
        isRecord(item) && item.itemId === productId && validInstanceId(item.id));
    const selected = matches.slice(0, quantity);
    if (new Set(matches.map((item) => item.id)).size !== matches.length)
        fail("chef_inventory_state_invalid", "The kitchen product inventory contains duplicate instance ids");
    return selected;
}

function fishInstances(fishing, quantity) {
    if (!Array.isArray(fishing.catchInventory))
        fail("chef_inventory_state_invalid", "The fishing catch inventory is invalid");
    const matches = fishing.catchInventory.filter((item) =>
        isRecord(item) && validInstanceId(item.id) && fishingFishById.has(item.fishId));
    if (new Set(matches.map((item) => item.id)).size !== matches.length)
        fail("chef_inventory_state_invalid", "The fishing catch inventory contains duplicate instance ids");
    return matches.slice(0, quantity);
}

function planConsumption(working, ingredients, methodId) {
    const method = kitchenMethodDefinition(methodId);
    if (!method)
        fail("chef_inventory_method_unavailable", "The selected cooking method is unavailable");
    const kitchen = ensureKitchen(working);
    if (method.toolId && !kitchenToolIsOwned(kitchen, method.toolId))
        return { ok: false, code: "chef_recipe_method_tool_required" };
    const fishing = ensureFishing(working);
    const ingredientDeltas = [];
    const productDeltas = [];
    const fishDeltas = [];
    for (const entry of ingredients) {
        if (cookingIngredientById.has(entry.id)) {
            const available = inventoryCount(kitchen.ingredients[entry.id] ?? 0);
            if (available < entry.quantity)
                return { ok: false, code: "inventory_insufficient" };
            ingredientDeltas.push({ id: entry.id, quantity: entry.quantity });
            continue;
        }
        const product = cookingProductById.get(entry.id);
        if (product) {
            if (product.cookable !== true)
                return { ok: false, code: "inventory_item_not_cookable" };
            const instances = productInstances(kitchen, entry.id, entry.quantity);
            if (instances.length < entry.quantity)
                return { ok: false, code: "inventory_insufficient" };
            productDeltas.push({
                id: entry.id,
                quantity: entry.quantity,
                instanceIds: instances.map((item) => item.id),
            });
            continue;
        }
        if (entry.id === "fish:any") {
            const instances = fishInstances(fishing, entry.quantity);
            if (instances.length < entry.quantity)
                return { ok: false, code: "inventory_insufficient" };
            fishDeltas.push({
                id: entry.id,
                quantity: entry.quantity,
                instanceIds: instances.map((item) => item.id),
            });
            continue;
        }
        fail("chef_inventory_item_unavailable", "The requested cooking item is not in the approved inventory catalog");
    }
    return { ok: true, kitchen, fishing, ingredientDeltas, productDeltas, fishDeltas };
}

function applyConsumption(plan) {
    for (const entry of plan.ingredientDeltas) {
        const next = inventoryCount(plan.kitchen.ingredients[entry.id] ?? 0) - entry.quantity;
        if (next === 0)
            delete plan.kitchen.ingredients[entry.id];
        else
            plan.kitchen.ingredients[entry.id] = next;
    }
    const productIds = new Set(plan.productDeltas.flatMap((entry) => entry.instanceIds));
    plan.kitchen.products = plan.kitchen.products.filter((item) => !productIds.has(item?.id));
    const fishIds = new Set(plan.fishDeltas.flatMap((entry) => entry.instanceIds));
    plan.fishing.catchInventory = plan.fishing.catchInventory.filter((item) => !fishIds.has(item?.id));
}

function receiptForConsumption(input, farm, plan, appliedAt) {
    return {
        version: CHEF_FARM_INVENTORY_RECEIPT_VERSION,
        kind: CONSUME_RECEIPT_KIND,
        receiptId: `chef-recipe-consume:${input.operationId}`,
        operationId: input.operationId,
        idempotencyKey: input.idempotencyKey,
        residentId: input.residentId,
        farmId: farm.id,
        methodId: input.methodId,
        requestFingerprint: input.requestFingerprint,
        ingredients: input.ingredients,
        consumed: {
            ingredients: plan.ingredientDeltas,
            products: plan.productDeltas,
            fish: plan.fishDeltas,
        },
        appliedAt,
    };
}

function receiptForRefund(input, farm, consumeReceipt, appliedAt) {
    return {
        version: CHEF_FARM_INVENTORY_RECEIPT_VERSION,
        kind: REFUND_RECEIPT_KIND,
        receiptId: `chef-recipe-refund:${input.operationId}`,
        operationId: input.operationId,
        idempotencyKey: input.idempotencyKey,
        residentId: input.residentId,
        farmId: farm.id,
        methodId: input.methodId,
        ingredientId: input.ingredientId,
        quantity: input.quantity,
        consumeReceiptId: consumeReceipt.receiptId,
        appliedAt,
    };
}

function resolveResidentBinding(database, residentId) {
    if (!database || typeof database.prepare !== "function")
        fail("chef_inventory_database_required", "The chef inventory adapter requires the career database");
    let row;
    try {
        row = database.prepare(`
          SELECT binding_reference
          FROM residents
          WHERE resident_id = ?
        `).get(residentId);
    }
    catch {
        fail("chef_inventory_binding_unavailable", "The resident-to-farm binding could not be read");
    }
    const bindingReference = row?.binding_reference;
    if (typeof bindingReference !== "string" || bindingReference.length === 0)
        fail("chef_inventory_binding_required", "The resident is not bound to a farm");
    return bindingReference;
}

export function resolveChefFarmForResident(database, residentId, listFarms = defaultListFarms) {
    const id = requiredId(residentId, "resident_id");
    const bindingReference = resolveResidentBinding(database, id);
    let farms;
    try {
        farms = listFarms();
    }
    catch {
        fail("chef_inventory_farm_unavailable", "The farm inventory could not be listed");
    }
    if (!Array.isArray(farms))
        fail("chef_inventory_farm_unavailable", "The farm inventory list is invalid");
    const matches = farms.filter((farm) => farm?.doorbellMcpMigration?.migrationId === bindingReference);
    if (matches.length === 0)
        fail("chef_inventory_binding_required", "The resident has no uniquely bound farm");
    if (matches.length !== 1)
        fail("chef_inventory_binding_conflict", "The resident is bound to more than one farm");
    return matches[0];
}

function assertBoundResident(inputResidentId, configuredResidentId) {
    if (configuredResidentId !== undefined && inputResidentId !== configuredResidentId)
        fail("chef_inventory_resident_conflict", "The inventory adapter is bound to another server resident");
}

/**
 * Server-side farm inventory bridge for ChefRecipeService.
 *
 * The factory is intentionally resident-scoped.  The server supplies the
 * authoritative resident id; every method resolves that resident's migration
 * binding to exactly one farm.  No browser farm doorplate or human key is an
 * accepted identity input.
 */
export function createChefFarmInventoryAdapter(options = {}) {
    if (!isRecord(options))
        fail("chef_inventory_options_required", "Chef farm inventory adapter options are required");
    const database = options.database;
    const configuredResidentId = requiredId(options.residentId, "resident_id");
    const listFarms = options.listFarms ?? defaultListFarms;
    const replaceFarm = options.replaceFarm ?? defaultReplaceFarm;
    if (typeof listFarms !== "function" || typeof replaceFarm !== "function")
        fail("chef_inventory_adapter_unavailable", "The farm inventory adapter callbacks are invalid");
    const clock = options.now ?? Date.now;

    const resolveFarm = (residentId) => {
        const id = requiredId(residentId, "resident_id");
        assertBoundResident(id, configuredResidentId);
        return resolveChefFarmForResident(database, id, listFarms);
    };

    const saveWorkingFarm = (farm, working) => {
        try {
            replaceFarm(farm.id, working);
        }
        catch {
            fail("chef_inventory_unavailable", "The farm inventory action could not be durably saved");
        }
    };

    const isMethodAvailable = (methodId) => {
        const method = kitchenMethodDefinition(requiredId(methodId, "method_id"));
        if (!method)
            return false;
        if (!method.toolId) return true;
        const farm = resolveFarm(configuredResidentId);
        const kitchen = farm?.ranch?.kitchen;
        return kitchenToolIsOwned(kitchen, method.toolId);
    };

    const hasTool = (toolId) => {
        const id = requiredId(toolId, "tool_id");
        const farm = resolveFarm(configuredResidentId);
        return kitchenToolIsOwned(farm?.ranch?.kitchen, id);
    };

    const consumeIngredients = (input) => {
        const normalized = normalizeConsumeInput(input);
        assertBoundResident(normalized.residentId, configuredResidentId);
        const farm = resolveFarm(normalized.residentId);
        const receipts = receiptsOnFarm(farm);
        const existing = findConsumeReceipt(receipts, normalized, farm.id);
        if (existing)
            return { ok: true, alreadyConsumed: true, receipt: structuredClone(existing) };

        const working = cloneFarm(farm);
        const plan = planConsumption(working, normalized.ingredients, normalized.methodId);
        if (!plan.ok)
            return { ok: false, code: plan.code };
        applyConsumption(plan);
        const receipt = receiptForConsumption(normalized, farm, plan, resolveTimestamp(clock));
        setReceipt(working, receiptKey("consume", normalized.idempotencyKey), receipt);
        saveWorkingFarm(farm, working);
        return { ok: true, receipt: structuredClone(receipt) };
    };

    const refundIngredient = (input) => {
        const normalized = normalizeRefundInput(input);
        assertBoundResident(normalized.residentId, configuredResidentId);
        const farm = resolveFarm(normalized.residentId);
        const receipts = receiptsOnFarm(farm);
        const existing = findReceiptByOperation(receipts, normalized.operationId, REFUND_RECEIPT_KIND);
        if (existing) {
            if (existing.residentId !== normalized.residentId ||
                existing.farmId !== farm.id ||
                existing.idempotencyKey !== normalized.idempotencyKey ||
                existing.ingredientId !== normalized.ingredientId ||
                existing.quantity !== normalized.quantity ||
                existing.methodId !== normalized.methodId)
                fail("chef_inventory_idempotency_conflict", "The chef inventory refund is already bound to different parameters");
            return { ok: true, alreadyApplied: true, receipt: structuredClone(existing) };
        }

        const consumeReceipt = findReceiptByOperation(receipts, normalized.operationId, CONSUME_RECEIPT_KIND);
        if (!consumeReceipt)
            return { ok: false, code: "chef_inventory_consume_receipt_required" };
        ensureFarmReceiptTarget(consumeReceipt, normalized, farm);
        if (consumeReceipt.methodId !== normalized.methodId)
            fail("chef_inventory_receipt_target_conflict", "The approved refund method does not match consumption");

        // Refund eligibility is authoritative here, not a caller hint: only a
        // catalogued stacked kitchen ingredient can be returned.  Products,
        // fish catches, and unknown ids never become ordinary refund stock.
        const consumedIngredient = consumeReceipt.consumed?.ingredients?.find((entry) =>
            entry?.id === normalized.ingredientId && Number.isSafeInteger(entry.quantity) && entry.quantity >= 1);
        if (!cookingIngredientById.has(normalized.ingredientId) || !consumedIngredient)
            return { ok: false, code: "refund_not_eligible" };

        const working = cloneFarm(farm);
        const kitchen = ensureKitchen(working);
        const current = inventoryCount(kitchen.ingredients[normalized.ingredientId] ?? 0);
        if (!Number.isSafeInteger(current + normalized.quantity))
            fail("chef_inventory_state_invalid", "The kitchen ingredient inventory is full");
        kitchen.ingredients[normalized.ingredientId] = current + normalized.quantity;
        const receipt = receiptForRefund(normalized, farm, consumeReceipt, resolveTimestamp(clock));
        setReceipt(working, receiptKey("refund", normalized.operationId), receipt);
        saveWorkingFarm(farm, working);
        return { ok: true, receipt: structuredClone(receipt) };
    };

    return Object.freeze({
        consumeIngredients,
        refundIngredient,
        isMethodAvailable,
        hasMethod: isMethodAvailable,
        hasTool,
        resolveFarm,
        residentId: configuredResidentId,
    });
}

export const createChefFarmInventory = createChefFarmInventoryAdapter;
