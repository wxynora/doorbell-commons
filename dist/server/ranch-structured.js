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
  glimmerVariantById,
  glimmerVariants,
  pets,
  petById,
  ranchSkinById,
  ranchVariantById,
} from "../content.js";
import {
  RANCH_PATROL_GOOSE_ID,
  RANCH_PATROL_GOOSE_NAME,
  RANCH_ANIMAL_MAX_LEVEL,
  RANCH_LEVEL_INCOME_STEP,
} from "../config.js";
import {
  animalUpgradeCost,
  ranchFeedAnimal,
  ranchTakeOffAccessory,
  ranchTogglePin,
  ranchUpgradeAnimal,
  ranchWearAccessory,
} from "../engine.js";
import {
  glimmerAnimalVariantMultiplier,
  glimmerBuffMultiplier,
  glimmerVariantSpriteInfo,
} from "../glimmer.js";
import { ranchSkinShop, ranchSkinVariantsFor } from "../domain/ranch/skins.js";

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
      target_farm_doorplate: null,
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
    target_farm_doorplate: FARM_DOORPLATE_RE.test(String(raw.targetFarmId ?? ""))
      ? raw.targetFarmId
      : null,
    started_at: safeTimestamp(startedAt),
    ends_at: safeTimestamp(endsAt),
    remaining_ms: remainingMs,
    reserved_coins: reservedCoins,
  };
}

const RESIDENT_ACTION_NAMES = [
  "feed",
  "upgrade",
  "rename",
  "toggle_pin",
  "wear_accessory",
  "takeoff_accessory",
  "set_variant",
  "dispatch",
];

function actionCost(currency = null, amount = null) {
  return { currency, amount };
}

function allowedAction(enabled, cost, reason = null) {
  return {
    enabled,
    cost,
    reason: enabled ? null : safeText(reason) ?? "当前不可用",
  };
}

function unavailableActions(reason) {
  return Object.fromEntries(
    RESIDENT_ACTION_NAMES.map((action) => [action, allowedAction(false, actionCost(), reason)]),
  );
}

function cloneProbeResident(value) {
  if (!isRecord(value)) return value;
  const copy = { ...value };
  if (Array.isArray(value.acc)) copy.acc = [...value.acc];
  if (Array.isArray(value.glimmerVariants)) copy.glimmerVariants = [...value.glimmerVariants];
  return copy;
}

function cloneProbeCollection(value) {
  return Array.isArray(value) ? value.map(cloneProbeResident) : value;
}

/**
 * Build the smallest throw-away farm shape consumed by the existing ranch
 * authorities.  None of the probe's mutations can reach the read farm.
 */
function actionProbe(farm) {
  const ranch = farm?.ranch;
  if (!isRecord(ranch)) return null;
  return {
    silver: farm?.silver,
    ranch: {
      ...ranch,
      animals: cloneProbeCollection(ranch.animals),
      pets: cloneProbeCollection(ranch.pets),
      patrolGoose: cloneProbeResident(ranch.patrolGoose),
      raids: cloneProbeCollection(ranch.raids),
      pinned: Array.isArray(ranch.pinned) ? [...ranch.pinned] : ranch.pinned,
      wardrobe: Array.isArray(ranch.wardrobe) ? [...ranch.wardrobe] : ranch.wardrobe,
      feedDaily: isRecord(ranch.feedDaily) ? { ...ranch.feedDaily } : ranch.feedDaily,
    },
  };
}

function probeAuthority(farm, run) {
  const probe = actionProbe(farm);
  if (!probe) return null;
  try {
    return run(probe);
  } catch {
    return null;
  }
}

function probeFeedCost(farm, animalIndex, now) {
  const probe = actionProbe(farm);
  const animal = probe?.ranch?.animals?.[animalIndex];
  if (!isRecord(animal)) return null;
  // Remove only the action blockers in the throw-away probe so the existing
  // authority computes the exact fee even when the real resident is capped,
  // already boosted, has pending output, or lacks silver.
  animal.pending = 0;
  animal.pendingMeat = 0;
  animal.feedBoostPending = false;
  probe.ranch.raids = [];
  probe.ranch.feedDaily = undefined;
  probe.silver = Number.MAX_SAFE_INTEGER;
  try {
    const result = ranchFeedAnimal(probe, animalIndex, now);
    return result?.ok && safeMoney(result.cost) !== null ? result.cost : null;
  } catch {
    return null;
  }
}

function actionResidentTarget(type) {
  return type === "patrol_goose" ? "goose" : type;
}

function residentLevelForAction(raw) {
  const value = raw?.level === undefined ? 1 : raw.level;
  return Number.isSafeInteger(value) && value >= 1 && value <= RANCH_ANIMAL_MAX_LEVEL ? value : null;
}

function projectFeedAction(farm, type, raw, kind, index, now, known) {
  if (type !== "animal") {
    return allowedAction(false, actionCost(), "投喂仅适用于生产动物");
  }
  if (!known || !isRecord(raw)) {
    return allowedAction(false, actionCost(), "居民资料不可用");
  }
  const cost = probeFeedCost(farm, index, now);
  const costShape = actionCost(cost === null ? null : "silver", cost);
  if (cost === null) return allowedAction(false, costShape, "投喂费用不可用");
  if (safeMoney(farm?.silver) === null) {
    return allowedAction(false, costShape, "银币余额不可用");
  }
  const result = probeAuthority(farm, (probe) => ranchFeedAnimal(probe, index, now));
  if (!result) return allowedAction(false, costShape, "牧场投喂状态不可用");
  if (!result.ok) return allowedAction(false, costShape, result.error);
  return allowedAction(
    true,
    actionCost("silver", safeMoney(result.cost) === null ? cost : result.cost),
  );
}

function projectUpgradeAction(farm, type, raw, kind, index, known) {
  if (type !== "animal") {
    return allowedAction(false, actionCost(), "升级仅适用于生产动物");
  }
  if (!known || !isRecord(raw) || !kind) {
    return allowedAction(false, actionCost(), "居民资料不可用");
  }
  const level = residentLevelForAction(raw);
  if (level === null) return allowedAction(false, actionCost(), "动物等级不可用");
  if (level >= RANCH_ANIMAL_MAX_LEVEL) {
    return allowedAction(false, actionCost(), "动物已经达到最高等级");
  }
  const cost = animalUpgradeCost(kind, level);
  const costShape = actionCost("ranch_coins", safeMoney(cost) === null ? null : cost);
  if (safeMoney(cost) === null) return allowedAction(false, costShape, "升级费用不可用");
  if (safeMoney(farm?.ranch?.coins) === null) {
    return allowedAction(false, costShape, "牧场金币余额不可用");
  }
  const result = probeAuthority(farm, (probe) => ranchUpgradeAnimal(probe, index));
  if (!result) return allowedAction(false, costShape, "牧场升级状态不可用");
  if (!result.ok) return allowedAction(false, costShape, result.error);
  return allowedAction(
    true,
    actionCost("ranch_coins", safeMoney(result.cost) === null ? cost : result.cost),
  );
}

function projectRenameAction(known) {
  return known
    ? allowedAction(true, actionCost())
    : allowedAction(false, actionCost(), "居民资料不可用");
}

function projectTogglePinAction(farm, type, kind, pinned, known) {
  if (!known || !kind) return allowedAction(false, actionCost(), "居民资料不可用");
  if (pinned !== undefined && !Array.isArray(pinned)) {
    return allowedAction(false, actionCost(), "pin 状态不可用");
  }
  const result = probeAuthority(farm, (probe) => ranchTogglePin(probe, kind.id));
  if (!result) return allowedAction(false, actionCost(), "牧场 pin 状态不可用");
  return result.ok
    ? allowedAction(true, actionCost())
    : allowedAction(false, actionCost(), result.error);
}

function knownAccessoryIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === "string" && accessoryById.has(id)))]
    : null;
}

function projectWearAccessoryAction(farm, type, raw, index, known) {
  if (!known || !isRecord(raw)) return allowedAction(false, actionCost(), "居民资料不可用");
  const wardrobe = knownAccessoryIds(farm?.ranch?.wardrobe);
  if (wardrobe === null) return allowedAction(false, actionCost(), "配饰仓库不可用");
  const worn = raw.acc === undefined ? [] : knownAccessoryIds(raw.acc);
  if (worn === null) return allowedAction(false, actionCost(), "已穿戴配饰状态不可用");
  const candidate = wardrobe.find((id) => !worn.includes(id));
  if (!candidate) return allowedAction(false, actionCost(), "没有可穿戴的配饰");
  const result = probeAuthority(farm, (probe) =>
    ranchWearAccessory(probe, actionResidentTarget(type), index, candidate),
  );
  if (!result) return allowedAction(false, actionCost(), "牧场配饰状态不可用");
  return result.ok
    ? allowedAction(true, actionCost())
    : allowedAction(false, actionCost(), result.error);
}

function projectTakeoffAccessoryAction(farm, type, raw, index, known) {
  if (!known || !isRecord(raw)) return allowedAction(false, actionCost(), "居民资料不可用");
  const worn = raw.acc === undefined ? [] : knownAccessoryIds(raw.acc);
  if (worn === null) return allowedAction(false, actionCost(), "已穿戴配饰状态不可用");
  const candidate = worn[0];
  if (!candidate) return allowedAction(false, actionCost(), "这只居民没有已穿戴的配饰");
  const result = probeAuthority(farm, (probe) =>
    ranchTakeOffAccessory(probe, actionResidentTarget(type), index, candidate),
  );
  if (!result) return allowedAction(false, actionCost(), "牧场配饰状态不可用");
  return result.ok
    ? allowedAction(true, actionCost())
    : allowedAction(false, actionCost(), result.error);
}

function variantTypeForResident(type) {
  return type === "patrol_goose" ? "goose" : type;
}

function projectVariantOption(id, kindId, variantType) {
  const glimmerVariant = glimmerVariantById.get(id);
  const sprite = glimmerVariant
    ? glimmerVariantSpriteInfo({ variantId: id }, kindId, variantType)
    : null;
  const hasAtlasSprite =
    glimmerVariant &&
    Number.isSafeInteger(sprite?.set) &&
    sprite.set >= 1 &&
    sprite.set <= 3 &&
    Number.isSafeInteger(sprite?.index) &&
    sprite.index >= 0;
  return {
    variant_id: id,
    name: id === "base" ? "原始外观" : safeText(ranchVariantById.get(id)?.name) ?? id,
    atlas: hasAtlasSprite ? "glimmer.variants" : null,
    set: hasAtlasSprite ? sprite.set : null,
    sprite_index: hasAtlasSprite ? sprite.index : null,
  };
}

function projectResidentVariants(farm, type, raw, kindId) {
  const unlocked = new Set(
    Array.isArray(farm?.glimmer?.unlocked)
      ? farm.glimmer.unlocked.filter((id) => typeof id === "string" && glimmerVariantById.has(id))
      : [],
  );
  const variantType = variantTypeForResident(type);
  const unlockedVariantIds = glimmerVariants
    .filter((variant) => variant.type === variantType && variant.kindId === kindId)
    .filter((variant) => unlocked.has(variant.id))
    .map((variant) => variant.id)
    .filter((id) => safeId(id) !== null);
  const skinVariantIds = ranchSkinVariantsFor(farm, variantType, kindId)
    .map((skin) => skin.id)
    .filter((id) => safeId(id) !== null);
  const availableVariantIds = [
    "base",
    ...unlockedVariantIds.filter((id) => id !== "base"),
    ...skinVariantIds.filter((id) => id !== "base" && !unlockedVariantIds.includes(id)),
  ];
  const currentVariantId =
    typeof raw?.variantId === "string" && availableVariantIds.includes(raw.variantId)
      ? raw.variantId
      : "base";
  return {
    current_variant_id: currentVariantId,
    available_variant_ids: availableVariantIds,
    available_variants: availableVariantIds.map((id) =>
      projectVariantOption(id, kindId, variantType),
    ),
  };
}

function projectSetVariantAction(variants, known) {
  if (!known) return allowedAction(false, actionCost(), "居民资料不可用");
  return variants.available_variant_ids.length > 1
    ? allowedAction(true, actionCost())
    : allowedAction(false, actionCost(), "没有可切换的异色外观");
}

export function ranchDispatchHealthReason(raw) {
  switch (raw?.lingyeHealth?.status) {
    case "open":
      return "这只动物有待处理的健康问题，暂时不能派遣";
    case "treating":
      return "这只动物正在治疗中，暂时不能派遣";
    case "recovering":
      return "这只动物正在恢复中，暂时不能派遣";
    default:
      return null;
  }
}

function projectResidentHealth(type, raw, known) {
  if (!known || !isRecord(raw)) return { status: "unavailable", label: "健康状态不可用" };
  if (type !== "animal") return { status: "healthy", label: "健康" };
  switch (raw.lingyeHealth?.status) {
    case "open":
      return { status: "open", label: "需要治疗" };
    case "treating":
      return { status: "treating", label: "治疗中" };
    case "recovering":
      return { status: "recovering", label: "恢复中" };
    case undefined:
    case "resolved":
      return { status: "healthy", label: "健康" };
    default:
      return { status: "unavailable", label: "健康状态不可用" };
  }
}

function projectDispatchAction(type, raw, dispatch, known) {
  if (type !== "animal") {
    return allowedAction(false, actionCost(), "派遣仅适用于生产动物");
  }
  if (!known || !isRecord(raw)) {
    return allowedAction(false, actionCost(), "居民资料不可用");
  }
  if (dispatch?.state === "active") {
    return allowedAction(false, actionCost(), "这只动物已经在外面潜伏了");
  }
  if (dispatch?.state === "pending_settlement") {
    return allowedAction(false, actionCost(), "这只动物正在等待派遣结算");
  }
  if (dispatch?.state === "unavailable") {
    return allowedAction(false, actionCost(), "派遣状态不可用");
  }
  const healthReason = ranchDispatchHealthReason(raw);
  return healthReason
    ? allowedAction(false, actionCost(), healthReason)
    : allowedAction(true, actionCost());
}

function projectResidentAllowedActions(
  farm,
  type,
  raw,
  kind,
  index,
  now,
  pinned,
  variants,
  dispatch,
  known,
) {
  if (!known) return unavailableActions("居民资料不可用");
  return {
    feed: projectFeedAction(farm, type, raw, kind, index, now, known),
    upgrade: projectUpgradeAction(farm, type, raw, kind, index, known),
    rename: projectRenameAction(known),
    toggle_pin: projectTogglePinAction(farm, type, kind, pinned, known),
    wear_accessory: projectWearAccessoryAction(farm, type, raw, index, known),
    takeoff_accessory: projectTakeoffAccessoryAction(farm, type, raw, index, known),
    set_variant: projectSetVariantAction(variants, known),
    dispatch: projectDispatchAction(type, raw, dispatch, known),
  };
}

function projectResident(type, raw, now, raids, pinned, farm, index) {
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
  const variants = known
    ? projectResidentVariants(farm, type, raw, kindId)
    : { current_variant_id: null, available_variant_ids: [], available_variants: [] };
  return {
    status: identity.status,
    identity: {
      ...identity,
      custom_name: known ? safeText(raw?.name) : null,
    },
    level,
    pinned: pinnedState,
    accessories,
    variants,
    health: projectResidentHealth(type, raw, known),
    allowed_actions: projectResidentAllowedActions(
      farm,
      type,
      raw,
      kind,
      index,
      now,
      pinned,
      variants,
      dispatch,
      known,
    ),
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
          target_farm_doorplate: null,
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
          target_farm_doorplate: null,
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
        target_farm_doorplate: FARM_DOORPLATE_RE.test(String(raid.targetFarmId ?? ""))
          ? raid.targetFarmId
          : null,
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

function projectSkinItem(skin, owned) {
  const known = !!skin
    && safeId(skin.id) !== null
    && safeText(skin.name) !== null
    && safeId(skin.targetKindId) !== null
    && ["animal", "pet"].includes(skin.targetType)
    && safeMoney(skin.price) !== null;
  return {
    status: known ? "known" : "unavailable",
    skin_id: known ? skin.id : null,
    name: known ? safeText(skin.name) : null,
    target_type: known ? skin.targetType : null,
    target_kind_id: known ? skin.targetKindId : null,
    price: known ? skin.price : null,
    owned: known ? owned : null,
    available_quantity: known && typeof owned === "boolean" ? owned ? 0 : 1 : null,
    starts_at: known ? safeTimestamp(Date.parse(skin.startsAt)) : null,
    ends_at: known ? safeTimestamp(Date.parse(skin.endsAt)) : null,
  };
}

function projectShop(farm, ranch, residentArrays, now) {
  if (!ranch || !isRecord(farm.codex)) {
    return {
      animals: { status: "unavailable", shop_day: null, items: [] },
      pets: { status: "unavailable", shop_day: null, items: [] },
      skins: { status: "unavailable", shop_day: null, items: [] },
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
  const ownedSkins = Array.isArray(ranch.skins) ? new Set(ranch.skins.filter((id) => ranchSkinById.has(id))) : null;
  const skinItems = ranchSkinShop(farm, now).map((skin) => projectSkinItem(skin, ownedSkins?.has(skin.id) ?? null));

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
    skins: { status: ownedSkins ? "available" : "unavailable", shop_day: null, items: skinItems },
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
    ? ranch.animals.map((animal, index) =>
      projectResident("animal", animal, now, Array.isArray(raids) ? raids : [], pinned, farm, index),
    )
    : [];
  const petResidents = petsAvailable
    ? ranch.pets.map((pet, index) => projectResident("pet", pet, now, [], pinned, farm, index))
    : [];
  const patrolGoose = ranch && Object.prototype.hasOwnProperty.call(ranch, "patrolGoose") && ranch.patrolGoose !== null
    ? projectResident("patrol_goose", ranch.patrolGoose, now, [], pinned, farm, null)
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
    shop: projectShop(farm, ranch, residentArrays, now),
  };
  return {
    data,
    revision: revisionFor(data),
    server_time: new Date(now).toISOString(),
  };
}
