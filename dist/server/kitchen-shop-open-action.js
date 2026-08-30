import { createHash } from "node:crypto";
import { refreshKitchenShop } from "../engine.js";
import { replaceFarm } from "../store.js";
import { projectHumanKitchen } from "./kitchen-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHOP_REVISION_RE = /^kitchen-v1:[0-9a-f]{64}$/;
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_shop_revision",
];
const RECEIPTS_FIELD = "doorbellHumanKitchenShopOpenReceipts";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
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
      JSON.stringify({
        expected_farm_doorplate: body.expected_farm_doorplate,
        expected_shop_revision: body.expected_shop_revision,
        farm_human_key: body.farm_human_key,
      }),
      "utf8",
    )
    .digest("hex");
}

function errorResponse(code, message, status = 409, currentRevision) {
  const error = { code, message };
  if (currentRevision !== undefined) error.current_shop_revision = currentRevision;
  return { status, json: { error } };
}

function currentKitchen(farm, now, options) {
  try {
    return projectHumanKitchen(farm, now, options);
  } catch {
    return null;
  }
}

/**
 * Open the persisted Human kitchen shelf through the existing free day-roll
 * authority. The strict kitchen GET remains read-only, and the paid ingredient
 * reroll remains a separate action.
 */
export function handleHumanKitchenShopOpen(farm, body, now = Date.now(), options = {}) {
  if (!validateBody(body)) {
    return errorResponse(
      "invalid_request",
      "Submit one valid kitchen shop open request",
      400,
    );
  }

  const receipts = isRecord(farm?.[RECEIPTS_FIELD]) ? farm[RECEIPTS_FIELD] : {};
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

  const before = currentKitchen(farm, now, options);
  if (!before) return errorResponse("farm_unavailable", "The kitchen could not be read", 503);
  if (before.shop_revision !== body.expected_shop_revision) {
    return errorResponse(
      "state_conflict",
      "The kitchen shop has changed",
      409,
      before.shop_revision,
    );
  }

  try {
    const working = structuredClone(farm);
    const beforeShop = JSON.stringify(working.ranch?.kitchen?.shop ?? null);
    const beforeCoins = working.coins;
    const beforeSilver = working.silver;
    refreshKitchenShop(working, now);
    if (working.coins !== beforeCoins || working.silver !== beforeSilver) {
      return errorResponse("farm_unavailable", "The kitchen day roll changed a balance", 503);
    }
    const projected = projectHumanKitchen(working, now, options);
    if (
      projected.data.daily_shop.status !== "available" ||
      projected.data.daily_shop.is_current_day !== true
    ) {
      return errorResponse("shop_unavailable", "The current kitchen shop is unavailable");
    }
    const response = {
      data: {
        result: {
          receipt_id: body.idempotency_key,
          refreshed: JSON.stringify(working.ranch?.kitchen?.shop ?? null) !== beforeShop,
        },
        resource: projected.data,
      },
      shop_revision: projected.shop_revision,
      server_time: projected.server_time,
    };
    working[RECEIPTS_FIELD] = {
      ...(isRecord(working[RECEIPTS_FIELD]) ? working[RECEIPTS_FIELD] : {}),
      [body.idempotency_key]: { fingerprint: requestFingerprint, response },
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return errorResponse("farm_unavailable", "The kitchen shop could not be opened", 503);
  }
}

export const openHumanKitchenShop = handleHumanKitchenShopOpen;
