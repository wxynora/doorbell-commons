import { createHash } from "node:crypto";
import {
  expChoose,
  expEnter,
  expExplore,
  expRetreat,
  expRoll,
  expSetCharm,
} from "../expedition.js";
import { replaceFarm } from "../store.js";
import { expeditionActionRevision } from "./expedition-revision.js";
import { projectHumanFarmCatalog } from "./farm-catalog-structured.js";
import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

export { expeditionActionRevision } from "./expedition-revision.js";

function responseFor(farm, now, result) {
  const resource = projectHumanFarmCatalog(farm, now);
  return {
    data: { result, resource: resource.data },
    revision: expeditionActionRevision(farm, now),
    server_time: resource.server_time,
  };
}

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_RE = /^farm-expedition-v1:[0-9a-f]{64}$/;
const ACTIONS = new Set(["enter", "explore", "roll", "choose", "charm", "retreat"]);
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_revision",
  "action",
  "payload",
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

function fingerprint(body) {
  return digest({
    farm_human_key: body.farm_human_key,
    expected_farm_doorplate: body.expected_farm_doorplate,
    expected_revision: body.expected_revision,
    action: body.action,
    payload: body.payload,
  });
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit one valid expedition action and its minimal target",
      },
    },
  };
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: code === "farm_unavailable" ? 503 : 409, json: { error } };
}

function validPayload(action, payload) {
  const expectedKeys = {
    enter: ["charges"],
    explore: ["charges"],
    roll: [],
    choose: ["option"],
    charm: ["kind", "blessing"],
    retreat: [],
  }[action];
  if (!expectedKeys || !exactKeys(payload, expectedKeys)) return false;
  if (action === "enter" || action === "explore") {
    return Number.isSafeInteger(payload.charges) && payload.charges > 0;
  }
  if (action === "choose") {
    return typeof payload.option === "string" && payload.option.trim().length > 0;
  }
  if (action === "charm") {
    return (
      (payload.kind === "check" || payload.kind === "hp") &&
      typeof payload.blessing === "string"
    );
  }
  return true;
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
    REVISION_RE.test(body.expected_revision) &&
    typeof body.action === "string" &&
    ACTIONS.has(body.action) &&
    validPayload(body.action, body.payload)
  );
}

function callAuthority(farm, body, now) {
  switch (body.action) {
    case "enter":
      return expEnter(farm, now, body.payload.charges);
    case "explore":
      return expExplore(farm, now, body.payload.charges);
    case "roll":
      return expRoll(farm, true, now);
    case "choose":
      return expChoose(farm, body.payload.option, now);
    case "charm":
      return expSetCharm(farm, body.payload.kind, body.payload.blessing, now);
    case "retreat":
      return expRetreat(farm, now);
    default:
      return { ok: false, text: "Unknown expedition action" };
  }
}

function actionOutcome(authorityResult) {
  if (authorityResult?.ok !== true || typeof authorityResult.text !== "string") return null;
  return { text: authorityResult.text };
}

/**
 * Execute one Human expedition action. The legacy expedition functions remain
 * the only gameplay authorities; this adapter supplies strict targets,
 * revision/idempotency, an isolated clone, a catalog resource, and one save.
 * In particular, entering remains random because expEnter chooses the map.
 */
export function handleHumanExpeditionAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  const receipts = isRecord(farm?.doorbellHumanExpeditionActionReceipts)
    ? farm.doorbellHumanExpeditionActionReceipts
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
        : errorResponse(
            "idempotency_conflict",
            "This idempotency key was used for a different request",
          );
    } catch {
      return errorResponse("farm_unavailable", "The expedition state could not be read");
    }
  }

  let currentRevision;
  try {
    currentRevision = expeditionActionRevision(farm, now);
  } catch {
    return errorResponse("farm_unavailable", "The expedition state could not be read");
  }
  if (currentRevision !== body.expected_revision) {
    return errorResponse("state_conflict", "The expedition state has changed", currentRevision);
  }

  try {
    const working = structuredClone(farm);
    const authorityResult = callAuthority(working, body, now);
    if (authorityResult?.ok !== true) {
      return errorResponse(
        "action_rejected",
        authorityResult?.text || "The expedition action was rejected",
      );
    }
    const outcome = actionOutcome(authorityResult);
    if (!outcome) {
      return errorResponse("farm_unavailable", "The expedition action returned an invalid result");
    }

    const response = responseFor(working, now, {
      receipt_id: key,
      action: body.action,
      outcome,
    });

    working.doorbellHumanExpeditionActionReceipts = {
      ...(isRecord(working.doorbellHumanExpeditionActionReceipts)
        ? working.doorbellHumanExpeditionActionReceipts
        : {}),
      [key]: createMinimalHumanActionReceipt(requestFingerprint, response),
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The expedition action could not be saved" } },
    };
  }
}

export const handleHumanExpedition = handleHumanExpeditionAction;
