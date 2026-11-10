import { agronomyGrowthEffect } from "../career/p3-world.js";
import { createHash } from "node:crypto";
import { HUMAN_HARVEST_DAILY_CAP } from "../config.js";
import { getCrop, landTierByLevel } from "../content.js";
import { humanHarvestLeft, nextUpgradeReq, petBuffs, plotRemainMs, projectFarmGrowth } from "../engine.js";
import { checkLandUpgrade } from "../domain/field/land.js";
import { championCropBonus } from "../domain/champion-harvest.js";
import { natureSnapshot } from "../nature.js";
import { readNatureWorld } from "../store.js";
import { currentDayIndex, currentSeason } from "../time.js";
import { equippedTitle } from "../titles.js";

const SEASON_IDS_BY_NAME = {
    "春": "spring",
    "夏": "summer",
    "秋": "autumn",
    "冬": "winter",
};

function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value && typeof value === "object") {
        const sorted = {};
        for (const key of Object.keys(value).sort())
            sorted[key] = canonicalize(value[key]);
        return sorted;
    }
    return value;
}

function projectIdentity(crop) {
    if (crop.seedType !== "limited")
        return { identity_state: "hidden", crop_identity: null };
    const identity = typeof crop.limitedId === "string" && crop.limitedId
        ? getCrop(crop.limitedId)
        : undefined;
    if (!identity || (identity.category !== "limited" && identity.category !== "ugc"))
        return { identity_state: "unavailable", crop_identity: null };
    return {
        identity_state: "known",
        crop_identity: {
            crop_id: identity.id,
            name: identity.name,
            category: identity.category,
        },
    };
}

function projectPlot(plot, farm, now, elapsedTicks) {
    const crop = plot.crop;
    if (!crop) {
        return {
            plot_id: plot.id,
            state: "empty",
            growth_effect: "normal",
            seed_type: null,
            watered: 0,
            progress: null,
            matures_at: null,
            identity_state: "empty",
            crop_identity: null,
        };
    }
    const total = crop.growTicks;
    const projectedProgress = crop.ripe
        ? total
        : Math.min(total, crop.progress + elapsedTicks);
    const ripe = crop.ripe || projectedProgress >= total;
    const identity = projectIdentity(crop);
    const growthEffect = ripe ? "normal" : agronomyGrowthEffect(plot);
    return {
        plot_id: plot.id,
        state: ripe ? "ripe" : "growing",
        growth_effect: growthEffect,
        seed_type: crop.seedType,
        watered: crop.waterCount ?? 0,
        progress: { current: projectedProgress, total },
        matures_at: ripe || growthEffect !== "normal"
            ? null
            : new Date(now + plotRemainMs(plot, farm, now)).toISOString(),
        ...identity,
    };
}

function nextShanghaiMidnight(dayIndex) {
    return new Date((dayIndex + 1) * 86_400_000 - 8 * 3_600_000).toISOString();
}

function readRevision(projectedFarm, data, dayIndex, now) {
    // Bind the two field actions to their actual preconditions and yield
    // inputs, not to kitchen stock, messages, logs or action receipts.
    const {luck,dropMult} = petBuffs(projectedFarm,now);
    const canonical = JSON.stringify(canonicalize({
        schema: "field-action-inputs",
        day: dayIndex,
        farmId: projectedFarm.id,
        season: data.season,
        weather: data.weather,
        landTier: projectedFarm.landTier,
        landUpgrade: data.land.next_upgrade,
        coins: projectedFarm.coins,
        plots: projectedFarm.plots,
        remainingAssists: data.harvest_assist.remaining,
        rngState: projectedFarm.rngState,
        seasonEventAt: projectedFarm.seasonEventAt,
        speedPotion: projectedFarm.items?.speed_potion ?? 0,
        knownCrops: Object.keys(projectedFarm.codex ?? {}).sort(),
        petBuffs: {luck,dropMult},
        championBonusPercent: championCropBonus(projectedFarm,100,now),
    }));
    return `field-v1:${createHash("sha256").update(canonical).digest("hex")}`;
}

/**
 * Project the Human field view without advancing the game clock or mutating the farm.
 * The action-safe revision is calculated from the same projected clone the write
 * path reaches immediately after its leading `advance` call.
 */
export function projectHumanField(farm, now = Date.now()) {
    const dayIndex = currentDayIndex(now);
    const currentNature = natureSnapshot(readNatureWorld(), now);
    const legacySeason = currentSeason(now);
    const season = currentNature.season
        ? { id: currentNature.season.id, name: currentNature.season.name }
        : { id: SEASON_IDS_BY_NAME[legacySeason.name], name: legacySeason.name };
    if (!season.id)
        throw new Error("Farm season is unavailable");
    // Ranch production can advance the same RNG used by harvesting; project
    // its animals, not the unrelated kitchen, inventory or past receipts.
    const projectedFarm = projectFarmGrowth(farm,now,{includeRanch:true});
    const title = equippedTitle(projectedFarm);
    const plots = projectedFarm.plots
        .map((plot) => projectPlot(plot, projectedFarm, now, 0))
        .sort((a, b) => a.plot_id - b.plot_id);
    const maturePlotCount = plots.filter((plot) => plot.state === "ripe").length;
    const remainingAssists = humanHarvestLeft(projectedFarm, now);
    const land = landTierByLevel(projectedFarm.landTier);
    if (land.tier !== projectedFarm.landTier)
        throw new Error("Farm land tier is unavailable");
    const pendingLandUpgrade = nextUpgradeReq(projectedFarm);
    const landUpgradePreview = pendingLandUpgrade
        ? checkLandUpgrade(projectedFarm)
        : null;
    const welcome = typeof projectedFarm.welcome === "string" && projectedFarm.welcome.trim()
        ? projectedFarm.welcome.trim()
        : null;
    const data = {
        farm: {
            farm_doorplate: projectedFarm.id,
            farm_name: projectedFarm.name,
            welcome_message: welcome,
            equipped_title: title ? { title_id: title.id, name: title.name } : null,
        },
        balance: { farm_coins: projectedFarm.coins },
        season,
        weather: currentNature.weather
            ? { condition: currentNature.weather.condition }
            : null,
        land: {
            tier: projectedFarm.landTier,
            name: land.name,
            is_max_tier: pendingLandUpgrade === null,
            next_upgrade: pendingLandUpgrade
                ? {
                    tier: pendingLandUpgrade.next.tier,
                    name: pendingLandUpgrade.next.name,
                    plots: pendingLandUpgrade.next.plots,
                    cost_farm_coins: pendingLandUpgrade.req.coins,
                    can_upgrade: landUpgradePreview?.ok === true,
                    status_message: landUpgradePreview?.ok === true
                        ? null
                        : landUpgradePreview?.error ?? "土地升级条件暂时不可用",
                }
                : null,
        },
        plots,
        harvest_assist: {
            daily_limit: HUMAN_HARVEST_DAILY_CAP,
            remaining: remainingAssists,
            mature_plot_count: maturePlotCount,
            can_assist: remainingAssists > 0 && maturePlotCount > 0,
            reset_at: nextShanghaiMidnight(dayIndex),
        },
    };
    return {
        data,
        revision: readRevision(projectedFarm, data, dayIndex, now),
        server_time: new Date(now).toISOString(),
    };
}
