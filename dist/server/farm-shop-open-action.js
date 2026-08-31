import { createHash } from "node:crypto";
import { refreshShop } from "../engine.js";
import { replaceFarm } from "../store.js";
import { projectHumanFarmCatalog } from "./farm-catalog-structured.js";
import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHOP_REVISION_RE = /^farm-catalog-v1:[0-9a-f]{64}$/;
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_shop_revision",
];
const RECEIPTS_FIELD = "doorbellHumanFarmShopOpenReceipts";

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
    (body.expected_shop_revision === null ||
      (typeof body.expected_shop_revision === "string" &&
        SHOP_REVISION_RE.test(body.expected_shop_revision)))
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

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit one valid farm shop open request",
      },
    },
  };
}

function errorResponse(code, message, status = 409, currentRevision) {
  const error = { code, message };
  if (currentRevision !== undefined) error.current_shop_revision = currentRevision;
  return { status, json: { error } };
}

function currentShop(farm, now) {
  const projected = projectHumanFarmCatalog(farm, now);
  const shop = projected.data.shop;
  return {
    revision: shop.status === "available" ? shop.revision : null,
    shop,
  };
}

function responseFor(farm, now, result) {
  const projected = projectHumanFarmCatalog(farm, now);
  const shop = projected.data.shop;
  return {
    data: { result, resource: shop },
    shop_revision: shop.status === "available" ? shop.revision : null,
    server_time: projected.server_time,
  };
}

/**
 * Bring the persisted field shop forward through the existing four-hour
 * authority. The catalog GET remains read-only; opening the shop is the only
 * write edge. A current shelf is returned unchanged and never consumes RNG.
 */
export function handleHumanFarmShopOpen(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  const receipts = isRecord(farm?.[RECEIPTS_FIELD]) ? farm[RECEIPTS_FIELD] : {};
  const requestFingerprint = fingerprint(body);
  const existing = receipts[body.idempotency_key];
  if (existing !== undefined) {
    if (existing?.fingerprint !== requestFingerprint) {
      return errorResponse(
        "idempotency_conflict",
        "This idempotency key was used for a different request",
      );
    }
    try {
      const response = replayMinimalHumanActionReceipt(
        existing,
        requestFingerprint,
        responseFor(farm, now, null),
      );
      return response
        ? { status: 200, json: response }
        : errorResponse(
            "idempotency_conflict",
            "This idempotency key was used for a different request",
          );
    } catch {
      return errorResponse("farm_unavailable", "The farm shop could not be read", 503);
    }
  }

  let before;
  try {
    before = currentShop(farm, now);
  } catch {
    return errorResponse("farm_unavailable", "The farm shop could not be read", 503);
  }
  if (before.revision !== body.expected_shop_revision) {
    return errorResponse(
      "state_conflict",
      "The farm shop has changed",
      409,
      before.revision,
    );
  }

  try {
    const working = structuredClone(farm);
    const beforeRefreshAt = Number(working.shop?.refreshAt);
    refreshShop(working, now);
    const projected = projectHumanFarmCatalog(working, now);
    const shop = projected.data.shop;
    if (shop.status !== "available") {
      return errorResponse("shop_unavailable", "The current farm shop is unavailable");
    }
    const refreshed = Number(working.shop?.refreshAt) !== beforeRefreshAt;
    const response = responseFor(working, now, {
      receipt_id: body.idempotency_key,
      refreshed,
    });

    working[RECEIPTS_FIELD] = {
      ...(isRecord(working[RECEIPTS_FIELD]) ? working[RECEIPTS_FIELD] : {}),
      [body.idempotency_key]: createMinimalHumanActionReceipt(requestFingerprint, response),
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return errorResponse("farm_unavailable", "The farm shop could not be refreshed", 503);
  }
}

export const openHumanFarmShop = handleHumanFarmShopOpen;
