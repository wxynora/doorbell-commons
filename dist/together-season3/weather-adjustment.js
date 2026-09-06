import { beijingDayIndex, reviseNatureWeather } from "../nature.js";
import { commitNatureWorld, getNatureWorld } from "../store.js";

export const RAIN_EASE_DATE_ENV = "AIFARM_TOGETHER_RAIN_EASE_DATE";
export const APPROVED_RAIN_EASE_DATE = "2026-09-09";

export function readTogetherRainEaseDate(env = process.env) {
  const selected = env[RAIN_EASE_DATE_ENV];
  if (selected === undefined || selected === "") return null;
  if (selected !== APPROVED_RAIN_EASE_DATE)
    throw new Error("season3_rain_ease_config_invalid");
  return selected;
}

// No player route. Deployment must explicitly select the single approved date.
export function applyTogetherRainEase({
  now = Date.now(),
  selected = readTogetherRainEaseDate(),
  readNature = getNatureWorld,
  commitNature = commitNatureWorld,
} = {}) {
  if (selected === null) return { changed: false };
  if (selected !== APPROVED_RAIN_EASE_DATE)
    throw new Error("season3_rain_ease_config_invalid");
  const dayIndex = beijingDayIndex(Date.parse(`${selected}T00:00:00+08:00`));
  const result = reviseNatureWeather(readNature(), { dayIndex, condition: "light_rain", now });
  if (result.changed) commitNature(result.world);
  return { changed: result.changed };
}
