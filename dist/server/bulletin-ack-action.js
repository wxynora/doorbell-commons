import { createHash } from "node:crypto";
import { replaceFarm } from "../store.js";
import { projectHumanBulletin, projectHumanBulletinSource } from "./bulletin-structured.js";
import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_RE = /^farm-bulletin-v1:[0-9a-f]{64}$/;
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "expected_bulletin_revision",
  "idempotency_key",
];
const ACK_SCOPES = new Set(["system_notifications", "trail"]);

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
  if (!isRecord(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
  return sorted;
}

function fingerprint(body) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          farm_human_key: body.farm_human_key,
          expected_farm_doorplate: body.expected_farm_doorplate,
          expected_bulletin_revision: body.expected_bulletin_revision,
          ...(ackScope(body) === "trail" ? { acknowledge: "trail" } : {}),
        }),
      ),
      "utf8",
    )
    .digest("hex");
}

function ackScope(body) {
  return body.acknowledge ?? "system_notifications";
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit exactly the Human bulletin acknowledgement fields",
      },
    },
  };
}

function conflict(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: 409, json: { error } };
}

function validateBody(body) {
  return (
    (exactKeys(body, REQUEST_KEYS) || exactKeys(body, [...REQUEST_KEYS, "acknowledge"])) &&
    typeof body.farm_human_key === "string" &&
    body.farm_human_key.trim().length > 0 &&
    typeof body.expected_farm_doorplate === "string" &&
    FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
    typeof body.expected_bulletin_revision === "string" &&
    REVISION_RE.test(body.expected_bulletin_revision) &&
    typeof body.idempotency_key === "string" &&
    UUID_RE.test(body.idempotency_key) &&
    ACK_SCOPES.has(ackScope(body))
  );
}

function readState(farm) {
  const state = isRecord(farm?.doorbellHumanBulletinReadState)
    ? farm.doorbellHumanBulletinReadState
    : {};
  return {
    acknowledged_reminder_keys: Array.isArray(state.acknowledged_reminder_keys)
      ? [...state.acknowledged_reminder_keys]
      : [],
    trail_seen_event_id:
      typeof state.trail_seen_event_id === "string" && state.trail_seen_event_id.trim()
        ? state.trail_seen_event_id
        : null,
    receipts: isRecord(state.receipts) ? { ...state.receipts } : {},
  };
}

function sourceReminderKeys(source) {
  return Object.values(source.data.available)
    .flat()
    .map((entry) => entry.reminder_key);
}

function responseFor(farm, now, result) {
  const source = projectHumanBulletinSource(farm, now);
  const resource = projectHumanBulletin(farm, now);
  return {
    subject: source.subject,
    data: { result, resource: resource.data },
    revision: source.revision,
    server_time: source.server_time,
  };
}

/**
 * Mark the currently verified bulletin projection as read.  The source task,
 * plot, guestbook and ranch-notice arrays are never changed; only the Human
 * bulletin read state and its idempotency receipt are persisted.
 */
export function handleHumanBulletinAck(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();
  if (farm?.humanKey !== body.farm_human_key || farm?.id !== body.expected_farm_doorplate) {
    return {
      status: 403,
      json: {
        error: {
          code: "farm_credential_invalid",
          message: "The bulletin credential does not match the bound farm",
        },
      },
    };
  }

  const state = readState(farm);
  const requestFingerprint = fingerprint(body);
  const existing = state.receipts[body.idempotency_key];
  if (existing !== undefined) {
    if (existing?.fingerprint !== requestFingerprint) {
      return conflict(
        "idempotency_conflict",
        "This idempotency key was used for a different bulletin acknowledgement",
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
        : conflict("idempotency_conflict", "The stored bulletin receipt is invalid");
    } catch {
      return {
        status: 503,
        json: { error: { code: "farm_unavailable", message: "The farm bulletin could not be read" } },
      };
    }
  }

  let source;
  try {
    source = projectHumanBulletinSource(farm, now);
  } catch {
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The farm bulletin could not be read" } },
    };
  }
  if (source.revision !== body.expected_bulletin_revision) {
    return conflict("state_conflict", "The farm bulletin has changed", source.revision);
  }

  const working = structuredClone(farm);
  const nextState = readState(working);
  const scope = ackScope(body);
  let acknowledgedCount = 0;
  if (scope === "system_notifications") {
    nextState.acknowledged_reminder_keys = sourceReminderKeys(source);
    acknowledgedCount = nextState.acknowledged_reminder_keys.length;
  } else if (source.data.trail.status === "available") {
    nextState.trail_seen_event_id = source.data.trail.entries[0]?.event_id ?? null;
    acknowledgedCount = source.data.trail.entries.length > 0 ? 1 : 0;
  }
  working.doorbellHumanBulletinReadState = nextState;
  const response = responseFor(working, now, {
    receipt_id: body.idempotency_key,
    acknowledged_count: acknowledgedCount,
  });
  nextState.receipts[body.idempotency_key] = createMinimalHumanActionReceipt(
    requestFingerprint,
    response,
  );
  working.doorbellHumanBulletinReadState = nextState;

  try {
    replaceFarm(farm.id, working);
  } catch {
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The bulletin read state could not be saved" } },
    };
  }
  return { status: 200, json: response };
}

export const acknowledgeHumanBulletin = handleHumanBulletinAck;
