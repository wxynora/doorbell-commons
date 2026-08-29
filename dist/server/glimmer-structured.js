import { glimmer, glimmerVariants, glimmerEncounters, titles } from "../content.js";
import { glimmerHumanData, glimmerVariantSpriteInfo } from "../glimmer.js";

const GLIMMER_ATLAS_KEY = "glimmer.variants";
const GLIMMER_ACHIEVEMENT_FIELDS = new Set(["glimmerEncounters", "glimmerVariants", "glimmerCoops"]);

function asIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const at = Number(value);
  if (!Number.isFinite(at)) return null;
  const date = new Date(at);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeText(value) {
  return String(value ?? "").replace(/[<>]/gu, "");
}

function spriteMeta(variant) {
  const sprite = glimmerVariantSpriteInfo({ variantId: variant.id }, variant.kindId, variant.type);
  return {
    atlas: GLIMMER_ATLAS_KEY,
    set: Number(variant.set),
    sprite_index: Number.isInteger(sprite.index) ? sprite.index : null,
  };
}

function variantIdentity(variant) {
  return {
    id: String(variant.id),
    name: String(variant.name),
    ...spriteMeta(variant),
  };
}

function projectTrack(variant) {
  return { revealed: true, variant: variantIdentity(variant) };
}

function projectEvents(logs) {
  return logs.slice(0, 10).flatMap((item) => {
    const at = asIso(item.at);
    if (!at) return [];
    return [{
      at,
      text: safeText(item.text).replace(/^(?:(?:\d{4}-\d{2}-\d{2}\s+)?\d{2}:\d{2})\s*·\s*/u, ""),
    }];
  });
}

function projectCooperation(coop) {
  const contributors = Array.isArray(coop?.contributors) ? coop.contributors : [];
  if (!coop?.event) return null;
  const target = Math.max(1, Math.floor(Number(glimmer.coopRequired) || 1));
  return {
    event: {
      id: String(coop.event.id),
      name: String(coop.event.name),
      requirement: String(coop.event.requirement),
    },
    progress: {
      current: Math.min(contributors.length, target),
      target,
    },
    completed: Number(coop.completedAt) > 0,
  };
}

function metricFor(stats, field) {
  if (field === "glimmerEncounters") return Number(stats?.encounters) || 0;
  if (field === "glimmerVariants") return Number(stats?.variants) || 0;
  if (field === "glimmerCoops") return Number(stats?.coops) || 0;
  return 0;
}

function projectAchievements(stats, rewarded) {
  return titles
    .filter((item) => GLIMMER_ACHIEVEMENT_FIELDS.has(item.field))
    .map((item) => ({
      id: String(item.id),
      name: String(item.name),
      progress: {
        current: metricFor(stats, item.field),
        target: Math.max(0, Math.floor(Number(item.min) || 0)),
      },
      rewarded: rewarded.has(item.id),
      reward: {
        coins: Math.max(0, Math.floor(Number(item.reward?.coins) || 0)),
        silver: Math.max(0, Math.floor(Number(item.reward?.silver) || 0)),
      },
    }));
}

function projectVariants(variants, unlocked) {
  return variants.map((variant) => ({
    ...variantIdentity(variant),
    unlocked: unlocked.has(variant.id),
  }));
}

function projectEncounters(encounters, seen) {
  return encounters.map((encounter) => ({
    id: String(encounter.id),
    name: String(encounter.name),
    seen: seen.has(encounter.id),
  }));
}

function projectCaptureCooldown(farm, now) {
  const lastCatchAt = Number(farm?.glimmer?.daily?.lastCatchAt);
  const cooldownMs = Number(glimmer.captureCooldownMs);
  if (!Number.isFinite(lastCatchAt) || lastCatchAt <= 0 || !Number.isFinite(cooldownMs) || cooldownMs <= 0) {
    return null;
  }
  const readyAt = lastCatchAt + cooldownMs;
  return readyAt > now ? { ready_at: new Date(readyAt).toISOString() } : null;
}

/**
 * Project the existing Glimmer Human view on isolated farm/world clones.
 * glimmerHumanData owns daily and cross-day normalization; this adapter only
 * selects the fields that the structured Human UI is allowed to receive.
 */
export function projectHumanGlimmer(farm, world, now = Date.now()) {
  const projectedFarm = structuredClone(farm);
  const view = glimmerHumanData(projectedFarm, structuredClone(world), now);
  const open = view.open === true;
  const data = {
    open,
    status: safeText(view.status),
    season: safeText(view.season),
    capture_cooldown: projectCaptureCooldown(projectedFarm, now),
    tracks: view.tracks.map((variant) => projectTrack(variant)),
    cooperation: projectCooperation(view.coop),
    events: projectEvents(view.logs),
    variants: projectVariants(view.variants, view.unlocked),
    encounters: projectEncounters(view.encounters, view.encounterSeen),
    achievements: projectAchievements(view.stats, view.rewardedAchievements),
    summary: {
      encounters: Number(view.stats?.encounters) || 0,
      variants: Number(view.stats?.variants) || 0,
      cooperations: Number(view.stats?.coops) || 0,
    },
  };
  return {
    subject: { farm_doorplate: String(farm.id) },
    data,
    server_time: new Date(now).toISOString(),
  };
}

export const glimmerStructuredCatalog = {
  variants: glimmerVariants.length,
  encounters: glimmerEncounters.length,
};
