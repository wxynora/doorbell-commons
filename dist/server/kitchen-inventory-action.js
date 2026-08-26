import { createHash } from "node:crypto";
import {
  kitchenSellMany,
  kitchenUse,
} from "../engine.js";
import { sellFishingCatchIds, sellFishingTreasure } from "../fishing.js";
import { replaceFarm } from "../store.js";
import { kitchenInventoryRevisionFromData } from "./kitchen-inventory-revision.js";
import { projectHumanKitchen } from "./kitchen-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const INVENTORY_REVISION_RE = /^kitchen-inventory-v1:[0-9a-f]{64}$/;
const RECEIPTS_FIELD = "doorbellHumanKitchenInventoryActionReceipts";
const COMMON_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_kitchen_inventory_revision",
  "action",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function validId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

function validCount(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function actionKeys(action) {
  switch (action) {
    case "use":
      return [...COMMON_KEYS, "dish_instance_id", "target"];
    case "recycle":
      return [...COMMON_KEYS, "item_kind", "item_instance_ids", "quantity"];
    case "stall":
      return [...COMMON_KEYS, "item_instance_ids", "quantity", "price"];
    case "sell_fish":
      return [...COMMON_KEYS, "catch_instance_ids", "quantity"];
    case "sell_treasure":
      return [...COMMON_KEYS, "treasure_item_id", "quantity"];
    default:
      return null;
  }
}

function validateBody(body) {
  if (!isRecord(body) || typeof body.action !== "string") return false;
  const expected = actionKeys(body.action);
  if (!expected || !exactKeys(body, expected)) return false;
  if (
    typeof body.farm_human_key !== "string" ||
    body.farm_human_key.trim().length === 0 ||
    typeof body.expected_farm_doorplate !== "string" ||
    !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) ||
    typeof body.idempotency_key !== "string" ||
    !UUID_RE.test(body.idempotency_key) ||
    typeof body.expected_kitchen_inventory_revision !== "string" ||
    !INVENTORY_REVISION_RE.test(body.expected_kitchen_inventory_revision)
  ) {
    return false;
  }

  switch (body.action) {
    case "use":
      return validId(body.dish_instance_id) && ["self", "cat", "dog"].includes(body.target);
    case "recycle":
      return (
        ["product", "dish"].includes(body.item_kind) &&
        Array.isArray(body.item_instance_ids) &&
        body.item_instance_ids.length > 0 &&
        body.item_instance_ids.every(validId) &&
        validCount(body.quantity) &&
        body.quantity <= body.item_instance_ids.length
      );
    case "stall":
      return (
        Array.isArray(body.item_instance_ids) &&
        body.item_instance_ids.length > 0 &&
        body.item_instance_ids.every(validId) &&
        validCount(body.quantity) &&
        body.quantity <= body.item_instance_ids.length &&
        validCount(body.price)
      );
    case "sell_fish":
      return (
        Array.isArray(body.catch_instance_ids) &&
        body.catch_instance_ids.length > 0 &&
        body.catch_instance_ids.every(validId) &&
        validCount(body.quantity) &&
        body.quantity <= body.catch_instance_ids.length
      );
    case "sell_treasure":
      return validId(body.treasure_item_id) && validCount(body.quantity);
    default:
      return false;
  }
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

function fingerprint(body) {
  const request = {};
  for (const key of actionKeys(body.action) ?? []) {
    if (key !== "idempotency_key") request[key] = body[key];
  }
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(request)), "utf8")
    .digest("hex");
}

export function kitchenInventoryRevision(farm, now = Date.now()) {
  return kitchenInventoryRevisionFromData(projectHumanKitchen(farm, now).data);
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit one valid kitchen inventory action",
      },
    },
  };
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_kitchen_inventory_revision = currentRevision;
  return { status: 409, json: { error } };
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

function rejected(message, currentRevision) {
  return errorResponse("action_rejected", message || "The kitchen inventory action was rejected", currentRevision);
}

function currentResource(farm, now) {
  try {
    const projected = projectHumanKitchen(farm, now);
    return {
      data: projected.data,
      revision: kitchenInventoryRevisionFromData(projected.data),
      server_time: projected.server_time,
    };
  } catch {
    return null;
  }
}

function actionOutcome(body, result) {
  if (!result || result.ok !== true) return null;
  switch (body.action) {
    case "use": {
      const dish = result.dish;
      if (!isRecord(dish) || dish.id !== body.dish_instance_id || typeof dish.name !== "string") return null;
      const outcome = {
        kind: "use",
        dish_instance_id: dish.id,
        dish_name: dish.name,
        target: body.target,
      };
      if (body.target === "self") {
        if (!isRecord(result.debuff) || typeof result.debuff.name !== "string" || !Number.isSafeInteger(result.debuff.until)) {
          return null;
        }
        outcome.debuff_name = result.debuff.name;
        outcome.ends_at = result.debuff.until;
      } else {
        if (!isRecord(result.buff) || !Number.isFinite(result.buff.bonus) || !Number.isSafeInteger(result.buff.endsAt)) {
          return null;
        }
        outcome.bonus = result.buff.bonus;
        outcome.ends_at = result.buff.endsAt;
      }
      return outcome;
    }
    case "recycle":
    case "stall": {
      if (typeof result.name !== "string" || !Number.isSafeInteger(result.qty) || result.qty < 1) return null;
      const outcome = {
        kind: body.action,
        item_kind: body.item_kind ?? null,
        name: result.name,
        quantity: result.qty,
      };
      if (body.action === "recycle") {
        if (!Number.isSafeInteger(result.value) || result.value < 0 || !Number.isSafeInteger(result.silver) || result.silver < 0) return null;
        outcome.value = result.value;
        outcome.silver = result.silver;
      } else {
        if (!Number.isSafeInteger(result.price) || result.price < 1) return null;
        outcome.price = result.price;
      }
      return outcome;
    }
    case "sell_fish":
      return typeof result.name === "string" && Number.isSafeInteger(result.qty) && result.qty > 0 && Number.isSafeInteger(result.silver) && result.silver >= 0
        ? { kind: "sell_fish", name: result.name, quantity: result.qty, silver: result.silver }
        : null;
    case "sell_treasure":
      return typeof result.name === "string" && Number.isSafeInteger(result.qty) && result.qty > 0 && Number.isSafeInteger(result.silver) && result.silver >= 0
        ? { kind: "sell_treasure", item_id: body.treasure_item_id, name: result.name, quantity: result.qty, silver: result.silver }
        : null;
    default:
      return null;
  }
}

function executeAuthority(working, body, now) {
  switch (body.action) {
    case "use":
      return kitchenUse(working, body.dish_instance_id, body.target, now);
    case "recycle":
      return kitchenSellMany(working, body.item_instance_ids, body.quantity, "system", undefined, now);
    case "stall":
      return kitchenSellMany(working, body.item_instance_ids, body.quantity, "market", body.price, now);
    case "sell_fish":
      return sellFishingCatchIds(working, body.catch_instance_ids, body.quantity);
    case "sell_treasure":
      return sellFishingTreasure(working, body.treasure_item_id, body.quantity);
    default:
      return { ok: false, error: "Unknown kitchen inventory action" };
  }
}

/**
 * Execute one Human kitchen inventory action against the existing authorities.
 * The clone, authority mutation, receipt and complete read projection are
 * committed together through one replaceFarm call; rejected/stale actions do
 * not touch the live farm or receipt ledger.
 */
export function handleHumanKitchenInventoryAction(farm, body, now = Date.now()) {
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
    return existing?.fingerprint === requestFingerprint && isRecord(existing.response)
      ? { status: 200, json: existing.response }
      : errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
  }

  const current = currentResource(farm, now);
  if (!current) return unavailable("The kitchen inventory could not be read");
  if (current.revision !== body.expected_kitchen_inventory_revision) {
    return errorResponse("state_conflict", "The kitchen inventory has changed", current.revision);
  }

  let working;
  try {
    working = structuredClone(farm);
  } catch {
    return unavailable("The kitchen inventory action could not be prepared");
  }

  let authorityResult;
  try {
    authorityResult = executeAuthority(working, body, now);
  } catch {
    return unavailable("The kitchen inventory action could not be executed");
  }
  if (!authorityResult?.ok) return rejected(authorityResult?.error, current.revision);

  const outcome = actionOutcome(body, authorityResult);
  if (!outcome) return unavailable("The kitchen inventory action returned an invalid result");
  const resource = currentResource(working, now);
  if (!resource) return unavailable("The kitchen inventory resource could not be read");
  const response = {
    data: {
      result: {
        receipt_id: key,
        action: body.action,
        outcome,
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
    return unavailable("The kitchen inventory action could not be saved");
  }
  return { status: 200, json: response };
}

export const handleHumanKitchenInventory = handleHumanKitchenInventoryAction;
export const kitchenInventoryActionRevision = kitchenInventoryRevision;
export { kitchenInventoryRevisionFromData } from "./kitchen-inventory-revision.js";
