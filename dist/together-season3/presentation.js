import { createHash } from "node:crypto";
import { togetherSeason3Content as content, season3StoryHistory } from "./content.js";
import { togetherSeason3DishNeeds } from "./runtime.js";
import { listInterviewNpcs, listOwnInterviewRecords, listInterviewSources, interviewOpeningText, completedInterviewTaskMessage } from "./interviews.js";

const copy = (value) => structuredClone(value);
const receiptKey = (state, farm, kind, args) =>
  "s3:" +
  createHash("sha256")
    .update(JSON.stringify([state.eventId, farm.id, kind, args]))
    .digest("hex");

// Keep the durable receipt identity unchanged; only the displayed handle shrinks.
const shortOption = (key) => /^s3:[a-f0-9]{64}$/.test(key)
  ? "s3:" + Buffer.from(key.slice(3), "hex").toString("base64url").slice(0, 12)
  : key;
const optionKey = (state, farm, kind, args) => shortOption(receiptKey(state, farm, kind, args));
const matchesOption = (state, farm, kind, args, option) => {
  const key = receiptKey(state, farm, kind, args);
  return option === key || option === shortOption(key);
};
export const season3ActionMatchesOption = (state, farm, action, option) =>
  matchesOption(state, farm, action.kind, action.args, option);
export const season3ActionRequestId = (state, farm, action) =>
  action.requestId ?? receiptKey(state, farm, action.kind, action.args);

export function season3Actions(state, farm, identity) {
  const actions = [];
  const add = (kind, args, label) =>
    actions.push({ kind, args, label, option: optionKey(state, farm, kind, args) });
  if (state.phase !== "ended") {
    for (const need of togetherSeason3DishNeeds(state, farm.id).filter((entry) => entry.status === "open")) {
      for (const dish of farm.ranch?.kitchen?.dishes ?? []) {
        if (
          dish.recipeId === need.recipeId &&
          dish.name === need.dishName &&
          typeof dish.id === "string"
        )
          add("delivery", { needId: need.id, dishSelector: dish.id }, content.needs[need.id].title);
      }
    }
  }
  if (identity?.reporterId && identity.isReporter) {
    const options = listInterviewNpcs(state.interviews, {
      phase: state.phase,
      reporterId: identity.reporterId,
    });
    for (const npc of [...options.available, ...options.inProgress])
      add("interview-read", { npcId: npc.npcId }, npc.name);
    for (const npc of [...options.available, ...options.inProgress]) {
      for (const question of npc.questions)
        add(
          "question",
          { npcId: npc.npcId, questionId: question.questionId },
          `${npc.name}：${question.text}`,
        );
    }
  }
  return actions;
}

const callFor = (action) => `doorbell(${JSON.stringify({
  op: "farm.together.choose", args: { option: action.option },
})})`;

export function season3InterviewTaskText(actions, npcId, { includeOpening = false, phase } = {}) {
  const questions = actions.filter((action) => action.kind === "question" && action.args.npcId === npcId)
    .map((action) => `${action.label}\n${callFor(action)}`).join("\n\n");
  return includeOpening ? `${interviewOpeningText(npcId, phase)}\n\n${questions}` : questions;
}

export function season3InterviewNotice(actions, phase) {
  const tasks = actions.filter((action) => action.kind === "interview-read");
  if (tasks.length === 0) return "";
  return [...(phase === "preparation" ? [content.interviewLetter] : []),
    ...tasks.map((task) => `${task.label}\n使用 ${callFor(task)} 查看当前采访任务。`),
  ].join("\n\n");
}

// Replay is scoped to the authenticated farm/resident, not to an identifier
// embedded in a player-supplied string. No free-form option parser exists.
export function season3ReplayAction(state, farm, identity, option) {
  const prior = state.receipts.find(
    (entry) => entry.farmId === farm.id &&
      (entry.requestId === option || shortOption(entry.requestId) === option),
  );
  if (prior?.kind === "delivery") {
    const delivery = state.deliveries.find((entry) => entry.deliveryId === prior.resultId);
    if (delivery)
      return {
        kind: "delivery",
        args: { needId: delivery.needId, dishSelector: delivery.dishId },
        requestId: prior.requestId,
        option,
      };
  }
  if (!identity?.isReporter || !identity.reporterId) return null;
  for (const record of listOwnInterviewRecords(state.interviews, {
    reporterId: identity.reporterId,
  })) {
    for (const answer of record.answers) {
      const args = { npcId: record.npcId, questionId: answer.questionId };
      if (matchesOption(state, farm, "question", args, option))
        return { kind: "question", args, option };
    }
  }
  return null;
}

// Classify only exact handles derived from this event and authenticated farm.
// This never executes an old action or changes the completed answer replay path.
export function season3UnavailableAction(state, farm, identity, option) {
  for (const need of togetherSeason3DishNeeds(state, farm.id)) {
    if (need.status !== "closed" && need.status !== "delivered") continue;
    for (const dish of farm.ranch?.kitchen?.dishes ?? []) {
      if (dish.recipeId !== need.recipeId || dish.name !== need.dishName || typeof dish.id !== "string") continue;
      if (matchesOption(state, farm, "delivery", { needId: need.id, dishSelector: dish.id }, option))
        return need.status === "delivered"
          ? { code: "season3_dish_already_delivered", text: content.messages.already_delivered }
          : { code: "season3_dish_window_closed", text: content.messages.dish_closed };
    }
  }
  if (identity?.isReporter && identity.reporterId) {
    for (const record of state.interviews.interviews) {
      const readOption = matchesOption(state, farm, "interview-read", { npcId: record.npcId }, option);
      const answeredOption = record.answers.some((answer) => matchesOption(state, farm, "question", {
        npcId: record.npcId, questionId: answer.questionId,
      }, option));
      if (readOption || answeredOption)
        return { code: "interview_completed", text: completedInterviewTaskMessage() };
    }
  }
  return null;
}

export function season3HumanData(state, _farm) {
  const phase = content.stages[state.phase];
  return {
    title: content.title,
    artFile: `rain-not-yet-${state.phase === "ended" ? "ending" : state.phase}-v4.png`,
    round: 1,
    status: phase.title,
    history: copy(season3StoryHistory(state)),
    currentTask: null,
    currentChoice: null,
    cooldown: null,
    ending: state.phase === "ended" ? { title: content.ending.title, text: state.endingText ?? phase.text } : null,
    rewards: [],
    clues: [...Map.groupBy(listInterviewSources(state.interviews), (source) => source.interviewId)]
      .map(([id, sources]) => ({
        id: "interview_" + createHash("sha256").update(id).digest("hex"),
        title: `采访${sources[0].npc.name}`,
        text: sources.flatMap((source) => source.answers)
          .map((answer) => `${answer.question}\n\n${answer.answer}`).join("\n\n"),
      })),
    clueTarget: 0,
    archives: copy(state.archives ?? []),
  };
}

export function season3Text(
  state,
  farm,
  { actions = [], history = false, identity = null } = {},
) {
  const data = season3HumanData(state, farm);
  const paragraphs = [`🧭 铃野共行｜本期故事：《${content.title}》`];
  const scenes = history
    ? data.history
    : data.history.filter((entry) => entry.id === `${state.eventId}:stage:${state.phase}`);
  if (scenes.length === 0) paragraphs.push(data.status);
  for (const scene of scenes) paragraphs.push(`【${scene.title}】\n${scene.text}`);
  // The public source already includes the reporter's own answer.
  for (const clue of data.clues) paragraphs.push(`【${clue.title}】\n${clue.text}`);
  paragraphs.push(season3NextStepsText(state, { actions, identity, farmId: farm.id }));
  return paragraphs.filter(Boolean).join("\n\n");
}

export function season3NextStepsText(state, { actions = [], identity = null, farmId = null } = {}) {
  const paragraphs = togetherSeason3DishNeeds(state, farmId)
    .filter((need) => need.status === "open")
    .map((need) => `${content.needs[need.id].text}\n${need.dishName} ×${need.quantity}`);
  const ownNpcs = new Set(identity?.reporterId ? listOwnInterviewRecords(state.interviews,
    { reporterId: identity.reporterId }).map((record) => record.npcId) : []);
  const visibleActions = actions.filter((action) => action.kind !== "question" || ownNpcs.has(action.args.npcId));
  if (visibleActions.length)
    paragraphs.push(
      "【下一步】\n" +
        visibleActions
          .map(
            (entry) =>
              `${entry.label}\ndoorbell(${JSON.stringify({ op: "farm.together.choose", args: { option: entry.option } })})`,
          )
          .join("\n\n"),
    );
  return paragraphs.join("\n\n");
}
