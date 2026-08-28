import { createHash } from "node:crypto";
import { kitchenBuy } from "../engine.js";
import { replaceFarm } from "../store.js";
import {
  kitchenShopRevisionFromData,
  PAID_KITCHEN_TOOLS,
  projectHumanKitchen,
} from "./kitchen-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHOP_REVISION_RE = /^kitchen-v1:[0-9a-f]{64}$/;
const PAID_KITCHEN_TOOL_BY_ID = new Map(
  PAID_KITCHEN_TOOLS.map((tool) => [tool.tool_id, tool]),
);
const PURCHASE_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_shop_revision",
  "items",
];
const ITEM_KEYS = ["kind", "item_id", "quantity"];

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

export function kitchenPurchaseRevision(farm, now = Date.now(), options = {}) {
  return projectHumanKitchen(farm, now, options).shop_revision;
}

function fingerprint(body) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          farm_human_key: body.farm_human_key,
          expected_farm_doorplate: body.expected_farm_doorplate,
          expected_shop_revision: body.expected_shop_revision,
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
        message: "Submit a non-empty kitchen purchase cart",
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
    !SHOP_REVISION_RE.test(body.expected_shop_revision) ||
    !Array.isArray(body.items) ||
    body.items.length < 1
  ) {
    return false;
  }
  const seen = new Set();
  for (const item of body.items) {
    if (!isRecord(item)) return false;
    const itemKeys = Object.keys(item);
    if (itemKeys.length !== ITEM_KEYS.length || !itemKeys.every((key) => ITEM_KEYS.includes(key))) {
      return false;
    }
    if (
      (item.kind !== "ingredient" && item.kind !== "recipe" && item.kind !== "tool") ||
      typeof item.item_id !== "string" ||
      !item.item_id.trim() ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      ((item.kind === "recipe" || item.kind === "tool") && item.quantity !== 1)
    ) {
      return false;
    }
    const itemKey = `${item.kind}:${item.item_id}`;
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
  }
  return true;
}

function buyKitchenTool(farm, toolId) {
  const tool = PAID_KITCHEN_TOOL_BY_ID.get(String(toolId));
  if (!tool) return { ok: false, error: "料理工具商店没有这个工具。" };

  const kitchen = farm?.ranch?.kitchen;
  if (!isRecord(kitchen)) {
    return { ok: false, error: "料理台状态无效。" };
  }
  const ownedTools = kitchen.ownedTools;
  if (ownedTools !== undefined && !Array.isArray(ownedTools)) {
    return { ok: false, error: "料理工具持有状态无效。" };
  }
  if (Array.isArray(ownedTools) && ownedTools.includes(tool.tool_id)) {
    return { ok: false, error: `已经拥有「${tool.name}」了。` };
  }
  if (farm.silver < tool.price_silver) {
    return {
      ok: false,
      error: `银币不足，购买「${tool.name}」需要 🪙${tool.price_silver}（你有 ${farm.silver}）。`,
    };
  }

  farm.silver -= tool.price_silver;
  kitchen.ownedTools = Array.isArray(ownedTools) ? [...ownedTools, tool.tool_id] : [tool.tool_id];
  return {
    ok: true,
    kind: "tool",
    name: tool.name,
    qty: 1,
    cost: tool.price_silver,
  };
}

function errorResponse(code, message) {
  return { status: 409, json: { error: { code, message } } };
}

function currentKitchenState(farm, now, options) {
  try {
    const projected = projectHumanKitchen(farm, now, options);
    return {
      projected,
      revision: projected.shop_revision,
    };
  } catch {
    return null;
  }
}

/**
 * Execute one Human kitchen purchase cart.  The old kitchenBuy remains the
 * source of ingredient/recipe prices, limits, shelf checks, silver debit and
 * inventory updates; the paid-tool catalog above is settled in the same clone.
 * This adapter supplies binding, optimistic concurrency, receipt idempotency
 * and one atomic replaceFarm save for the whole cart.
 */
export function handleHumanKitchenPurchase(farm, body, now = Date.now(), options = {}) {
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

  const current = currentKitchenState(farm, now, options);
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
    if (!Number.isSafeInteger(working.silver) || working.silver < 0) {
      return {
        status: 503,
        json: { error: { code: "farm_unavailable", message: "The farm silver balance is invalid" } },
      };
    }
    const resultItems = [];
    let totalPrice = 0;
    for (const item of body.items) {
      const purchase = item.kind === "tool"
        ? buyKitchenTool(working, item.item_id)
        : kitchenBuy(working, item.kind, item.item_id, item.quantity, now, options);
      if (!purchase.ok) return errorResponse("purchase_rejected", purchase.error);

      const quantity = purchase.qty ?? item.quantity;
      const totalPriceSilver = purchase.cost;
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        !Number.isSafeInteger(totalPriceSilver) ||
        totalPriceSilver < 0
      ) {
        return {
          status: 503,
          json: { error: { code: "farm_unavailable", message: "The kitchen purchase result was invalid" } },
        };
      }
      totalPrice += totalPriceSilver;
      if (!Number.isSafeInteger(totalPrice)) {
        return {
          status: 503,
          json: { error: { code: "farm_unavailable", message: "The kitchen purchase total was invalid" } },
        };
      }
      resultItems.push({
        kind: item.kind,
        item_id: item.item_id,
        quantity,
        total_price_silver: totalPriceSilver,
      });
    }

    const projected = projectHumanKitchen(working, now, options);
    if (projected.data.daily_shop.status !== "available") {
      return errorResponse("shop_unavailable", "The kitchen shop became unavailable");
    }
    const response = {
      data: {
        result: {
          receipt_id: body.idempotency_key,
          items: resultItems,
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
