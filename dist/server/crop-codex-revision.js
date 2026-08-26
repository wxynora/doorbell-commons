import { createHash } from "node:crypto";
import { allUgc } from "../ugc.js";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

/**
 * The codex precondition covers the persisted discovery records, current
 * stars, and known UGC identities without calling the full catalog projector.
 * Action receipts are excluded, so replaying an action does not make the same
 * request stale.
 */
export function cropCodexActionRevision(farm) {
  return `farm-crop-codex-v1:${digest({
    schema: "farm-crop-codex-v1",
    discovered: farm?.codex ?? null,
    starred: farm?.starred ?? null,
    original_crops: allUgc(),
  })}`;
}

export const cropCodexRevision = cropCodexActionRevision;
