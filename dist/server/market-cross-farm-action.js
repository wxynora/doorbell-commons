import { createHash } from "node:crypto";
import { humanBarterAccept } from "../engine.js";
import { buyFromMarket } from "../game.js";
import { dumpUgc, loadUgc } from "../ugc.js";
import { normalizeFarm, replaceFarmsAtomic } from "../store.js";
import { marketActionRevision } from "./market-revision.js";
import {
  createMinimalHumanActionReceipt,
  replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_RE = /^farm-market-v1:[0-9a-f]{64}$/;
const MARKET_RECEIPTS = "doorbellHumanMarketActionReceipts";

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
  const request = { ...body };
  delete request.idempotency_key;
  return digest(request);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit one valid cross-farm Human market action and its stable target",
      },
    },
  };
}

function errorResponse(code, message, currentRevision, status = 409) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status, json: { error } };
}

function validateBody(body) {
  if (!isRecord(body) || typeof body.action !== "string") return false;
  const common = [
    "farm_human_key",
    "expected_farm_doorplate",
    "idempotency_key",
    "expected_revision",
    "action",
    "seller_doorplate",
  ];
  if (body.action === "buy") {
    return (
      exactKeys(body, [...common, "kind", "item_id", "qty"]) &&
      typeof body.farm_human_key === "string" && body.farm_human_key.trim().length > 0 &&
      typeof body.expected_farm_doorplate === "string" && FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
      typeof body.seller_doorplate === "string" && FARM_DOORPLATE_RE.test(body.seller_doorplate) &&
      typeof body.idempotency_key === "string" && UUID_RE.test(body.idempotency_key) &&
      typeof body.expected_revision === "string" && REVISION_RE.test(body.expected_revision) &&
      typeof body.kind === "string" && body.kind.length > 0 &&
      typeof body.item_id === "string" && body.item_id.trim().length > 0 &&
      positiveInteger(body.qty)
    );
  }
  if (body.action === "barter-accept") {
    return (
      exactKeys(body, [...common, "listing_id"]) &&
      typeof body.farm_human_key === "string" && body.farm_human_key.trim().length > 0 &&
      typeof body.expected_farm_doorplate === "string" && FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
      typeof body.seller_doorplate === "string" && FARM_DOORPLATE_RE.test(body.seller_doorplate) &&
      typeof body.idempotency_key === "string" && UUID_RE.test(body.idempotency_key) &&
      typeof body.expected_revision === "string" && REVISION_RE.test(body.expected_revision) &&
      UUID_RE.test(body.listing_id)
    );
  }
  return false;
}

function buyOutcome(body, result) {
  return {
    seller_doorplate: body.seller_doorplate,
    kind: body.kind,
    item_id: body.item_id,
    quantity: result.qty,
    name: result.name,
    cost: result.cost,
    fee: result.fee,
    price: result.price,
  };
}

function barterOutcome(body, result) {
  return {
    seller_doorplate: body.seller_doorplate,
    listing_id: body.listing_id,
    give: {
      kind: result.give.kind,
      item_id: result.give.id,
      quantity: result.giveQty,
      name: result.give.name,
    },
    want: {
      kind: result.want.kind,
      item_id: result.want.id,
      quantity: result.wantQty,
      name: result.want.name,
    },
  };
}

function stableResult(body, result) {
  const outcome = body.action === "buy" ? buyOutcome(body, result) : barterOutcome(body, result);
  return {
    receipt_id: body.idempotency_key,
    action: body.action,
    outcome,
  };
}

function responseFor(buyer, seller, result, now) {
  return {
    data: {
      result,
      buyer_doorplate: buyer.id,
      seller_doorplate: seller.id,
    },
    revision: marketActionRevision(buyer, now),
    seller_revision: marketActionRevision(seller, now),
    server_time: new Date(now).toISOString(),
  };
}

function callAuthority(body, seller, buyer, now) {
  if (body.action === "buy") {
    return buyFromMarket(seller, buyer, body.kind, body.item_id, body.qty, now);
  }
  return humanBarterAccept(seller, buyer, body.listing_id, now);
}

/**
 * Settle one Human purchase or barter acceptance across two existing farms.
 * The authorities run only on isolated clones; the two clones, UGC and the
 * buyer's idempotency receipt are published by one store commit.
 */
export function handleHumanCrossFarmMarketAction(buyer, seller, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();
  if (!buyer || !seller || buyer.id === seller.id) {
    return errorResponse("farm_identity_mismatch", "Buyer and seller must be two different farms", undefined, 409);
  }
  if (buyer.humanKey !== body.farm_human_key || buyer.id !== body.expected_farm_doorplate) {
    return errorResponse("farm_identity_mismatch", "The Human credential does not match the buyer farm", undefined, 409);
  }
  if (seller.id !== body.seller_doorplate) {
    return errorResponse("farm_identity_mismatch", "The seller doorplate does not match the target farm", undefined, 409);
  }

  const requestFingerprint = fingerprint(body);
  const receipts = isRecord(buyer[MARKET_RECEIPTS]) ? buyer[MARKET_RECEIPTS] : {};
  const existing = receipts[body.idempotency_key];
  if (existing !== undefined) {
    if (existing?.fingerprint !== requestFingerprint) {
      return errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
    }
    try {
      const response = replayMinimalHumanActionReceipt(
        existing,
        requestFingerprint,
        responseFor(buyer, seller, null, now),
      );
      return response
        ? { status: 200, json: response }
        : errorResponse("idempotency_conflict", "The stored action receipt is invalid");
    } catch {
      return errorResponse("farm_unavailable", "The market state could not be read", undefined, 503);
    }
  }

  let currentRevision;
  try {
    currentRevision = marketActionRevision(buyer, now);
  } catch {
    return errorResponse("farm_unavailable", "The buyer market state could not be read", undefined, 503);
  }
  if (currentRevision !== body.expected_revision) {
    return errorResponse("state_conflict", "The buyer market state has changed", currentRevision);
  }

  const ugcBefore = structuredClone(dumpUgc());
  let nextUgc;
  try {
    const buyerWorking = structuredClone(buyer);
    const sellerWorking = structuredClone(seller);
    normalizeFarm(buyerWorking);
    normalizeFarm(sellerWorking);
    const result = callAuthority(body, sellerWorking, buyerWorking, now);
    if (!result?.ok) {
      loadUgc(ugcBefore);
      return errorResponse("action_rejected", result?.error || "The market action was rejected", currentRevision);
    }
    nextUgc = structuredClone(dumpUgc());
    const response = responseFor(
      buyerWorking,
      sellerWorking,
      stableResult(body, result),
      now,
    );
    buyerWorking[MARKET_RECEIPTS] = {
      ...(isRecord(buyerWorking[MARKET_RECEIPTS]) ? buyerWorking[MARKET_RECEIPTS] : {}),
      [body.idempotency_key]: createMinimalHumanActionReceipt(requestFingerprint, response),
    };
    // The authorities may have updated the live UGC catalog while operating
    // on clones (UGC sales counters); restore it before the store commit so a
    // failed write leaves the live catalog untouched.
    loadUgc(ugcBefore);
    replaceFarmsAtomic(
      [
        { id: buyer.id, farm: buyerWorking },
        { id: seller.id, farm: sellerWorking },
      ],
      nextUgc,
    );
    return { status: 200, json: response };
  } catch {
    loadUgc(ugcBefore);
    return errorResponse("farm_unavailable", "The cross-farm market action could not be saved", undefined, 503);
  }
}

export const handleHumanMarketCrossFarmAction = handleHumanCrossFarmMarketAction;
