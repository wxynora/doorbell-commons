import { createHash } from "node:crypto";
import {
  accessoryById,
  animalById,
  animals,
  cooking,
  cookingProductById,
  cropById,
  decorationById,
  expDecorById,
  pets,
  petById,
} from "../content.js";
import {
  RANCH_PATROL_GOOSE_ID,
  RANCH_PATROL_GOOSE_NAME,
  RANCH_ANIMAL_MAX_LEVEL,
  RANCH_LEVEL_INCOME_STEP,
} from "../config.js";
import { glimmerAnimalVariantMultiplier, glimmerBuffMultiplier } from "../glimmer.js";

const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 256 || /[<>]/u.test(text) || /(?:https?|javascript):/iu.test(text)) {
    return null;
  }
  return text;
}

function safeId(value) {
  return typeof value === "string" && ID_RE.test(value) ? value : null;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeLevel(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= RANCH_ANIMAL_MAX_LEVEL ? value : null;
}

function safeMoney(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeBoolean(value, fallback = null) {
  return typeof value === "boolean" ? value : fallback;
}

function safeTimestamp(value) {
  if (!Number.isSafeInteger(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeTimestampMs(value) {
  if (!Number.isSafeInteger(value)) return null;
  return Number.isFinite(new Date(value).getTime()) ? value : null;
}

function itemStatus(itemId, definition) {
  return definition && safeId(itemId) ? "known" : "unavailable";
}

function projectAccessory(itemId) {
  const definition = typeof itemId === "string" ? accessoryById.get(itemId) : undefined;
  const status = itemStatus(itemId, definition);
  return {
    status,
    accessory_id: status === "known" ? definition.id : null,
    name: status === "known" ? safeText(definition.name) : null,
  };
}

function projectDecoration(itemId) {
  const definition = typeof itemId === "string"
    ? decorationById.get(itemId) ?? expDecorById.get(itemId)
    : undefined;
  const status = itemStatus(itemId, definition);
  return {
    status,
    decoration_id: status === "known" ? definition.id : null,
    name: status === "known" ? safeText(definition.name) : null,
  };
}

function projectOwnedAccessories(value) {
  if (!Array.isArray(value)) {
    return { status: "unavailable", items: [] };
  }
  return { status: "available", items: value.map(projectAccessory) };
}

function projectOwnedDecorations(value) {
  if (!Array.isArray(value)) {
    return { status: "unavailable", items: [] };
  }
  return { status: "available", items: value.map(projectDecoration) };
}

function projectOutputEntry(itemId, itemName, pending, unitValue, boosted = null) {
  const item = typeof itemId === "string" ? cookingProductById.get(itemId) : undefined;
  const status = item && safeId(itemId) && safeCount(pending) !== null && safeMoney(unitValue) !== null
    ? "known"
    : "unavailable";
  return {
    status,
    item_id: status === "known" ? item.id : null,
    name: status === "known" ? safeText(item.name ?? itemName) : null,
    pending_count: status === "known" ? pending : null,
    unit_value: status === "known" ? unitValue : null,
    boosted: status === "known" ? safeBoolean(boosted, false) : null,
  };
}

function animalUnitValue(animal, kind, now) {
  const level = safeLevel(animal.level ?? 1);
  if (!kind || level === null) return null;
  let value = Math.round(kind.producePrice * (1 + (level - 1) * RANCH_LEVEL_INCOME_STEP));
  value = Math.round(value * glimmerAnimalVariantMultiplier(animal));
  return Math.round(value * glimmerBuffMultiplier("ranchValue", now));
}

function projectProduce(animal, kind, now) {
  if (!kind) return null;
  const unitValue = animalUnitValue(animal, kind, now);
  const primary = projectOutputEntry(
    kind.produceId,
    kind.produce,
    animal.pending,
    unitValue,
    animal.pendingBoost,
  );
  let meat = null;
  if (kind.meatId) {
    const meatValue = unitValue === null || !Number.isFinite(Number(cooking.meatValueMultiplier))
      ? null
      : Math.round(unitValue * cooking.meatValueMultiplier);
    meat = projectOutputEntry(kind.meatId, kind.meat, animal.pendingMeat, meatValue);
  }
  return {
    status: primary.status === "known" && (!meat || meat.status === "known") ? "available" : "unavailable",
    item: primary,
    meat,
  };
}

function projectIdentity(type, raw, kind) {
  const status = kind && isRecord(raw) ? "known" : "unavailable";
  const kindId = status === "known" ? kind.id : null;
  const defaultName = status === "known"
    ? type === "patrol_goose" ? RANCH_PATROL_GOOSE_NAME : kind.name
    : null;
  return {
    status,
    kind_id: kindId,
    name: status === "known" ? safeText(defaultName) : null,
  };
}

function projectDispatchForResident(kindId, raids, now) {
  const raw = raids.find((raid) => isRecord(raid) && raid.animalKindId === kindId);
  if (!raw) return null;
  const raidId = safeId(raw.id) && UUID_RE.test(raw.id) ? raw.id : null;
  const kind = animalById.get(kindId);
  const startedAt = safeTimestampMs(raw.startedAt);
  const endsAt = safeTimestampMs(raw.endsAt);
  const reservedCoins = safeMoney(raw.reservedCoins);
  if (!raidId || !kind || startedAt === null || endsAt === null || reservedCoins === null) {
    return {
      status: "unavailable",
      state: "unavailable",
      raid_id: null,
      animal_kind_id: null,
      animal_name: null,
      started_at: null,
      ends_at: null,
      remaining_ms: null,
      reserved_coins: null,
    };
  }
  const remainingMs = Math.max(0, endsAt - now);
  return {
    status: "known",
    state: endsAt > now ? "active" : "pending_settlement",
    raid_id: raidId,
    animal_kind_id: kind.id,
    animal_name: safeText(kind.name),
    started_at: safeTimestamp(startedAt),
    ends_at: safeTimestamp(endsAt),
    remaining_ms: remainingMs,
    reserved_coins: reservedCoins,
  };
}

function projectResident(type, raw, now, raids, pinned) {
  const kindId = type === "patrol_goose" ? RANCH_PATROL_GOOSE_ID : raw?.kindId;
  const kind = type === "animal" ? animalById.get(kindId) : type === "pet" ? petById.get(kindId) : { id: RANCH_PATROL_GOOSE_ID, name: RANCH_PATROL_GOOSE_NAME };
  const identity = projectIdentity(type, raw, kind);
  const known = identity.status === "known";
  const accessories = known
    ? projectOwnedAccessories(raw?.acc ?? [])
    : { status: "unavailable", items: [] };
  const dispatch = type === "animal" && known ? projectDispatchForResident(kind.id, raids, now) : null;
  const level = type === "animal" && known ? safeLevel(raw?.level ?? 1) : null;
  const produce = type === "animal" && known ? projectProduce(raw, kind, now) : null;
  const pinnedState = known
    ? Array.isArray(pinned) ? pinned.includes(kind.id) : pinned === undefined ? false : null
    : null;
  return {
    status: identity.status,
    identity: {
      ...identity,
      custom_name: known ? safeText(raw?.name) : null,
    },
    level,
    pinned: pinnedState,
    accessories,
    produce,
    dispatch: dispatch
      ? { state: dispatch.state, raid_id: dispatch.raid_id }
      : type === "animal" && known
        ? { state: "home", raid_id: null }
        : null,
  };
}

function projectDispatch(raids, now) {
  if (!Array.isArray(raids)) return { status: "unavailable", active: [] };
  return {
    status: "available",
    active: raids.map((raid) => {
      if (!isRecord(raid)) {
        return {
          status: "unavailable",
          state: "unavailable",
          raid_id: null,
          animal_kind_id: null,
          animal_name: null,
          started_at: null,
          ends_at: null,
          remaining_ms: null,
          reserved_coins: null,
        };
      }
      const kind = animalById.get(raid.animalKindId);
      const raidId = safeId(raid.id) && UUID_RE.test(raid.id) ? raid.id : null;
      const startedAt = safeTimestampMs(raid.startedAt);
      const endsAt = safeTimestampMs(raid.endsAt);
      const reservedCoins = safeMoney(raid.reservedCoins);
      if (!kind || !raidId || startedAt === null || endsAt === null || reservedCoins === null) {
        return {
          status: "unavailable",
          state: "unavailable",
          raid_id: null,
          animal_kind_id: null,
          animal_name: null,
          started_at: null,
          ends_at: null,
          remaining_ms: null,
          reserved_coins: null,
        };
      }
      return {
        status: "known",
        state: endsAt > now ? "active" : "pending_settlement",
        raid_id: raidId,
        animal_kind_id: kind.id,
        animal_name: safeText(kind.name),
        started_at: safeTimestamp(startedAt),
        ends_at: safeTimestamp(endsAt),
        remaining_ms: Math.max(0, endsAt - now),
        reserved_coins: reservedCoins,
      };
    }),
  };
}

function projectShopItem(kind, owned) {
  const known = !!kind && safeId(kind.id) !== null && safeText(kind.name) !== null && safeMoney(kind.buyCost) !== null;
  return {
    status: known ? "known" : "unavailable",
    kind_id: known ? kind.id : null,
    name: known ? safeText(kind.name) : null,
    category: known ? safeText(kind.category) : null,
    price: known ? kind.buyCost : null,
    owned: known ? owned : null,
    available_quantity: known && typeof owned === "boolean" ? owned ? 0 : 1 : null,
  };
}

function projectDailyShopItem(itemId, owned, decoration = false) {
  if (decoration) {
    const definition = typeof itemId === "string" ? decorationById.get(itemId) ?? expDecorById.get(itemId) : undefined;
    const known = !!definition && safeId(definition.id) !== null && safeText(definition.name) !== null && safeMoney(definition.price) !== null;
    return {
      status: known ? "known" : "unavailable",
      decoration_id: known ? definition.id : null,
      name: known ? safeText(definition.name) : null,
      price: known ? definition.price : null,
      owned: known ? owned : null,
      available_quantity: known && typeof owned === "boolean" ? owned ? 0 : 1 : null,
    };
  }
  const definition = typeof itemId === "string" ? accessoryById.get(itemId) : undefined;
  const known = !!definition && safeId(definition.id) !== null && safeText(definition.name) !== null && safeMoney(definition.price) !== null;
  return {
    status: known ? "known" : "unavailable",
    accessory_id: known ? definition.id : null,
    name: known ? safeText(definition.name) : null,
    price: known ? definition.price : null,
    owned: known ? owned : null,
    available_quantity: known ? null : null,
  };
}

function projectShop(farm, ranch, residentArrays) {
  if (!ranch || !isRecord(farm.codex)) {
    return {
      animals: { status: "unavailable", shop_day: null, items: [] },
      pets: { status: "unavailable", shop_day: null, items: [] },
      accessories: { status: "unavailable", shop_day: null, items: [] },
      decorations: { status: "unavailable", shop_day: null, items: [] },
    };
  }
  const animalOwned = residentArrays.animals;
  const petOwned = residentArrays.pets;
  const arraysAvailable = Array.isArray(animalOwned) && Array.isArray(petOwned);
  const codexCount = Object.keys(farm.codex).filter((id) => cropById.has(id)).length;
  const unlockedAnimals = animals.filter((kind) => codexCount >= kind.unlockCodex).sort((a, b) => a.unlockCodex - b.unlockCodex);
  const unlockedPets = pets.filter((kind) => codexCount >= kind.unlockCodex).sort((a, b) => a.unlockCodex - b.unlockCodex);
  const animalIds = arraysAvailable ? new Set(animalOwned.filter(isRecord).map((item) => item.kindId)) : null;
  const petIds = arraysAvailable ? new Set(petOwned.filter(isRecord).map((item) => item.kindId)) : null;
  const animalItems = unlockedAnimals.map((kind) => projectShopItem(kind, animalIds?.has(kind.id) ?? null));
  const petItems = unlockedPets.map((kind) => projectShopItem(kind, petIds?.has(kind.id) ?? null));

  const shop = ranch.shop;
  const dailyAvailable = isRecord(shop) && Number.isSafeInteger(shop.day) && shop.day >= 0 && Array.isArray(shop.acc) && Array.isArray(shop.decor);
  const accessoryIds = dailyAvailable ? shop.acc : [];
  const decorationIds = dailyAvailable ? shop.decor : [];
  const ownedAccessories = Array.isArray(ranch.wardrobe) ? new Set(ranch.wardrobe) : null;
  const ownedDecorations = Array.isArray(ranch.decor) && Array.isArray(ranch.decorStore)
    ? new Set([...ranch.decor, ...ranch.decorStore])
    : null;
  return {
    animals: { status: arraysAvailable ? "available" : "unavailable", shop_day: null, items: animalItems },
    pets: { status: arraysAvailable ? "available" : "unavailable", shop_day: null, items: petItems },
    accessories: {
      status: dailyAvailable ? "available" : "unavailable",
      shop_day: dailyAvailable ? shop.day : null,
      items: accessoryIds.map((id) => projectDailyShopItem(id, ownedAccessories?.has(id) ?? null)),
    },
    decorations: {
      status: dailyAvailable ? "available" : "unavailable",
      shop_day: dailyAvailable ? shop.day : null,
      items: decorationIds.map((id) => projectDailyShopItem(id, ownedDecorations?.has(id) ?? null, true)),
    },
  };
}

function projectDebt(value) {
  if (value === undefined) return { status: "available", debt_coins: 0 };
  if (!Array.isArray(value)) return { status: "unavailable", debt_coins: null };
  let total = 0;
  for (const entry of value) {
    if (!isRecord(entry) || safeMoney(entry.coins) === null) return { status: "unavailable", debt_coins: null };
    total += entry.coins;
  }
  return Number.isSafeInteger(total) ? { status: "available", debt_coins: total } : { status: "unavailable", debt_coins: null };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "remaining_ms") continue;
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function revisionFor(data) {
  return `ranch-v1:${createHash("sha256").update(JSON.stringify(canonicalize(data))).digest("hex")}`;
}

/**
 * Project the Human Ranch read from existing farm state without advancing,
 * refreshing, settling, saving, buying, collecting, feeding, upgrading,
 * dispatching, catching, or otherwise changing the authoritative state.
 */
export function projectHumanRanch(farm, now = Date.now()) {
  const ranch = isRecord(farm?.ranch) ? farm.ranch : null;
  const residentArrays = {
    animals: ranch?.animals,
    pets: ranch?.pets,
  };
  const animalsAvailable = ranch ? Array.isArray(ranch.animals) : false;
  const petsAvailable = ranch ? Array.isArray(ranch.pets) : false;
  const raids = ranch?.raids;
  const pinned = ranch?.pinned;
  const animalResidents = animalsAvailable
    ? ranch.animals.map((animal) => projectResident("animal", animal, now, Array.isArray(raids) ? raids : [], pinned))
    : [];
  const petResidents = petsAvailable
    ? ranch.pets.map((pet) => projectResident("pet", pet, now, [], pinned))
    : [];
  const patrolGoose = ranch && Object.prototype.hasOwnProperty.call(ranch, "patrolGoose") && ranch.patrolGoose !== null
    ? projectResident("patrol_goose", ranch.patrolGoose, now, [], pinned)
    : null;
  const dispatch = projectDispatch(raids, now);
  const collectableEntries = [];
  let collectableCount = 0;
  let collectableMeatCount = 0;
  let collectableTotalsAvailable = true;
  for (const resident of animalResidents) {
    const produce = resident.produce;
    const kindId = resident.identity.kind_id;
    if (!produce || produce.status !== "available" || !kindId) {
      if (produce?.status === "unavailable") collectableTotalsAvailable = false;
      continue;
    }
    for (const output of [produce.item, produce.meat]) {
      if (!output) continue;
      if (output.status !== "known" || output.pending_count === null) {
        collectableTotalsAvailable = false;
        continue;
      }
      if (output.pending_count > 0) {
        collectableEntries.push({
          resident_type: "animal",
          kind_id: kindId,
          item_id: output.item_id,
          name: output.name,
          pending_count: output.pending_count,
          unit_value: output.unit_value,
          meat: output === produce.meat,
        });
        if (output === produce.meat) collectableMeatCount += output.pending_count;
        else collectableCount += output.pending_count;
      }
    }
  }
  const balanceStatus = ranch && safeMoney(ranch.coins) !== null ? "available" : "unavailable";
  const debt = ranch ? projectDebt(ranch.raidDebts) : { status: "unavailable", debt_coins: null };
  const wardrobe = ranch ? projectOwnedAccessories(ranch.wardrobe ?? []) : { status: "unavailable", items: [] };
  const placed = ranch ? projectOwnedDecorations(ranch.decor ?? []) : { status: "unavailable", items: [] };
  const stored = ranch ? projectOwnedDecorations(ranch.decorStore ?? []) : { status: "unavailable", items: [] };
  const decorationsStatus = placed.status === "available" && stored.status === "available" ? "available" : "unavailable";
  const data = {
    farm: {
      farm_doorplate: FARM_DOORPLATE_RE.test(String(farm?.id ?? "")) ? farm.id : null,
    },
    balance: {
      status: balanceStatus,
      ranch_coins: balanceStatus === "available" ? ranch.coins : null,
      debt_status: debt.status,
      debt_coins: debt.debt_coins,
    },
    residents: {
      status: ranch && animalsAvailable && petsAvailable ? "available" : "unavailable",
      animals: animalResidents,
      pets: petResidents,
      patrol_goose: patrolGoose,
    },
    collectable: {
      status: collectableTotalsAvailable && (ranch === null || animalsAvailable) ? "available" : "unavailable",
      total_pending_count: collectableTotalsAvailable ? collectableCount : null,
      total_pending_meat_count: collectableTotalsAvailable ? collectableMeatCount : null,
      entries: collectableEntries,
    },
    wardrobe,
    decorations: {
      status: decorationsStatus,
      placed: placed.items,
      stored: stored.items,
    },
    dispatch,
    shop: projectShop(farm, ranch, residentArrays),
  };
  return {
    data,
    revision: revisionFor(data),
    server_time: new Date(now).toISOString(),
  };
}
