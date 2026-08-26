import { createHash } from "node:crypto";
import { toggleStar } from "../engine.js";
import { getCrop } from "../content.js";
import { replaceFarm } from "../store.js";
import { projectHumanFarmCatalog } from "./farm-catalog-structured.js";
import { cropCodexActionRevision } from "./crop-codex-revision.js";

export { cropCodexActionRevision } from "./crop-codex-revision.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const CROP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_RE = /^farm-crop-codex-v1:[0-9a-f]{64}$/;
const ACTIONS = new Set(["star", "unstar"]);
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "crop_id",
  "action",
  "expected_codex_revision",
  "idempotency_key",
];
const RECEIPTS_FIELD = "doorbellHumanCropCodexActionReceipts";

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
    typeof body.crop_id === "string" &&
    CROP_ID_RE.test(body.crop_id) &&
    typeof body.action === "string" &&
    ACTIONS.has(body.action) &&
    typeof body.expected_codex_revision === "string" &&
    REVISION_RE.test(body.expected_codex_revision) &&
    typeof body.idempotency_key === "string" &&
    UUID_RE.test(body.idempotency_key)
  );
}

function fingerprint(body) {
  return digest({
    farm_human_key: body.farm_human_key,
    expected_farm_doorplate: body.expected_farm_doorplate,
    crop_id: body.crop_id,
    action: body.action,
    expected_codex_revision: body.expected_codex_revision,
  });
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit exactly one crop codex action and its expected revision",
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

function applyDesiredStar(working, body) {
  const desired = body.action === "star";
  const crop = getCrop(body.crop_id);
  if (!crop) return { ok: false, error: "The crop does not exist" };

  const starred = Array.isArray(working.starred) && working.starred.includes(body.crop_id);
  if (starred === desired) return { ok: true, on: starred };

  const authority = toggleStar(working, body.crop_id);
  if (!authority?.ok || authority.on !== desired) {
    return { ok: false, error: "The crop codex action was rejected" };
  }
  return authority;
}

/**
 * Execute one Human crop-codex star action.  `toggleStar` remains the only
 * writer for the persisted star list; this adapter owns only the binding,
 * clone, revision, receipt and one atomic farm replacement boundary.
 */
export function handleHumanCropCodexAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();
  const binding = bindingError(farm, body);
  if (binding) return binding;

  const receipts = isRecord(farm?.[RECEIPTS_FIELD]) ? farm[RECEIPTS_FIELD] : {};
  const key = body.idempotency_key;
  const requestFingerprint = fingerprint(body);
  const existing = receipts[key];
  if (existing !== undefined) {
    return existing?.fingerprint === requestFingerprint && isRecord(existing.response)
      ? { status: 200, json: existing.response }
      : errorResponse(
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
  }

  let currentRevision;
  try {
    currentRevision = cropCodexActionRevision(farm, now);
  } catch {
    return errorResponse("farm_unavailable", "The crop codex could not be read");
  }
  if (currentRevision !== body.expected_codex_revision) {
    return errorResponse("state_conflict", "The crop codex has changed", currentRevision);
  }

  try {
    const working = structuredClone(farm);
    const authority = applyDesiredStar(working, body);
    if (!authority?.ok) {
      return errorResponse("action_rejected", authority?.error || "The crop codex action was rejected");
    }

    const projected = projectHumanFarmCatalog(working, now);
    const response = {
      data: {
        result: {
          receipt_id: key,
          crop_id: body.crop_id,
          action: body.action,
          starred: authority.on === true,
        },
        resource: projected.data,
      },
      revision: projected.revision,
      codex_revision: cropCodexActionRevision(working, now),
      server_time: projected.server_time,
    };

    working[RECEIPTS_FIELD] = {
      ...(isRecord(working[RECEIPTS_FIELD]) ? working[RECEIPTS_FIELD] : {}),
      [key]: { fingerprint: requestFingerprint, response },
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return errorResponse("farm_unavailable", "The crop codex action could not be saved");
  }
}

export const handleHumanCropCodex = handleHumanCropCodexAction;
export const handleCropCodexAction = handleHumanCropCodexAction;
