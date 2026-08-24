import { createHash } from "node:crypto";
import { kitchenBuy } from "../engine.js";
import { replaceFarm } from "../store.js";
import { kitchenShopRevisionFromData, projectHumanKitchen } from "./kitchen-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURCHASE_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_shop_revision",
  "kind",
  "item_id",
  "quantity",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export const kitchenPurchaseRevisionFromData = kitchenShopRevisionFromData;

export function kitchenPurchaseRevision(farm, now = Date.now()) {
  return projectHumanKitchen(farm, now).shop_revision;
}

function fingerprint(body) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          farm_human_key: body.farm_human_key,
          expected_farm_doorplate: body.expected_farm_doorplate,
          expected_shop_revision: body.expected_shop_revision,
          kind: body.kind,
          item_id: body.item_id,
          quantity: body.quantity,
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
        message: "Submit exactly one ingredient or recipe purchase",
      },
    },
  };
}

function conflict(message, currentRevision) {
  return {
    status: 409,
    json: {
      error: {
        code: "state_conflict",
        message,
        current_shop_revision: currentRevision,
      },
    },
  };
}

function validateBody(body) {
  if (!isRecord(body)) return false;
  const keys = Object.keys(body);
  if (keys.length !== PURCHASE_KEYS.length || !keys.every((key) => PURCHASE_KEYS.includes(key))) {
    return false;
  }
  if (
    typeof body.farm_human_key !== "string" ||
    !body.farm_human_key.trim() ||
    typeof body.expected_farm_doorplate !== "string" ||
    !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) ||
    typeof body.idempotency_key !== "string" ||
    !UUID_RE.test(body.idempotency_key) ||
    typeof body.expected_shop_revision !== "string" ||
    !body.expected_shop_revision.trim() ||
    (body.kind !== "ingredient" && body.kind !== "recipe") ||
    typeof body.item_id !== "string" ||
    !body.item_id.trim() ||
    !Number.isSafeInteger(body.quantity) ||
    body.quantity < 1
  ) {
    return false;
  }
  return body.kind !== "recipe" || body.quantity === 1;
}

function errorResponse(code, message) {
  return { status: 409, json: { error: { code, message } } };
}

function currentKitchenState(farm, now) {
  try {
    const projected = projectHumanKitchen(farm, now);
    return {
      projected,
      revision: projected.shop_revision,
    };
  } catch {
    return null;
  }
}

/**
 * Execute exactly one Human kitchen purchase.  Batch and partial-success
 * semantics are intentionally absent until the product contract decides them.
 * The old kitchenBuy remains the only source of prices, limits, shelf checks,
 * silver debit and inventory updates; this adapter only supplies binding,
 * optimistic concurrency, receipt idempotency and one atomic replaceFarm save.
 */
export function handleHumanKitchenPurchase(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  const receipts = isRecord(farm?.doorbellHumanKitchenPurchaseReceipts)
    ? farm.doorbellHumanKitchenPurchaseReceipts
    : {};
  const existing = receipts[body.idempotency_key];
  const requestFingerprint = fingerprint(body);
  if (existing !== undefined) {
    return existing?.fingerprint === requestFingerprint && isRecord(existing.response)
      ? { status: 200, json: existing.response }
      : errorResponse(
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
  }

  const current = currentKitchenState(farm, now);
  if (!current) {
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The kitchen could not be read" } },
    };
  }
  if (current.projected.data.daily_shop.status !== "available") {
    return errorResponse(
      "shop_unavailable",
      "The current kitchen shop is unavailable; read the current shop before purchasing",
    );
  }
  if (current.revision !== body.expected_shop_revision) {
    return conflict("The kitchen shop or state has changed", current.revision);
  }

  try {
    // Work on a clone so authority rejection, malformed legacy state, and a
    // failed save cannot leak a partial silver/inventory/shop mutation.
    const working = structuredClone(farm);
    const purchase = kitchenBuy(working, body.kind, body.item_id, body.quantity, now);
    if (!purchase.ok) return errorResponse("purchase_rejected", purchase.error);

    const projected = projectHumanKitchen(working, now);
    if (projected.data.daily_shop.status !== "available") {
      return errorResponse("shop_unavailable", "The kitchen shop became unavailable");
    }
    const quantity = purchase.qty ?? 1;
    const totalPrice = purchase.cost;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(totalPrice) || totalPrice < 0) {
      return {
        status: 503,
        json: { error: { code: "farm_unavailable", message: "The kitchen purchase result was invalid" } },
      };
    }
    const response = {
      data: {
        result: {
          receipt_id: body.idempotency_key,
          kind: body.kind,
          item_id: body.item_id,
          quantity,
          total_price_silver: totalPrice,
          silver_balance: working.silver,
        },
        resource: projected.data,
      },
      shop_revision: projected.shop_revision,
      server_time: projected.server_time,
    };

    working.doorbellHumanKitchenPurchaseReceipts = {
      ...(isRecord(working.doorbellHumanKitchenPurchaseReceipts)
        ? working.doorbellHumanKitchenPurchaseReceipts
        : {}),
      [body.idempotency_key]: { fingerprint: requestFingerprint, response },
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The kitchen purchase could not be saved" } },
    };
  }
}
