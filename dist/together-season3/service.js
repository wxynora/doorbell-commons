import {
  getPublicExpeditionWorld,
  getNatureWorld,
  getFarm,
  playerFarms,
  replaceFarmsAndPublicExpeditionAtomic,
} from "../store.js";
import { settlePublicExpeditionRewards, publicExpeditionRewardText } from "../public-expedition.js";
import { farmResidentId, farmCareerQualificationLevel } from "../career/farm-benefits.js";
import { registerTogetherFlood } from "../nature.js";
import {
  TOGETHER_SEASON3_STORY_ID,
  activateTogetherSeason3,
  advanceTogetherSeason3,
  deliverTogetherSeason3Dish,
  recordTogetherSeason3Source,
  togetherSeason3DishNeeds,
} from "./runtime.js";
import { createInterviewState, answerInterviewQuestion } from "./interviews.js";
import { syncInterviewReporterSources } from "./reporter-source.js";
import { captureSeason3Harvest, recordSeason3Harvest } from "./harvest.js";
import { collectSeason3AuthorityReceipts } from "./authority.js";
import {
  togetherSeason3Content as content,
  appendSeason3Story,
  appendSeason3FactText,
  season3EndingText,
} from "./content.js";
import {
  season3Actions,
  season3ReplayAction,
  season3UnavailableAction,
  season3Text,
  season3NextStepsText,
  season3InterviewTaskText,
  season3InterviewNotice,
} from "./presentation.js";

let databaseProvider = () => null;
let backendProvider = () => null;
export function configureTogetherSeason3Authority({ getDatabase, getBackend }) {
  if (typeof getDatabase !== "function" || typeof getBackend !== "function")
    throw new TypeError("invalid story authority providers");
  databaseProvider = getDatabase;
  backendProvider = getBackend;
}
const clone = (value) => structuredClone(value);
const assertResult = (result) => {
  if (!result.ok) {
    const error = new Error(result.code);
    error.code = result.code;
    throw error;
  }
  return result;
};
export const isTogetherSeason3 = (world) => world?.storyId === TOGETHER_SEASON3_STORY_ID;

// The caller attaches the returned metadata to the same working farm before
// the original harvest commit; never make a later, detached receipt write.
export function captureStoredTogetherSeason3Harvest(farm,now=Date.now()) {
  const current=getPublicExpeditionWorld();
  if(!isTogetherSeason3(current)) return null;
  const state=assertResult(advanceTogetherSeason3(current,getNatureWorld(),now)).state;
  const capture=captureSeason3Harvest({farm,state,now});
  return capture?{state,capture}:null;
}

export function attachStoredTogetherSeason3Harvest(farm,captured,now=Date.now()) {
  if(!captured) return null;
  const result=assertResult(recordSeason3Harvest({farm,state:captured.state,capture:captured.capture,now}));
  if(result.changed) farm.togetherSeason3HarvestReceipts=result.farm.togetherSeason3HarvestReceipts;
  return result.source;
}

function withOwnReward(text, state, farm) {
  const reward = (state.rewards ?? []).find((item) => item.farmId === farm.id);
  return reward ? `${text}\n\n${publicExpeditionRewardText(reward)}` : text;
}

function identityFor(farm, now) {
  const database = databaseProvider();
  const reporterId = farmResidentId(database, farm);
  return {
    reporterId,
    isReporter: Boolean(
      reporterId && farmCareerQualificationLevel(database, farm, "reporter", now) > 0,
    ),
    isAgronomist: Boolean(reporterId && farmCareerQualificationLevel(database, farm, "agronomist", now) > 0),
    isVeterinarian: Boolean(reporterId && farmCareerQualificationLevel(database, farm, "veterinarian", now) > 0),
  };
}

function prepare(raw, nature, farms, now) {
  let state = assertResult(advanceTogetherSeason3(raw, nature, now)).state;
  state.storyTitle = content.title;
  for (const farm of farms) {
    for (const source of collectSeason3AuthorityReceipts({
      database: databaseProvider(),
      farm,
      state,
      now,
    })) {
      const result = recordTogetherSeason3Source(state, { ...source, now }, nature);
      if (!result.ok) {
        if (result.code === "season3_ended") continue;
        assertResult(result);
      } else state = result.state;
    }
  }
  appendSeason3Story(state, state.phase, now);
  if (state.phase === "ended") {
    state.endingId = content.ending.id;
    state.endingTitle = content.ending.title;
    state.endingTitleId = content.ending.titleId;
    state.endingText = season3EndingText(state);
    settlePublicExpeditionRewards(state, farms, now);
  }
  return state;
}

function commit(state, farms, nextNatureWorld) {
  return replaceFarmsAndPublicExpeditionAtomic({
    replacements: farms.map((farm) => ({ id: farm.id, farm })),
    nextPublicExpeditionWorld: state,
    ...(nextNatureWorld === undefined ? {} : { nextNatureWorld }),
  });
}

// Each saved answer is itself the durable pending source. Registration
// can safely replay after a lost ACK. Interview contribution is already saved.
function syncSources(state) {
  const registerSource = backendProvider()?.trustedSystemCommands?.registerReporterSourceFact;
  if (typeof registerSource !== "function") return;
  syncInterviewReporterSources(state.interviews, { registerSource, acknowledgedIds: [] });
}

/** Trusted launch boundary. No HTTP player route or timer activates a story. */
export function activateStoredTogetherSeason3({ enabled = false, now = Date.now() } = {}) {
  const previous = getPublicExpeditionWorld();
  const nature = enabled && !isTogetherSeason3(previous)
    ? registerTogetherFlood(getNatureWorld(), now) : getNatureWorld();
  const result = activateTogetherSeason3({
    enabled,
    state: isTogetherSeason3(previous) ? previous : null,
    previousStory: previous,
    nature,
    now,
  });
  if (!result.ok) return result;
  let state = result.state;
  state.storyTitle = content.title;
  if (!isTogetherSeason3(previous)) {
    const archived = clone(previous);
    delete archived.archives;
    state.archives = [...clone(previous.archives ?? []), archived];
    state.interviews = createInterviewState({ eventId: state.eventId });
  }
  appendSeason3Story(state, state.phase, now);
  const farms = playerFarms().map(clone);
  commit(state, farms, nature);
  return { ok: true, changed: result.changed, world: clone(state) };
}

export function readStoredTogetherSeason3(farm, now = Date.now()) {
  const current = getFarm(farm?.id);
  if (!current || !isTogetherSeason3(getPublicExpeditionWorld()))
    throw new Error("season3_not_active");
  const farms = playerFarms().map(clone);
  const state = prepare(getPublicExpeditionWorld(), getNatureWorld(), farms, now);
  commit(state, farms);
  syncSources(state);
  return { world: clone(state), farm: clone(getFarm(current.id)) };
}

// Status is a projection of existing tasks. It never claims an NPC, creates a
// second career job, or adds a notification/read-state store.
export function storedTogetherSeason3StatusText(farm, now = Date.now()) {
  const raw = getPublicExpeditionWorld();
  const actor = getFarm(farm?.id);
  if (!actor || !isTogetherSeason3(raw)) return "";
  const state = assertResult(advanceTogetherSeason3(raw, getNatureWorld(), now)).state;
  if (state.phase === "ended") return "";
  const identity = identityFor(actor, now);
  const actions = season3Actions(state, actor, identity);
  const parts = [season3InterviewNotice(actions, state.phase)];
  const database = databaseProvider();
  if (identity.reporterId && database) {
    const rows = database.prepare(`SELECT job_id FROM career_jobs
      WHERE career = 'agronomist' AND (worker_resident_id = ? OR owner_resident_id = ?)
        AND status IN ('available','accepted','assigned','active')
      ORDER BY created_at, job_id`).all(identity.reporterId, identity.reporterId);
    for (const row of rows) {
      // Reference reads use the original job and its original visibility and
      // inspection options. Finishing that job naturally removes this link.
      parts.push(`${content.agronomyTaskLabel}\ndoorbell(${JSON.stringify({
        op: "go.farm.commission", args: { reference: row.job_id },
      })})`);
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

export function runStoredTogetherSeason3(farm, input = {}, now = Date.now()) {
  const current = getFarm(farm?.id);
  if (!current || !isTogetherSeason3(getPublicExpeditionWorld()))
    throw new Error("season3_not_active");
  const nature = getNatureWorld();
  let farms = playerFarms().map(clone);
  let state = prepare(getPublicExpeditionWorld(), nature, farms, now);
  let actor = farms.find((item) => item.id === current.id);
  if (!actor) throw new Error("season3_actor_unavailable");
  const identity = identityFor(actor, now);
  const actions = season3Actions(state, actor, identity);
  if (input.option === undefined) {
    commit(state, farms);
    syncSources(state);
    return {
      ok: true,
      farm: clone(getFarm(actor.id)),
      text: withOwnReward(
        season3Text(state, actor, {
          actions,
          identity,
          history: input.view === "history",
        }),
        state,
        actor,
      ),
    };
  }
  const action =
    actions.find((item) => item.option === input.option) ??
    season3ReplayAction(state, actor, identity, input.option);
  if (!action) {
    const unavailable = season3UnavailableAction(state, actor, identity, input.option);
    return {
      ok: false,
      farm: clone(current),
      code: unavailable?.code ?? "option_not_available",
      text: [unavailable?.text ?? content.messages.option_unavailable,
        season3NextStepsText(state, { actions, identity })].filter(Boolean).join("\n\n"),
    };
  }
  if (action.kind === "interview-read") {
    return {
      ok: true,
      farm: clone(current),
      text: season3InterviewTaskText(actions, action.args.npcId, { includeOpening: true, phase: state.phase }),
    };
  }
  let result;
  let response;
  let actionScene = "";
  if (action.kind === "delivery") {
    result = deliverTogetherSeason3Dish(
      state,
      actor,
      { ...action.args, requestId: input.option, now },
      nature,
    );
    if (result.ok) {
      const need = content.needs[action.args.needId];
      response = result.replayed
        ? content.messages.replay
        : content.messages.delivered
            .replace("{料理名}", need.dish)
            .replace("{实际用途}", need.title);
      const receiver =
        action.args.needId === "flood_tea"
          ? "砂砂"
          : state.previousStory.endingId === "next_door"
            ? "南枝"
            : "冬青";
      if (!result.replayed) {
        actionScene = need.success.replaceAll("{验收人}", receiver);
        appendSeason3FactText(result.state, {
          id: result.delivery.deliveryId,
          title: need.title,
          text: actionScene,
          at: now,
        });
      }
    }
  } else {
    const needs = togetherSeason3DishNeeds(state);
    const tea = needs.find((need) => need.id === "flood_tea");
    const pancake = needs.find((need) => need.id === "preparation_pancake").status === "delivered";
    const riceBall = needs.find((need) => need.id === "preparation_rice_ball").status === "delivered";
    const context = {
      secondEnding: state.previousStory.endingId,
      teaStatus: tea.status === "not_open" ? "open" : tea.status,
      preparationDelivery: pancake ? (riceBall ? "both" : "pancake_only") : (riceBall ? "rice_ball_only" : "neither"),
      publicFactReferences: [{ kind: "nature_event", id: state.eventId },
        ...state.deliveries.filter((delivery) => ["preparation_pancake", "preparation_rice_ball"].includes(delivery.needId))
          .map((delivery) => ({ kind: "delivery", id: delivery.deliveryId }))],
    };
    const phase = state.phase;
    const r = answerInterviewQuestion(state.interviews, {
            ...action.args,
            reporterId: identity.reporterId,
            phase,
            occurredAt: now,
            context,
          });
    result = { ...r, state };
    response = r.text;
    if (r.ok) {
      const contribution = recordTogetherSeason3Source(
        state,
        {
          eventId: state.eventId,
          farmId: actor.id,
          kind: "interview",
          sourceId: r.record.interviewId,
          occurredAt: r.record.startedAt,
          successful: true,
          now,
        },
        nature,
      );
      if (!contribution.ok)
        return {
          ok: false,
          farm: clone(current),
          code: contribution.code,
          text: content.messages.unavailable,
        };
      result.state = contribution.state;
    }
    if (r.ok && r.answer) response = [r.answer.question, r.answer.answer, r.text].filter(Boolean).join("\n\n");
  }
  if (!result.ok)
    return {
      ok: false,
      farm: clone(current),
      code: result.code,
      text:
        result.text ??
        (result.code === "season3_dish_window_closed"
          ? content.messages.closed
          : content.messages.unavailable),
    };
  state = result.state;
  if (result.farm) {
    actor = result.farm;
    farms = farms.map((item) => (item.id === actor.id ? actor : item));
  }
  commit(state, farms);
  syncSources(state);
  const nextActions = season3Actions(state, actor, identity);
  if (action.kind === "question") {
    return {
      ok: true,
      farm: clone(getFarm(actor.id)),
      text: [response, season3InterviewTaskText(nextActions, action.args.npcId)]
        .filter(Boolean).join("\n\n"),
    };
  }
  return {
    ok: true,
    farm: clone(getFarm(actor.id)),
    text: withOwnReward(
      [response, actionScene, season3NextStepsText(state, { actions: nextActions, identity })]
        .filter(Boolean).join("\n\n"),
      state,
      actor,
    ),
  };
}
