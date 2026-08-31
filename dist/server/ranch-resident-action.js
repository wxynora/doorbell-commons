import { createHash } from "node:crypto";
import {
  animalById,
  petById,
} from "../content.js";
import {
  ranchFeedAnimal,
  ranchNameAnimal,
  ranchNamePatrolGoose,
  ranchNamePet,
  ranchTakeOffAccessory,
  ranchTogglePin,
  ranchUpgradeAnimal,
  ranchWearAccessory,
} from "../engine.js";
import { setGlimmerVariant } from "../glimmer.js";
import { replaceFarm } from "../store.js";
import { projectHumanRanch } from "./ranch-structured.js";
import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

function responseFor(farm, now, result) {
  const resource = projectHumanRanch(farm, now);
  return {
    data: { result, resource: resource.data },
    revision: resource.revision,
    server_time: resource.server_time,
  };
}

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESIDENT_TYPES = new Set(["animal", "pet", "patrol_goose"]);
const ACTIONS = new Set([
  "feed",
  "upgrade",
  "rename",
  "toggle_pin",
  "wear_accessory",
  "takeoff_accessory",
  "set_variant",
]);
const ACTION_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_revision",
  "action",
  "resident_type",
  "kind_id",
  "payload",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function safeRename(value) {
  return safeText(value) && value.trim().length <= 12;
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function validateBody(body) {
  if (!exactKeys(body, ACTION_KEYS)) return false;
  if (
    typeof body.farm_human_key !== "string" ||
    !body.farm_human_key.trim() ||
    typeof body.expected_farm_doorplate !== "string" ||
    !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) ||
    typeof body.idempotency_key !== "string" ||
    !UUID_RE.test(body.idempotency_key) ||
    typeof body.expected_revision !== "string" ||
    !body.expected_revision.trim() ||
    typeof body.action !== "string" ||
    !ACTIONS.has(body.action) ||
    typeof body.resident_type !== "string" ||
    !RESIDENT_TYPES.has(body.resident_type) ||
    !safeId(body.kind_id) ||
    !isRecord(body.payload)
  ) {
    return false;
  }
  if (
    (body.resident_type === "patrol_goose" && body.kind_id !== "patrol_goose") ||
    (body.resident_type !== "patrol_goose" && body.kind_id === "patrol_goose") ||
    ((body.action === "feed" || body.action === "upgrade") && body.resident_type !== "animal")
  ) {
    return false;
  }

  const payloadKeys = Object.keys(body.payload);
  const expectedPayloadKeys =
    body.action === "rename"
      ? ["name"]
      : body.action === "wear_accessory" || body.action === "takeoff_accessory"
        ? ["accessory_id"]
        : body.action === "set_variant"
          ? ["variant_id"]
          : [];
  if (
    payloadKeys.length !== expectedPayloadKeys.length ||
    !expectedPayloadKeys.every((key) => payloadKeys.includes(key))
  ) {
    return false;
  }
  if (body.action === "rename" && !safeRename(body.payload.name)) return false;
  if (
    (body.action === "wear_accessory" || body.action === "takeoff_accessory") &&
    !safeId(body.payload.accessory_id)
  ) {
    return false;
  }
  if (body.action === "set_variant" && !safeId(body.payload.variant_id)) return false;
  return true;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
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
          resident_type: body.resident_type,
          kind_id: body.kind_id,
          payload: body.payload,
        }),
      ),
      "utf8",
    )
    .digest("hex");
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: 409, json: { error } };
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit one valid ranch resident action",
      },
    },
  };
}

function residentRef(farm, residentType, kindId) {
  const ranch = farm?.ranch;
  if (!isRecord(ranch)) return null;
  if (residentType === "patrol_goose") {
    return kindId === "patrol_goose" && isRecord(ranch.patrolGoose)
      ? { target: "goose", index: null }
      : null;
  }
  const list = residentType === "animal" ? ranch.animals : ranch.pets;
  if (!Array.isArray(list)) return null;
  const matches = list.reduce((indices, resident, index) => {
    if (isRecord(resident) && resident.kindId === kindId) indices.push(index);
    return indices;
  }, []);
  return matches.length === 1 ? { target: residentType, index: matches[0] } : null;
}

function knownResidentTarget(farm, residentType, kindId, ref) {
  if (!ref) return false;
  if (residentType === "patrol_goose") return kindId === "patrol_goose";
  const definition = residentType === "animal" ? animalById.get(kindId) : petById.get(kindId);
  const resident = farm?.ranch?.[residentType === "animal" ? "animals" : "pets"]?.[ref.index];
  return !!definition && isRecord(resident) && resident.kindId === kindId;
}

function projectedResident(current, residentType, ref) {
  if (residentType === "patrol_goose") return current?.data?.residents?.patrol_goose ?? null;
  const list = current?.data?.residents?.[residentType === "animal" ? "animals" : "pets"];
  return Array.isArray(list) ? list[ref.index] ?? null : null;
}

function actionOutcome(body, authorityResult, working) {
  if (body.action === "feed") {
    if (
      !Number.isSafeInteger(authorityResult?.cost) ||
      authorityResult.cost < 0 ||
      typeof authorityResult.bonus !== "number" ||
      !Number.isFinite(authorityResult.bonus) ||
      !Number.isSafeInteger(authorityResult.left) ||
      authorityResult.left < 0 ||
      !Number.isSafeInteger(working?.silver) ||
      working.silver < 0
    ) return null;
    return {
      kind: "feed",
      cost_silver: authorityResult.cost,
      bonus_rate: authorityResult.bonus,
      remaining_today: authorityResult.left,
      silver_balance: working.silver,
    };
  }
  if (body.action === "upgrade") {
    if (
      !Number.isSafeInteger(authorityResult?.level) ||
      authorityResult.level < 1 ||
      !Number.isSafeInteger(authorityResult?.cost) ||
      authorityResult.cost < 0 ||
      !Number.isSafeInteger(working?.ranch?.coins) ||
      working.ranch.coins < 0
    ) return null;
    return {
      kind: "upgrade",
      level: authorityResult.level,
      cost_ranch_coins: authorityResult.cost,
      ranch_coin_balance: working.ranch.coins,
    };
  }
  if (body.action === "rename") {
    return safeRename(authorityResult?.name)
      ? { kind: "rename", name: authorityResult.name.trim() }
      : null;
  }
  if (body.action === "toggle_pin") {
    return typeof authorityResult?.pinned === "boolean"
      ? { kind: "toggle_pin", pinned: authorityResult.pinned }
      : null;
  }
  if (body.action === "wear_accessory" || body.action === "takeoff_accessory") {
    return safeText(authorityResult?.name) && safeText(authorityResult?.wearer)
      ? {
          kind: body.action,
          accessory_id: body.payload.accessory_id,
          accessory_name: authorityResult.name,
          wearer_name: authorityResult.wearer,
        }
      : null;
  }
  if (body.action === "set_variant") {
    return safeId(body.payload.variant_id) && safeText(authorityResult?.name)
      ? {
          kind: "set_variant",
          variant_id: body.payload.variant_id,
          variant_name: authorityResult.name,
        }
      : null;
  }
  return null;
}

function callAuthority(farm, body, ref, now) {
  const { action, resident_type: residentType, kind_id: kindId, payload } = body;
  if (action === "feed") return ranchFeedAnimal(farm, ref.index, now);
  if (action === "upgrade") return ranchUpgradeAnimal(farm, ref.index);
  if (action === "rename") {
    if (residentType === "animal") return ranchNameAnimal(farm, ref.index, payload.name);
    if (residentType === "pet") return ranchNamePet(farm, ref.index, payload.name);
    return ranchNamePatrolGoose(farm, payload.name);
  }
  if (action === "toggle_pin") return ranchTogglePin(farm, kindId);
  if (action === "wear_accessory") {
    return ranchWearAccessory(farm, ref.target, ref.index, payload.accessory_id);
  }
  if (action === "takeoff_accessory") {
    return ranchTakeOffAccessory(farm, ref.target, ref.index, payload.accessory_id);
  }
  return setGlimmerVariant(
    farm,
    residentType === "patrol_goose" ? "goose" : residentType,
    kindId,
    payload.variant_id,
  );
}

/**
 * Execute one Human action from a concrete ranch resident detail view.
 *
 * The stable public target is resident_type + kind_id.  Legacy Human engine
 * functions still take array indices for animals and pets, so the current
 * cloned arrays are resolved immediately before calling those authorities.
 * No time advancement, shop refresh, raid settlement, or global ranch action
 * is performed here.
 */
export function handleHumanRanchResidentAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  const receipts = isRecord(farm?.doorbellHumanRanchResidentActionReceipts)
    ? farm.doorbellHumanRanchResidentActionReceipts
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
    current = projectHumanRanch(farm, now);
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
    const ref = residentRef(working, body.resident_type, body.kind_id);
    if (!knownResidentTarget(working, body.resident_type, body.kind_id, ref)) {
      return errorResponse("action_rejected", "The selected ranch resident does not exist");
    }
    const projected = projectedResident(current, body.resident_type, ref);
    if (!projected || projected.status !== "known") {
      return errorResponse("action_rejected", "The selected ranch resident is unavailable");
    }
    if (
      body.action === "set_variant" &&
      (!projected.variants.available_variant_ids.includes(body.payload.variant_id) ||
        projected.variants.available_variant_ids.length <= 1)
    ) {
      return errorResponse("action_rejected", "This resident has no selectable alternate appearance");
    }

    const result = callAuthority(working, body, ref, now);
    if (!result?.ok) {
      return errorResponse("action_rejected", result?.error || "The ranch action was rejected");
    }

    const outcome = actionOutcome(body, result, working);
    if (!outcome) {
      return errorResponse("action_rejected", "The ranch action returned an unusable result");
    }
    const response = responseFor(working, now, {
      receipt_id: key,
      action: body.action,
      resident_type: body.resident_type,
      kind_id: body.kind_id,
      outcome,
    });

    working.doorbellHumanRanchResidentActionReceipts = {
      ...(isRecord(working.doorbellHumanRanchResidentActionReceipts)
        ? working.doorbellHumanRanchResidentActionReceipts
        : {}),
      [key]: createMinimalHumanActionReceipt(requestFingerprint, response),
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    // The original farm is untouched until replaceFarm.  Its own save failure
    // also restores the old map entry, so no partial authority result leaks.
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The ranch action could not be saved" } },
    };
  }
}

export function ranchResidentActionRevision(farm, now = Date.now()) {
  return projectHumanRanch(farm, now).revision;
}
