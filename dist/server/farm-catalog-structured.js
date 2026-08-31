import { createHash } from "node:crypto";
import {
  EXP_DAILY_CAP,
  ITEMS,
  POTION_DAILY_CAP,
  RECIPE_PRICE,
  SEED_PRICE,
  SHOP_REFRESH_MS,
} from "../config.js";
import {
  cropById,
  crops,
  cookingIngredientById,
  cookingRecipeById,
  expDecorById,
  expEventById,
  expMapById,
  materialById,
  recipes,
} from "../content.js";
import { allUgc } from "../ugc.js";
import { currentDayIndex } from "../time.js";
import { titleById } from "../titles.js";
import { buildLeaderboards } from "../leaderboard.js";
import { playerFarms } from "../store.js";
import { cropCodexActionRevision } from "./crop-codex-revision.js";
import { originalPlantActionRevision } from "./original-plant-action.js";
import { expeditionActionRevision } from "./expedition-revision.js";
import { marketActionRevision } from "./market-revision.js";
import { neighborhoodMessageActionRevision } from "./neighborhood-revision.js";
import { smeltingActionRevision } from "./smelting-revision.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const RARITY_ORDER = new Map([
  ["N", 0],
  ["R", 1],
  ["SR", 2],
  ["SSR", 3],
  ["SP", 4],
  ["OR", 5],
]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function cleanInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function nullableInt(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function nullableIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(number)) return null;
  const date = new Date(number);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function nullableText(value) {
  return typeof value === "string" ? value : null;
}

function safeText(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
  return sorted;
}

function opaqueRevision(value) {
  return `farm-catalog-v1:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function unavailable(message, reason = "no_authoritative_data") {
  return { status: "unavailable", reason, message };
}

function cropDefinition(id, ugcById) {
  const key = String(id ?? "");
  return cropById.get(key) ?? ugcById.get(key);
}

function cropIdentity(crop) {
  if (!crop) {
    return {
      identity_state: "unavailable",
      name: null,
      rarity: null,
    };
  }
  return {
    identity_state: "known",
    name: typeof crop.name === "string" && crop.name ? crop.name : null,
    rarity: RARITY_ORDER.has(crop.rarity) ? crop.rarity : null,
  };
}

function projectShopItem({
  kind,
  itemId,
  name = null,
  rarity = null,
  price = null,
  currency = null,
  quantity = null,
  availableQuantity = null,
  dailyLimit = null,
  purchasedToday = null,
  condition = null,
  source,
  identityState = "known",
}) {
  return {
    kind,
    item_id: String(itemId),
    identity_state: identityState,
    name,
    rarity: RARITY_ORDER.has(rarity) ? rarity : null,
    price: nullableInt(price),
    currency,
    quantity: quantity === null ? null : nullableInt(quantity),
    available_quantity: availableQuantity === null ? null : nullableInt(availableQuantity),
    daily_limit: dailyLimit === null ? null : nullableInt(dailyLimit),
    purchased_today: purchasedToday === null ? null : nullableInt(purchasedToday),
    condition: nullableText(condition),
    source,
  };
}

function projectShop(farm, now) {
  const refreshAt = isObject(farm.shop) ? Number(farm.shop.refreshAt) : NaN;
  if (!isObject(farm.shop) || !Object.hasOwn(farm.shop, "refreshAt") || !Number.isFinite(refreshAt) || refreshAt <= 0) {
    return unavailable("商店还没有初始化的持久化货架。", "not_initialized");
  }

  const refreshedAt = nullableIso(farm.shop.refreshAt);
  const nextRefreshAt = nullableIso(refreshAt + SHOP_REFRESH_MS);
  const day = currentDayIndex(now);
  const potionBought = farm.potionBuy?.day === day ? cleanInt(farm.potionBuy.n) : 0;
  const items = [
    projectShopItem({
      kind: "seed",
      itemId: "common",
      name: "普通种子",
      price: SEED_PRICE.common,
      currency: "gold",
      quantity: null,
      availableQuantity: null,
      source: "permanent",
    }),
    projectShopItem({
      kind: "seed",
      itemId: "fantasy",
      name: "奇幻种子",
      price: SEED_PRICE.fantasy,
      currency: "gold",
      quantity: null,
      availableQuantity: null,
      source: "permanent",
    }),
    projectShopItem({
      kind: "potion",
      itemId: "speed_potion",
      name: ITEMS.speed_potion?.name ?? null,
      price: ITEMS.speed_potion?.price,
      currency: "gold",
      quantity: null,
      availableQuantity: Math.max(0, POTION_DAILY_CAP - potionBought),
      dailyLimit: POTION_DAILY_CAP,
      purchasedToday: potionBought,
      source: "permanent",
    }),
  ];

  const recipeId = typeof farm.shop.recipe === "string" ? farm.shop.recipe : null;
  if (recipeId) {
    const crop = cropDefinition(recipeId, new Map(allUgc().map((item) => [item.id, item])));
    const known = Array.isArray(farm.knownRecipes) && farm.knownRecipes.includes(recipeId);
    items.push(
      projectShopItem({
        kind: "recipe",
        itemId: recipeId,
        name: crop?.name ?? null,
        rarity: crop?.rarity ?? null,
        price: RECIPE_PRICE,
        currency: "gold",
        quantity: 1,
        availableQuantity: known ? 0 : 1,
        dailyLimit: 1,
        purchasedToday: known ? 1 : 0,
        condition: known ? "already_owned" : null,
        source: "persisted",
        identityState: crop ? "known" : "unavailable",
      }),
    );
  }

  const potionSet = farm.shop.potionSet;
  if (isObject(potionSet)) {
    const qty = nullableInt(potionSet.qty);
    const price = nullableInt(potionSet.price);
    const buyers = Array.isArray(potionSet.buyers) ? potionSet.buyers : [];
    const bought = buyers.includes(farm.id) ? 1 : 0;
    items.push(
      projectShopItem({
        kind: "potion_set",
        itemId: "potion_set",
        name: "药水套装",
        price,
        currency: "gold",
        quantity: qty,
        availableQuantity: bought ? 0 : qty,
        dailyLimit: 1,
        purchasedToday: bought,
        condition: bought ? "already_owned" : null,
        source: "persisted",
      }),
    );
  }

  const limited = farm.shop.npcSeed;
  if (isObject(limited) && typeof limited.id === "string" && limited.id) {
    const ugcById = new Map(allUgc().map((item) => [item.id, item]));
    const crop = cropDefinition(limited.id, ugcById);
    items.push(
      projectShopItem({
        kind: "seed",
        itemId: limited.id,
        name: crop?.name ?? null,
        rarity: crop?.rarity ?? null,
        price: limited.price,
        currency: "gold",
        quantity: 1,
        availableQuantity: 1,
        dailyLimit: 1,
        purchasedToday: 0,
        source: "persisted",
        identityState: crop ? "known" : "unavailable",
      }),
    );
  }

  return {
    status: "available",
    initialized: true,
    revision: opaqueRevision({
      shop: farm.shop,
      potion_buy: farm.potionBuy ?? null,
    }),
    refreshed_at: refreshedAt,
    next_refresh_at: nextRefreshAt,
    items,
  };
}

function projectInventoryItem(kind, id, quantity, definition) {
  return {
    kind,
    item_id: String(id),
    identity_state: definition ? "known" : "unavailable",
    name: definition?.name ?? null,
    rarity: RARITY_ORDER.has(definition?.rarity) ? definition.rarity : null,
    quantity: cleanInt(quantity),
  };
}

function projectBackpack(farm) {
  const items = [];
  const ugcById = new Map(allUgc().map((item) => [item.id, item]));
  for (const [id, quantity] of Object.entries(isObject(farm.seeds) ? farm.seeds : {})) {
    if (cleanInt(quantity) <= 0) continue;
    items.push(projectInventoryItem("seed", id, quantity, cropDefinition(id, ugcById)));
  }
  for (const [id, quantity] of Object.entries(isObject(farm.materials) ? farm.materials : {})) {
    if (cleanInt(quantity) <= 0) continue;
    items.push(projectInventoryItem("material", id, quantity, materialById.get(id)));
  }
  for (const [id, quantity] of Object.entries(isObject(farm.items) ? farm.items : {})) {
    if (cleanInt(quantity) <= 0) continue;
    items.push(projectInventoryItem("item", id, quantity, ITEMS[id]));
  }
  return { status: "available", items };
}

function projectCodexEntry(id, record, starred, ugcById) {
  const crop = cropDefinition(id, ugcById);
  const identity = cropIdentity(crop);
  const discovered = record !== undefined;
  return {
    crop_id: String(id),
    identity_state: identity.identity_state,
    name: identity.name,
    latin_name: crop?.latin ?? null,
    description: crop?.desc ?? null,
    category: ["common", "fantasy", "limited", "ugc"].includes(crop?.category)
      ? crop.category
      : null,
    rarity: identity.rarity,
    grow_ticks: nullableInt(crop?.growTicks),
    seed_price: nullableInt(crop?.seedPrice),
    sell_price: nullableInt(crop?.sellPrice),
    unlock_condition: nullableText(crop?.unlockCond),
    discovered,
    discovery_count: discovered ? nullableInt(record?.count) : null,
    best_quality: discovered ? nullableInt(record?.bestQuality) : null,
    first_discovered_at: discovered ? nullableIso(record?.firstAt) : null,
    starred,
  };
}

function projectCodex(farm) {
  const ugcById = new Map(allUgc().map((item) => [item.id, item]));
  const records = isObject(farm.codex) ? farm.codex : {};
  const starredIds = new Set(Array.isArray(farm.starred) ? farm.starred.filter((id) => typeof id === "string") : []);
  const ids = new Set([
    ...crops.map((crop) => crop.id),
    ...ugcById.keys(),
    ...Object.keys(records),
    ...starredIds,
  ]);
  const categoryOrder = new Map([
    ["common", 0],
    ["fantasy", 1],
    ["limited", 2],
    ["ugc", 3],
  ]);
  const entries = [...ids]
    .map((id) => projectCodexEntry(id, records[id], starredIds.has(id), ugcById))
    .sort((left, right) => {
      const categoryDifference = (categoryOrder.get(left.category) ?? 4) - (categoryOrder.get(right.category) ?? 4);
      if (categoryDifference) return categoryDifference;
      const rarityDifference = (RARITY_ORDER.get(left.rarity) ?? 6) - (RARITY_ORDER.get(right.rarity) ?? 6);
      if (rarityDifference) return rarityDifference;
      const leftKnownName = left.name ?? "";
      const rightKnownName = right.name ?? "";
      return leftKnownName.localeCompare(rightKnownName, "zh-Hans-CN") || left.crop_id.localeCompare(right.crop_id);
    });
  return { status: "available", entries };
}

function projectTitle(id) {
  const titleId = typeof id === "string" ? id : "";
  if (!titleId) return null;
  const title = titleById(titleId);
  return title
    ? { identity_state: "known", title_id: titleId, name: title.name }
    : { identity_state: "unavailable", title_id: titleId, name: null };
}

function projectSettings(farm) {
  const unlockedIds = Array.isArray(farm.titles) ? farm.titles.filter((id) => typeof id === "string") : [];
  const equippedId = typeof farm.titleEquipped === "string" && farm.titleEquipped ? farm.titleEquipped : null;
  const equipped = equippedId ? projectTitle(equippedId) : null;
  const social = isObject(farm.social) ? farm.social : {};
  const boolOrNull = (value) => typeof value === "boolean" ? value : null;
  return {
    status: "available",
    farm_name: safeText(farm.name),
    ai_name: nullableText(farm.aiName),
    human_name: nullableText(farm.humanName),
    welcome_message: nullableText(farm.welcome),
    equipped_title: equipped,
    unlocked_titles: unlockedIds.map(projectTitle).filter(Boolean),
    social: {
      visit: boolOrNull(social.visit),
      steal: boolOrNull(social.steal),
      water: boolOrNull(social.water),
      message: boolOrNull(social.message),
    },
  };
}

function projectSmelting(farm) {
  const rawMaterials = isObject(farm.materials) ? farm.materials : {};
  const materialRows = Object.entries(rawMaterials)
    .filter(([, quantity]) => cleanInt(quantity) > 0)
    .map(([id, quantity]) => {
      const definition = materialById.get(id);
      return {
        material_id: id,
        identity_state: definition ? "known" : "unavailable",
        name: definition?.name ?? null,
        rarity: RARITY_ORDER.has(definition?.rarity) ? definition.rarity : null,
        quantity: cleanInt(quantity),
      };
    });
  const quantities = new Map(materialRows.map((row) => [row.material_id, row.quantity]));
  const knownIds = Array.isArray(farm.knownRecipes)
    ? farm.knownRecipes.filter((id) => typeof id === "string")
    : [];
  const recipeRows = knownIds.map((recipeId) => {
    const recipe = recipes.find((item) => item.output === recipeId);
    const output = recipe ? cropById.get(recipe.output) : null;
    const known = !!recipe && !!output;
    const requirementCounts = new Map();
    for (const materialId of Array.isArray(recipe?.materials) ? recipe.materials : []) {
      if (typeof materialId !== "string" || !materialId) continue;
      requirementCounts.set(materialId, (requirementCounts.get(materialId) ?? 0) + 1);
    }
    const requiredMaterials = [...requirementCounts].map(([materialId, quantity]) => {
      const definition = materialById.get(materialId);
      return {
        material_id: materialId,
        identity_state: definition ? "known" : "unavailable",
        name: definition?.name ?? null,
        quantity,
      };
    });
    return {
      recipe_id: recipeId,
      identity_state: known ? "known" : "unavailable",
      output_crop_id: output?.id ?? null,
      output_name: output?.name ?? null,
      materials: requiredMaterials,
      known: known,
      can_start:
        known &&
        requiredMaterials.every(
          (material) => (quantities.get(material.material_id) ?? 0) >= material.quantity,
        ),
    };
  });
  return {
    status: "available",
    write_status: "available",
    revision: smeltingActionRevision(farm),
    materials: materialRows,
    recipes: recipeRows,
  };
}

function projectExpeditionLog(entry) {
  if (!isObject(entry)) return null;
  const eventId = typeof entry.eventId === "string" && entry.eventId ? entry.eventId : null;
  const event = eventId ? expEventById.get(eventId) : null;
  return {
    event_id: eventId,
    title: event?.title ?? (typeof entry.title === "string" && entry.title ? entry.title : null),
    text: safeText(entry.text),
    at: nullableIso(entry.at),
  };
}

function projectExpeditionPending(pending) {
  if (!isObject(pending) || !["choice", "combat"].includes(pending.type) || typeof pending.eventId !== "string") {
    return null;
  }
  const event = expEventById.get(pending.eventId);
  const options = event?.options?.map((option) => ({
    key: safeText(option.key),
    label: safeText(option.label),
  })).filter((option) => option.key && option.label) ?? null;
  return {
    kind: pending.type,
    event_id: pending.eventId,
    identity_state: event ? "known" : "unavailable",
    title: event?.title ?? null,
    options,
    foe: event?.foe ?? null,
    difficulty: ["easy", "mid", "hard"].includes(event?.difficulty) ? event.difficulty : null,
  };
}

function projectExpeditionDrop(drop) {
  if (!isObject(drop) || !["coins", "silver", "potion", "decor"].includes(drop.t)) return null;
  if (drop.t === "coins") {
    return { kind: "coins", quantity: nullableInt(drop.n), item_id: null, identity_state: "known", name: "金币" };
  }
  if (drop.t === "silver") {
    return { kind: "silver", quantity: nullableInt(drop.n), item_id: null, identity_state: "known", name: "银币" };
  }
  if (drop.t === "potion") {
    return { kind: "potion", quantity: nullableInt(drop.n), item_id: "speed_potion", identity_state: "known", name: ITEMS.speed_potion?.name ?? null };
  }
  const definition = typeof drop.id === "string" ? expDecorById.get(drop.id) : null;
  return {
    kind: "decor",
    quantity: 1,
    item_id: typeof drop.id === "string" && drop.id ? drop.id : null,
    identity_state: definition ? "known" : "unavailable",
    name: definition?.name ?? null,
  };
}

function projectExpedition(farm, now) {
  const day = currentDayIndex(now);
  const daily = isObject(farm.expDaily) && farm.expDaily.day === day ? cleanInt(farm.expDaily.n) : 0;
  const active = isObject(farm.expedition);
  const exp = active ? farm.expedition : null;
  const map = exp?.mapId ? expMapById.get(exp.mapId) : null;
  const rawBag = Array.isArray(exp?.bag) ? exp.bag : [];
  const rawLog = Array.isArray(exp?.log) ? exp.log : [];
  const journeys = Array.isArray(farm.expJourneys) ? farm.expJourneys : [];
  const projectJourney = (journey) => {
    if (!isObject(journey)) return null;
    const mapId = typeof journey.mapId === "string" && journey.mapId ? journey.mapId : null;
    const mapDefinition = mapId ? expMapById.get(mapId) : null;
    return {
      map_id: mapId,
      map_name: mapDefinition?.name ?? null,
      at: nullableIso(journey.at),
      summary: safeText(journey.summary),
      log: (Array.isArray(journey.log) ? journey.log : []).map(projectExpeditionLog).filter(Boolean),
    };
  };
  return {
    status: "available",
    daily_limit: EXP_DAILY_CAP,
    used_today: daily,
    remaining_today: Math.max(0, EXP_DAILY_CAP - daily),
    active,
    map_id: typeof exp?.mapId === "string" && exp.mapId ? exp.mapId : null,
    map_name: map?.name ?? null,
    step: active ? nullableInt(exp.step) : null,
    hp: active ? nullableInt(exp.hp) : null,
    pending: active ? projectExpeditionPending(exp.pending) : null,
    bag: rawBag.map(projectExpeditionDrop).filter(Boolean),
    seen_event_ids: Array.isArray(farm.expCodex) ? farm.expCodex.filter((id) => typeof id === "string") : [],
    log: rawLog.map(projectExpeditionLog).filter(Boolean),
    journeys: journeys.map(projectJourney).filter(Boolean),
  };
}

function projectMessage(message) {
  if (!isObject(message) || typeof message.text !== "string" || !message.text.trim()) return null;
  const by = typeof message.by === "string" && FARM_DOORPLATE_RE.test(message.by) ? message.by : null;
  return {
    id: typeof message.id === "string" && message.id ? message.id : null,
    author_farm_doorplate: by,
    author_name: nullableText(message.name),
    text: message.text,
    at: nullableIso(message.at),
  };
}

function projectMessageBoard(boardFarm, own = false) {
  const closed = boardFarm.guestbook === false;
  const aiName = typeof boardFarm.aiName === "string" ? boardFarm.aiName.trim() : "";
  const messages = closed
    ? []
    : (Array.isArray(boardFarm.messages) ? boardFarm.messages : [])
      .map(projectMessage)
      .filter(Boolean)
      .slice(-10)
      .reverse();
  return {
    farm_doorplate: String(boardFarm.id),
    farm_name: safeText(boardFarm.name),
    ai_name: aiName || null,
    is_own: own,
    status: closed ? "closed" : "open",
    messages,
  };
}

function projectBulletin(farm) {
  const messages = (Array.isArray(farm.messages) ? farm.messages : [])
    .map(projectMessage)
    .filter(Boolean)
    .slice(-10)
    .reverse();
  const ranchNotices = (Array.isArray(farm.ranch?.notices) ? farm.ranch.notices : [])
    .filter((notice) => isObject(notice) && typeof notice.text === "string" && notice.text.trim())
    .map((notice) => ({
      text: notice.text,
      at: nullableIso(notice.at),
      section: typeof notice.section === "string" && notice.section ? notice.section : null,
    }));
  return {
    status: "available",
    messages,
    ranch_notices: ranchNotices,
    tasks: unavailable("任务槽需要旧的时间推进器，当前没有无副作用读取合同。"),
    mature_broadcast: unavailable("成熟播报需要旧的时间推进器，当前没有无副作用读取合同。"),
  };
}

function projectNeighborhood(farm, now) {
  const farms = playerFarms();
  if (!farms.some((item) => item.id === farm.id)) farms.push(farm);
  const ugcs = allUgc();
  const leaderboards = buildLeaderboards(farms, ugcs, now);
  const rankings = {};
  for (const [key, rows] of Object.entries(leaderboards)) {
    if (key === "hot" || !Array.isArray(rows)) continue;
    rankings[key] = rows.flatMap((row) => {
      if (!FARM_DOORPLATE_RE.test(String(row.code ?? "")) || !row.name) return [];
      return [{
        farm_doorplate: row.code,
        farm_name: row.name,
        value: cleanInt(row.value),
        equipped_title: nullableText(row.title),
      }];
    });
  }
  const originalCrops = ugcs.map((crop) => ({
    crop_id: String(crop.id),
    identity_state: "known",
    name: typeof crop.name === "string" && crop.name ? crop.name : null,
    designer_name: nullableText(crop.designer),
    buyers: nullableInt(Array.isArray(crop.buyers) ? crop.buyers.length : 0),
    banned: typeof crop.banned === "boolean" ? crop.banned : null,
  })).filter((crop) => crop.name !== null);
  const messages = (Array.isArray(farm.messages) ? farm.messages : [])
    .map(projectMessage)
    .filter(Boolean)
    .slice(-10)
    .reverse();
  const messageBoards = [
    projectMessageBoard(farm, true),
    ...farms
      .filter((item) => item.id !== farm.id && item.social?.visit !== false)
      .map((item) => projectMessageBoard(item)),
  ];
  return {
    status: "available",
    rankings,
    messages,
    message_boards: messageBoards,
    original_crops: originalCrops,
  };
}

const MARKET_KINDS = new Set(["seed", "material", "ingredient", "dish"]);

function marketDefinition(kind, itemId, ugcById, listing = null) {
  if (kind === "seed") return cropDefinition(itemId, ugcById);
  if (kind === "material") return materialById.get(itemId);
  if (kind === "ingredient") return cookingIngredientById.get(itemId);
  if (kind === "dish") return isObject(listing?.dish) ? listing.dish : cookingRecipeById.get(itemId);
  return null;
}

function projectMarketPart(part, ugcById) {
  if (!isObject(part) || !MARKET_KINDS.has(part.kind)) return null;
  const itemId = typeof part.id === "string" && part.id ? part.id : null;
  if (!itemId) return null;
  const definition = marketDefinition(part.kind, itemId, ugcById);
  return {
    kind: part.kind,
    item_id: itemId,
    identity_state: definition ? "known" : "unavailable",
    name: definition?.name ?? null,
    rarity: RARITY_ORDER.has(definition?.rarity) ? definition.rarity : null,
    quantity: nullableInt(part.qty),
  };
}

function projectMarketListing(seller, listing, ugcById) {
  if (!isObject(listing) || !MARKET_KINDS.has(listing.kind)) return null;
  const itemId = typeof listing.id === "string" && listing.id ? listing.id : null;
  if (!itemId) return null;
  const definition = marketDefinition(listing.kind, itemId, ugcById, listing);
  return {
    seller_farm_doorplate: String(seller.id),
    kind: listing.kind,
    item_id: itemId,
    identity_state: definition ? "known" : "unavailable",
    name: definition?.name ?? null,
    rarity: RARITY_ORDER.has(definition?.rarity) ? definition.rarity : null,
    quantity: cleanInt(listing.qty),
    price: nullableInt(listing.price),
  };
}

function projectHumanBarterListing(seller, listing, ugcById) {
  const listingId = typeof listing?.id === "string" && listing.id ? listing.id : null;
  if (!listingId) return null;
  const give = projectMarketPart(listing.give, ugcById);
  const want = projectMarketPart(listing.want, ugcById);
  if (!give || !want) return null;
  return {
    seller_farm_doorplate: String(seller.id),
    listing_id: listingId,
    give,
    want,
  };
}

function projectMarket(farm) {
  const ugcById = new Map(allUgc().map((item) => [item.id, item]));
  const sellers = playerFarms().map((seller) => seller.id === farm.id ? farm : seller);
  if (!sellers.some((seller) => seller.id === farm.id)) sellers.push(farm);
  const listings = [];
  const barterListings = [];
  for (const seller of sellers) {
    for (const listing of Array.isArray(seller.market) ? seller.market : []) {
      const projected = projectMarketListing(seller, listing, ugcById);
      if (projected) listings.push(projected);
    }
    for (const listing of Array.isArray(seller.humanBarters) ? seller.humanBarters : []) {
      const projected = projectHumanBarterListing(seller, listing, ugcById);
      if (projected) barterListings.push(projected);
    }
  }
  return { status: "available", listings, barter_listings: barterListings };
}

/**
 * Project only persisted farm state and immutable content definitions.  No
 * lazy time advancement, shop refresh, title check, notification take, or
 * save is performed here.
 */
export function projectHumanFarmCatalog(farm, now = Date.now()) {
  if (!farm || typeof farm !== "object") throw new TypeError("Farm catalog requires a farm");
  const data = {
    farm: {
      farm_doorplate: String(farm.id ?? ""),
      farm_name: safeText(farm.name),
    },
    shop: projectShop(farm, now),
    backpack: projectBackpack(farm),
    codex: projectCodex(farm),
    settings: projectSettings(farm),
    expedition: projectExpedition(farm, now),
    smelting: projectSmelting(farm),
    bulletin: projectBulletin(farm),
    neighborhood: projectNeighborhood(farm, now),
    market: projectMarket(farm),
  };
  return {
    data,
    revision: opaqueRevision({ farm: data.farm, settings: data.settings }),
    codex_revision: cropCodexActionRevision(farm, now),
    original_plant_revision: originalPlantActionRevision(farm, now),
    expedition_revision: expeditionActionRevision(farm, now),
    market_revision: marketActionRevision(farm, now),
    neighborhood_revision: neighborhoodMessageActionRevision(farm, now),
    server_time: new Date(now).toISOString(),
  };
}

export const projectFarmCatalog = projectHumanFarmCatalog;
export const farmCatalogStructured = { projectHumanFarmCatalog };
