import { createHash } from "node:crypto";
import { checkTitles } from "../titles.js";
import { dishSystemRecycleSilver, kitchenCook } from "../engine.js";
import { resolveChefOriginalCookingReceipt } from "../domain/kitchen/original.js";
import { replaceFarm } from "../store.js";
import { kitchenInventoryRevisionFromData } from "./kitchen-inventory-revision.js";
import {
  kitchenMethodDefinition,
  kitchenRecipeMethodId,
  kitchenRecipeToolId,
  kitchenToolDefinition,
  kitchenToolIsOwned,
  projectHumanKitchen,
} from "./kitchen-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVENTORY_REVISION_RE = /^kitchen-inventory-v1:[0-9a-f]{64}$/;
const REF_RE = /^\S(?:.{0,127})$/u;
const RECEIPTS_FIELD = "doorbellHumanKitchenCookReceipts";
const LEGACY_REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_kitchen_inventory_revision",
  "items",
];
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_kitchen_inventory_revision",
  "method_id",
  "items",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

function validRef(value) {
  return typeof value === "string" && REF_RE.test(value);
}

function validateBody(body) {
  const hasMethod = exactKeys(body, REQUEST_KEYS);
  if (!hasMethod && !exactKeys(body, LEGACY_REQUEST_KEYS)) return false;
  if (
    typeof body.farm_human_key !== "string" ||
    body.farm_human_key.trim().length === 0 ||
    typeof body.expected_farm_doorplate !== "string" ||
    !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) ||
    typeof body.idempotency_key !== "string" ||
    !UUID_RE.test(body.idempotency_key) ||
    typeof body.expected_kitchen_inventory_revision !== "string" ||
    !INVENTORY_REVISION_RE.test(body.expected_kitchen_inventory_revision) ||
    !Array.isArray(body.items) ||
    body.items.length < 2 ||
    body.items.length > 5
  ) {
    return false;
  }
  if (hasMethod && (typeof body.method_id !== "string" || !kitchenMethodDefinition(body.method_id))) {
    return false;
  }
  return body.items.every(validRef);
}

function fingerprint(body) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          farm_human_key: body.farm_human_key,
          expected_farm_doorplate: body.expected_farm_doorplate,
          expected_kitchen_inventory_revision: body.expected_kitchen_inventory_revision,
          method_id: body.method_id ?? null,
          items: body.items,
        }),
      ),
      "utf8",
    )
    .digest("hex");
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit 2 to 5 ingredient references and a valid kitchen method",
      },
    },
  };
}

function credentialError() {
  return {
    status: 403,
    json: {
      error: {
        code: "farm_credential_invalid",
        message: "The kitchen credential does not match the bound farm",
      },
    },
  };
}

function unavailable(message) {
  return { status: 503, json: { error: { code: "farm_unavailable", message } } };
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_kitchen_inventory_revision = currentRevision;
  return { status: 409, json: { error } };
}

/**
 * The farm save is the first durable half of an original cook.  Commons
 * discovery/commission settlement is retried from the same action receipt;
 * it must never run before replaceFarm succeeds or turn a callback failure
 * into a farm rollback.
 */
function reconcileOriginalCooking(farm, receipt, options) {
  if (!receipt || typeof options?.onOriginalCookingReceipt !== "function") return true;
  try {
    const result = options.onOriginalCookingReceipt(receipt);
    if (result && typeof result.then === "function") return false;
    return !(result && result.ok === false);
  } catch {
    return false;
  }
}

function currentResource(farm, now, options) {
  try {
    const projected = projectHumanKitchen(farm, now, options);
    return {
      data: projected.data,
      revision: kitchenInventoryRevisionFromData(projected.data),
      server_time: projected.server_time,
    };
  } catch {
    return null;
  }
}

function outcome(body, result) {
  const dish = result?.dish;
  if (
    !isRecord(dish) ||
    typeof dish.id !== "string" ||
    dish.id.length === 0 ||
    typeof dish.recipeId !== "string" ||
    typeof dish.name !== "string" ||
    typeof dish.rarity !== "string" ||
    !Number.isSafeInteger(dish.value) ||
    dish.value < 0
  ) {
    return null;
  }
  return {
    kind: "cook",
    item_refs: [...body.items],
    dish_instance_id: dish.id,
    recipe_id: dish.recipeId,
    name: dish.name,
    rarity: dish.rarity,
    value_gold: dish.value,
    recycle_silver: dishSystemRecycleSilver(dish),
    odd: result.odd === true,
    discovered: result.discovered === true,
    qixi: result.qixi ?? null,
  };
}

function toolRequirementError(farm, methodId) {
  if (!methodId) return null;
  const method = kitchenMethodDefinition(methodId);
  if (!method) return "The kitchen method is not available";
  if (!method.tool_id) return null;

  const kitchen = farm?.ranch?.kitchen;
  if (!isRecord(kitchen)) return `「${method.name}」需要先拥有对应料理工具。`;
  if (kitchen.ownedTools !== undefined && !Array.isArray(kitchen.ownedTools)) {
    return "料理工具持有状态无效。";
  }
  const tool = kitchenToolDefinition(method.tool_id);
  if (!tool) return "The kitchen method tool is not available";
  return kitchenToolIsOwned(kitchen, method.tool_id)
    ? null
    : `「${method.name}」需要先拥有「${tool.name}」。`;
}

function authorityRecipeError(farm, result, requestedMethodId) {
  const recipe = result?.recipe;
  if (!recipe) return null;

  const recipeMethodId = kitchenRecipeMethodId(recipe);
  const method = kitchenMethodDefinition(recipeMethodId);
  if (!method) return "正式食谱缺少有效制作方式。";
  if (requestedMethodId && recipeMethodId !== requestedMethodId) {
    return "提交的制作方式与命中的食谱不一致。";
  }

  const recipeToolId = kitchenRecipeToolId(recipe);
  if (!recipeToolId) return null;
  return toolRequirementError(farm, recipeMethodId);
}

/**
 * Execute the Human cooking contract against the existing kitchenCook
 * authority.  Legacy callers may still submit raw `items`; new callers submit
 * the authoritative method_id, which is checked against the matched recipe and
 * its per-farm paid-tool ownership before the clone is saved.
 */
export function handleHumanKitchenCookAction(farm, body, now = Date.now(), options = {}) {
  if (!validateBody(body)) return invalidRequest();
  if (!farm) return unavailable("The bound farm was not found");
  if (farm.humanKey !== body.farm_human_key || farm.id !== body.expected_farm_doorplate) {
    return credentialError();
  }

  const key = body.idempotency_key;
  const requestFingerprint = fingerprint(body);
  const receipts = isRecord(farm[RECEIPTS_FIELD]) ? farm[RECEIPTS_FIELD] : {};
  const existing = receipts[key];
  if (existing !== undefined) {
    if (existing?.fingerprint !== requestFingerprint || !isRecord(existing.response))
      return errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
    const originalReceipt = resolveChefOriginalCookingReceipt(farm, key);
    if (originalReceipt && !reconcileOriginalCooking(farm, originalReceipt, options))
      return unavailable("The original recipe settlement could not be reconciled");
    return { status: 200, json: existing.response };
  }

  const current = currentResource(farm, now, options);
  if (!current) return unavailable("The kitchen could not be read");
  if (current.revision !== body.expected_kitchen_inventory_revision) {
    return errorResponse("state_conflict", "The kitchen inventory has changed", current.revision);
  }
  const requestedToolError = toolRequirementError(farm, body.method_id);
  if (requestedToolError) return errorResponse("cook_rejected", requestedToolError, current.revision);

  let working;
  try {
    working = structuredClone(farm);
  } catch {
    return unavailable("The kitchen cook could not be prepared");
  }

  let authorityResult;
  try {
    authorityResult = kitchenCook(working, body.items, now, {
      ...options,
      cookingReceiptId: key,
      cookingRequestFingerprint: requestFingerprint,
      ...(body.method_id
        ? { methodId: body.method_id, requireMethodId: true }
        : {}),
    });
  } catch {
    return unavailable("The kitchen cook could not be executed");
  }
  if (!authorityResult?.ok) {
    return errorResponse("cook_rejected", authorityResult?.error || "The kitchen cook was rejected", current.revision);
  }
  const recipeError = authorityRecipeError(working, authorityResult, body.method_id);
  if (recipeError) return errorResponse("cook_rejected", recipeError, current.revision);

  // The old Human route performs title settlement after kitchenCook and before
  // its single save; keep that same settlement boundary on the clone.
  try {
    checkTitles(working);
  } catch {
    return unavailable("The kitchen cook title settlement was invalid");
  }

  const cookOutcome = outcome(body, authorityResult);
  if (!cookOutcome) return unavailable("The kitchen cook returned an invalid result");
  const resource = currentResource(working, now, options);
  if (!resource) return unavailable("The kitchen resource could not be read");
  const response = {
    data: {
      result: {
        receipt_id: key,
        outcome: cookOutcome,
      },
      resource: resource.data,
    },
    kitchen_inventory_revision: resource.revision,
    server_time: resource.server_time,
  };

  working[RECEIPTS_FIELD] = {
    ...(isRecord(working[RECEIPTS_FIELD]) ? working[RECEIPTS_FIELD] : {}),
    [key]: { fingerprint: requestFingerprint, response },
  };
  try {
    replaceFarm(farm.id, working);
  } catch {
    return unavailable("The kitchen cook could not be saved");
  }
  if (authorityResult.cookingReceipt && !reconcileOriginalCooking(farm, authorityResult.cookingReceipt, options))
    return unavailable("The original recipe settlement could not be reconciled");
  return { status: 200, json: response };
}

export const handleHumanKitchenCook = handleHumanKitchenCookAction;
export const kitchenCookRevision = (farm, now = Date.now(), options = {}) =>
  currentResource(farm, now, options)?.revision ?? null;
export const kitchenCookActionRevision = kitchenCookRevision;
export { kitchenInventoryRevisionFromData } from "./kitchen-inventory-revision.js";
