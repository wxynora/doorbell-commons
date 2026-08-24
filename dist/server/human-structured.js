import { createHash } from "node:crypto";
import { HUMAN_HARVEST_DAILY_CAP } from "../config.js";
import { getCrop, landTierByLevel } from "../content.js";
import { advance, humanHarvestLeft, plotRemainMs } from "../engine.js";
import { currentDayIndex, currentSeason } from "../time.js";
import { equippedTitle } from "../titles.js";

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
    return {
        plot_id: plot.id,
        state: ripe ? "ripe" : "growing",
        seed_type: crop.seedType,
        watered: crop.waterCount ?? 0,
        progress: { current: projectedProgress, total },
        matures_at: ripe
            ? null
            : new Date(now + plotRemainMs(plot, farm, now)).toISOString(),
        ...identity,
    };
}

function nextShanghaiMidnight(dayIndex) {
    return new Date((dayIndex + 1) * 86_400_000 - 8 * 3_600_000).toISOString();
}

function stripReceipts(value) {
    if (Array.isArray(value))
        return value.map(stripReceipts);
    if (!value || typeof value !== "object")
        return value;
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
        if (key === "doorbellHumanHarvestReceipts")
            continue;
        result[key] = stripReceipts(nested);
    }
    return result;
}

function readRevision(projectedFarm, data, dayIndex, now) {
    // The revision is a write precondition, so include every hidden farm field
    // that the reused Human harvest chain can observe.  The receipt ledger is
    // deliberately excluded: recording/replaying a receipt must not make an
    // otherwise identical field snapshot stale.
    const canonical = JSON.stringify(canonicalize({
        schema: "field-v1",
        rule_version: "human-harvest-assist-v1",
        day: dayIndex,
        season: currentSeason(now),
        data,
        farm: stripReceipts(projectedFarm),
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
    // Lazy growth is projected on a clone.  This keeps field reads pure while
    // making the revision match the exact pre-action state after the old
    // Human UI's leading `advance(farm, now)` call.
    const projectedFarm = structuredClone(farm);
    advance(projectedFarm, now);
    const title = equippedTitle(projectedFarm);
    const plots = projectedFarm.plots
        .map((plot) => projectPlot(plot, projectedFarm, now, 0))
        .sort((a, b) => a.plot_id - b.plot_id);
    const maturePlotCount = plots.filter((plot) => plot.state === "ripe").length;
    const remainingAssists = humanHarvestLeft(projectedFarm, now);
    const land = landTierByLevel(projectedFarm.landTier);
    if (land.tier !== projectedFarm.landTier)
        throw new Error("Farm land tier is unavailable");
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
        season: { name: currentSeason(now).name },
        land: { tier: projectedFarm.landTier, name: land.name },
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
