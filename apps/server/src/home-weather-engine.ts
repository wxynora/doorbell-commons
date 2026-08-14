import { createHash } from "node:crypto";
import type { ClimateType, WeatherCondition, WeatherSeasonPhase } from "@doorbell/protocol";
import type { CommunityDatabase, HumanSettingsRecord } from "./community-database.js";

const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const EXTREME_WEATHER_THRESHOLD = 0.01;

const DRY_CONDITIONS = ["clear", "mostly_clear", "partly_cloudy"] as const;
const MIXED_CONDITIONS = [
  "clear",
  "mostly_clear",
  "partly_cloudy",
  "overcast",
  "drizzle",
  "light_rain",
] as const;
const WET_CONDITIONS = [
  "partly_cloudy",
  "overcast",
  "fog",
  "drizzle",
  "light_rain",
  "rain",
  "showers",
] as const;
const COLD_CONDITIONS = [
  "clear",
  "mostly_clear",
  "partly_cloudy",
  "overcast",
  "light_snow",
  "snow",
] as const;
const FREEZE_CONDITIONS = ["clear", "partly_cloudy", "overcast", "light_snow", "snow"] as const;

interface BeijingWeatherPeriod {
  month: number;
  startedAt: number;
  nextTransitionAt: number;
}

export interface HomeWeatherEngineOptions {
  database: CommunityDatabase;
  now?: () => number;
  sample?: (key: string) => number;
}

function defaultSample(key: string): number {
  const digest = createHash("sha256").update(key, "utf8").digest();
  return digest.readUIntBE(0, 6) / 0x1_0000_0000_0000;
}

function beijingWeatherPeriod(now: number): BeijingWeatherPeriod {
  const shifted = new Date(now + BEIJING_UTC_OFFSET_MS);
  const startedAt =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
    BEIJING_UTC_OFFSET_MS;
  return {
    month: shifted.getUTCMonth() + 1,
    startedAt,
    nextTransitionAt: startedAt + ONE_DAY_MS,
  };
}

function standardSeason(month: number): WeatherSeasonPhase {
  if (month >= 3 && month <= 5) {
    return "spring";
  }
  if (month >= 6 && month <= 8) {
    return "summer";
  }
  if (month >= 9 && month <= 11) {
    return "autumn";
  }
  return "winter";
}

export function weatherSeasonForClimate(
  climateType: ClimateType,
  month: number,
): WeatherSeasonPhase {
  switch (climateType) {
    case "tropical_rainforest":
      return month >= 5 && month <= 10 ? "rainier_period" : "drier_period";
    case "tropical_savanna":
    case "tropical_monsoon":
      return month >= 5 && month <= 10 ? "wet_season" : "dry_season";
    case "hot_desert":
      return month >= 4 && month <= 10 ? "warm_season" : "cold_season";
    case "subarctic":
      return month >= 6 && month <= 8 ? "warm_season" : "cold_season";
    case "tundra":
      return month >= 6 && month <= 8 ? "thaw_period" : "freeze_period";
    case "ice_cap":
      return "freeze_period";
    default:
      return standardSeason(month);
  }
}

function regularConditions(
  climateType: ClimateType,
  seasonPhase: WeatherSeasonPhase,
): readonly WeatherCondition[] {
  switch (climateType) {
    case "tropical_rainforest":
      return WET_CONDITIONS;
    case "tropical_savanna":
      return seasonPhase === "wet_season" ? WET_CONDITIONS : DRY_CONDITIONS;
    case "tropical_monsoon":
      return seasonPhase === "wet_season" ? WET_CONDITIONS : MIXED_CONDITIONS;
    case "hot_desert":
      return DRY_CONDITIONS;
    case "humid_subtropical":
      return seasonPhase === "summer"
        ? WET_CONDITIONS
        : seasonPhase === "winter"
          ? MIXED_CONDITIONS
          : [...MIXED_CONDITIONS, "showers"];
    case "mediterranean":
      return seasonPhase === "summer" ? DRY_CONDITIONS : MIXED_CONDITIONS;
    case "oceanic":
      return WET_CONDITIONS;
    case "temperate_monsoon":
      return seasonPhase === "summer"
        ? WET_CONDITIONS
        : seasonPhase === "winter"
          ? COLD_CONDITIONS
          : MIXED_CONDITIONS;
    case "continental":
      return seasonPhase === "winter"
        ? COLD_CONDITIONS
        : seasonPhase === "summer"
          ? [...MIXED_CONDITIONS, "showers"]
          : MIXED_CONDITIONS;
    case "subarctic":
      return seasonPhase === "cold_season" ? COLD_CONDITIONS : MIXED_CONDITIONS;
    case "tundra":
      return seasonPhase === "freeze_period"
        ? FREEZE_CONDITIONS
        : ["overcast", "fog", "drizzle", "sleet", "light_snow"];
    case "ice_cap":
      return FREEZE_CONDITIONS;
    case "highland":
      return seasonPhase === "winter"
        ? COLD_CONDITIONS
        : ["mostly_clear", "partly_cloudy", "overcast", "fog", "showers", "sleet"];
  }
}

function extremeConditions(
  climateType: ClimateType,
  seasonPhase: WeatherSeasonPhase,
): readonly WeatherCondition[] {
  switch (climateType) {
    case "tropical_rainforest":
    case "tropical_savanna":
    case "tropical_monsoon":
    case "humid_subtropical":
    case "temperate_monsoon":
      return ["heavy_rain", "thunderstorm"];
    case "hot_desert":
      return ["dust"];
    case "mediterranean":
    case "oceanic":
      return ["heavy_rain"];
    case "continental":
      return seasonPhase === "winter" ? ["heavy_snow", "blowing_snow"] : ["thunderstorm"];
    case "subarctic":
    case "tundra":
    case "ice_cap":
      return ["heavy_snow", "blowing_snow"];
    case "highland":
      return seasonPhase === "winter"
        ? ["heavy_snow", "blowing_snow"]
        : ["heavy_rain", "thunderstorm"];
  }
}

function selectFromPool(pool: readonly WeatherCondition[], sample: number): WeatherCondition {
  const normalized = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON)
    : 0;
  return pool[Math.floor(normalized * pool.length)] ?? pool[0] ?? "clear";
}

export class HomeWeatherEngine {
  readonly #database: CommunityDatabase;
  readonly #now: () => number;
  readonly #sample: (key: string) => number;

  constructor(options: HomeWeatherEngineOptions) {
    this.#database = options.database;
    this.#now = options.now ?? Date.now;
    this.#sample = options.sample ?? defaultSample;
  }

  ensureCurrent(settings: HumanSettingsRecord): HumanSettingsRecord {
    if (settings.climateType === null || settings.weatherState === null) {
      return settings;
    }

    const now = this.#now();
    const period = beijingWeatherPeriod(now);
    const current = settings.weatherState;
    if (
      current.condition !== null &&
      current.seasonPhase !== null &&
      current.stateStartedAt === period.startedAt &&
      current.nextTransitionAt === period.nextTransitionAt
    ) {
      return settings;
    }

    const seasonPhase = weatherSeasonForClimate(settings.climateType, period.month);
    const key = `${settings.homeId}:${settings.climateType}:${period.startedAt}`;
    const extreme = this.#sample(`${key}:extreme`) < EXTREME_WEATHER_THRESHOLD;
    const pool = extreme
      ? extremeConditions(settings.climateType, seasonPhase)
      : regularConditions(settings.climateType, seasonPhase);
    const condition = selectFromPool(pool, this.#sample(`${key}:condition`));
    const updated = this.#database.updateHomeWeatherState(settings.homeId, now, {
      climateType: settings.climateType,
      expectedWeatherRevision: current.weatherRevision,
      seasonPhase,
      condition,
      stateStartedAt: period.startedAt,
      nextTransitionAt: period.nextTransitionAt,
    });

    return updated
      ? { ...settings, weatherState: updated }
      : this.#database.getHumanSettings(settings.homeId);
  }
}
