import { createHash } from "node:crypto";
import {
  catchRanchRaid,
  dispatchRanchRaid,
  farmSendRanch,
  ranchRemit,
} from "../engine.js";
import { playerFarms, save } from "../store.js";
import { projectHumanRanch } from "./ranch-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["dispatch", "catch", "remit", "send"]);
const RECEIPTS_FIELD = "doorbellHumanRanchInteractionActionReceipts";
const COMMON_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_revision",
  "action",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function validId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

function validMoney(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function actionKeys(action) {
  switch (action) {
    case "dispatch":
      return [...COMMON_KEYS, "target_farm_doorplate", "animal_kind_id", "duration_hours"];
    case "catch":
      return [...COMMON_KEYS, "raid_id"];
    case "remit":
    case "send":
      return [...COMMON_KEYS, "amount"];
    default:
      return null;
  }
}

function validateBody(body) {
  if (!isRecord(body) || typeof body.action !== "string" || !ACTIONS.has(body.action)) return false;
  const expected = actionKeys(body.action);
  if (!expected || !exactKeys(body, expected)) return false;
  if (
    typeof body.farm_human_key !== "string" ||
    body.farm_human_key.trim().length === 0 ||
    typeof body.expected_farm_doorplate !== "string" ||
    !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) ||
    typeof body.idempotency_key !== "string" ||
    !UUID_RE.test(body.idempotency_key) ||
    typeof body.expected_revision !== "string" ||
    body.expected_revision.trim().length === 0
  ) {
    return false;
  }
  switch (body.action) {
    case "dispatch":
      return (
        typeof body.target_farm_doorplate === "string" &&
        FARM_DOORPLATE_RE.test(body.target_farm_doorplate) &&
        validId(body.animal_kind_id) &&
        Number.isSafeInteger(body.duration_hours) &&
        body.duration_hours > 0
      );
    case "catch":
      return validId(body.raid_id);
    case "remit":
    case "send":
      return validMoney(body.amount);
    default:
      return false;
  }
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
  const request = {};
  for (const key of actionKeys(body.action) ?? []) {
    if (key !== "idempotency_key") request[key] = body[key];
  }
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(request)), "utf8")
    .digest("hex");
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit one valid ranch interaction action",
      },
    },
  };
}

function errorResponse(code, message, currentRevision) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status: 409, json: { error } };
}

function credentialError() {
  return {
    status: 403,
    json: {
      error: {
        code: "farm_credential_invalid",
        message: "The ranch credential does not match the bound farm",
      },
    },
  };
}

function notFound(message = "The target farm was not found") {
  return { status: 404, json: { error: { code: "farm_not_found", message } } };
}

function unavailable(message) {
  return { status: 503, json: { error: { code: "farm_unavailable", message } } };
}

function actionResult(body, authorityResult, target) {
  if (!authorityResult?.ok) return null;
  switch (body.action) {
    case "dispatch": {
      const raid = authorityResult.raid;
      if (
        !isRecord(raid) ||
        !validId(raid.id) ||
        raid.targetFarmId !== target.id ||
        !Number.isSafeInteger(raid.reservedCoins) ||
        raid.reservedCoins < 0 ||
        !Number.isSafeInteger(raid.startedAt) ||
        !Number.isSafeInteger(raid.endsAt) ||
        typeof authorityResult.animal !== "string"
      ) {
        return null;
      }
      return {
        kind: "dispatch",
        raid_id: raid.id,
        animal_kind_id: body.animal_kind_id,
        animal_name: authorityResult.animal,
        target_farm_doorplate: target.id,
        reserved_coins: raid.reservedCoins,
        started_at: raid.startedAt,
        ends_at: raid.endsAt,
      };
    }
    case "catch":
      return (
        typeof authorityResult.owner === "string" &&
        typeof authorityResult.animal === "string" &&
        Number.isSafeInteger(authorityResult.compensation) &&
        authorityResult.compensation >= 0
      )
        ? {
            kind: "catch",
            raid_id: body.raid_id,
            owner: authorityResult.owner,
            animal_name: authorityResult.animal,
            compensation: authorityResult.compensation,
          }
        : null;
    case "remit":
      return Number.isSafeInteger(authorityResult.amount) &&
        authorityResult.amount > 0 &&
        Number.isSafeInteger(authorityResult.left) &&
        authorityResult.left >= 0
        ? {
            kind: "remit",
            amount: authorityResult.amount,
            ranch_coins_remaining: authorityResult.left,
          }
        : null;
    case "send":
      return Number.isSafeInteger(authorityResult.amount) &&
        authorityResult.amount > 0 &&
        Number.isSafeInteger(authorityResult.farmLeft) &&
        authorityResult.farmLeft >= 0 &&
        Number.isSafeInteger(authorityResult.ranchCoins) &&
        authorityResult.ranchCoins >= 0
        ? {
            kind: "send",
            amount: authorityResult.amount,
            farm_coins_remaining: authorityResult.farmLeft,
            ranch_coins: authorityResult.ranchCoins,
          }
        : null;
    default:
      return null;
  }
}

function setFarmState(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(source));
}

/**
 * Commit one or more already-cloned farm states with one world save.  The
 * store has no multi-farm replace primitive, so the in-memory references are
 * replaced together and restored from snapshots if the atomic world save
 * fails.  No authority is called against live farm objects.
 */
function commitFarmStates(entries) {
  const snapshots = entries.map(({ actual }) => ({ actual, snapshot: structuredClone(actual) }));
  try {
    for (const { actual, working } of entries) setFarmState(actual, working);
    save();
  } catch (error) {
    for (const { actual, snapshot } of snapshots) setFarmState(actual, snapshot);
    throw error;
  }
}

function storeReceipt(working, key, requestFingerprint, response) {
  working[RECEIPTS_FIELD] = {
    ...(isRecord(working[RECEIPTS_FIELD]) ? working[RECEIPTS_FIELD] : {}),
    [key]: { fingerprint: requestFingerprint, response },
  };
}

function targetFarmFor(body, farm) {
  return playerFarms().find((entry) => entry.id === body.target_farm_doorplate && entry.id !== farm.id);
}

function raidOwnerFor(raidId, target) {
  const owners = playerFarms().filter((entry) =>
    entry !== target &&
    (entry.ranch?.raids ?? []).some((raid) => raid?.id === raidId),
  );
  return owners.length === 1 ? owners[0] : owners.length === 0 ? null : undefined;
}

function currentResource(farm, now) {
  try {
    return projectHumanRanch(farm, now);
  } catch {
    return null;
  }
}

/**
 * Execute dispatch/catch/remit/send through the existing farm authorities.
 * Inputs are stable IDs and current ranch revision only; prices, probability,
 * compensation and balances remain exclusively engine-owned.
 */
export function handleHumanRanchInteractionAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();
  if (!farm) return notFound("The bound farm was not found");
  if (farm.humanKey !== body.farm_human_key || farm.id !== body.expected_farm_doorplate) {
    return credentialError();
  }

  const key = body.idempotency_key;
  const requestFingerprint = fingerprint(body);
  const receipts = isRecord(farm[RECEIPTS_FIELD]) ? farm[RECEIPTS_FIELD] : {};
  const existing = receipts[key];
  if (existing !== undefined) {
    return existing?.fingerprint === requestFingerprint && isRecord(existing.response)
      ? { status: 200, json: existing.response }
      : errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
  }

  const current = currentResource(farm, now);
  if (!current) return unavailable("The ranch could not be read");
  if (current.revision !== body.expected_revision) {
    return errorResponse("state_conflict", "The ranch has changed", current.revision);
  }

  let target = farm;
  let owner = farm;
  if (body.action === "dispatch") {
    target = targetFarmFor(body, farm);
    if (!target) return notFound();
  } else if (body.action === "catch") {
    owner = raidOwnerFor(body.raid_id, farm);
    if (owner === undefined) return errorResponse("action_rejected", "The raid owner is ambiguous", current.revision);
    if (!owner) return errorResponse("action_rejected", "This raid is no longer active", current.revision);
  }

  if (target !== farm && !currentResource(target, now)) {
    return unavailable("The target ranch could not be read");
  }
  if (owner !== farm && !currentResource(owner, now)) {
    return unavailable("The raid owner ranch could not be read");
  }

  let workingFarm;
  let workingTarget;
  let workingOwner;
  try {
    workingFarm = structuredClone(farm);
    workingTarget = target === farm ? workingFarm : structuredClone(target);
    workingOwner = owner === farm ? workingFarm : structuredClone(owner);
  } catch {
    return unavailable("The ranch interaction could not be prepared");
  }
  let authorityResult;
  try {
    switch (body.action) {
      case "dispatch": {
        const animalIndex = workingOwner.ranch?.animals?.findIndex(
          (animal) => animal?.kindId === body.animal_kind_id,
        );
        authorityResult = dispatchRanchRaid(
          workingOwner,
          workingTarget,
          animalIndex,
          body.duration_hours,
          now,
        );
        break;
      }
      case "catch":
        authorityResult = catchRanchRaid(workingTarget, [workingOwner], body.raid_id, now);
        break;
      case "remit":
        authorityResult = ranchRemit(workingFarm, body.amount, now);
        break;
      case "send":
        authorityResult = farmSendRanch(workingFarm, body.amount, now);
        break;
      default:
        return invalidRequest();
    }
  } catch {
    return unavailable("The ranch interaction could not be executed");
  }
  if (!authorityResult?.ok) {
    return errorResponse("action_rejected", authorityResult?.error || "The ranch interaction was rejected", current.revision);
  }

  const outcome = actionResult(body, authorityResult, target);
  if (!outcome) return unavailable("The ranch interaction returned an invalid result");

  const responseFarm = body.action === "catch" ? workingTarget : workingFarm;
  const resource = currentResource(responseFarm, now);
  if (!resource) return unavailable("The ranch interaction resource could not be read");
  const response = {
    data: {
      result: {
        receipt_id: key,
        action: body.action,
        outcome,
      },
      resource: resource.data,
    },
    revision: resource.revision,
    server_time: resource.server_time,
  };
  const receiptFarm = body.action === "dispatch" ? workingFarm : workingTarget;
  storeReceipt(receiptFarm, key, requestFingerprint, response);

  try {
    if (target === farm && owner === farm) {
      commitFarmStates([{ actual: farm, working: workingFarm }]);
    } else if (body.action === "dispatch") {
      commitFarmStates([
        { actual: farm, working: workingFarm },
        { actual: target, working: workingTarget },
      ]);
    } else {
      commitFarmStates([
        { actual: target, working: workingTarget },
        { actual: owner, working: workingOwner },
      ]);
    }
  } catch {
    return unavailable("The ranch interaction could not be saved");
  }
  return { status: 200, json: response };
}

export const handleHumanRanchInteraction = handleHumanRanchInteractionAction;

export function ranchInteractionActionRevision(farm, now = Date.now()) {
  const resource = currentResource(farm, now);
  if (!resource) throw new Error("The ranch could not be read");
  return resource.revision;
}
