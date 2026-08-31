import { createHash } from "node:crypto";
import { craft } from "../engine.js";
import { replaceFarm } from "../store.js";
import { projectHumanFarmCatalog } from "./farm-catalog-structured.js";
import { smeltingActionRevision } from "./smelting-revision.js";
import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

export { smeltingActionRevision } from "./smelting-revision.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const MATERIAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_RE = /^farm-smelting-v1:[0-9a-f]{64}$/;
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "material_ids",
  "expected_smelting_revision",
  "idempotency_key",
];
const RECEIPTS_FIELD = "doorbellHumanSmeltingActionReceipts";

function responseFor(farm, now, result) {
  const projected = projectHumanFarmCatalog(farm, now);
  return {
    data: { result, resource: projected.data },
    revision: projected.revision,
    smelting_revision: smeltingActionRevision(farm),
    server_time: projected.server_time,
  };
}

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

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function validateBody(body) {
  return (
    exactKeys(body, REQUEST_KEYS) &&
    typeof body.farm_human_key === "string" &&
    body.farm_human_key.trim().length > 0 &&
    typeof body.expected_farm_doorplate === "string" &&
    FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
    Array.isArray(body.material_ids) &&
    body.material_ids.length === 3 &&
    body.material_ids.every((id) => typeof id === "string" && MATERIAL_ID_RE.test(id)) &&
    typeof body.expected_smelting_revision === "string" &&
    REVISION_RE.test(body.expected_smelting_revision) &&
    typeof body.idempotency_key === "string" &&
    UUID_RE.test(body.idempotency_key)
  );
}

function fingerprint(body) {
  return digest({
    farm_human_key: body.farm_human_key,
    expected_farm_doorplate: body.expected_farm_doorplate,
    material_ids: body.material_ids,
    expected_smelting_revision: body.expected_smelting_revision,
  });
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit exactly three material ids and the expected smelting revision",
      },
    },
  };
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: code === "farm_unavailable" ? 503 : 409, json: { error } };
}

function bindingError(farm, body) {
  if (farm?.humanKey !== body.farm_human_key) {
    return errorResponse("farm_credential_invalid", "The farm Human credential is invalid");
  }
  if (farm?.id !== body.expected_farm_doorplate) {
    return errorResponse(
      "farm_doorplate_mismatch",
      "The farm Human credential does not match the expected doorplate",
    );
  }
  return null;
}

/** Execute the existing Human `craft()` action without duplicating its rules. */
export function handleHumanSmeltingAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();
  const binding = bindingError(farm, body);
  if (binding) return binding;

  const receipts = isRecord(farm?.[RECEIPTS_FIELD]) ? farm[RECEIPTS_FIELD] : {};
  const key = body.idempotency_key;
  const requestFingerprint = fingerprint(body);
  const existing = receipts[key];
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
      return errorResponse("farm_unavailable", "The smelting inventory could not be read");
    }
  }

  let currentRevision;
  try {
    currentRevision = smeltingActionRevision(farm);
  } catch {
    return errorResponse("farm_unavailable", "The smelting inventory could not be read");
  }
  if (currentRevision !== body.expected_smelting_revision) {
    return errorResponse("state_conflict", "The smelting inventory has changed", currentRevision);
  }

  try {
    const working = structuredClone(farm);
    const authority = craft(working, body.material_ids, now);
    if (!authority?.ok) {
      return errorResponse("action_rejected", authority?.error || "The smelting action was rejected");
    }

    const response = responseFor(working, now, {
      receipt_id: key,
      material_ids: [...body.material_ids],
      crop_id: authority.cropId,
      crop_name: authority.cropName,
      rarity: authority.rarity,
      by_recipe: authority.byRecipe === true,
    });

    working[RECEIPTS_FIELD] = {
      ...(isRecord(working[RECEIPTS_FIELD]) ? working[RECEIPTS_FIELD] : {}),
      [key]: createMinimalHumanActionReceipt(requestFingerprint, response),
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return errorResponse("farm_unavailable", "The smelting action could not be saved");
  }
}

export const handleHumanSmelting = handleHumanSmeltingAction;
