import { createHash } from "node:crypto";
import { refreshKitchenIngredients } from "../engine.js";
import { replaceFarm } from "../store.js";
import { kitchenShopRevisionFromData, projectHumanKitchen } from "./kitchen-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHOP_REVISION_RE = /^kitchen-v1:[0-9a-f]{64}$/;
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_shop_revision",
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

function validateBody(body) {
  return (
    exactKeys(body, REQUEST_KEYS) &&
    typeof body.farm_human_key === "string" &&
    body.farm_human_key.trim() &&
    typeof body.expected_farm_doorplate === "string" &&
    FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
    typeof body.idempotency_key === "string" &&
    UUID_RE.test(body.idempotency_key) &&
    typeof body.expected_shop_revision === "string" &&
    SHOP_REVISION_RE.test(body.expected_shop_revision)
  );
}

function fingerprint(body) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          farm_human_key: body.farm_human_key,
          expected_farm_doorplate: body.expected_farm_doorplate,
          expected_shop_revision: body.expected_shop_revision,
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
        message: "Submit one valid kitchen ingredient refresh request",
      },
    },
  };
}

function errorResponse(code, message, status = 409, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_shop_revision = currentRevision;
  return { status, json: { error } };
}

function currentKitchenState(farm, now) {
  try {
    const projected = projectHumanKitchen(farm, now);
    return { projected, revision: projected.shop_revision };
  } catch {
    return null;
  }
}

function unavailableShop(projected) {
  const reason = projected?.data?.daily_shop?.reason;
  return reason === "stale_shop"
    ? errorResponse(
        "shop_unavailable",
        "The current kitchen shop is stale; read the current shop before refreshing",
      )
    : errorResponse(
        "farm_unavailable",
        "The current kitchen shop is unavailable",
        503,
      );
}

export const kitchenShopRefreshRevisionFromData = kitchenShopRevisionFromData;

export function kitchenShopRefreshRevision(farm, now = Date.now()) {
  return projectHumanKitchen(farm, now).shop_revision;
}

/** Execute one atomic Human refresh of the kitchen's rotating ingredients. */
export function handleHumanKitchenShopRefresh(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  const receipts = isRecord(farm?.doorbellHumanKitchenShopRefreshReceipts)
    ? farm.doorbellHumanKitchenShopRefreshReceipts
    : {};
  const requestFingerprint = fingerprint(body);
  const existing = receipts[body.idempotency_key];
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
    return errorResponse("farm_unavailable", "The kitchen could not be read", 503);
  }
  if (current.projected.data.daily_shop.status !== "available") {
    return unavailableShop(current.projected);
  }
  if (current.revision !== body.expected_shop_revision) {
    return errorResponse(
      "state_conflict",
      "The kitchen shop or state has changed",
      409,
      current.revision,
    );
  }

  try {
    const working = structuredClone(farm);
    if (!Number.isSafeInteger(working.coins) || working.coins < 0) {
      return errorResponse("farm_unavailable", "The farm coins balance is invalid", 503);
    }
    const authority = refreshKitchenIngredients(working, now);
    if (!authority?.ok) {
      const status = authority?.code === "farm_unavailable" ? 503 : 409;
      return errorResponse(
        authority?.code ?? "farm_unavailable",
        authority?.error ?? "The kitchen ingredient refresh was rejected",
        status,
      );
    }
    if (
      !Number.isSafeInteger(authority.cost) ||
      authority.cost < 0 ||
      !Number.isSafeInteger(authority.coins) ||
      authority.coins < 0 ||
      !Number.isSafeInteger(authority.refreshWindowId) ||
      !Number.isSafeInteger(authority.refreshCount) ||
      !Number.isSafeInteger(authority.refreshLimit) ||
      authority.refreshLimit < 1 ||
      !Number.isSafeInteger(authority.nextCostCoins) ||
      authority.nextCostCoins < 0 ||
      typeof authority.canRefresh !== "boolean" ||
      working.coins !== authority.coins
    ) {
      return errorResponse("farm_unavailable", "The kitchen refresh result was invalid", 503);
    }

    const projected = projectHumanKitchen(working, now);
    if (projected.data.daily_shop.status !== "available") {
      return errorResponse("farm_unavailable", "The refreshed kitchen shop is unavailable", 503);
    }
    const dailyShop = projected.data.daily_shop;
    if (
      dailyShop.refresh_window_id !== authority.refreshWindowId ||
      dailyShop.refresh_used_count !== authority.refreshCount ||
      dailyShop.refresh_limit !== authority.refreshLimit ||
      dailyShop.next_cost_coins !== authority.nextCostCoins ||
      dailyShop.can_refresh !== authority.canRefresh ||
      dailyShop.refresh_remaining_count !== authority.refreshLimit - authority.refreshCount
    ) {
      return errorResponse("farm_unavailable", "The kitchen refresh state was invalid", 503);
    }

    const response = {
      data: {
        result: {
          receipt_id: body.idempotency_key,
          cost_coins: authority.cost,
          coins_balance: authority.coins,
          refresh_window_id: dailyShop.refresh_window_id,
          refresh_used_count: dailyShop.refresh_used_count,
          refresh_remaining_count: dailyShop.refresh_remaining_count,
          refresh_limit: dailyShop.refresh_limit,
          next_cost_coins: dailyShop.next_cost_coins,
          can_refresh: dailyShop.can_refresh,
        },
        resource: projected.data,
      },
      shop_revision: projected.shop_revision,
      server_time: projected.server_time,
    };

    working.doorbellHumanKitchenShopRefreshReceipts = {
      ...(isRecord(working.doorbellHumanKitchenShopRefreshReceipts)
        ? working.doorbellHumanKitchenShopRefreshReceipts
        : {}),
      [body.idempotency_key]: { fingerprint: requestFingerprint, response },
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return errorResponse("farm_unavailable", "The kitchen ingredient refresh could not be saved", 503);
  }
}
