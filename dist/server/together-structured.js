import { getPublicExpeditionWorld, playerFarms, save } from "../store.js";
import {
  advancePublicExpedition,
  publicExpeditionContent,
  publicExpeditionHumanData,
} from "../public-expedition.js";

const ART_ASSET_KEYS = new Map([
  ["same-kitchen-opening-v3.jpg", "together.same-kitchen-opening"],
  ["same-kitchen-old-recipe-v1.jpg", "together.same-kitchen-old-recipe"],
  ["same-kitchen-undelivered-letters-v1.jpg", "together.same-kitchen-undelivered-letters"],
  ["same-kitchen-service-v1.jpg", "together.same-kitchen-service"],
  ["same-kitchen-final-arrangement-v1.jpg", "together.same-kitchen-final-arrangement"],
  ["same-kitchen-ending-one-sign-v1.jpg", "together.same-kitchen-ending-one-sign"],
  ["same-kitchen-ending-next-door-v1.jpg", "together.same-kitchen-ending-next-door"],
  ["same-kitchen-ending-public-kitchen-v1.jpg", "together.same-kitchen-ending-public-kitchen"],
]);

const STAGE_ORDER = ["opening", "recipe", "letters", "service", "final"];

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

function projectHistory(history) {
  return history.flatMap((entry) => {
    if (entry?.kind === "choice") {
      if (!Number.isSafeInteger(entry.step) || entry.step < 1) return [];
      if (!["A", "B", "C"].includes(entry.option)) return [];
      return [{
        kind: "choice",
        step: entry.step,
        option: entry.option,
        label: safeText(entry.label),
      }];
    }
    if (entry?.kind === "task") {
      return [{
        kind: "task",
        title: safeText(entry.title),
        text: safeText(entry.text),
        progress: Math.max(0, Math.floor(Number(entry.contributions?.length ?? entry.progress) || 0)),
        target: Math.max(1, Math.floor(Number(entry.target) || 1)),
      }];
    }
    if (["story", "clue", "ending"].includes(entry?.kind)) {
      return [{
        kind: entry.kind,
        title: safeText(entry.title),
        text: safeText(entry.text),
      }];
    }
    return [];
  });
}

function projectTask(task) {
  if (!task) return null;
  return {
    id: String(task.id),
    title: safeText(task.name),
    text: safeText(task.opening),
    progress: Math.max(0, Math.floor(Number(task.progress) || 0)),
    target: Math.max(1, Math.floor(Number(task.target) || 1)),
  };
}

function projectChoice(choice) {
  if (!choice) return null;
  const index = Number.isSafeInteger(choice.index) && choice.index > 0 ? choice.index : null;
  const options = Object.entries(choice.options ?? {})
    .filter(([key]) => ["A", "B", "C"].includes(key))
    .map(([key, value]) => ({ key, label: String(value) }));
  if (options.length < 2) return null;
  return {
    index,
    title: safeText(choice.title),
    options: options.map((option) => ({ ...option, label: safeText(option.label) })),
    counts: choice.counts && typeof choice.counts === "object"
      ? {
          A: Math.max(0, Math.floor(Number(choice.counts.A) || 0)),
          B: Math.max(0, Math.floor(Number(choice.counts.B) || 0)),
          C: Math.max(0, Math.floor(Number(choice.counts.C) || 0)),
        }
      : null,
  };
}

function projectCooldown(cooldown) {
  if (!cooldown) return null;
  const readyAt = asIso(cooldown.readyAt);
  if (!readyAt) return null;
  return {
    text: safeText(cooldown.text),
    ready_at: readyAt,
    ready_text: safeText(cooldown.readyText),
  };
}

function projectEnding(ending, endingId) {
  if (!ending || !endingId) return null;
  return {
    id: String(endingId),
    title: safeText(ending.title),
    text: safeText(ending.text),
  };
}

function projectClues(clues) {
  return clues.map((clue) => ({
    id: String(clue.id),
    title: safeText(clue.title),
    text: safeText(clue.text),
  }));
}

function projectStage(world) {
  const index = Math.max(0, STAGE_ORDER.indexOf(String(world.stage))) + 1;
  const stage = String(world.stage);
  const name = stage === "opening"
    ? publicExpeditionContent.opening?.title
    : publicExpeditionContent.stages?.[stage]?.title ?? publicExpeditionContent.choices?.["4"]?.title;
  return {
    index,
    total: STAGE_ORDER.length,
    name: String(name ?? stage),
  };
}

function projectHumanTogether(world, farm, now = Date.now()) {
  const shared = publicExpeditionHumanData(world, farm, now);
  const data = {
    story_id: String(world.storyId ?? ""),
    title: safeText(shared.title ?? publicExpeditionContent.title),
    round: Math.max(1, Math.floor(Number(shared.round) || 1)),
    phase: String(world.phase ?? "closed"),
    status: safeText(shared.status),
    stage: projectStage(world),
    art_asset_key: ART_ASSET_KEYS.get(String(shared.artFile ?? "")) ?? "together.unknown",
    history: projectHistory((shared.history ?? []).slice(-128)),
    current_task: projectTask(shared.currentTask),
    current_choice: projectChoice(shared.currentChoice),
    cooldown: projectCooldown(shared.cooldown),
    ending: projectEnding(shared.ending, world.endingId),
    clues: projectClues(shared.clues ?? []),
  };
  return {
    data,
    server_time: new Date(now).toISOString(),
  };
}

/**
 * Preserve the old Human Together GET semantics: advance the shared world,
 * settle any due rewards, and persist exactly once before projecting a safe
 * view from clones.  This adapter never implements a parallel state machine.
 */
export function readHumanTogether(farm, now = Date.now()) {
  const world = getPublicExpeditionWorld();
  const farms = playerFarms();
  advancePublicExpedition(world, farms, now);
  save();
  return projectHumanTogether(structuredClone(world), structuredClone(farm), now);
}

export { projectHumanTogether };
