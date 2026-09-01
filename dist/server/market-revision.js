import { createHash } from "node:crypto";
import { getMysteryMerchantWorld, normalizeFarm } from "../store.js";
import { dumpUgc } from "../ugc.js";

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
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function revisionFarmSnapshot(farm) {
  const snapshot = structuredClone(farm);
  normalizeFarm(snapshot);
  if (isRecord(snapshot)) {
    for (const key of Object.keys(snapshot)) {
      if (key.startsWith("doorbellHuman") && key.endsWith("Receipts")) delete snapshot[key];
    }
  }
  return snapshot;
}

/** Read-only precondition for current farm inventory/listings and the shared UGC catalog. */
export function marketActionRevision(farm, _now = Date.now(), mysteryMerchantWorld = getMysteryMerchantWorld()) {
  return `farm-market-v1:${digest({
    schema: "farm-market-v1",
    farm: revisionFarmSnapshot(farm),
    ugc: structuredClone(dumpUgc()),
    mystery_merchant: structuredClone(mysteryMerchantWorld),
  })}`;
}
