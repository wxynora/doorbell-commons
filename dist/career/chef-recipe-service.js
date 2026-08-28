import { createHash, randomUUID } from "node:crypto";
import { CareerDomainError } from "./contracts.js";
import { runInTransaction } from "./persistence.js";
import { cookingProducts, cookingRecipes } from "../content.js";
import {
    chefOriginalRecipeKey,
    evaluateChefOriginalQuality,
    normalizeChefIngredients,
} from "../domain/kitchen/chef-quality.js";
import { kitchenMethodDefinition } from "../domain/kitchen/chef.js";

export const CHEF_RECIPE_SCHEMA_VERSION = 1;

export const CHEF_RECIPE_LEVEL_RULES = Object.freeze({
    1: Object.freeze({ maxRecipes: 2, successChance: 0.20, refundChance: 0.05 }),
    2: Object.freeze({ maxRecipes: 5, successChance: 0.30, refundChance: 0.10 }),
    3: Object.freeze({ maxRecipes: 10, successChance: 0.45, refundChance: 0.15 }),
    4: Object.freeze({ maxRecipes: 20, successChance: 0.60, refundChance: 0.20 }),
});

export const CHEF_RECIPE_TABLES = Object.freeze({
    recipes: "career_chef_original_recipes",
    operations: "career_chef_recipe_research_operations",
});

const COOKING_PRODUCT_IDS = new Set(cookingProducts.map((item) => item?.id).filter((id) => typeof id === "string"));

const TERMINAL_OPERATION_STATUSES = new Set(["succeeded", "failed", "rejected"]);
const REFUND_STATUSES = new Set(["pending", "applied", "none"]);
const RESEARCH_FAILURE = "research_failed";
const ODD_FAILURE = "odd_recipe";
const INVENTORY_REJECTION_CODES = new Set([
    "inventory_insufficient",
    "insufficient_inventory",
    "not_enough_inventory",
    "ingredient_insufficient",
]);
const REFUND_NOOP_CODES = new Set([
    "refund_not_eligible",
    "not_refundable",
    "inventory_insufficient",
    "insufficient_inventory",
]);

function fail(code, message = code) {
    throw new CareerDomainError(code, message);
}

function assertDatabase(database) {
    if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function")
        fail("chef_recipe_database_required", "A database is required for chef recipe research");
}

function requiredIdentifier(value, field) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
        fail(`chef_recipe_invalid_${field}`, `Invalid chef recipe ${field}`);
    return value;
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        fail(`chef_recipe_invalid_${field}`, `Invalid chef recipe ${field}`);
    return value;
}

function currentTimestamp(value, field = "timestamp") {
    const resolved = typeof value === "function" ? value() : value ?? Date.now();
    return timestamp(resolved, field);
}

function integer(value, field) {
    if (!Number.isSafeInteger(value) || value < 1)
        fail(`chef_recipe_invalid_${field}`, `Invalid chef recipe ${field}`);
    return value;
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
    if (value === null)
        return "null";
    if (typeof value === "string" || typeof value === "boolean")
        return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail("chef_recipe_invalid_payload", "Recipe research payload contains a non-finite number");
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map((child) => canonical(child)).join(",")}]`;
    if (isRecord(value)) {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => {
            if (["__proto__", "prototype", "constructor"].includes(key))
                fail("chef_recipe_invalid_payload", "Recipe research payload contains a forbidden key");
            return `${JSON.stringify(key)}:${canonical(value[key])}`;
        }).join(",")}}`;
    }
    fail("chef_recipe_invalid_payload", "Recipe research payload is not JSON-compatible");
}

function digest(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJson(value, code = "chef_recipe_corrupt_json") {
    try {
        return JSON.parse(value);
    }
    catch {
        fail(code, "The stored chef recipe data is invalid");
    }
}

function jsonOrNull(value) {
    return value === null || value === undefined ? null : canonical(value);
}

function sourceRefundEligible(source, id) {
    if (id === "fish:any")
        return false;
    const sourceKind = source.source ?? source.sourceKind ?? source.source_kind ??
        source.kind ?? source.itemKind ?? source.item_kind;
    const category = source.category ?? source.itemCategory ?? source.item_category;
    const ordinarySource = sourceKind === undefined
        ? !COOKING_PRODUCT_IDS.has(id)
        : sourceKind === "ingredient" || sourceKind === "material";
    const ordinaryCategory = category === undefined || category === "ordinary" || category === "common";
    return ordinarySource && ordinaryCategory &&
        source.refundEligible !== false &&
        source.refund_eligible !== false &&
        source.limited !== true &&
        source.activity !== true &&
        source.sp !== true &&
        source.task !== true &&
        source.isLimited !== true &&
        source.isActivity !== true &&
        source.isSp !== true &&
        source.isTask !== true;
}

function normalizedEntry(raw, index) {
    const source = typeof raw === "string" ? { id: raw, quantity: 1 } : raw;
    if (!isRecord(source))
        fail("chef_recipe_invalid_ingredients", `Invalid ingredient at position ${index}`);
    const id = requiredIdentifier(source.id, "ingredient_id");
    const quantity = integer(source.quantity, "ingredient_quantity");
    return {
        id,
        quantity,
        // These are only eligibility hints from the inventory adapter/request.
        // The real adapter remains responsible for enforcing its item class.
        refundEligible: sourceRefundEligible(source, id),
    };
}

function normalizeResearchIngredients(rawIngredients) {
    if (!Array.isArray(rawIngredients))
        fail("chef_recipe_invalid_ingredients", "Recipe research needs 2 to 5 ingredients");
    const parsed = rawIngredients.map(normalizedEntry);
    const ingredients = normalizeChefIngredients(parsed.map(({ id, quantity }) => ({ id, quantity })));
    if (!ingredients)
        fail("chef_recipe_invalid_ingredients", "Recipe research needs 2 to 5 ingredients");
    const eligibility = new Map();
    for (const { id, refundEligible } of parsed)
        eligibility.set(id, (eligibility.get(id) ?? true) && refundEligible);
    return ingredients.map((entry) => ({
        ...entry,
        refundEligible: eligibility.get(entry.id) !== false,
    }));
}

function normalizeInput(input, now) {
    const source = input ?? {};
    const residentId = requiredIdentifier(source.residentId ?? source.resident_id, "resident_id");
    const operationId = requiredIdentifier(
        source.operationId ?? source.operation_id ?? source.researchId,
        "operation_id",
    );
    const idempotencyKey = requiredIdentifier(
        source.idempotencyKey ?? source.idempotency_key ?? source.actionKey,
        "idempotency_key",
    );
    const methodId = requiredIdentifier(source.methodId ?? source.method_id ?? source.method, "method_id");
    if (!kitchenMethodDefinition(methodId))
        fail("chef_recipe_method_unavailable", "The selected cooking method is unavailable");
    const name = requiredIdentifier(source.recipeName ?? source.recipe_name ?? source.name, "recipe_name");
    const ingredients = normalizeResearchIngredients(source.ingredients ?? source.items);
    // The service clock is authoritative; callers cannot move certificate
    // eligibility or operation timestamps by embedding a timestamp in the
    // research payload.
    const recordedAt = timestamp(now, "timestamp");
    const identityKey = chefOriginalRecipeKey(ingredients, methodId);
    if (!identityKey)
        fail("chef_recipe_identity_unavailable", "The recipe identity could not be built");
    const payload = {
        residentId,
        operationId,
        idempotencyKey,
        methodId,
        name,
        ingredients: ingredients.map(({ id, quantity }) => ({ id, quantity })),
    };
    return {
        ...payload,
        ingredients,
        ingredientsJson: canonical(payload.ingredients),
        identityKey,
        payloadHash: digest(canonical(payload)),
        recordedAt,
    };
}

function mapRecipe(row) {
    if (!row)
        return null;
    const ingredients = row.ingredients_json !== undefined && row.ingredients_json !== null
        ? parseJson(row.ingredients_json)
        : row.ingredients;
    if (!Array.isArray(ingredients))
        fail("chef_recipe_corrupt_recipe", "The stored chef recipe ingredients are invalid");
    const recipeId = row.recipe_id ?? row.recipeId ?? row.id;
    const authorResidentId = row.resident_id ?? row.author_resident_id ?? row.authorResidentId ?? null;
    return {
        recipeId,
        id: recipeId,
        identityKey: row.identity_key ?? chefOriginalRecipeKey(ingredients, row.method_id ?? row.methodId),
        residentId: authorResidentId,
        authorResidentId,
        name: row.recipe_name ?? row.recipeName ?? row.name,
        ingredients,
        methodId: row.method_id ?? row.methodId,
        recipeVersion: row.recipe_version ?? row.recipeVersion ?? null,
        qualityVersion: row.quality_version ?? row.qualityVersion ?? null,
        B: row.base_score ?? row.B ?? null,
        pairScore: row.pair_score ?? row.pairScore ?? null,
        methodScore: row.method_score ?? row.methodScore ?? null,
        structureScore: row.structure_score ?? row.structureScore ?? null,
        P: row.quality_score ?? row.P ?? null,
        S: row.total_score ?? row.S ?? null,
        rarity: row.rarity ?? null,
        createdAt: row.created_at ?? row.createdAt ?? null,
    };
}

function qualityView(value) {
    if (!value)
        return null;
    return {
        qualityVersion: value.qualityVersion ?? value.contentVersion ?? null,
        identity: value.identity ?? null,
        B: value.B ?? null,
        pairScore: value.pairScore ?? null,
        methodScore: value.methodScore ?? null,
        structureScore: value.structureScore ?? null,
        P: value.P ?? null,
        S: value.S ?? null,
        rarity: value.rarity ?? null,
        odd: value.odd === true,
    };
}

function mapOperation(row, { includeStoredResult = true } = {}) {
    if (!row)
        return null;
    if (includeStoredResult && row.result_json)
        return parseJson(row.result_json);
    const quality = row.quality_json ? parseJson(row.quality_json) : null;
    return {
        ok: row.status !== "rejected",
        status: row.status,
        operationId: row.operation_id,
        idempotencyKey: row.idempotency_key,
        residentId: row.resident_id,
        methodId: row.method_id,
        ingredients: parseJson(row.ingredients_json),
        qualificationLevel: row.qualification_level,
        researchLimit: row.max_recipes,
        successChance: row.success_chance,
        refundChance: row.refund_chance,
        successRoll: row.success_roll,
        refundRoll: row.refund_roll,
        consumed: row.status === "consumed",
        refund: {
            applied: row.refund_status === "applied",
            ingredientId: row.refund_ingredient_id,
            quantity: row.refund_status === "applied" ? 1 : 0,
            receipt: row.refund_receipt_json ? parseJson(row.refund_receipt_json) : null,
        },
        inventoryReceipt: row.inventory_receipt_json ? parseJson(row.inventory_receipt_json) : null,
        quality: qualityView(quality),
        recipe: null,
        failureCode: row.failure_code,
    };
}

function activeChefLevel(database, residentId, now) {
    let row;
    try {
        row = database.prepare(`
          SELECT MAX(qualification_level) AS qualification_level
          FROM career_certificates
          WHERE resident_id = ? AND career = 'chef' AND status = 'active'
            AND (effective_at IS NULL OR effective_at <= ?)
        `).get(residentId, now);
    }
    catch {
        // Older isolated career fixtures may not have effective_at yet.  The
        // active status is still authoritative in those fixtures.
        try {
            row = database.prepare(`
              SELECT MAX(qualification_level) AS qualification_level
              FROM career_certificates
              WHERE resident_id = ? AND career = 'chef' AND status = 'active'
            `).get(residentId);
        }
        catch {
            fail("chef_recipe_career_unavailable", "The active chef qualification is unavailable");
        }
    }
    if (!Number.isSafeInteger(row?.qualification_level) || !CHEF_RECIPE_LEVEL_RULES[row.qualification_level])
        fail("chef_active_qualification_required", "An active chef qualification is required");
    return row.qualification_level;
}

function ruleForLevel(level) {
    const rule = CHEF_RECIPE_LEVEL_RULES[level];
    if (!rule)
        fail("chef_active_qualification_required", "An active chef qualification is required");
    return rule;
}

function randomValue(options) {
    let value;
    if (typeof options?.random === "function")
        value = options.random();
    else if (typeof options?.rng?.next === "function")
        value = options.rng.next.call(options.rng);
    else
        value = Math.random();
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
        fail("chef_recipe_random_unavailable", "The chef recipe success roll is unavailable");
    return value;
}

function inventoryMethod(inventory, names) {
    for (const name of names) {
        if (typeof inventory?.[name] === "function")
            return inventory[name].bind(inventory);
    }
    return null;
}

function assertMethodAvailable(inventory, methodId) {
    const definition = kitchenMethodDefinition(methodId);
    if (!definition?.toolId)
        return;
    const checker = inventoryMethod(inventory, ["isMethodAvailable", "hasMethod"]);
    const toolChecker = inventoryMethod(inventory, ["hasTool"]);
    let available;
    try {
        if (checker)
            available = checker(methodId);
        else if (toolChecker)
            available = toolChecker(definition.toolId);
        else
            fail("chef_recipe_method_access_unavailable", "The selected cooking tool ownership could not be verified");
    }
    catch (error) {
        if (error instanceof CareerDomainError)
            throw error;
        fail("chef_recipe_method_access_unavailable", "The selected cooking tool ownership could not be verified");
    }
    if (available && typeof available.then === "function")
        fail("chef_recipe_method_access_async_unsupported", "The inventory adapter must be synchronous");
    const accepted = available === true ||
        (isRecord(available) && (available.ok === true || available.available === true) && available.available !== false);
    if (!accepted)
        fail("chef_recipe_method_tool_required", "The selected cooking method is not available");
}

function inventoryResponse(response, operationCode) {
    if (response && typeof response.then === "function")
        fail(`${operationCode}_async_unsupported`, "The inventory adapter must be synchronous");
    if (response === false || response === null || response === undefined)
        fail(`${operationCode}_invalid_response`, "The inventory adapter returned no receipt");
    if (isRecord(response) && response.ok === false) {
        const code = typeof response.code === "string" ? response.code : `${operationCode}_rejected`;
        return { rejected: true, code, response };
    }
    const alreadyApplied = isRecord(response) && (
        response.alreadyConsumed === true ||
        response.alreadyApplied === true ||
        response.status === "already_consumed" ||
        response.status === "already_applied"
    );
    return {
        rejected: false,
        alreadyApplied,
        receipt: isRecord(response) && Object.hasOwn(response, "receipt") ? response.receipt : response,
    };
}

function consumeInventory(inventory, input) {
    const consume = inventoryMethod(inventory, ["consumeIngredients", "consume"]);
    if (!consume)
        fail("chef_inventory_required", "A real inventory adapter is required for recipe research");
    let response;
    try {
        response = consume({
            operationId: input.operationId,
            idempotencyKey: input.idempotencyKey,
            residentId: input.residentId,
            ingredients: input.ingredients.map(({ id, quantity }) => ({ id, quantity })),
            methodId: input.methodId,
        });
    }
    catch {
        fail("chef_inventory_unavailable", "The inventory could not confirm recipe research consumption");
    }
    return inventoryResponse(response, "chef_inventory");
}

function refundInventory(inventory, input, ingredientId) {
    const refund = inventoryMethod(inventory, ["refundIngredient", "refundIngredients", "refund"]);
    if (!refund)
        fail("chef_inventory_refund_unavailable", "The inventory cannot apply the approved ingredient refund");
    let response;
    try {
        response = refund({
            operationId: input.operationId,
            idempotencyKey: `${input.operationId}:refund`,
            residentId: input.residentId,
            ingredientId,
            quantity: 1,
            methodId: input.methodId,
        });
    }
    catch {
        fail("chef_inventory_refund_unavailable", "The approved ingredient refund could not be confirmed");
    }
    if (response && typeof response.then === "function")
        fail("chef_inventory_refund_async_unsupported", "The inventory adapter must be synchronous");
    if (isRecord(response) && response.ok === false) {
        const code = typeof response.code === "string" ? response.code : "chef_inventory_refund_rejected";
        if (REFUND_NOOP_CODES.has(code))
            return { applied: false, receipt: response, code };
        fail("chef_inventory_refund_unavailable", "The approved ingredient refund could not be confirmed");
    }
    if (response === false || response === null || response === undefined)
        fail("chef_inventory_refund_invalid_response", "The inventory adapter returned no refund receipt");
    const applied = !isRecord(response) || response.applied !== false;
    return {
        applied,
        receipt: isRecord(response) && Object.hasOwn(response, "receipt") ? response.receipt : response,
    };
}

function operationByIdentity(database, identityKey) {
    return database.prepare(`
      SELECT * FROM ${CHEF_RECIPE_TABLES.operations}
      WHERE identity_key = ? AND status IN ('pending', 'consumed')
      ORDER BY created_at, operation_id LIMIT 1
    `).get(identityKey);
}

function operationByIdOrKey(database, input) {
    const byId = database.prepare(`
      SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?
    `).get(input.operationId);
    const byKey = database.prepare(`
      SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE idempotency_key = ?
    `).get(input.idempotencyKey);
    if (byId && byKey && byId.operation_id !== byKey.operation_id)
        fail("chef_recipe_idempotency_conflict", "The operation and idempotency key belong to different research attempts");
    const existing = byId ?? byKey;
    if (!existing)
        return null;
    if (existing.operation_id !== input.operationId || existing.idempotency_key !== input.idempotencyKey ||
        existing.payload_hash !== input.payloadHash)
        fail("chef_recipe_idempotency_conflict", "The research key has different parameters");
    return existing;
}

function recipeByIdentity(database, identityKey) {
    return database.prepare(`
      SELECT * FROM ${CHEF_RECIPE_TABLES.recipes} WHERE identity_key = ?
    `).get(identityKey);
}

function officialRecipeByIdentity(identityKey) {
    return cookingRecipes.find((recipe) =>
        chefOriginalRecipeKey(recipe?.ingredients, recipe?.method_id) === identityKey) ?? null;
}

function operationResult(input, fields) {
    return {
        ok: fields.status !== "rejected",
        status: fields.status,
        operationId: input.operationId,
        idempotencyKey: input.idempotencyKey,
        residentId: input.residentId,
        methodId: input.methodId,
        ingredients: input.ingredients.map(({ id, quantity }) => ({ id, quantity })),
        qualificationLevel: fields.qualificationLevel,
        researchLimit: fields.maxRecipes,
        successChance: fields.successChance,
        refundChance: fields.refundChance,
        successRoll: fields.successRoll,
        refundRoll: fields.refundRoll,
        consumed: fields.consumed === true,
        refund: {
            applied: fields.refund?.applied === true,
            ingredientId: fields.refund?.ingredientId ?? null,
            quantity: fields.refund?.applied === true ? 1 : 0,
            receipt: fields.refund?.receipt ?? null,
        },
        inventoryReceipt: fields.inventoryReceipt ?? null,
        quality: qualityView(fields.quality),
        recipe: fields.recipe ?? null,
        ...(fields.failureCode ? { failureCode: fields.failureCode } : {}),
    };
}

function prepareOperation(database, input, options) {
    return runInTransaction(database, () => {
        const existing = operationByIdOrKey(database, input);
        if (existing)
            return { row: existing, created: false };

        assertMethodAvailable(options.inventory, input.methodId);
        const qualificationLevel = activeChefLevel(database, input.residentId, input.recordedAt);
        const rule = ruleForLevel(qualificationLevel);
        const count = database.prepare(`
          SELECT COUNT(*) AS count FROM ${CHEF_RECIPE_TABLES.recipes}
          WHERE resident_id = ?
        `).get(input.residentId).count;
        const existingRecipe = recipeByIdentity(database, input.identityKey);
        const existingOfficialRecipe = officialRecipeByIdentity(input.identityKey);
        const activeResearchCount = database.prepare(`
          SELECT COUNT(*) AS count FROM ${CHEF_RECIPE_TABLES.operations}
          WHERE resident_id = ? AND status IN ('pending', 'consumed')
        `).get(input.residentId).count;
        const pendingIdentity = operationByIdentity(database, input.identityKey);
        if (pendingIdentity)
            fail("chef_recipe_operation_in_progress", "This recipe identity is already being researched");
        if (existingRecipe || existingOfficialRecipe || count + activeResearchCount >= rule.maxRecipes) {
            const failureCode = existingRecipe || existingOfficialRecipe
                ? "chef_recipe_identity_exists"
                : "chef_recipe_limit_reached";
            const result = operationResult(input, {
                status: "rejected",
                qualificationLevel,
                maxRecipes: rule.maxRecipes,
                successChance: rule.successChance,
                refundChance: rule.refundChance,
                successRoll: null,
                refundRoll: null,
                consumed: false,
                refund: null,
                quality: null,
                recipe: existingRecipe ? mapRecipe(existingRecipe) : null,
                failureCode,
            });
            database.prepare(`
              INSERT INTO ${CHEF_RECIPE_TABLES.operations} (
                operation_id, idempotency_key, identity_key, resident_id,
                payload_hash, recipe_name, ingredients_json, method_id,
                qualification_level, max_recipes, success_chance, refund_chance,
                quality_json, success_roll, refund_roll, refund_ingredient_id,
                refund_status, status, failure_code, result_json, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL,
                        'none', 'rejected', ?, ?, ?, ?)
            `).run(input.operationId, input.idempotencyKey, input.identityKey, input.residentId,
                input.payloadHash, input.name, input.ingredientsJson, input.methodId,
                qualificationLevel, rule.maxRecipes, rule.successChance, rule.refundChance,
                failureCode, canonical(result), input.recordedAt, input.recordedAt);
            return {
                row: database.prepare(`SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?`).get(input.operationId),
                created: true,
            };
        }

        const quality = evaluateChefOriginalQuality({
            ingredients: input.ingredients.map(({ id, quantity }) => ({ id, quantity })),
            methodId: input.methodId,
        });
        if (!quality.ok)
            fail(`chef_recipe_quality_${quality.code}`, "The approved chef quality evaluator is unavailable");
        const successRoll = quality.odd ? null : randomValue(options);
        const refundRoll = randomValue(options);
        const refundIngredient = input.ingredients.find((entry) => entry.refundEligible)?.id ?? null;
        const refundPending = refundIngredient !== null && refundRoll < rule.refundChance;
        database.prepare(`
          INSERT INTO ${CHEF_RECIPE_TABLES.operations} (
            operation_id, idempotency_key, identity_key, resident_id,
            payload_hash, recipe_name, ingredients_json, method_id,
            qualification_level, max_recipes, success_chance, refund_chance,
            quality_json, success_roll, refund_roll, refund_ingredient_id,
            refund_status, status, failure_code, result_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)
        `).run(input.operationId, input.idempotencyKey, input.identityKey, input.residentId,
            input.payloadHash, input.name, input.ingredientsJson, input.methodId,
            qualificationLevel, rule.maxRecipes, rule.successChance, rule.refundChance,
            canonical(quality), successRoll, refundRoll, refundIngredient,
            refundPending ? "pending" : "none", input.recordedAt, input.recordedAt);
        return {
            row: database.prepare(`SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?`).get(input.operationId),
            created: true,
        };
    });
}

function rejectInventoryOperation(database, row, input, code) {
    return runInTransaction(database, () => {
        const current = database.prepare(`SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?`).get(row.operation_id);
        if (TERMINAL_OPERATION_STATUSES.has(current.status))
            return parseJson(current.result_json);
        const quality = current.quality_json ? parseJson(current.quality_json) : null;
        const result = operationResult(input, {
            status: "rejected",
            qualificationLevel: current.qualification_level,
            maxRecipes: current.max_recipes,
            successChance: current.success_chance,
            refundChance: current.refund_chance,
            successRoll: current.success_roll,
            refundRoll: current.refund_roll,
            consumed: false,
            refund: null,
            quality,
            recipe: null,
            failureCode: code,
        });
        database.prepare(`
          UPDATE ${CHEF_RECIPE_TABLES.operations}
          SET status = 'rejected', failure_code = ?, result_json = ?, updated_at = ?
          WHERE operation_id = ? AND status IN ('pending', 'consumed')
        `).run(code, canonical(result), input.recordedAt, row.operation_id);
        return result;
    });
}

function markInventoryConsumed(database, row, receipt, now) {
    return runInTransaction(database, () => {
        const current = database.prepare(`SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?`).get(row.operation_id);
        if (TERMINAL_OPERATION_STATUSES.has(current.status))
            return current;
        if (current.status === "pending") {
            database.prepare(`
              UPDATE ${CHEF_RECIPE_TABLES.operations}
              SET status = 'consumed', inventory_receipt_json = ?, updated_at = ?
              WHERE operation_id = ? AND status = 'pending'
            `).run(jsonOrNull(receipt), now, row.operation_id);
        }
        return database.prepare(`SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?`).get(row.operation_id);
    });
}

function markRefund(database, row, refund, now) {
    return runInTransaction(database, () => {
        const current = database.prepare(`SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?`).get(row.operation_id);
        if (TERMINAL_OPERATION_STATUSES.has(current.status))
            return current;
        if (current.refund_status === "pending") {
            database.prepare(`
              UPDATE ${CHEF_RECIPE_TABLES.operations}
              SET refund_status = ?, refund_receipt_json = ?, updated_at = ?
              WHERE operation_id = ? AND status = 'consumed' AND refund_status = 'pending'
            `).run(refund.applied ? "applied" : "none", jsonOrNull(refund.receipt), now, row.operation_id);
        }
        return database.prepare(`SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?`).get(row.operation_id);
    });
}

function finalizeOperation(database, row, input, generateId, now) {
    return runInTransaction(database, () => {
        const current = database.prepare(`SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?`).get(row.operation_id);
        if (TERMINAL_OPERATION_STATUSES.has(current.status))
            return parseJson(current.result_json);
        if (current.status !== "consumed")
            fail("chef_recipe_consumption_pending", "Recipe research consumption has not been confirmed");
        if (!REFUND_STATUSES.has(current.refund_status) || current.refund_status === "pending")
            fail("chef_recipe_refund_pending", "Recipe research refund has not been confirmed");

        const quality = parseJson(current.quality_json);
        const ingredients = parseJson(current.ingredients_json);
        const refund = {
            applied: current.refund_status === "applied",
            ingredientId: current.refund_ingredient_id,
            receipt: current.refund_receipt_json ? parseJson(current.refund_receipt_json) : null,
        };
        const inventoryReceipt = current.inventory_receipt_json
            ? parseJson(current.inventory_receipt_json)
            : null;
        const researchInput = {
            ...input,
            ingredients: ingredients.map((entry) => ({ ...entry, refundEligible: true })),
        };
        const success = quality.odd !== true && current.success_roll < current.success_chance;
        if (!success) {
            const result = operationResult(researchInput, {
                status: "failed",
                qualificationLevel: current.qualification_level,
                maxRecipes: current.max_recipes,
                successChance: current.success_chance,
                refundChance: current.refund_chance,
                successRoll: current.success_roll,
                refundRoll: current.refund_roll,
                consumed: true,
                refund,
                inventoryReceipt,
                quality,
                recipe: null,
                failureCode: quality.odd === true ? ODD_FAILURE : RESEARCH_FAILURE,
            });
            database.prepare(`
              UPDATE ${CHEF_RECIPE_TABLES.operations}
              SET status = 'failed', failure_code = ?, result_json = ?, updated_at = ?
              WHERE operation_id = ?
            `).run(quality.odd === true ? ODD_FAILURE : RESEARCH_FAILURE, canonical(result), now, row.operation_id);
            return result;
        }

        const existing = recipeByIdentity(database, current.identity_key) || officialRecipeByIdentity(current.identity_key);
        if (existing) {
            const result = operationResult(researchInput, {
                status: "failed",
                qualificationLevel: current.qualification_level,
                maxRecipes: current.max_recipes,
                successChance: current.success_chance,
                refundChance: current.refund_chance,
                successRoll: current.success_roll,
                refundRoll: current.refund_roll,
                consumed: true,
                refund,
                inventoryReceipt,
                quality,
                recipe: mapRecipe(existing),
                failureCode: "chef_recipe_identity_exists",
            });
            database.prepare(`
              UPDATE ${CHEF_RECIPE_TABLES.operations}
              SET status = 'failed', failure_code = ?, result_json = ?, updated_at = ?
              WHERE operation_id = ?
            `).run("chef_recipe_identity_exists", canonical(result), now, row.operation_id);
            return result;
        }

        const recipeId = requiredIdentifier(generateId(), "recipe_id");
        database.prepare(`
          INSERT INTO ${CHEF_RECIPE_TABLES.recipes} (
            recipe_id, identity_key, resident_id, recipe_name, ingredients_json,
            method_id, recipe_version, quality_version, base_score, pair_score,
            method_score, structure_score, quality_score, total_score, rarity, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(recipeId, current.identity_key, current.resident_id, current.recipe_name,
            current.ingredients_json, current.method_id, quality.qualityVersion,
            quality.B, quality.pairScore, quality.methodScore, quality.structureScore,
            quality.P, quality.S, quality.rarity, now);
        const recipe = mapRecipe(database.prepare(`
          SELECT * FROM ${CHEF_RECIPE_TABLES.recipes} WHERE recipe_id = ?
        `).get(recipeId));
        const result = operationResult(researchInput, {
            status: "succeeded",
            qualificationLevel: current.qualification_level,
            maxRecipes: current.max_recipes,
            successChance: current.success_chance,
            refundChance: current.refund_chance,
            successRoll: current.success_roll,
            refundRoll: current.refund_roll,
            consumed: true,
            refund,
            inventoryReceipt,
            quality,
            recipe,
        });
        database.prepare(`
          UPDATE ${CHEF_RECIPE_TABLES.operations}
          SET status = 'succeeded', recipe_id = ?, failure_code = NULL,
              result_json = ?, updated_at = ?
          WHERE operation_id = ?
        `).run(recipeId, canonical(result), now, row.operation_id);
        return result;
    });
}

function executeResearch(database, input, options, prepared) {
    let row = prepared.row;
    if (TERMINAL_OPERATION_STATUSES.has(row.status))
        return parseJson(row.result_json);
    const operationNow = row.created_at;

    if (row.status === "pending") {
        const consumed = consumeInventory(options.inventory, input);
        if (consumed.rejected) {
            if (!INVENTORY_REJECTION_CODES.has(consumed.code))
                fail("chef_inventory_unavailable", "The inventory rejected recipe research consumption");
            return rejectInventoryOperation(database, row, input, consumed.code);
        }
        row = markInventoryConsumed(database, row, consumed.receipt, operationNow);
    }

    if (row.status !== "consumed")
        return mapOperation(row);

    if (row.refund_status === "pending") {
        const refund = refundInventory(options.inventory, input, row.refund_ingredient_id);
        row = markRefund(database, row, refund, operationNow);
    }
    return finalizeOperation(database, row, input, options.generateId, operationNow);
}

export function ensureChefRecipeSchema(database) {
    assertDatabase(database);
    database.exec(`
      CREATE TABLE IF NOT EXISTS ${CHEF_RECIPE_TABLES.recipes} (
        recipe_id TEXT PRIMARY KEY,
        identity_key TEXT NOT NULL UNIQUE,
        resident_id TEXT NOT NULL,
        recipe_name TEXT NOT NULL,
        ingredients_json TEXT NOT NULL,
        method_id TEXT NOT NULL,
        recipe_version INTEGER NOT NULL CHECK (recipe_version >= 1),
        quality_version TEXT NOT NULL,
        base_score REAL NOT NULL,
        pair_score REAL NOT NULL,
        method_score REAL NOT NULL,
        structure_score INTEGER NOT NULL,
        quality_score REAL NOT NULL,
        total_score REAL NOT NULL,
        rarity TEXT NOT NULL CHECK (rarity IN ('N', 'R', 'SR', 'SSR')),
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS career_chef_original_recipes_resident_index
        ON ${CHEF_RECIPE_TABLES.recipes}(resident_id, created_at, recipe_id);
      CREATE TABLE IF NOT EXISTS ${CHEF_RECIPE_TABLES.operations} (
        operation_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        identity_key TEXT NOT NULL,
        resident_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        recipe_name TEXT NOT NULL,
        ingredients_json TEXT NOT NULL,
        method_id TEXT NOT NULL,
        qualification_level INTEGER NOT NULL CHECK (qualification_level BETWEEN 1 AND 4),
        max_recipes INTEGER NOT NULL CHECK (max_recipes > 0),
        success_chance REAL NOT NULL CHECK (success_chance >= 0 AND success_chance <= 1),
        refund_chance REAL NOT NULL CHECK (refund_chance >= 0 AND refund_chance <= 1),
        quality_json TEXT,
        success_roll REAL CHECK (success_roll IS NULL OR (success_roll >= 0 AND success_roll <= 1)),
        refund_roll REAL CHECK (refund_roll IS NULL OR (refund_roll >= 0 AND refund_roll <= 1)),
        refund_ingredient_id TEXT,
        refund_status TEXT NOT NULL CHECK (refund_status IN ('pending', 'applied', 'none')),
        inventory_receipt_json TEXT,
        refund_receipt_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'consumed', 'succeeded', 'failed', 'rejected')),
        failure_code TEXT,
        recipe_id TEXT REFERENCES ${CHEF_RECIPE_TABLES.recipes}(recipe_id),
        result_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS career_chef_recipe_operations_status_index
        ON ${CHEF_RECIPE_TABLES.operations}(status, updated_at, operation_id);
      CREATE UNIQUE INDEX IF NOT EXISTS career_chef_recipe_operations_identity_pending
        ON ${CHEF_RECIPE_TABLES.operations}(identity_key)
        WHERE status IN ('pending', 'consumed');
    `);
    return database;
}

export function researchChefRecipe(database, input, options = {}) {
    ensureChefRecipeSchema(database);
    const now = currentTimestamp(options.now, "timestamp");
    const normalized = normalizeInput(input, now);
    const configured = {
        ...options,
        inventory: options.inventory,
        generateId: options.generateId ?? randomUUID,
    };
    const prepared = prepareOperation(database, normalized, configured);
    return executeResearch(database, normalized, configured, prepared);
}

export const researchOriginalChefRecipe = researchChefRecipe;
export const runChefRecipeResearch = researchChefRecipe;
export const handleChefRecipeResearch = researchChefRecipe;

export function getChefRecipe(database, selector) {
    ensureChefRecipeSchema(database);
    const key = requiredIdentifier(selector, "recipe_selector");
    return mapRecipe(database.prepare(`
      SELECT * FROM ${CHEF_RECIPE_TABLES.recipes}
      WHERE recipe_id = ? OR identity_key = ?
    `).get(key, key));
}

export function listChefRecipes(database, residentId) {
    ensureChefRecipeSchema(database);
    const id = requiredIdentifier(residentId, "resident_id");
    return database.prepare(`
      SELECT * FROM ${CHEF_RECIPE_TABLES.recipes}
      WHERE resident_id = ? ORDER BY created_at, recipe_id
    `).all(id).map(mapRecipe);
}

export function getChefRecipeResearch(database, selector) {
    ensureChefRecipeSchema(database);
    const key = requiredIdentifier(selector, "operation_selector");
    const row = database.prepare(`
      SELECT * FROM ${CHEF_RECIPE_TABLES.operations}
      WHERE operation_id = ? OR idempotency_key = ?
    `).get(key, key);
    return row ? mapOperation(row) : null;
}

export function recoverChefRecipeResearch(database, operationId, options = {}) {
    ensureChefRecipeSchema(database);
    const key = requiredIdentifier(operationId, "operation_id");
    const row = database.prepare(`
      SELECT * FROM ${CHEF_RECIPE_TABLES.operations} WHERE operation_id = ?
    `).get(key);
    if (!row)
        fail("chef_recipe_operation_not_found", "The chef recipe research operation was not found");
    if (TERMINAL_OPERATION_STATUSES.has(row.status))
        return parseJson(row.result_json);
    const now = currentTimestamp(options.now, "timestamp");
    const input = {
        residentId: row.resident_id,
        operationId: row.operation_id,
        idempotencyKey: row.idempotency_key,
        methodId: row.method_id,
        recipeName: row.recipe_name,
        ingredients: parseJson(row.ingredients_json),
    };
    const configured = {
        ...options,
        generateId: options.generateId ?? randomUUID,
    };
    return executeResearch(database, normalizeInput(input, now), configured, { row, created: false });
}

export function activeChefQualificationLevel(database, residentId, now = Date.now()) {
    assertDatabase(database);
    return activeChefLevel(database, requiredIdentifier(residentId, "resident_id"), currentTimestamp(now, "timestamp"));
}

export class ChefRecipeService {
    #database;
    #options;

    constructor(options = {}, legacyOptions = {}) {
        const config = options && typeof options.prepare === "function"
            ? { ...legacyOptions, database: options }
            : options;
        assertDatabase(config.database);
        ensureChefRecipeSchema(config.database);
        this.#database = config.database;
        this.#options = { ...config };
    }

    research(input) {
        return researchChefRecipe(this.#database, input, this.#options);
    }

    recover(operationId) {
        return recoverChefRecipeResearch(this.#database, operationId, this.#options);
    }

    get(selector) {
        return getChefRecipe(this.#database, selector);
    }

    list(residentId) {
        return listChefRecipes(this.#database, residentId);
    }

    getResearch(selector) {
        return getChefRecipeResearch(this.#database, selector);
    }
}

export function createChefRecipeService(options, legacyOptions) {
    return new ChefRecipeService(options, legacyOptions);
}
