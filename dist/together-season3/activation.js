import { advanceNatureGameplay } from "../nature-runtime.js";
import { getPublicExpeditionWorld } from "../store.js";
import { TOGETHER_SEASON3_STORY_ID } from "./runtime.js";
import { activateStoredTogetherSeason3 } from "./service.js";
import { applyTogetherRainEase, readTogetherRainEaseDate } from "./weather-adjustment.js";

export const TOGETHER_STORY_ENV = "AIFARM_TOGETHER_STORY_ID";

const ACTIVATION_NOT_READY_CODES = new Set([
  "previous_story_not_completed",
  "nature_authority_unavailable",
  "nature_event_unavailable",
  "season3_rain_not_present",
]);

const ACTIVATION_FAILURE_CODES = new Set([
  "nature_phase_regressed",
  "invalid_season3_state",
  "invalid_season3_time",
]);

export class TogetherSeason3ActivationError extends Error {
  constructor(code) {
    super(code);
    this.name = "TogetherSeason3ActivationError";
    this.code = code;
  }
}

/** Parse before opening a database, starting a timer, or listening on HTTP. */
export function readTogetherSeason3StartupSelection(env = process.env) {
  const selected = env[TOGETHER_STORY_ENV];
  if (selected === undefined || selected === "") return null;
  if (selected !== TOGETHER_SEASON3_STORY_ID)
    throw new TogetherSeason3ActivationError("season3_activation_config_invalid");
  readTogetherRainEaseDate(env);
  return selected;
}

/**
 * Call inside the existing startup cleanup boundary, after loading persistence
 * and installing its coordinator, but before starting any timer or listener.
 * The story selection never reseeds nature. A separate explicit selection may
 * persist the approved future-day rain adjustment through the same authority.
 * Ordinary story prerequisites return not_ready; configuration, state/time
 * corruption, phase regression, and actual synchronization/write failures throw.
 */
export function applyTogetherSeason3StartupSelection(selection, {
  now = Date.now(),
  synchronizeNature = advanceNatureGameplay,
  activateStory = activateStoredTogetherSeason3,
  readWorld = getPublicExpeditionWorld,
  adjustRain = applyTogetherRainEase,
} = {}) {
  if (selection === null) return { status: "not_requested", changed: false };
  if (selection !== TOGETHER_SEASON3_STORY_ID)
    throw new TogetherSeason3ActivationError("season3_activation_config_invalid");
  const alreadyActive = readWorld()?.storyId === TOGETHER_SEASON3_STORY_ID;
  const activate = () => {
    let result;
    try {
      result = activateStory({ enabled: true, now });
    } catch {
      throw new TogetherSeason3ActivationError("season3_activation_unavailable");
    }
    if (result?.ok !== true && !ACTIVATION_NOT_READY_CODES.has(result?.code)) {
      const code = ACTIVATION_FAILURE_CODES.has(result?.code)
        ? result.code : "season3_activation_unavailable";
      throw new TogetherSeason3ActivationError(code);
    }
    return result;
  };
  // Bind the existing authoritative event first: its first gameplay catch-up
  // must already see the episode's level-one difficulty. No event is fabricated
  // when prerequisites are absent; ordinary Farm startup remains available.
  const bound = activate();
  if (!bound.ok)
    return { status: "not_ready", changed: false, code: bound.code };
  let rainAdjustment;
  try {
    rainAdjustment = adjustRain({ now });
  } catch {
    throw new TogetherSeason3ActivationError("season3_weather_adjustment_failed");
  }
  try {
    synchronizeNature(now);
  } catch {
    // The durable story binding survives so the next startup resumes this same
    // event instead of applying an ordinary flood before binding again.
    throw new TogetherSeason3ActivationError("season3_nature_sync_failed");
  }
  const result = activate();
  if (!result.ok)
    throw new TogetherSeason3ActivationError("season3_activation_unavailable");
  return {
    status: alreadyActive ? "already_active" : "activated",
    changed: bound.changed === true || result.changed === true || rainAdjustment?.changed === true,
  };
}
