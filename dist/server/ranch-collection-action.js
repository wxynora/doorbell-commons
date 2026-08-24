import { createHash } from "node:crypto";
import { ranchCollect } from "../engine.js";
import { playerFarms, replaceFarm } from "../store.js";
import { projectHumanRanch } from "./ranch-structured.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEYS = [
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
  "expected_revision",
];
const DESTINATIONS = {
  KITCHEN: "kitchen",
  RANCH_COINS: "ranch_coins",
  DEBT: "debt",
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
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
    body.expected_revision.trim().length > 0
  );
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
        message: "Submit only the expected ranch revision and a UUID idempotency key",
      },
    },
  };
}

function validItemId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function validName(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validInstanceId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function pushItem(items, item) {
  if (
    !validItemId(item.item_id) ||
    !validName(item.name) ||
    !Number.isSafeInteger(item.quantity) ||
    item.quantity <= 0 ||
    (item.unit_value !== null &&
      (!Number.isSafeInteger(item.unit_value) || item.unit_value < 0))
  ) {
    throw new Error("The ranch collection result contained an invalid item");
  }
  items.push({
    instance_id: validInstanceId(item.instance_id) ? item.instance_id : null,
    item_id: item.item_id,
    name: item.name,
    quantity: item.quantity,
    unit_value: item.unit_value,
    destination: item.destination,
  });
}

function collectionItems(before, working, authorityResult, beforeProductIds) {
  const items = [];
  const recycled = Array.isArray(authorityResult.autoRecycled)
    ? authorityResult.autoRecycled
    : [];
  for (const item of recycled) {
    pushItem(items, {
      instance_id: item?.id,
      item_id: item?.itemId,
      name: item?.name,
      quantity: 1,
      unit_value: item?.value ?? null,
      destination: DESTINATIONS.DEBT,
    });
  }

  // The authority appends newly stored products to the clone.  Use the
  // pre-action snapshot to retain each real instance id and locked value.
  const storedProducts = Array.isArray(working?.ranch?.kitchen?.products)
    ? working.ranch.kitchen.products.filter(
        (item) => !beforeProductIds.has(item?.id),
      )
    : [];
  for (const item of storedProducts) {
    pushItem(items, {
      instance_id: item?.id,
      item_id: item?.itemId,
      name: item?.name,
      quantity: 1,
      unit_value: item?.value ?? null,
      destination: DESTINATIONS.KITCHEN,
    });
  }

  const nonCookableDetail = isRecord(authorityResult.nonCookableDetail)
    ? authorityResult.nonCookableDetail
    : {};
  const entries = Array.isArray(before?.collectable?.entries) ? before.collectable.entries : [];
  for (const entry of entries) {
    const quantity = nonCookableDetail[entry.name];
    if (!Number.isSafeInteger(quantity) || quantity <= 0) continue;
    pushItem(items, {
      instance_id: null,
      item_id: entry.item_id,
      name: entry.name,
      quantity,
      // Non-cookable output is only returned by the authority as an aggregate
      // coin delta; do not reconstruct a possibly boosted per-unit value.
      unit_value: null,
      destination: DESTINATIONS.RANCH_COINS,
    });
  }
  return items;
}

function detail(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const [name, count] of Object.entries(value)) {
    if (typeof name !== "string" || !name.trim()) throw new Error("Invalid ranch detail name");
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error("Invalid ranch detail quantity");
    }
    result[name] = count;
  }
  return result;
}

function resultFor(before, working, authorityResult, key, beforeProductIds) {
  if (!authorityResult || authorityResult.ok !== true) return null;
  const gross = authorityResult.gross;
  const gain = authorityResult.gain;
  const debtPaid = authorityResult.debtPaid;
  const storedCount = authorityResult.storedCount;
  const nonCookableCount = authorityResult.nonCookableCount;
  const nonCookableGain = authorityResult.nonCookableGain;
  const potion = authorityResult.potion;
  for (const value of [gross, gain, debtPaid, storedCount, nonCookableCount, nonCookableGain, potion]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid ranch collection totals");
  }
  const items = collectionItems(before, working, authorityResult, beforeProductIds);
  return {
    receipt_id: key,
    items,
    gross_value: gross,
    ranch_coins_gained: gain + nonCookableGain,
    debt_paid: debtPaid,
    stored_count: storedCount,
    non_cookable_count: nonCookableCount,
    non_cookable_gain: nonCookableGain,
    potion_count: potion,
    detail: detail(authorityResult.detail),
    non_cookable_detail: detail(authorityResult.nonCookableDetail),
  };
}

function farmsForCollection(farm, working) {
  return playerFarms().map((entry) => (entry === farm ? working : structuredClone(entry)));
}

/**
 * Collect all pending ranch output through the existing ranchCollect
 * authority.  This action deliberately does not advance time, refresh a
 * shop, settle raids, or save directly.  The cloned authority result and its
 * idempotency receipt are committed together by one replaceFarm call.
 */
export function handleHumanRanchCollection(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  const receipts = isRecord(farm?.doorbellHumanRanchCollectionReceipts)
    ? farm.doorbellHumanRanchCollectionReceipts
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
    const beforeProductIds = new Set(
      Array.isArray(working?.ranch?.kitchen?.products)
        ? working.ranch.kitchen.products.map((item) => item?.id)
        : [],
    );
    const authorityResult = ranchCollect(working, farmsForCollection(farm, working), now);
    if (!authorityResult?.ok) {
      const code = current.data.collectable.status === "available" &&
        (current.data.collectable.total_pending_count ?? 0) +
          (current.data.collectable.total_pending_meat_count ?? 0) === 0
        ? "no_collectable"
        : "collection_rejected";
      return errorResponse(code, authorityResult?.error || "The ranch collection was rejected", current.revision);
    }

    const result = resultFor(current.data, working, authorityResult, key, beforeProductIds);
    const resource = projectHumanRanch(working, now);
    const response = {
      data: { result, resource: resource.data },
      revision: resource.revision,
      server_time: resource.server_time,
    };

    working.doorbellHumanRanchCollectionReceipts = {
      ...(isRecord(working.doorbellHumanRanchCollectionReceipts)
        ? working.doorbellHumanRanchCollectionReceipts
        : {}),
      [key]: { fingerprint: requestFingerprint, response },
    };
    replaceFarm(farm.id, working);
    return { status: 200, json: response };
  } catch {
    return {
      status: 503,
      json: { error: { code: "farm_unavailable", message: "The ranch collection could not be saved" } },
    };
  }
}

export const handleHumanRanchCollect = handleHumanRanchCollection;

export function ranchCollectionRevision(farm, now = Date.now()) {
  return projectHumanRanch(farm, now).revision;
}
