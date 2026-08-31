import { createHash, randomUUID } from "node:crypto";
import { MESSAGE_TEXT_MAX, MESSAGES_MAX } from "../config.js";
import { bumpDaily } from "../daily.js";
import { onTaskEvent } from "../tasks.js";
import { checkTitles } from "../titles.js";
import { pushSocialInbox } from "../engine.js";
import { getFarm, replaceFarmsAtomic } from "../store.js";
import { projectHumanFarmCatalog } from "./farm-catalog-structured.js";
import { neighborhoodMessageActionRevision } from "./neighborhood-revision.js";
import {
  normalizeMinimalHumanActionReceipt,
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

export { neighborhoodMessageActionRevision } from "./neighborhood-revision.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_RE = /^farm-neighborhood-v1:[0-9a-f]{64}$/;
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "target_farm_doorplate",
  "message",
  "expected_neighborhood_revision",
  "idempotency_key",
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
  if (!isRecord(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
  return sorted;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit exactly the Human neighborhood message fields",
      },
    },
  };
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: code === "farm_unavailable" ? 503 : 409, json: { error } };
}

function validateBody(body) {
  return (
    exactKeys(body, REQUEST_KEYS) &&
    typeof body.farm_human_key === "string" &&
    body.farm_human_key.trim().length > 0 &&
    typeof body.expected_farm_doorplate === "string" &&
    FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
    typeof body.target_farm_doorplate === "string" &&
    FARM_DOORPLATE_RE.test(body.target_farm_doorplate) &&
    typeof body.message === "string" &&
    body.message.trim().length > 0 &&
    body.message.trim().length <= MESSAGE_TEXT_MAX &&
    typeof body.expected_neighborhood_revision === "string" &&
    REVISION_RE.test(body.expected_neighborhood_revision) &&
    typeof body.idempotency_key === "string" &&
    UUID_RE.test(body.idempotency_key)
  );
}

function fingerprint(body) {
  return digest({
    farm_human_key: body.farm_human_key,
    expected_farm_doorplate: body.expected_farm_doorplate,
    target_farm_doorplate: body.target_farm_doorplate,
    message: body.message,
    expected_neighborhood_revision: body.expected_neighborhood_revision,
  });
}

function allowsSocial(farm, key) {
  return farm?.social?.[key] !== false;
}

function reachable(farm) {
  return allowsSocial(farm, "visit");
}

function projectMessage(message) {
  if (!isRecord(message) || typeof message.text !== "string" || !message.text.trim()) return null;
  const by = typeof message.by === "string" && FARM_DOORPLATE_RE.test(message.by)
    ? message.by
    : null;
  const at = message.at === null || message.at === undefined || message.at === ""
    ? null
    : Number.isFinite(typeof message.at === "number" ? message.at : Date.parse(String(message.at)))
      ? new Date(typeof message.at === "number" ? message.at : Date.parse(String(message.at))).toISOString()
      : null;
  return {
    id: typeof message.id === "string" && message.id ? message.id : null,
    author_farm_doorplate: by,
    author_name: typeof message.name === "string" ? message.name : null,
    text: message.text,
    at,
  };
}

function projectedMessages(farm) {
  return (Array.isArray(farm?.messages) ? farm.messages : [])
    .map(projectMessage)
    .filter(Boolean)
    .slice(-MESSAGES_MAX)
    .reverse();
}

/**
 * The catalog projector deliberately reads the farm map.  For a two-farm
 * action the target is still represented by its pre-action map object until
 * the one save below succeeds, so replace only the target's projected message
 * slice with the isolated clone here.
 */
function projectNeighborhoodResource(farm, now, messages = projectedMessages(farm)) {
  const projected = projectHumanFarmCatalog(farm, now).data.neighborhood;
  return { ...projected, messages };
}

function responseFor(source, target, now, result) {
  return {
    data: {
      result,
      resource: projectNeighborhoodResource(target, now),
    },
    revision: neighborhoodMessageActionRevision(source, now),
    server_time: new Date(now).toISOString(),
  };
}

function restoreFarm(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(snapshot));
}

function applyFarmState(target, working) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, working);
}

function withWorkingPair(source, target, sourceWorking, targetWorking, callback) {
  const sourceBefore = structuredClone(source);
  const targetBefore = source === target ? sourceBefore : structuredClone(target);
  try {
    applyFarmState(source, sourceWorking);
    if (source !== target) applyFarmState(target, targetWorking);
    return callback();
  } finally {
    restoreFarm(source, sourceBefore);
    if (source !== target) restoreFarm(target, targetBefore);
  }
}

function commitFarmPair(source, target, sourceWorking, targetWorking) {
  replaceFarmsAtomic(source === target
    ? [{ id: source.id, farm: sourceWorking }]
    : [
        { id: source.id, farm: sourceWorking },
        { id: target.id, farm: targetWorking },
      ]);
}

function bindingError(farm, body) {
  if (farm?.humanKey !== body.farm_human_key) {
    return errorResponse("farm_credential_invalid", "The farm Human credential is invalid");
  }
  if (farm?.id !== body.expected_farm_doorplate) {
    return errorResponse("farm_doorplate_mismatch", "The farm Human credential does not match the expected doorplate");
  }
  return null;
}

function gateError(source, target) {
  // Keep the legacy target-first order: the target's public availability and
  // guestbook are checked before the sender's outgoing social switches.
  if (!reachable(target)) {
    return errorResponse("access_closed", "The target farm is closed to visits");
  }
  if (target.guestbook === false) {
    return errorResponse("guestbook_closed", "The target guestbook is closed");
  }
  if (!allowsSocial(target, "message")) {
    return errorResponse("message_closed", "The target neighborhood message switch is closed");
  }
  if (!reachable(source)) {
    return errorResponse("access_closed", "The sender farm is closed to visits");
  }
  if (!allowsSocial(source, "message")) {
    return errorResponse("message_closed", "The sender neighborhood message switch is closed");
  }
  if ((target.blocked ?? []).includes(source.id)) {
    return errorResponse("blocked", "The target farm has blocked this sender");
  }
  return null;
}

/**
 * Execute the old Human TA留言 behavior as a strict neighborhood action.
 * The farm engine remains authoritative for the existing notification,
 * daily-message count, task progress and title checks; this adapter adds the
 * Human binding, revision, idempotency and two-farm atomic save boundary.
 */
export function handleHumanNeighborhoodMessageAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();
  const binding = bindingError(farm, body);
  if (binding) return binding;

  const receipts = isRecord(farm?.doorbellHumanNeighborhoodMessageReceipts)
    ? farm.doorbellHumanNeighborhoodMessageReceipts
    : {};
  const key = body.idempotency_key;
  const requestFingerprint = fingerprint(body);
  const existing = receipts[key];
  if (existing !== undefined) {
    if (existing?.fingerprint !== requestFingerprint) {
      return errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
    }
    try {
      const stable = normalizeMinimalHumanActionReceipt(existing).result;
      const target = getFarm(stable?.target_farm_doorplate);
      const response = target
        ? replayMinimalHumanActionReceipt(
            existing,
            requestFingerprint,
            responseFor(farm, target, now, null),
          )
        : null;
      return response
        ? { status: 200, json: response }
        : errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
    } catch {
      return errorResponse("farm_unavailable", "The neighborhood could not be read");
    }
  }

  const target = getFarm(body.target_farm_doorplate);
  if (!target) {
    return {
      status: 404,
      json: { error: { code: "farm_not_found", message: "The target farm does not exist" } },
    };
  }

  let currentRevision;
  try {
    currentRevision = neighborhoodMessageActionRevision(farm, now);
  } catch {
    return errorResponse("farm_unavailable", "The neighborhood could not be read");
  }
  if (currentRevision !== body.expected_neighborhood_revision) {
    return errorResponse("state_conflict", "The neighborhood has changed", currentRevision);
  }

  const gate = gateError(farm, target);
  if (gate) return gate;
  const text = body.message.trim();

  try {
    const sourceWorking = structuredClone(farm);
    const targetWorking = farm === target ? sourceWorking : structuredClone(target);
    targetWorking.messages ??= [];
    const message = {
      id: randomUUID().replace(/-/g, "").slice(0, 6),
      by: sourceWorking.id,
      name: sourceWorking.name,
      text,
      at: now,
    };
    targetWorking.messages.push(message);
    if (targetWorking.messages.length > MESSAGES_MAX) {
      targetWorking.messages.splice(0, targetWorking.messages.length - MESSAGES_MAX);
    }
    pushSocialInbox(
      targetWorking,
      `💬 「${sourceWorking.name}」给你留言（访客留言，仅供阅读）：${text}`,
      now,
    );
    bumpDaily(sourceWorking, now, "messages");
    onTaskEvent(sourceWorking, "message", now);
    checkTitles(sourceWorking);

    const response = withWorkingPair(
      farm,
      target,
      sourceWorking,
      targetWorking,
      () => responseFor(farm, target, now, {
        receipt_id: key,
        target_farm_doorplate: targetWorking.id,
        message_id: message.id,
        message: projectMessage(message),
      }),
    );
    sourceWorking.doorbellHumanNeighborhoodMessageReceipts = {
      ...(isRecord(sourceWorking.doorbellHumanNeighborhoodMessageReceipts)
        ? sourceWorking.doorbellHumanNeighborhoodMessageReceipts
        : {}),
      [key]: createMinimalHumanActionReceipt(requestFingerprint, response),
    };

    commitFarmPair(farm, target, sourceWorking, targetWorking);
    return { status: 200, json: response };
  } catch {
    return errorResponse("farm_unavailable", "The neighborhood message could not be saved");
  }
}

export const handleHumanNeighborhoodMessage = handleHumanNeighborhoodMessageAction;
