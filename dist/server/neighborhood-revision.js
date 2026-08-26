import { createHash } from "node:crypto";
import { currentDayIndex } from "../time.js";
import { allFarms } from "../store.js";
import { allUgc } from "../ugc.js";

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

function farmSnapshot(farm) {
  const snapshot = structuredClone(farm);
  if (isRecord(snapshot)) {
    for (const key of Object.keys(snapshot)) {
      if (key.startsWith("doorbellHuman") && key.endsWith("Receipts")) delete snapshot[key];
    }
  }
  return snapshot;
}

/** Covers public farm state, social gates, guestbooks, rankings and original crops. */
export function neighborhoodMessageActionRevision(farm, now = Date.now()) {
  const farms = allFarms();
  if (farm && !farms.some((entry) => entry.id === farm.id)) farms.push(farm);
  return `farm-neighborhood-v1:${digest({
    schema: "farm-neighborhood-v1",
    day_index: currentDayIndex(now),
    farms: farms
      .filter((entry) => entry && typeof entry.id === "string")
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(farmSnapshot),
    ugc: structuredClone(allUgc()),
  })}`;
}
