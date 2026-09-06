import { togetherSeason3Content as content } from "./content.js";
import { togetherSeason3DishNeeds } from "./runtime.js";
import { listInterviewSources } from "./interviews.js";
import { season3Actions } from "./presentation.js";

const viewCall = 'doorbell({"op":"farm.together.view","args":{}})';
const chooseCall = (action) => `doorbell(${JSON.stringify({
  op: "farm.together.choose", args: { option: action.option },
})})`;

// Keep the reviewed first scene paragraph as a short scene, not a new summary.
// Full scenes and frozen interview answers remain available through Together.
export function takeSeason3AiNotices(state, farm, reads, farms) {
  const messages = [];
  const pending = [];
  const fresh = (list, id) => {
    if (reads[list].includes(id)) return false;
    pending.push([list, id]);
    return true;
  };
  const prefix = `${state.storyId}:${state.eventId}`;
  const stage = content.stages[state.phase];
  if (fresh("aiPhases", `${prefix}:stage:${state.phase}`)) {
    fresh("aiOpenings", prefix);
    messages.push(`🧭 铃野共行｜本期故事：《${content.title}》\n【${stage.title}】\n${stage.text.split("\n\n")[0]}`);
  }
  const needs = togetherSeason3DishNeeds(state);
  for (const need of needs.filter((entry) => entry.status === "open")) {
    if (fresh("aiClues", `${prefix}:need:${need.id}`)) {
      const narrative = content.needs[need.id].notice ?? content.needs[need.id].text;
      messages.push(`${narrative}\n${need.dishName} ×${need.quantity}`);
    }
  }
  const nameFor = (id) => farms.find((entry) => entry.id === id)?.aiName ?? id;
  for (const need of needs.filter((entry) => entry.status === "delivered")) {
    const delivery = need.delivery;
    if (!fresh("aiClues", `${prefix}:delivery:${delivery.deliveryId}`)) continue;
    // The actor already received the same scene in the successful action result.
    if (delivery.farmId === farm.id) continue;
    const receiver = need.id === "flood_tea" ? "砂砂"
      : state.previousStory.endingId === "next_door" ? "南枝" : "冬青";
    const scene = content.needs[need.id].success.replaceAll("{验收人}", receiver);
    messages.push(`【${nameFor(delivery.farmId)} · ${need.dishName} ×${need.quantity}】\n${scene}`);
  }
  const contributions = new Map(state.contributions.filter((entry) => entry.kind === "interview")
    .map((entry) => [entry.sourceId, entry.farmId]));
  for (const source of listInterviewSources(state.interviews)) {
    const author = contributions.get(source.interviewId);
    const answer = source.answers[0];
    if (!author || !fresh("aiClues", `${prefix}:interview:${answer.sourceId}`)) continue;
    if (author === farm.id) continue;
    messages.push(`【${nameFor(author)} · 采访${source.npc.name}】\n${answer.question}`);
  }
  if (messages.length) messages.push(`【下一步】\n${viewCall}`);
  // Only consume after successful rendering. The caller persists these existing
  // per-household AI markers with the same world commit, never Human read state.
  for (const [list, id] of pending) reads[list].push(id);
  return messages;
}

// A dish obtained after the initial request still gets a current actor-bound
// handle on status. There is no handle for missing, delivered or closed dishes.
export function season3PendingDeliveryCalls(state, farm) {
  return season3Actions(state, farm, null).filter((entry) => entry.kind === "delivery")
    .map((entry) => `${entry.label}\n${chooseCall(entry)}`).join("\n\n");
}
