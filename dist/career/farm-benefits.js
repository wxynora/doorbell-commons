/**
 * Resolve career benefits from the stable Doorbell farm migration binding.
 * Farm doorplates and human keys are not identity credentials for this lookup.
 */
import { createHash } from "node:crypto";
import { getChefRecipe } from "./chef-recipe-service.js";
import { PAID_KITCHEN_TOOLS } from "../server/kitchen-structured.js";

export function farmResidentId(database, farm) {
    const bindingReference = farm?.doorbellMcpMigration?.migrationId;
    if (!database || typeof bindingReference !== "string" || !bindingReference)
        return null;
    const rows = database.prepare(`
      SELECT resident_id FROM residents WHERE binding_reference = ?
    `).all(bindingReference);
    return rows.length === 1 && typeof rows[0]?.resident_id === "string"
        ? rows[0].resident_id
        : null;
}

export function farmCareerQualificationLevel(database, farm, career) {
    const bindingReference = farm?.doorbellMcpMigration?.migrationId;
    if (!database || typeof bindingReference !== "string" || !bindingReference)
        return 0;
    const row = database.prepare(`
      SELECT MAX(certificate.qualification_level) AS qualification_level
      FROM residents AS resident
      JOIN career_certificates AS certificate
        ON certificate.resident_id = resident.resident_id
      WHERE resident.binding_reference = ?
        AND certificate.career = ?
        AND certificate.status = 'active'
    `).get(bindingReference, career);
    return Number.isSafeInteger(row?.qualification_level) ? row.qualification_level : 0;
}

function allOriginalChefRecipes(database) {
    if (!database)
        return [];
    const rows = database.prepare(`
      SELECT recipe_id FROM career_chef_original_recipes
      ORDER BY created_at, recipe_id
    `).all();
    return rows.map(({ recipe_id }) => getChefRecipe(database, recipe_id)).filter(Boolean);
}

function accessibleOriginalChefRecipeIds(database, residentId) {
    if (!database || !residentId)
        return [];
    return database.prepare(`
      SELECT DISTINCT recipe.recipe_id
      FROM career_chef_original_recipes AS recipe
      LEFT JOIN chef_recipe_entitlements AS entitlement
        ON entitlement.recipe_id = recipe.recipe_id
       AND entitlement.resident_id = ?
       AND entitlement.revoked_at IS NULL
      WHERE recipe.resident_id = ? OR entitlement.resident_id IS NOT NULL
      ORDER BY recipe.recipe_id
    `).all(residentId, residentId).map(({ recipe_id }) => recipe_id);
}

function stableChefActionId(residentId, kind, value) {
    const digest = createHash("sha256")
        .update(JSON.stringify([residentId, kind, value]), "utf8")
        .digest("hex");
    return `doorbell-chef:${kind}:${digest}`;
}

function countedIngredients(items) {
    const counts = new Map();
    for (const raw of Array.isArray(items) ? items : []) {
        const id = typeof raw === "string" ? raw.trim() : "";
        if (!id)
            continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([id, quantity]) => ({ id, quantity }));
}

export function farmKitchenCareerBenefits(database, farm) {
    const chefQualificationLevel = farmCareerQualificationLevel(database, farm, "chef");
    return Object.freeze({
        chefQualificationLevel,
        ingredientDailyBuyMultiplier: chefQualificationLevel > 0 ? 2 : 1,
    });
}

/**
 * Server-only additions used by Doorbell's authenticated Human kitchen route.
 * They are deliberately not included in the legacy farm/agent benefit object:
 * model-visible original-recipe operations remain closed until their registry
 * copy is approved.  The callback only carries a durable cooking receipt id;
 * resident identity is closed over from the stable migration binding.
 */
export function farmDoorbellKitchenCareerBenefits(database, backend, farm) {
    const residentId = farmResidentId(database, farm);
    const base = farmKitchenCareerBenefits(database, farm);
    if (!residentId || !backend || typeof backend.forResident !== "function")
        return base;
    const originalRecipes = allOriginalChefRecipes(database);
    const accessibleOriginalRecipeIds = accessibleOriginalChefRecipeIds(database, residentId);
    const resident = backend.forResident(residentId);
    return Object.freeze({
        ...base,
        cookResidentId: residentId,
        originalRecipes,
        accessibleOriginalRecipeIds,
        purchaseKitchenTool(toolId) {
            const tool = PAID_KITCHEN_TOOLS.find((entry) => entry.tool_id === toolId);
            if (!tool)
                return { ok: false, error: "料理工具商店没有这个工具。" };
            const kitchen = farm?.ranch?.kitchen;
            if (!kitchen || !Number.isSafeInteger(farm.silver) || farm.silver < 0)
                return { ok: false, error: "料理台状态无效。" };
            const owned = Array.isArray(kitchen.ownedTools) ? kitchen.ownedTools : [];
            if (owned.includes(tool.tool_id))
                return { ok: false, error: `已经拥有「${tool.name}」了。` };
            if (farm.silver < tool.price_silver)
                return { ok: false, error: `银币不足，购买「${tool.name}」需要 ${tool.price_silver} 银币。` };
            farm.silver -= tool.price_silver;
            kitchen.ownedTools = [...owned, tool.tool_id];
            return { ok: true, kind: "tool", name: tool.name, qty: 1, cost: tool.price_silver };
        },
        researchOriginalRecipe({ items, methodId, recipeName }) {
            const ingredients = countedIngredients(items);
            const payload = { ingredients, methodId, recipeName };
            const key = stableChefActionId(residentId, "recipe-research", payload);
            return resident.researchOwnChefRecipe({
                operationId: key,
                idempotencyKey: key,
                recipeName,
                methodId,
                ingredients,
            });
        },
        onOriginalCookingReceipt(receipt) {
            const receiptId = receipt?.receiptId ?? receipt?.cookingReceiptId;
            if (typeof receiptId !== "string" || !receiptId)
                return { ok: false };
            return resident.recordChefOriginalRecipeProduction({
                cookingReceiptId: receiptId,
                idempotencyKey: `chef-original-cook:${receiptId}:settlement`,
            });
        },
    });
}

const AGRONOMIST_EXTRA_HARVEST_CHANCE = Object.freeze({
    1: 0.03,
    2: 0.06,
    3: 0.10,
    4: 0.15,
});

export function farmAgronomistCareerBenefits(database, farm) {
    const agronomistQualificationLevel = farmCareerQualificationLevel(database, farm, "agronomist");
    return Object.freeze({
        agronomistQualificationLevel,
        agronomistExtraHarvestChance: AGRONOMIST_EXTRA_HARVEST_CHANCE[agronomistQualificationLevel] ?? 0,
    });
}

export function farmCareerBenefits(database, farm) {
    return Object.freeze({
        ...farmKitchenCareerBenefits(database, farm),
        ...farmAgronomistCareerBenefits(database, farm),
    });
}
