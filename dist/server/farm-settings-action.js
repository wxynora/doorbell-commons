import { createHash } from "node:crypto";
import { dispatch } from "../game.js";
import { replaceFarm } from "../store.js";
import { equipTitle } from "../titles.js";
import { projectHumanFarmCatalog } from "./farm-catalog-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = new Set([
  "farm_name",
  "ai_name",
  "human_name",
  "welcome_message",
  "social.visit",
  "social.steal",
  "social.water",
  "social.message",
  "equip_title",
]);
const TEXT_FIELDS = new Set(["farm_name", "ai_name", "human_name", "welcome_message"]);
const SOCIAL_FIELDS = new Set(["social.visit", "social.steal", "social.water", "social.message"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
  return sorted;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

/**
 * Settings actions use the same complete catalog projection as the read
 * surface. The server_time field is deliberately excluded so a retry a few
 * milliseconds later sees the same revision for the same persisted state.
 */
export function farmSettingsActionRevision(farm, now = Date.now()) {
  return projectHumanFarmCatalog(farm, now).revision;
}

function fingerprint(body) {
  return digest({
    farm_human_key: body.farm_human_key,
    expected_farm_doorplate: body.expected_farm_doorplate,
    expected_catalog_revision: body.expected_catalog_revision,
    field: body.field,
    value: body.value,
  });
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: code === "farm_unavailable" ? 503 : 409, json: { error } };
}

function validateBody(body) {
  if (!isRecord(body)) return false;
  const keys = Object.keys(body);
  if (
    keys.length !== 6 ||
    !keys.every((key) => [
      "farm_human_key",
      "expected_farm_doorplate",
      "idempotency_key",
      "expected_catalog_revision",
      "field",
      "value",
    ].includes(key))
  ) return false;
  if (
    typeof body.farm_human_key !== "string" ||
    !body.farm_human_key.trim() ||
    typeof body.expected_farm_doorplate !== "string" ||
    !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) ||
    typeof body.idempotency_key !== "string" ||
    !UUID_RE.test(body.idempotency_key) ||
    typeof body.expected_catalog_revision !== "string" ||
    !body.expected_catalog_revision.trim() ||
    typeof body.field !== "string" ||
    !FIELDS.has(body.field)
  ) return false;
  if (TEXT_FIELDS.has(body.field)) return typeof body.value === "string" && body.value.length > 0;
  if (SOCIAL_FIELDS.has(body.field)) return typeof body.value === "boolean";
  return body.value === null || typeof body.value === "string";
}

function applySupportedAction(farm, body, now) {
  if (body.field === "farm_name") {
    return dispatch(farm, { action: "rename", name: body.value }, now);
  }
  if (body.field === "welcome_message") {
    return dispatch(farm, { action: "set-welcome", text: body.value }, now);
  }
  if (body.field === "equip_title") {
    return equipTitle(farm, body.value ?? "");
  }
  if (body.field === "ai_name" || body.field === "human_name") {
    return { ok: false, error: "该昵称字段当前没有农场权威写入动作" };
  }
  if (SOCIAL_FIELDS.has(body.field)) {
    return { ok: false, error: "该社交开关当前没有农场权威写入动作" };
  }
  return { ok: false, error: "该设置字段当前没有农场权威写入动作" };
}

/**
 * Execute one settings field against a clone. Existing game/title authorities
 * remain the only writers; unsupported fields are explicit rejects rather than
 * direct persistence edits. A successful action replaces the farm once and
 * stores its complete catalog response for exact idempotent replay.
 */
export function handleHumanFarmSettingsAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) {
    return { status: 400, json: { error: { code: "invalid_request", message: "Submit exactly one farm settings field" } } };
  }
  const receipts = isRecord(farm?.doorbellHumanFarmSettingsActionReceipts)
    ? farm.doorbellHumanFarmSettingsActionReceipts
    : {};
  const existing = receipts[body.idempotency_key];
  const requestFingerprint = fingerprint(body);
  if (existing !== undefined) {
    return existing?.fingerprint === requestFingerprint && isRecord(existing.response)
      ? { status: 200, json: existing.response }
      : errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
  }

  let currentRevision;
  try {
    currentRevision = farmSettingsActionRevision(farm, now);
  } catch {
    return errorResponse("farm_unavailable", "The farm settings could not be read");
  }
  if (currentRevision !== body.expected_catalog_revision) {
    return errorResponse("state_conflict", "The farm catalog has changed", currentRevision);
  }

  try {
    const working = structuredClone(farm);
    const action = applySupportedAction(working, body, now);
    if (!action?.ok) return errorResponse("action_rejected", action?.error || "The settings action was rejected");

    const projected = projectHumanFarmCatalog(working, now);
    const response = {
      data: {
        result: { receipt_id: body.idempotency_key, field: body.field },
        resource: projected.data,
      },
      revision: projected.revision,
      server_time: projected.server_time,
    };
    working.doorbellHumanFarmSettingsActionReceipts = {
      ...(isRecord(working.doorbellHumanFarmSettingsActionReceipts)
        ? working.doorbellHumanFarmSettingsActionReceipts
        : {}),
      [body.idempotency_key]: { fingerprint: requestFingerprint, response },
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return { status: 503, json: { error: { code: "farm_unavailable", message: "The farm settings could not be saved" } } };
  }
}

export const handleHumanFarmSettings = handleHumanFarmSettingsAction;
