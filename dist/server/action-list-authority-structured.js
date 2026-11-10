import { NPC_ID } from "../config.js";
import { fishing, fishingBaits, glimmer } from "../content.js";
import { projectFarmGrowth, canStealNow, isUgcCrop, stealShieldRemain } from "../engine.js";
import { publicExpeditionContent } from "../public-expedition.js";
import { readFarm, readGlimmerWorld, readPublicExpeditionWorld } from "../store.js";
import { currentDayIndex } from "../time.js";
import { allowsSocial, numberedPlayerFarms, reachable } from "./farm/social.js";

const cleanCount = value => {
  const count = Math.floor(Number(value) || 0);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
};

function stolenToday(thief, target, now) {
  const at = target.stealCooldowns?.[thief.id];
  return at !== undefined && currentDayIndex(at) === currentDayIndex(now);
}

function wateredToday(visitor, target, now) {
  return target.waterVisits?.[visitor.id] === currentDayIndex(now);
}

function projectNeighborActions(visitor, now) {
  const canSteal = reachable(visitor) && allowsSocial(visitor,"steal") &&
    canStealNow({stealQuota:visitor.stealQuota},now);
  const canWater = reachable(visitor) && allowsSocial(visitor, "water");
  const steal = { status:"available", targets:[] };
  const water = { status:"available", targets:[], visited_targets:[] };
  const npc = canSteal ? readFarm(NPC_ID) : undefined;
  const farms = numberedPlayerFarms();
  if (npc) farms.unshift({number:0,farm:npc});
  for (const { number, farm: sourceFarm } of farms) {
    if (sourceFarm.id === visitor.id) continue;
    const entry = {
      target: String(number),
      farm_name: String(sourceFarm.name || sourceFarm.id),
    };
    const watered = number !== 0 && wateredToday(visitor,sourceFarm,now);
    if (watered) water.visited_targets.push(entry);
    if (!reachable(sourceFarm)) continue;
    const wantWater = canWater && number !== 0 && !watered && allowsSocial(sourceFarm,"water");
    const wantSteal = canSteal && allowsSocial(sourceFarm,"steal") &&
      !stolenToday(visitor,sourceFarm,now) && !stealShieldRemain(sourceFarm,now);
    if (!wantWater && !wantSteal) continue;
    const {plots} = projectFarmGrowth(sourceFarm,now);
    if (wantWater && plots.some(plot=>plot.crop && !plot.crop.ripe)) water.targets.push(entry);
    if (wantSteal) {
      const ripePlotIds = plots.filter(plot=>plot.crop?.ripe && !isUgcCrop(plot.crop)).map(plot=>plot.id);
      if (ripePlotIds.length) steal.targets.push({...entry,ripe_plot_ids:ripePlotIds});
    }
  }
  return {steal,water};
}

function projectFishing(farm, now) {
  const state = farm.fishing ?? {};
  const baitInventory = state.baitInventory && typeof state.baitInventory === "object"
    ? state.baitInventory : fishing.initialBaitInventory;
  const usedToday =
    state.dailyCasts?.day === currentDayIndex(now) ? cleanCount(state.dailyCasts.count) : 0;
  const freeBait = cleanCount(state.freeBait);
  return {
    status: "available",
    daily_limit: cleanCount(fishing.dailyCastLimit),
    used_today: usedToday,
    remaining_today: Math.max(0, cleanCount(fishing.dailyCastLimit) - usedToday),
    available_baits: fishingBaits.flatMap((bait) => {
      const quantity = cleanCount(baitInventory?.[bait.id]) + freeBait;
      return quantity > 0
        ? [{ bait_id: String(bait.id), name: String(bait.name), quantity }]
        : [];
    }),
  };
}

function projectActivities(farm, now) {
  const day = currentDayIndex(now);
  const glimmerWorld = readGlimmerWorld();
  const glimmerDaily = farm.glimmer?.daily?.day === day ? farm.glimmer.daily : null;
  const joinedGlimmer =
    cleanCount(glimmerDaily?.explores) > 0 ||
    cleanCount(glimmerDaily?.captures) > 0 ||
    (glimmerWorld.coop?.contributors ?? []).some((entry) => entry?.farmId === farm.id);
  const togetherWorld = readPublicExpeditionWorld();
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
      ...projectNeighborActions(farm,now),
      fishing: projectFishing(farm, now),
      activities: projectActivities(farm, now),
    },
    server_time: new Date(now).toISOString(),
  };
}
