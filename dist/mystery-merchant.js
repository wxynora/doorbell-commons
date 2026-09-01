import { randomInt as cryptoRandomInt } from "node:crypto";
import { cropById, materialById } from "./content.js";
import { currentDayIndex } from "./time.js";

export const MYSTERY_MERCHANT_EVENT_COUNT = 3;
export const MYSTERY_MERCHANT_DURATION_MS = 30 * 60 * 1000;
export const MYSTERY_MERCHANT_WINDOW_MS = 3 * 60 * 60 * 1000;
export const MYSTERY_MERCHANT_SHELF_SIZE = 4;

function requiredCatalogName(catalog, id) {
  const name = text(catalog.get(id)?.name);
  if (!name) throw new TypeError(`Mystery merchant catalog item is missing: ${id}`);
  return name;
}

export const MYSTERY_MERCHANT_CATALOG = Object.freeze([
  {
    catalogId: "material:world_tree_seed",
    kind: "material",
    itemId: "world_tree_seed",
    name: requiredCatalogName(materialById, "world_tree_seed"),
    rarity: "SP",
    currency: "silver",
    unitPrice: 200,
    inventory: "materials",
    grantQuantity: 1,
  },
  {
    catalogId: "material:creation_echo",
    kind: "material",
    itemId: "creation_echo",
    name: requiredCatalogName(materialById, "creation_echo"),
    rarity: "SP",
    currency: "silver",
    unitPrice: 200,
    inventory: "materials",
    grantQuantity: 1,
  },
  ...[
    ["origin_vine", "SP", 800],
    ["world_root_crown", "SP", 800],
    ["phantom_lotus", "SSR", 30],
    ["migratory_bulb", "SSR", 30],
    ["moon_dust_taro", "SSR", 30],
  ].map(([itemId, rarity, unitPrice]) => ({
    catalogId: `seed:${itemId}`,
    kind: "seed",
    itemId,
    name: requiredCatalogName(cropById, itemId),
    rarity,
    currency: "silver",
    unitPrice,
    inventory: "seeds",
    grantQuantity: 1,
  })),
  {
    catalogId: "bundle:speed_potion_20",
    kind: "potion_set",
    itemId: "speed_potion_20",
    name: "20瓶加速药水套装",
    rarity: null,
    currency: "gold",
    unitPrice: 500,
    inventory: "items",
    grantItemId: "speed_potion",
    grantQuantity: 20,
  },
].map((entry) => Object.freeze(entry)));

const HALF_HOUR_MS = MYSTERY_MERCHANT_DURATION_MS;
const WINDOWS_PER_DAY = 24 * 60 * 60 * 1000 / MYSTERY_MERCHANT_WINDOW_MS;
const EVENT_SLOTS_PER_WINDOW = MYSTERY_MERCHANT_WINDOW_MS / HALF_HOUR_MS;
const SUPPORTED_CURRENCIES = new Set(["gold", "silver"]);
const SUPPORTED_INVENTORIES = new Set(["materials", "seeds", "items"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function beijingDayStart(day) {
  return day * 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000;
}

function defaultDrawInt(maxExclusive) {
  return cryptoRandomInt(maxExclusive);
}

function draw(drawInt, maxExclusive) {
  const value = drawInt(maxExclusive);
  if (!Number.isSafeInteger(value) || value < 0 || value >= maxExclusive) {
    throw new TypeError("Mystery merchant random source returned an invalid integer");
  }
  return value;
}

function shuffledIndexes(length, drawInt) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const other = draw(drawInt, index + 1);
    [indexes[index], indexes[other]] = [indexes[other], indexes[index]];
  }
  return indexes;
}

function normalizeCatalogEntry(raw) {
  if (!isRecord(raw)) throw new TypeError("Mystery merchant catalog entry must be an object");
  const catalogId = text(raw.catalogId);
  const itemId = text(raw.itemId);
  const name = text(raw.name);
  const kind = text(raw.kind);
  const currency = text(raw.currency);
  const inventory = text(raw.inventory);
  const rarity = text(raw.rarity) || null;
  if (!catalogId || !itemId || !name || !kind) {
    throw new TypeError("Mystery merchant catalog identity is incomplete");
  }
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new TypeError(`Mystery merchant currency is unsupported: ${currency || "<empty>"}`);
  }
  if (!SUPPORTED_INVENTORIES.has(inventory)) {
    throw new TypeError(`Mystery merchant inventory is unsupported: ${inventory || "<empty>"}`);
  }
  if (!positiveInteger(raw.unitPrice) || !positiveInteger(raw.grantQuantity)) {
    throw new TypeError("Mystery merchant price and grant quantity must be positive integers");
  }
  return {
    catalogId,
    kind,
    itemId,
    name,
    rarity,
    currency,
    unitPrice: raw.unitPrice,
    inventory,
    grantItemId: text(raw.grantItemId) || itemId,
    grantQuantity: raw.grantQuantity,
  };
}

export function normalizeMysteryMerchantCatalog(rawCatalog) {
  if (!Array.isArray(rawCatalog) || rawCatalog.length === 0) {
    throw new TypeError("Mystery merchant catalog must not be empty");
  }
  const catalog = rawCatalog.map(normalizeCatalogEntry);
  const ids = new Set();
  const itemIds = new Set();
  for (const entry of catalog) {
    if (ids.has(entry.catalogId)) {
      throw new TypeError(`Mystery merchant catalog id is duplicated: ${entry.catalogId}`);
    }
    ids.add(entry.catalogId);
    if (itemIds.has(entry.itemId)) {
      throw new TypeError(`Mystery merchant item id is duplicated: ${entry.itemId}`);
    }
    itemIds.add(entry.itemId);
  }
  return catalog;
}

export function projectMysteryMerchant(rawWorld, now, hostFarmName = null, buyerFarmId = null) {
  const world = normalizeMysteryMerchantWorld(rawWorld);
  const approximateWindows = world.day === currentDayIndex(now)
    ? world.events.map((event) => ({
        starts_at: new Date(event.windowStartsAt).toISOString(),
        ends_at: new Date(event.windowEndsAt).toISOString(),
      }))
    : [];
  const event = activeEventInNormalizedWorld(world, now);
  const buyerId = text(buyerFarmId);
  if (!event || (event.broadcastedAt === null && buyerId !== event.hostFarmId)) {
    return { status: "absent", approximate_windows: approximateWindows };
  }
  return {
    status: "present",
    approximate_windows: approximateWindows,
    host_farm_doorplate: event.hostFarmId,
    host_farm_name: text(hostFarmName) || null,
    ends_at: new Date(event.endsAt).toISOString(),
    offers: event.offers.map((offer) => ({
        kind: offer.kind,
        item_id: offer.itemId,
        name: offer.name,
        rarity: offer.rarity,
        currency: offer.currency,
        unit_price: offer.unitPrice,
        grant_quantity: offer.grantQuantity,
        already_bought: buyerId ? offer.purchasedByFarmIds.includes(buyerId) : false,
      })),
  };
}

function normalizeOffer(raw, eventId) {
  if (!isRecord(raw)) throw new TypeError("Mystery merchant offer must be an object");
  const offerId = text(raw.offerId);
  const catalogId = text(raw.catalogId);
  const itemId = text(raw.itemId);
  const name = text(raw.name);
  const kind = text(raw.kind);
  const currency = text(raw.currency);
  const inventory = text(raw.inventory);
  const rarity = text(raw.rarity) || null;
  if (!offerId || !catalogId || !itemId || !name || !kind || !offerId.startsWith(`${eventId}:`)) {
    throw new TypeError("Mystery merchant offer identity is invalid");
  }
  if (!SUPPORTED_CURRENCIES.has(currency) || !SUPPORTED_INVENTORIES.has(inventory)) {
    throw new TypeError("Mystery merchant offer settlement is invalid");
  }
  if (!positiveInteger(raw.unitPrice) || !positiveInteger(raw.grantQuantity)) {
    throw new TypeError("Mystery merchant offer quantity is invalid");
  }
  const purchasedByFarmIds = Array.isArray(raw.purchasedByFarmIds)
    ? raw.purchasedByFarmIds.map(text).filter(Boolean)
    : [];
  if (new Set(purchasedByFarmIds).size !== purchasedByFarmIds.length) {
    throw new TypeError("Mystery merchant purchase record is duplicated");
  }
  return {
    offerId,
    catalogId,
    kind,
    itemId,
    name,
    rarity,
    currency,
    unitPrice: raw.unitPrice,
    purchasedByFarmIds,
    inventory,
    grantItemId: text(raw.grantItemId) || itemId,
    grantQuantity: raw.grantQuantity,
  };
}

function normalizeEvent(raw, day) {
  if (!isRecord(raw)) throw new TypeError("Mystery merchant event must be an object");
  const eventId = text(raw.eventId);
  const hostFarmId = text(raw.hostFarmId);
  const startsAt = Number(raw.startsAt);
  const endsAt = Number(raw.endsAt);
  const windowStartsAt = Number(raw.windowStartsAt);
  const windowEndsAt = Number(raw.windowEndsAt);
  const broadcastedAt = raw.broadcastedAt === null ? null : Number(raw.broadcastedAt);
  const dayStart = beijingDayStart(day);
  if (!eventId || !hostFarmId || !Number.isSafeInteger(startsAt) ||
      !Number.isSafeInteger(endsAt) || endsAt - startsAt !== MYSTERY_MERCHANT_DURATION_MS ||
      !Number.isSafeInteger(windowStartsAt) || !Number.isSafeInteger(windowEndsAt) ||
      windowEndsAt - windowStartsAt !== MYSTERY_MERCHANT_WINDOW_MS ||
      windowStartsAt < dayStart || windowEndsAt > beijingDayStart(day + 1) ||
      (windowStartsAt - dayStart) % MYSTERY_MERCHANT_WINDOW_MS !== 0 ||
      startsAt < windowStartsAt || endsAt > windowEndsAt ||
      (startsAt - windowStartsAt) % HALF_HOUR_MS !== 0 ||
      (broadcastedAt !== null && (!Number.isSafeInteger(broadcastedAt) || broadcastedAt < startsAt || broadcastedAt >= endsAt))) {
    throw new TypeError("Mystery merchant event window is invalid");
  }
  if (!Array.isArray(raw.offers) || raw.offers.length === 0) {
    throw new TypeError("Mystery merchant event must contain at least one offer");
  }
  const offers = raw.offers.map((offer) => normalizeOffer(offer, eventId));
  if (new Set(offers.map((offer) => offer.offerId)).size !== offers.length) {
    throw new TypeError("Mystery merchant offer id is duplicated");
  }
  return { eventId, hostFarmId, windowStartsAt, windowEndsAt, startsAt, endsAt, broadcastedAt, offers };
}

export function normalizeMysteryMerchantWorld(raw) {
  if (raw === null || raw === undefined) {
    return { version: 1, day: null, events: [] };
  }
  if (!isRecord(raw) || raw.version !== 1) {
    throw new TypeError("Mystery merchant world version is invalid");
  }
  if (raw.day === null) {
    if (!Array.isArray(raw.events) || raw.events.length !== 0) {
      throw new TypeError("Unscheduled mystery merchant world must have no events");
    }
    return { version: 1, day: null, events: [] };
  }
  if (!nonNegativeInteger(raw.day) || !Array.isArray(raw.events) ||
      raw.events.length !== MYSTERY_MERCHANT_EVENT_COUNT) {
    throw new TypeError("Mystery merchant day plan is incomplete");
  }
  const events = raw.events.map((event) => normalizeEvent(event, raw.day));
  if (new Set(events.map((event) => event.eventId)).size !== events.length) {
    throw new TypeError("Mystery merchant event id is duplicated");
  }
  const ordered = [...events].sort((left, right) => left.startsAt - right.startsAt);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].windowStartsAt < ordered[index - 1].windowEndsAt) {
      throw new TypeError("Mystery merchant event windows overlap");
    }
  }
  return { version: 1, day: raw.day, events };
}

function buildOffers(eventId, catalog, shelfSize, drawInt) {
  const picked = shuffledIndexes(catalog.length, drawInt).slice(0, shelfSize);
  return picked.map((catalogIndex, offerIndex) => {
    const entry = catalog[catalogIndex];
    return {
      offerId: `${eventId}:${offerIndex + 1}`,
      catalogId: entry.catalogId,
      kind: entry.kind,
      itemId: entry.itemId,
      name: entry.name,
      rarity: entry.rarity,
      currency: entry.currency,
      unitPrice: entry.unitPrice,
      purchasedByFarmIds: [],
      inventory: entry.inventory,
      grantItemId: entry.grantItemId,
      grantQuantity: entry.grantQuantity,
    };
  });
}

export function createMysteryMerchantDay({
  now,
  farmIds,
  catalog: rawCatalog,
  shelfSize,
  drawInt = defaultDrawInt,
}) {
  if (!Number.isFinite(now)) throw new TypeError("Mystery merchant time is invalid");
  const hosts = Array.isArray(farmIds) ? [...new Set(farmIds.map(text).filter(Boolean))] : [];
  if (hosts.length === 0) throw new TypeError("Mystery merchant requires at least one player farm");
  const catalog = normalizeMysteryMerchantCatalog(rawCatalog);
  if (!positiveInteger(shelfSize) || shelfSize > catalog.length) {
    throw new TypeError("Mystery merchant shelf size is invalid");
  }
  const day = currentDayIndex(now);
  const dayStart = beijingDayStart(day);
  const windows = shuffledIndexes(WINDOWS_PER_DAY, drawInt)
    .slice(0, MYSTERY_MERCHANT_EVENT_COUNT)
    .sort((left, right) => left - right);
  const events = windows.map((windowIndex, index) => {
    const eventId = `merchant:${day}:${index + 1}`;
    const windowStartsAt = dayStart + windowIndex * MYSTERY_MERCHANT_WINDOW_MS;
    const windowEndsAt = windowStartsAt + MYSTERY_MERCHANT_WINDOW_MS;
    const startsAt = windowStartsAt + draw(drawInt, EVENT_SLOTS_PER_WINDOW) * HALF_HOUR_MS;
    return {
      eventId,
      hostFarmId: hosts[draw(drawInt, hosts.length)],
      windowStartsAt,
      windowEndsAt,
      startsAt,
      endsAt: startsAt + MYSTERY_MERCHANT_DURATION_MS,
      broadcastedAt: null,
      offers: buildOffers(eventId, catalog, shelfSize, drawInt),
    };
  });
  return normalizeMysteryMerchantWorld({ version: 1, day, events });
}

export function advanceMysteryMerchantWorld(rawWorld, options) {
  const world = normalizeMysteryMerchantWorld(rawWorld);
  const day = currentDayIndex(options.now);
  if (world.day === day) return { changed: false, world };
  return {
    changed: true,
    world: createMysteryMerchantDay(options),
  };
}

export function activeMysteryMerchantEvent(rawWorld, now) {
  const world = normalizeMysteryMerchantWorld(rawWorld);
  return activeEventInNormalizedWorld(world, now);
}

export function discoverMysteryMerchantEvent({ world: rawWorld, farmId, now }) {
  const world = normalizeMysteryMerchantWorld(rawWorld);
  const event = activeEventInNormalizedWorld(world, now);
  if (!event) return { discovered: false, world };
  const actorFarmId = text(farmId);
  if (!actorFarmId || actorFarmId !== event.hostFarmId) {
    return { discovered: false, world };
  }
  if (event.broadcastedAt !== null) return { discovered: false, world };
  event.broadcastedAt = now;
  return {
    discovered: true,
    world,
    eventId: event.eventId,
    hostFarmId: event.hostFarmId,
    endsAt: event.endsAt,
    broadcastedAt: event.broadcastedAt,
  };
}

function activeEventInNormalizedWorld(world, now) {
  if (!Number.isFinite(now) || world.day !== currentDayIndex(now)) return null;
  return world.events.find((event) => event.startsAt <= now && now < event.endsAt) ?? null;
}

function farmBalance(farm, currency) {
  return currency === "gold" ? Number(farm.coins) : Number(farm.silver);
}

function setFarmBalance(farm, currency, value) {
  if (currency === "gold") farm.coins = value;
  else farm.silver = value;
}

function offerGrantBag(farm, offer) {
  const bag = farm[offer.inventory];
  if (!isRecord(bag)) farm[offer.inventory] = {};
  return farm[offer.inventory];
}

export function buyMysteryMerchantOffers({
  world: rawWorld,
  buyer,
  itemIds,
  now,
}) {
  const world = normalizeMysteryMerchantWorld(rawWorld);
  if (!isRecord(buyer) || !text(buyer.id)) {
    return { ok: false, code: "buyer_invalid", world };
  }
  const event = activeEventInNormalizedWorld(world, now);
  if (!event) return { ok: false, code: "merchant_not_present", world };
  if (event.broadcastedAt === null && buyer.id !== event.hostFarmId) {
    return { ok: false, code: "merchant_not_visible", world };
  }
  const requestedItemIds = Array.isArray(itemIds) ? itemIds.map(text) : [];
  if (requestedItemIds.length === 0 || requestedItemIds.some((itemId) => !itemId)) {
    return { ok: false, code: "items_invalid", world };
  }
  if (new Set(requestedItemIds).size !== requestedItemIds.length) {
    return { ok: false, code: "duplicate_items", world };
  }
  const offers = requestedItemIds.map((itemId) =>
    event.offers.find((candidate) => candidate.itemId === itemId));
  if (offers.some((offer) => !offer)) return { ok: false, code: "offer_not_found", world };
  if (offers.some((offer) => offer.purchasedByFarmIds.includes(buyer.id))) {
    return { ok: false, code: "already_bought", world };
  }
  const costs = { gold: 0, silver: 0 };
  for (const offer of offers) costs[offer.currency] += offer.unitPrice;
  for (const currency of SUPPORTED_CURRENCIES) {
    const balance = farmBalance(buyer, currency);
    if (!nonNegativeInteger(balance) || balance < costs[currency]) {
      return { ok: false, code: "insufficient_funds", currency, cost: costs[currency], world };
    }
  }
  for (const currency of SUPPORTED_CURRENCIES) {
    setFarmBalance(buyer, currency, farmBalance(buyer, currency) - costs[currency]);
  }
  const purchased = offers.map((offer) => {
    const bag = offerGrantBag(buyer, offer);
    bag[offer.grantItemId] =
      (nonNegativeInteger(bag[offer.grantItemId]) ? bag[offer.grantItemId] : 0) +
      offer.grantQuantity;
    offer.purchasedByFarmIds.push(buyer.id);
    return {
      offerId: offer.offerId,
      catalogId: offer.catalogId,
      kind: offer.kind,
      itemId: offer.itemId,
      name: offer.name,
      granted: offer.grantQuantity,
      currency: offer.currency,
      unitPrice: offer.unitPrice,
      cost: offer.unitPrice,
    };
  });
  return {
    ok: true,
    world,
    eventId: event.eventId,
    hostFarmId: event.hostFarmId,
    items: purchased,
    costs,
  };
}

export function renderMysteryMerchantPurchaseResult(result) {
  if (result?.ok === true) {
    const items = result.items
      .map((item) => `${item.name}×${item.granted}`)
      .join("、");
    const costs = [
      result.costs.gold > 0 ? `${result.costs.gold} 金币` : "",
      result.costs.silver > 0 ? `${result.costs.silver} 银币` : "",
    ].filter(Boolean).join("、");
    return `🛒 买到了：${items}。共花费 ${costs}。`;
  }
  if (result?.code === "insufficient_funds") {
    return "可用余额不足，本次操作没有执行。";
  }
  if (result?.code === "already_bought") {
    return "这份清单里有你本次已经买过的商品，本次操作没有执行。";
  }
  if (result?.code === "merchant_not_present") {
    return "神秘商人现在不在铃野，本次操作没有执行。";
  }
  if (result?.code === "merchant_not_visible") {
    return "这次神秘商人的位置还没有被发现，本次操作没有执行。";
  }
  if (result?.code === "offer_not_found") {
    return "这份清单里有不在当前货架上的商品，本次操作没有执行。";
  }
  return "这份购买清单无效，本次操作没有执行。";
}
