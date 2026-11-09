import { createHash } from "node:crypto";
import { getMysteryMerchantWorld } from "../store.js";
import { dumpUgc } from "../ugc.js";
import { currentDayIndex } from "../time.js";
import { normalizeDishPricing } from "../domain/kitchen/pricing.js";

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
  const dishSnapshot = (dish) => {
    if (!isRecord(dish)) return dish;
    const copy = { ...dish };
    normalizeDishPricing(copy);
    return copy;
  };
  return {
    id: farm.id, coins: farm.coins, silver: farm.silver,
    materials: farm.materials ?? {}, seeds: farm.seeds ?? {}, items: farm.items ?? {},
    dishes: (farm.ranch?.kitchen?.dishes ?? []).map(dishSnapshot), ingredients: farm.ranch?.kitchen?.ingredients ?? {},
    market: (farm.market ?? []).map(listing => farm.ranch && listing?.kind === "dish"
      ? { ...listing, dish: dishSnapshot(listing.dish) } : listing), humanBarters: farm.humanBarters ?? [],
    humanPurchaseOrders: farm.humanPurchaseOrders ?? [], limitedSeedBuys: farm.limitedSeedBuys,
    qixiTasks: farm.qixi2026?.tasks,
  };
}

/** Read-only precondition for current farm inventory/listings and the shared UGC catalog. */
export function marketActionRevision(farm, now = Date.now(), mysteryMerchantWorld = getMysteryMerchantWorld()) {
  const event = mysteryMerchantWorld?.day === currentDayIndex(now)
    ? mysteryMerchantWorld.events.find(item => item.startsAt <= now && now < item.endsAt) ?? null : null;
  return `farm-market-v1:${digest({
    schema: "farm-market-v1",
    farm: revisionFarmSnapshot(farm),
    ugc: dumpUgc().map(({ id, name, category, banned, sellPrice }) => ({ id, name, category, banned, sellPrice })),
    mystery_merchant: event && {
      eventId: event.eventId, hostFarmId: event.hostFarmId, startsAt: event.startsAt,
      endsAt: event.endsAt, broadcastedAt: event.broadcastedAt,
      offers: event.offers.map(({ offerId, catalogId, itemId, kind, name, currency, unitPrice,
        inventory, grantItemId, grantQuantity, purchasedByFarmIds }) => ({
        offerId, catalogId, itemId, kind, name, currency, unitPrice, inventory, grantItemId, grantQuantity,
        purchased: purchasedByFarmIds.includes(farm.id),
      })),
    },
  })}`;
}
