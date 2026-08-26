import { createHash } from "node:crypto";
import { designCrop } from "../engine.js";
import { replaceFarm } from "../store.js";
import { dumpUgc, loadUgc } from "../ugc.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_RE = /^farm-original-plant-v1:[0-9a-f]{64}$/;
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_revision",
  "payload",
];
const DESIGN_KEYS = ["name", "latin", "desc", "plant", "harvest"];

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

/**
 * The original-plant write precondition covers every state that designCrop
 * can consume or mutate: farm coins, the complete seed map, designCount, and
 * the global UGC catalog. Receipt ledgers are intentionally excluded so a
 * replay does not make the original request stale.
 */
export function originalPlantActionRevision(farm, _now = Date.now()) {
  return `farm-original-plant-v1:${digest({
    schema: "farm-original-plant-v1",
    farm_doorplate: String(farm?.id ?? ""),
    coins: farm?.coins ?? null,
    seeds: farm?.seeds ?? null,
    design_count: farm?.designCount ?? 0,
    ugc: structuredClone(dumpUgc()),
  })}`;
}

function fingerprint(body) {
  return digest({
    farm_human_key: body.farm_human_key,
    expected_farm_doorplate: body.expected_farm_doorplate,
    expected_revision: body.expected_revision,
    payload: body.payload,
  });
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit exactly the five original plant design fields",
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
  if (
    !exactKeys(body, REQUEST_KEYS) ||
    typeof body.farm_human_key !== "string" ||
    body.farm_human_key.trim().length === 0 ||
    typeof body.expected_farm_doorplate !== "string" ||
    !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) ||
    typeof body.idempotency_key !== "string" ||
    !UUID_RE.test(body.idempotency_key) ||
    typeof body.expected_revision !== "string" ||
    !REVISION_RE.test(body.expected_revision) ||
    !exactKeys(body.payload, DESIGN_KEYS)
  ) {
    return false;
  }
  return DESIGN_KEYS.every((key) => typeof body.payload[key] === "string");
}

function validAuthorityResult(result, working) {
  return (
    result?.ok === true &&
    isRecord(result.crop) &&
    typeof result.crop.id === "string" &&
    result.crop.id.length > 0 &&
    typeof result.crop.name === "string" &&
    result.crop.name.length > 0 &&
    typeof result.crop.category === "string" &&
    typeof result.crop.rarity === "string" &&
    Number.isSafeInteger(result.fee) &&
    result.fee >= 0 &&
    Number.isSafeInteger(result.seeds) &&
    result.seeds > 0 &&
    Number.isSafeInteger(working?.coins) &&
    working.coins >= 0 &&
    Number.isSafeInteger(working?.designCount) &&
    working.designCount >= 0 &&
    isRecord(working?.seeds)
  );
}

/**
 * Execute one Human original-plant design.  designCrop remains the only
 * authority for validation, pricing, seed yield, rarity, growth rules, ID
 * generation and the global UGC limit.  This adapter only supplies binding,
 * revision/idempotency, an isolated clone, a strict receipt, and one atomic
 * replaceFarm commit.
 */
export function handleHumanOriginalPlantAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  const receipts = isRecord(farm?.doorbellHumanOriginalPlantActionReceipts)
    ? farm.doorbellHumanOriginalPlantActionReceipts
    : {};
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
    currentRevision = originalPlantActionRevision(farm, now);
  } catch {
    return errorResponse("farm_unavailable", "The original plant state could not be read");
  }
  if (currentRevision !== body.expected_revision) {
    return errorResponse("state_conflict", "The original plant state has changed", currentRevision);
  }

  let ugcSnapshot;
  try {
    ugcSnapshot = structuredClone(dumpUgc());
    const working = structuredClone(farm);
    const authorityResult = designCrop(working, {
      name: body.payload.name,
      latin: body.payload.latin,
      desc: body.payload.desc,
      plant: body.payload.plant,
      harvest: body.payload.harvest,
    });
    if (!authorityResult?.ok) {
      loadUgc(ugcSnapshot);
      return errorResponse(
        "action_rejected",
        authorityResult?.error || "The original plant design was rejected",
      );
    }
    if (!validAuthorityResult(authorityResult, working)) {
      loadUgc(ugcSnapshot);
      return errorResponse("farm_unavailable", "The original plant result was invalid");
    }

    const response = {
      data: {
        result: {
          receipt_id: key,
          crop: structuredClone(authorityResult.crop),
          fee: authorityResult.fee,
          seeds: authorityResult.seeds,
          coins_balance: working.coins,
        },
      },
      revision: originalPlantActionRevision(working, now),
      server_time: new Date(now).toISOString(),
    };
    working.doorbellHumanOriginalPlantActionReceipts = {
      ...(isRecord(working.doorbellHumanOriginalPlantActionReceipts)
        ? working.doorbellHumanOriginalPlantActionReceipts
        : {}),
      [key]: { fingerprint: requestFingerprint, response },
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    if (ugcSnapshot !== undefined) loadUgc(ugcSnapshot);
    return {
      status: 503,
      json: {
        error: {
          code: "farm_unavailable",
          message: "The original plant design could not be saved",
        },
      },
    };
  }
}

export const handleHumanOriginalPlant = handleHumanOriginalPlantAction;
