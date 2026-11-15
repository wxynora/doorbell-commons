import { FORECAST_FUTURE_DAYS } from "../../nature.js";

// Rules confirmed for the winter upgrade. Other seasonal generation and soil
// mechanics continue to use their existing authority.
export const APPROVED_WINTER_FORECAST_POLICY = Object.freeze({
    version: 1,
    seasonWeights: Object.freeze({ winter: Object.freeze({
        sunny: 20, cloudy: 15, fog: 5, light_snow: 30,
        blizzard: 10, cold_snap: 10, freezing_rain: 10,
    }) }),
    transitions: Object.freeze([]),
});

export const APPROVED_WINTER_SNOW_POLICY = Object.freeze({
    capacity: 3,
    weatherDelta: Object.freeze({
        sunny: -2, cloudy: -1, light_rain: -1, heavy_rain: -1,
        thunderstorm: -1, fog: -1, hot: -1, dry_wind: -1,
        light_snow: 1, blizzard: 2, cold_snap: 0, freezing_rain: 0,
    }),
    terrainAdjustments: Object.freeze([
        Object.freeze({ conditions: Object.freeze(["blizzard"]), anyFlags: Object.freeze(["windy"]), delta: 1 }),
        Object.freeze({ conditions: Object.freeze(["sunny"]), anyFlags: Object.freeze(["sunny"]), delta: -1 }),
    ]),
    growthThreshold: 2,
    growthEffect: "half",
});

const WARM_AND_DRY = Object.freeze(["sunny", "hot", "dry_wind"]);
export const APPROVED_WINTER_RANCH_POLICY = Object.freeze({
    freezeTroughWhen: Object.freeze(["cold_snap"]),
    freezeGroundWhen: Object.freeze(["freezing_rain"]),
    wetBeddingWhen: Object.freeze(["freezing_rain"]),
    thawWhen: WARM_AND_DRY,
    dryBeddingWhen: WARM_AND_DRY,
    dryingDays: 1,
});
export const APPROVED_WINTER_EVENT_POLICY = Object.freeze({
    triggerWeather: Object.freeze(["light_snow", "blizzard", "cold_snap", "freezing_rain"]),
    recoveryWeather: WARM_AND_DRY,
    forecastDays: FORECAST_FUTURE_DAYS,
    exposures: Object.freeze([
        Object.freeze({ condition: "dehydration", sinceField: "frozenSince", durationDays: 1, probability: 0.10 }),
        Object.freeze({ condition: "wet_cold", sinceField: "wetSince", durationDays: 1, probability: 0.10 }),
        Object.freeze({ condition: "minor_injury", sinceField: "iceSince", durationDays: 1, probability: 0.05 }),
    ]),
});

// Explicit opt-in through the existing weatherUpgrade runtime argument.
export function createApprovedWinterPolicy({ startDay } = {}) {
    if (!Number.isSafeInteger(startDay)) throw new TypeError("winter forecast start is required");
    return {
        forecast: { startDay, policy: APPROVED_WINTER_FORECAST_POLICY },
        plot: { snow: APPROVED_WINTER_SNOW_POLICY },
        ranch: APPROVED_WINTER_RANCH_POLICY,
        winterEvent: APPROVED_WINTER_EVENT_POLICY,
        actions: {
            thaw_trough: { itemId: null },
            clear_ice: { itemId: null },
            replace_bedding: { itemId: "dry_bedding" },
        },
    };
}
