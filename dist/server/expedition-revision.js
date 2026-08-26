import { createHash } from "node:crypto";
import { currentDayIndex } from "../time.js";

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

function revisionState(farm, now) {
  return {
    schema: "farm-expedition-v1",
    farm_doorplate: String(farm?.id ?? ""),
    day_index: currentDayIndex(now),
    expedition: structuredClone(farm?.expedition ?? null),
    exp_charm: structuredClone(farm?.expCharm ?? null),
    exp_daily: structuredClone(farm?.expDaily ?? null),
    exp_codex: structuredClone(farm?.expCodex ?? null),
    exp_runs: farm?.expRuns ?? null,
    exp_concord: farm?.expConcord ?? null,
    exp_journeys: structuredClone(farm?.expJourneys ?? null),
    rng_state: farm?.rngState ?? null,
    inventory: {
      coins: farm?.coins ?? null,
      silver: farm?.silver ?? null,
      items: structuredClone(farm?.items ?? null),
      ranch: structuredClone(farm?.ranch ?? null),
    },
  };
}

/** Read-only precondition for every persisted field used by expedition authorities. */
export function expeditionActionRevision(farm, now = Date.now()) {
  return `farm-expedition-v1:${digest(revisionState(farm, now))}`;
}
