import { readFileSync } from "node:fs";

// Literal text from the reviewed season-three manuscript. No model generation.
export const togetherSeason3Content = JSON.parse(
  readFileSync(new URL("../../content/together-season3-story.json", import.meta.url), "utf8"),
);

export function season3EndingText(state) {
  const results=togetherSeason3Content.results;
  const parts=[];
  const preparation=new Set(state.deliveries.filter(item=>item.phase==="preparation")
    .map(item=>item.needId));
  if(preparation.size) parts.push(results.preparation);
  if(!preparation.has("preparation_pancake") || !preparation.has("preparation_rice_ball"))
    parts.push(results.incomplete);
  if(state.deliveries.length) parts.push(results.delivered);
  parts.push(togetherSeason3Content.stages.ended.text);
  return parts.join("\n\n");
}

export function appendSeason3Story(state, phase = state.phase, at = Date.now()) {
  state.storyHistory ??= [];
  const key = `${state.eventId}:stage:${phase}`;
  if (state.storyHistory.some((entry) => entry.id === key)) return;
  const scene = togetherSeason3Content.stages[phase];
  if (!scene) throw new Error("invalid_season3_phase");
  let text = phase === "ended" ? season3EndingText(state) : scene.text;
  if (phase === "preparation") {
    const kitchen = togetherSeason3Content.kitchen[state.previousStory.endingId];
    if (!kitchen) throw new Error("season3_previous_story_unavailable");
    text += "\n\n" + kitchen;
  }
  state.storyHistory.push({
    id: key,
    kind: phase === "ended" ? "ending" : "story",
    title: scene.title,
    text,
    at,
  });
}

export function appendSeason3FactText(state, { id, title, text, at }) {
  state.storyHistory ??= [];
  if (!state.storyHistory.some((entry) => entry.id === id))
    state.storyHistory.push({ id, kind: "story", title, text, at });
}
