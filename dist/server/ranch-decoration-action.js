import { createHash } from "node:crypto";
import { ranchPlaceDecoration, ranchUnplaceDecoration } from "../engine.js";
import { playerFarms, replaceFarm } from "../store.js";
import { projectHumanRanch } from "./ranch-structured.js";
import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

function responseFor(farm, now, result) {
  const resource = projectHumanRanch(farm, now, playerFarms());
  return {
    data: { result, resource: resource.data },
    revision: resource.revision,
    server_time: resource.server_time,
  };
}

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["place", "unplace"]);
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_revision",
  "action",
  "decoration_id",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function safeId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

function safeText(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    !/[<>]/u.test(value) &&
    !/(?:https?|javascript):/iu.test(value)
  );
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
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          farm_human_key: body.farm_human_key,
          expected_farm_doorplate: body.expected_farm_doorplate,
          expected_revision: body.expected_revision,
          action: body.action,
          decoration_id: body.decoration_id,
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
        message: "Submit one valid ranch decoration action",
      },
    },
  };
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: 409, json: { error } };
}

function validateBody(body) {
  return (
    exactKeys(body, REQUEST_KEYS) &&
    typeof body.farm_human_key === "string" &&
    body.farm_human_key.trim().length > 0 &&
    typeof body.expected_farm_doorplate === "string" &&
    FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
    typeof body.idempotency_key === "string" &&
    UUID_RE.test(body.idempotency_key) &&
    typeof body.expected_revision === "string" &&
    body.expected_revision.trim().length > 0 &&
    typeof body.action === "string" &&
    ACTIONS.has(body.action) &&
    safeId(body.decoration_id)
  );
}

function callAuthority(farm, action, decorationId) {
  return action === "place"
    ? ranchPlaceDecoration(farm, decorationId)
    : ranchUnplaceDecoration(farm, decorationId);
}

function actionOutcome(body, authorityResult) {
  if (!authorityResult?.ok || !safeText(authorityResult.name)) return null;
  return {
    kind: body.action,
    decoration_id: body.decoration_id,
    decoration_name: authorityResult.name,
  };
}

/**
 * Execute one Human action for an already-owned ranch decoration.
 *
 * The public target is the stable decoration id. Legacy ranch authorities
 * remain the only writers; this adapter adds revision checking, idempotent
 * receipts, a cloned execution and one atomic replaceFarm save. Coordinates,
 * prices and balances are deliberately not accepted from the client.
 */
export function handleHumanRanchDecorationAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  const receipts = isRecord(farm?.doorbellHumanRanchDecorationActionReceipts)
    ? farm.doorbellHumanRanchDecorationActionReceipts
    : {};
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
        : errorResponse("idempotency_conflict", "The stored action receipt is invalid");
    } catch {
      return {
        status: 503,
        json: { error: { code: "farm_unavailable", message: "The ranch could not be read" } },
      };
    }
  }

  let current;
  try {
    current = projectHumanRanch(farm, now, playerFarms());
  } catch {
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The ranch could not be read" } },
    };
  }
  if (current.revision !== body.expected_revision) {
    return errorResponse("state_conflict", "The ranch has changed", current.revision);
  }

  try {
    const working = structuredClone(farm);
    const authorityResult = callAuthority(working, body.action, body.decoration_id);
    if (!authorityResult?.ok) {
      return errorResponse(
        "action_rejected",
        authorityResult?.error || "The ranch decoration action was rejected",
      );
    }
    const outcome = actionOutcome(body, authorityResult);
    if (!outcome) {
      return {
        status: 503,
        json: { error: { code: "farm_unavailable", message: "The ranch action returned an invalid result" } },
      };
    }

    const response = responseFor(working, now, {
      receipt_id: key,
      action: body.action,
      decoration_id: body.decoration_id,
      outcome,
    });

    working.doorbellHumanRanchDecorationActionReceipts = {
      ...(isRecord(working.doorbellHumanRanchDecorationActionReceipts)
        ? working.doorbellHumanRanchDecorationActionReceipts
        : {}),
      [key]: createMinimalHumanActionReceipt(requestFingerprint, response),
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The ranch decoration action could not be saved" } },
    };
  }
}

export function ranchDecorationActionRevision(farm, now = Date.now()) {
  return projectHumanRanch(farm, now, playerFarms()).revision;
}

export const handleHumanRanchDecoration = handleHumanRanchDecorationAction;
