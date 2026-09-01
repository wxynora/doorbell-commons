import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

const RECEIPT_TYPE = "human_market_v1";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep the first market response time inside the already-persisted result slot. */
export function createHumanMarketActionReceipt(fingerprint, response) {
  const minimal = createMinimalHumanActionReceipt(fingerprint, response);
  if (typeof response?.server_time !== "string" || response.server_time.length === 0) {
    throw new TypeError("A Human market action receipt needs its first server time");
  }
  return {
    fingerprint: minimal.fingerprint,
    result: {
      receipt_type: RECEIPT_TYPE,
      action_result: minimal.result,
      server_time: response.server_time,
    },
  };
}

/** Replay new timed receipts exactly while retaining support for older minimal rows. */
export function replayHumanMarketActionReceipt(entry, fingerprint, currentResponse) {
  const stored = entry?.result;
  if (
    !isRecord(stored) ||
    stored.receipt_type !== RECEIPT_TYPE ||
    !Object.hasOwn(stored, "action_result") ||
    typeof stored.server_time !== "string" ||
    stored.server_time.length === 0
  ) {
    return replayMinimalHumanActionReceipt(entry, fingerprint, currentResponse);
  }
  const replayed = replayMinimalHumanActionReceipt(
    {
      fingerprint: entry.fingerprint,
      result: stored.action_result,
    },
    fingerprint,
    currentResponse,
  );
  return replayed ? { ...replayed, server_time: stored.server_time } : null;
}
