import { createHash } from "node:crypto";
import { kitchenSellSelected, humanBarterList, humanBarterUnlist, pushInbox } from "../engine.js";
import { listForSale, unlistItem } from "../game.js";
import { cancelPurchaseOrder, createPurchaseOrder } from "../game/purchase-orders.js";
import { buyMysteryMerchantOffers, discoverMysteryMerchantEvent } from "../mystery-merchant.js";
import { dumpUgc, loadUgc } from "../ugc.js";
import {
  getMysteryMerchantWorld,
  normalizeFarm,
  playerFarms,
  replaceFarmAndMysteryMerchantAtomic,
  replaceFarmsAndMysteryMerchantAtomic,
  replaceFarmsAtomic,
} from "../store.js";
import { projectHumanFarmCatalog } from "./farm-catalog-structured.js";
import { marketActionRevision } from "./market-revision.js";
import {
  createHumanMarketActionReceipt,
  replayHumanMarketActionReceipt,
} from "./market-action-receipt.js";

export { marketActionRevision } from "./market-revision.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION_RE = /^farm-market-v1:[0-9a-f]{64}$/;
const ACTIONS = new Set([
  "browse",
  "list",
  "buy",
  "unlist",
  "barter-list",
  "barter-accept",
  "barter-unlist",
  "purchase-order-list",
  "purchase-order-fulfill",
  "purchase-order-unlist",
  "mystery-merchant-buy",
]);
const LISTING_KINDS = new Set(["seed", "material", "ingredient", "dish"]);
const STACKED_LISTING_KINDS = new Set(["seed", "material"]);
const MARKET_RECEIPTS = "doorbellHumanMarketActionReceipts";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
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

function invalidRequest() {
  return {
    status: 400,
    json: {
      error: {
        code: "invalid_request",
        message: "Submit one valid Human market action and its stable target",
      },
    },
  };
}

function errorResponse(code, message, currentRevision, status = 409) {
  const error = { code, message };
  if (currentRevision) error.current_revision = currentRevision;
  return { status, json: { error } };
}

function commonBodyValid(body, expectedKeys) {
  return (
    exactKeys(body, expectedKeys) &&
    typeof body.farm_human_key === "string" &&
    body.farm_human_key.trim().length > 0 &&
    typeof body.expected_farm_doorplate === "string" &&
    FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
    typeof body.idempotency_key === "string" &&
    UUID_RE.test(body.idempotency_key) &&
    typeof body.expected_revision === "string" &&
    REVISION_RE.test(body.expected_revision) &&
    typeof body.action === "string" &&
    ACTIONS.has(body.action)
  );
}

function validateBody(body) {
  if (!isRecord(body) || typeof body.action !== "string") return false;
  const common = [
    "farm_human_key",
    "expected_farm_doorplate",
    "idempotency_key",
    "expected_revision",
    "action",
  ];

  if (body.action === "browse") return commonBodyValid(body, common);

  if (body.action === "list") {
    const withTarget = [...common, "kind", "item_id", "qty"];
    if (!LISTING_KINDS.has(body.kind)) return false;
    if (!STACKED_LISTING_KINDS.has(body.kind)) withTarget.push("price");
    if (
      !commonBodyValid(body, withTarget) ||
      !nonEmptyText(body.item_id) ||
      !positiveInteger(body.qty)
    )
      return false;
    return STACKED_LISTING_KINDS.has(body.kind) || positiveInteger(body.price);
  }

  if (body.action === "unlist") {
    return (
      commonBodyValid(body, [...common, "kind", "item_id"]) &&
      LISTING_KINDS.has(body.kind) &&
      nonEmptyText(body.item_id)
    );
  }

  if (body.action === "buy") {
    return (
      commonBodyValid(body, [...common, "seller_doorplate", "kind", "item_id", "qty"]) &&
      FARM_DOORPLATE_RE.test(body.seller_doorplate) &&
      LISTING_KINDS.has(body.kind) &&
      nonEmptyText(body.item_id) &&
      positiveInteger(body.qty)
    );
  }

  if (body.action === "barter-list") {
    return (
      commonBodyValid(body, [
        ...common,
        "give_kind",
        "give_item_id",
        "give_qty",
        "want_kind",
        "want_item_id",
        "want_qty",
      ]) &&
      LISTING_KINDS.has(body.give_kind) &&
      LISTING_KINDS.has(body.want_kind) &&
      nonEmptyText(body.give_item_id) &&
      nonEmptyText(body.want_item_id) &&
      positiveInteger(body.give_qty) &&
      positiveInteger(body.want_qty)
    );
  }

  if (body.action === "barter-accept") {
    return (
      commonBodyValid(body, [...common, "seller_doorplate", "listing_id"]) &&
      FARM_DOORPLATE_RE.test(body.seller_doorplate) &&
      UUID_RE.test(body.listing_id)
    );
  }

  if (body.action === "barter-unlist") {
    return (
      commonBodyValid(body, [...common, "listing_id"]) &&
      UUID_RE.test(body.listing_id)
    );
  }

  if (body.action === "purchase-order-list") {
    return (
      commonBodyValid(body, [...common, "kind", "item_id", "qty", "price"]) &&
      LISTING_KINDS.has(body.kind) &&
      nonEmptyText(body.item_id) &&
      positiveInteger(body.qty) &&
      positiveInteger(body.price)
    );
  }

  if (body.action === "purchase-order-fulfill") {
    return (
      commonBodyValid(body, [...common, "order_owner_doorplate", "listing_id", "qty"]) &&
      FARM_DOORPLATE_RE.test(body.order_owner_doorplate) &&
      UUID_RE.test(body.listing_id) &&
      positiveInteger(body.qty)
    );
  }

  if (body.action === "purchase-order-unlist") {
    return (
      commonBodyValid(body, [...common, "listing_id"]) &&
      UUID_RE.test(body.listing_id)
    );
  }

  if (body.action === "mystery-merchant-buy") {
    return (
      commonBodyValid(body, [...common, "items"]) &&
      Array.isArray(body.items) &&
      body.items.length > 0 &&
      body.items.every(nonEmptyText) &&
      new Set(body.items).size === body.items.length
    );
  }

  return false;
}

function validListResult(result, body) {
  return (
    result?.ok === true &&
    typeof result.name === "string" &&
    result.name.length > 0 &&
    result.qty === body.qty &&
    positiveInteger(result.qty) &&
    Number.isSafeInteger(result.price) &&
    result.price > 0
  );
}

function validUnlistResult(result) {
  return (
    result?.ok === true &&
    typeof result.name === "string" &&
    result.name.length > 0 &&
    positiveInteger(result.returned)
  );
}

function validBarterListResult(result) {
  return (
    result?.ok === true &&
    isRecord(result.listing) &&
    UUID_RE.test(String(result.listing.id ?? "")) &&
    isRecord(result.listing.give) &&
    isRecord(result.listing.want) &&
    positiveInteger(result.listing.give.qty) &&
    positiveInteger(result.listing.want.qty)
  );
}

function validBarterUnlistResult(result) {
  return (
    result?.ok === true &&
    isRecord(result.give) &&
    positiveInteger(result.giveQty)
  );
}

function validPurchaseOrderListResult(result) {
  return (
    result?.ok === true &&
    isRecord(result.order) &&
    UUID_RE.test(String(result.order.id ?? "")) &&
    LISTING_KINDS.has(result.order.kind) &&
    nonEmptyText(result.order.itemId) &&
    positiveInteger(result.order.targetQuantity) &&
    result.order.filledQuantity === 0 &&
    positiveInteger(result.order.unitPrice)
  );
}

function validPurchaseOrderUnlistResult(result) {
  return result?.ok === true && isRecord(result.order) && UUID_RE.test(String(result.order.id ?? ""));
}

function callSingleFarmAuthority(working, body, now) {
  if (body.action === "list") {
    if (STACKED_LISTING_KINDS.has(body.kind)) {
      return listForSale(working, body.kind, body.item_id, body.qty, now);
    }
    return kitchenSellSelected(working, body.item_id, body.qty, "market", body.price, now);
  }
  if (body.action === "unlist") return unlistItem(working, body.kind, body.item_id);
  if (body.action === "barter-list") {
    return humanBarterList(
      working,
      body.give_kind,
      body.give_item_id,
      body.give_qty,
      body.want_kind,
      body.want_item_id,
      body.want_qty,
      now,
    );
  }
  if (body.action === "barter-unlist") return humanBarterUnlist(working, body.listing_id);
  if (body.action === "purchase-order-list") {
    return createPurchaseOrder(working, body.kind, body.item_id, body.qty, body.price, now);
  }
  if (body.action === "purchase-order-unlist") return cancelPurchaseOrder(working, body.listing_id);
  return { ok: false, error: "This market action is not a single-farm action" };
}

function listOutcome(body, result) {
  return {
    kind: body.kind,
    item_id: body.item_id,
    quantity: result.qty,
    price: result.price,
    name: result.name,
  };
}

function unlistOutcome(body, result) {
  return {
    kind: body.kind,
    item_id: body.item_id,
    quantity: result.returned,
    name: result.name,
  };
}

function barterListOutcome(result) {
  return {
    listing_id: result.listing.id,
    give: {
      kind: result.listing.give.kind,
      item_id: result.listing.give.id,
      quantity: result.listing.give.qty,
      name: result.listing.give.name,
    },
    want: {
      kind: result.listing.want.kind,
      item_id: result.listing.want.id,
      quantity: result.listing.want.qty,
      name: result.listing.want.name,
    },
  };
}

function barterUnlistOutcome(body, result) {
  return {
    listing_id: body.listing_id,
    give: {
      kind: result.give.kind,
      item_id: result.give.id,
      quantity: result.giveQty,
      name: result.give.name,
    },
  };
}

function purchaseOrderListOutcome(result) {
  return {
    listing_id: result.order.id,
    kind: result.order.kind,
    item_id: result.order.itemId,
    quantity: result.order.targetQuantity,
    filled_quantity: result.order.filledQuantity,
    price: result.order.unitPrice,
    name: result.definition.item.name,
  };
}

function purchaseOrderUnlistOutcome(body, result) {
  return {
    listing_id: body.listing_id,
    kind: result.order.kind,
    item_id: result.order.itemId,
    quantity: result.order.targetQuantity,
    filled_quantity: result.order.filledQuantity,
    price: result.order.unitPrice,
  };
}

function actionOutcome(body, result) {
  if (body.action === "list") return listOutcome(body, result);
  if (body.action === "unlist") return unlistOutcome(body, result);
  if (body.action === "barter-list") return barterListOutcome(result);
  if (body.action === "purchase-order-list") return purchaseOrderListOutcome(result);
  if (body.action === "purchase-order-unlist") return purchaseOrderUnlistOutcome(body, result);
  return barterUnlistOutcome(body, result);
}

function resourceResponse(farm, key, action, outcome, now, mysteryMerchantWorld) {
  const projected = projectHumanFarmCatalog(farm, now, { mysteryMerchantWorld });
  return {
    data: {
      result: {
        receipt_id: key,
        action,
        outcome,
      },
      resource: projected.data,
    },
    revision: marketActionRevision(farm, now, mysteryMerchantWorld),
    server_time: projected.server_time,
  };
}

/**
 * Read the same structured farm resource used by the existing Human catalog.
 * This is intentionally side-effect free; it does not advance, refresh, or
 * save anything. Market writes return this complete resource after settlement.
 */
export function readHumanMarket(farm, now = Date.now()) {
  const working = structuredClone(farm);
  normalizeFarm(working);
  const projected = projectHumanFarmCatalog(working, now);
  return {
    data: projected.data,
    revision: marketActionRevision(farm, now),
    server_time: projected.server_time,
  };
}

function beijingTime(timestamp) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Shanghai",
  }).formatToParts(new Date(timestamp));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function discoverAndBroadcastMysteryMerchant(farm, now) {
  const discovery = discoverMysteryMerchantEvent({
    world: getMysteryMerchantWorld(),
    farmId: farm.id,
    now,
  });
  if (!discovery.discovered) {
    return { farm, world: discovery.world, discovered: false };
  }
  const farms = playerFarms().map((current) => {
    const working = structuredClone(current);
    normalizeFarm(working);
    pushInbox(
      working,
      `📣 神秘商人出现在「${farm.name}」，将在 ${beijingTime(discovery.endsAt)} 离开。`,
      now,
    );
    return { id: working.id, farm: working };
  });
  const committed = replaceFarmsAndMysteryMerchantAtomic({
    replacements: farms,
    nextMysteryMerchantWorld: discovery.world,
  });
  return {
    farm: committed.farms.find((candidate) => candidate.id === farm.id) ?? farm,
    world: committed.mysteryMerchant,
    discovered: true,
  };
}

/** Execute the single-farm portion of the Human market contract. */
export function handleHumanMarketAction(farm, body, now = Date.now()) {
  if (!validateBody(body)) return invalidRequest();

  if (body.action === "browse") {
    try {
      const working = structuredClone(farm);
      normalizeFarm(working);
      const currentRevision = marketActionRevision(working, now);
      if (currentRevision !== body.expected_revision) {
        return errorResponse("state_conflict", "The market state has changed", currentRevision);
      }
      const discovery = discoverAndBroadcastMysteryMerchant(working, now);
      return {
        status: 200,
        json: resourceResponse(
          discovery.farm,
          body.idempotency_key,
          body.action,
          null,
          now,
          discovery.world,
        ),
      };
    } catch {
      return errorResponse("farm_unavailable", "The market could not be read", undefined, 503);
    }
  }

  const receipts = isRecord(farm?.[MARKET_RECEIPTS]) ? farm[MARKET_RECEIPTS] : {};
  const requestFingerprint = fingerprint(body);
  const existing = receipts[body.idempotency_key];
  if (existing !== undefined) {
    if (existing?.fingerprint !== requestFingerprint) {
      return errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
    }
    try {
      const response = replayHumanMarketActionReceipt(
        existing,
        requestFingerprint,
        resourceResponse(farm, body.idempotency_key, body.action, null, now),
      );
      return response
        ? { status: 200, json: response }
        : errorResponse("idempotency_conflict", "The stored action receipt is invalid");
    } catch {
      return errorResponse("farm_unavailable", "The market could not be read", undefined, 503);
    }
  }

  let currentRevision;
  try {
    currentRevision = marketActionRevision(farm, now);
  } catch {
    return errorResponse("farm_unavailable", "The market state could not be read", undefined, 503);
  }
  if (currentRevision !== body.expected_revision) {
    return errorResponse("state_conflict", "The market state has changed", currentRevision);
  }

  if (body.action === "buy" || body.action === "barter-accept" || body.action === "purchase-order-fulfill") {
    return errorResponse(
      "cross_farm_atomicity_unavailable",
      "Cross-farm market settlement is unavailable until the farm store supports one atomic multi-farm commit",
      currentRevision,
      503,
    );
  }

  if (body.action === "mystery-merchant-buy") {
    try {
      const working = structuredClone(farm);
      normalizeFarm(working);
      const result = buyMysteryMerchantOffers({
        world: getMysteryMerchantWorld(),
        buyer: working,
        itemIds: body.items,
        now,
      });
      if (!result.ok) {
        return errorResponse(
          result.code || "action_rejected",
          "The mystery merchant purchase was rejected",
          currentRevision,
        );
      }
      const outcome = {
        items: result.items.map((item) => ({
          kind: item.kind,
          item_id: item.itemId,
          name: item.name,
          granted_quantity: item.granted,
          currency: item.currency,
          unit_price: item.unitPrice,
          cost: item.cost,
        })),
        costs: result.costs,
        host_farm_doorplate: result.hostFarmId,
      };
      const response = resourceResponse(
        working,
        body.idempotency_key,
        body.action,
        outcome,
        now,
        result.world,
      );
      working[MARKET_RECEIPTS] = {
        ...(isRecord(working[MARKET_RECEIPTS]) ? working[MARKET_RECEIPTS] : {}),
        [body.idempotency_key]: createHumanMarketActionReceipt(requestFingerprint, response),
      };
      replaceFarmAndMysteryMerchantAtomic({
        replacement: { id: farm.id, farm: working },
        nextMysteryMerchantWorld: result.world,
      });
      return { status: 200, json: response };
    } catch {
      return errorResponse("farm_unavailable", "The mystery merchant purchase could not be saved", undefined, 503);
    }
  }

  let ugcSnapshot;
  try {
    ugcSnapshot = structuredClone(dumpUgc());
    const working = structuredClone(farm);
    normalizeFarm(working);
    const result = callSingleFarmAuthority(working, body, now);
    const valid = body.action === "list"
      ? validListResult(result, body)
      : body.action === "unlist"
        ? validUnlistResult(result)
        : body.action === "barter-list"
          ? validBarterListResult(result)
          : body.action === "barter-unlist"
            ? validBarterUnlistResult(result)
            : body.action === "purchase-order-list"
              ? validPurchaseOrderListResult(result)
              : validPurchaseOrderUnlistResult(result);
    if (!valid) {
      loadUgc(ugcSnapshot);
      return errorResponse(
        "action_rejected",
        result?.error || "The market action was rejected",
      );
    }

    const response = resourceResponse(
      working,
      body.idempotency_key,
      body.action,
      actionOutcome(body, result),
      now,
    );
    working[MARKET_RECEIPTS] = {
      ...(isRecord(working[MARKET_RECEIPTS]) ? working[MARKET_RECEIPTS] : {}),
      [body.idempotency_key]: createHumanMarketActionReceipt(requestFingerprint, response),
    };
    const nextUgc = structuredClone(dumpUgc());
    loadUgc(ugcSnapshot);
    replaceFarmsAtomic([{ id: farm.id, farm: working }], nextUgc);
    return { status: 200, json: response };
  } catch {
    if (ugcSnapshot !== undefined) loadUgc(ugcSnapshot);
    return errorResponse("farm_unavailable", "The market action could not be saved", undefined, 503);
  }
}

export const handleHumanMarket = handleHumanMarketAction;
export const projectHumanMarket = readHumanMarket;
