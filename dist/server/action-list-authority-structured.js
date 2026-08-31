import { NPC_ID } from "../config.js";
import { fishing, fishingBaits, glimmer } from "../content.js";
import { advance, canStealNow, isUgcCrop, stealShieldRemain } from "../engine.js";
import { ensureFishing } from "../fishing.js";
import { normalizeGlimmerFarm } from "../glimmer.js";
import { publicExpeditionContent } from "../public-expedition.js";
import { getFarm, getGlimmerWorld, getPublicExpeditionWorld } from "../store.js";
import { currentDayIndex } from "../time.js";
import { allowsSocial, numberedPlayerFarms, reachable } from "./farm/social.js";

function cleanCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function stolenToday(thief, target, now) {
  const at = target.stealCooldowns?.[thief.id];
  return at !== undefined && currentDayIndex(at) === currentDayIndex(now);
}

function projectStealTargets(thief, now) {
  const projectedThief = structuredClone(thief);
  if (
    !reachable(projectedThief) ||
    !allowsSocial(projectedThief, "steal") ||
    !canStealNow(projectedThief, now)
  ) {
    return [];
  }
  const npc = getFarm(NPC_ID);
  const candidates = [
    ...(npc ? [{ number: 0, farm: npc }] : []),
    ...numberedPlayerFarms(),
  ];
  return candidates.flatMap(({ number, farm: sourceFarm }) => {
    const farm = structuredClone(sourceFarm);
    if (
      farm.id === thief.id ||
      !reachable(farm) ||
      !allowsSocial(farm, "steal") ||
      stolenToday(projectedThief, farm, now) ||
      stealShieldRemain(farm, now)
    ) {
      return [];
    }
    advance(farm, now);
    const ripePlotIds = farm.plots
      .filter((plot) => plot.crop?.ripe && !isUgcCrop(plot.crop))
      .map((plot) => plot.id);
    return ripePlotIds.length === 0
      ? []
      : [
          {
            target: String(number),
            farm_name: String(farm.name || farm.id),
            ripe_plot_ids: ripePlotIds,
          },
        ];
  });
}

function projectFishing(farm, now) {
  const state = ensureFishing(structuredClone(farm));
  const usedToday =
    state.dailyCasts?.day === currentDayIndex(now) ? cleanCount(state.dailyCasts.count) : 0;
  const freeBait = cleanCount(state.freeBait);
  return {
    status: "available",
    daily_limit: cleanCount(fishing.dailyCastLimit),
    used_today: usedToday,
    remaining_today: Math.max(0, cleanCount(fishing.dailyCastLimit) - usedToday),
    available_baits: fishingBaits.flatMap((bait) => {
      const quantity = cleanCount(state.baitInventory?.[bait.id]) + freeBait;
      return quantity > 0
        ? [{ bait_id: String(bait.id), name: String(bait.name), quantity }]
        : [];
    }),
  };
}

function projectActivities(farm, now) {
  const day = currentDayIndex(now);
  const glimmerState = normalizeGlimmerFarm(structuredClone(farm));
  const glimmerWorld = structuredClone(getGlimmerWorld());
  const glimmerDaily = glimmerState.daily?.day === day ? glimmerState.daily : null;
  const joinedGlimmer =
    cleanCount(glimmerDaily?.explores) > 0 ||
    cleanCount(glimmerDaily?.captures) > 0 ||
    (glimmerWorld.coop?.contributors ?? []).some((entry) => entry?.farmId === farm.id);
  const togetherWorld = structuredClone(getPublicExpeditionWorld());
  const activities = [
    {
      activity_id: "glimmer",
      name: String(glimmer.name || "流光原野"),
      completed: joinedGlimmer,
      call: { op: "farm.glimmer.status", args: {} },
    },
  ];
  if (!["closed", "ended"].includes(String(togetherWorld.phase))) {
    activities.push({
      activity_id: "together",
      name: `${String(publicExpeditionContent.name || "铃野共行")}·${String(publicExpeditionContent.title || togetherWorld.storyTitle || "当前故事")}`,
      completed: Array.isArray(togetherWorld.participants)
        ? togetherWorld.participants.includes(farm.id)
        : false,
      call: { op: "farm.together.view", args: {} },
    });
  }
  return activities;
}

export function projectHumanActionListAuthority(farm, now = Date.now()) {
  return {
    data: {
      farm: { farm_doorplate: String(farm.id) },
      steal: { status: "available", targets: projectStealTargets(farm, now) },
      fishing: projectFishing(farm, now),
      activities: projectActivities(farm, now),
    },
    server_time: new Date(now).toISOString(),
  };
}
