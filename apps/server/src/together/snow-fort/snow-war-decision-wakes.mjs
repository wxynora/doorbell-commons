// Battle-tick obligations, persisted in the existing battle snapshot. No new timer or polling interval.
const own = (value, key) => Object.hasOwn(value, key);
const copy = (value) => structuredClone(value);
export const MIN_SNOW_DECISION_TICKS = 30;
function waits(battle) {
  battle.runtime.decisionWaits = Object.assign(Object.create(null), battle.runtime.decisionWaits);
  return battle.runtime.decisionWaits;
}
const eligible = (battle, residentId) =>
  [...battle.participants.attack, ...battle.participants.defend].includes(residentId) &&
  !(battle.runtime.npcs ?? []).includes(residentId) &&
  !(battle.runtime.substitutes ?? []).includes(residentId);

export function scheduleSnowDecision(battle, residentId, requestId, waitTicks) {
  if (
    !Number.isSafeInteger(waitTicks) ||
    waitTicks < MIN_SNOW_DECISION_TICKS ||
    !Number.isSafeInteger(battle.tick + waitTicks)
  )
    throw Error("invalid_decision_wait");
  if (!battle.runtime.started || !eligible(battle, residentId))
    throw Error("not_battle_participant");
  if (battle.status !== "running") return undefined;
  const records = waits(battle);
  if (own(records, residentId) && records[residentId].requestId === requestId)
    return copy(records[residentId]);
  const sequence = (records[residentId]?.sequence ?? 0) + 1;
  const record = {
    id: `${battle.battleId}:decision:${residentId}:${sequence}`,
    battleId: battle.battleId,
    residentId,
    requestId,
    sequence,
    fromTick: battle.tick,
    waitTicks,
    dueTick: battle.tick + waitTicks,
    status: "waiting",
  };
  records[residentId] = record;
  return copy(record);
}

export function advanceSnowDecisionWakes(battle) {
  if (!battle.runtime?.started) return false;
  const records = waits(battle);
  let attention = false;
  if (battle.status === "running" && !battle.runtime.decisionOpeningRecorded) {
    battle.runtime.decisionOpeningRecorded = true;
    for (const residentId of [...battle.participants.attack, ...battle.participants.defend]) {
      if (!eligible(battle, residentId) || own(records, residentId)) continue;
      records[residentId] = {
        id: `${battle.battleId}:decision:${residentId}:opening`,
        battleId: battle.battleId,
        residentId,
        requestId: null,
        sequence: 0,
        fromTick: battle.tick,
        waitTicks: 0,
        dueTick: battle.tick,
        status: "due",
      };
      attention = true;
    }
  }
  for (const record of Object.values(records)) {
    if (battle.status !== "running" || !eligible(battle, record.residentId)) {
      if (record.status !== "cancelled") {
        record.status = "cancelled";
        attention = true;
      }
    } else if (record.status === "waiting" && battle.tick >= record.dueTick) {
      record.status = "due";
      attention = true;
    }
  }
  return attention;
}

export function pendingSnowDecisions(battle) {
  return Object.values(battle.runtime?.decisionWaits ?? {})
    .filter((record) => record.status === "due")
    .map(copy);
}

export function markSnowDecisionNotified(battle, id) {
  const record = Object.values(battle.runtime?.decisionWaits ?? {}).find(
    (value) => value.id === id,
  );
  if (record?.status !== "due" || battle.status !== "running") throw Error("decision_not_current");
  record.status = "notified";
}

export function currentSnowDecision(battle, residentId, id) {
  const record = battle?.runtime?.decisionWaits?.[residentId];
  return (
    battle?.status === "running" &&
    record?.id === id &&
    record.status !== "cancelled" &&
    eligible(battle, residentId)
  );
}

// The decision obligation and its one mailbox/Bell notice commit in the host's existing transaction.
export function reconcileSnowDecisions(
  state,
  { runtime, loadBattle, identityForResident, present, render, at },
) {
  for (const notice of Object.values(state.notices ?? {})) {
    if (
      notice.kind === "action_due" &&
      notice.status === "pending" &&
      (state.retired ||
        !identityForResident(notice.residentId) ||
        !currentSnowDecision(loadBattle(notice.facts.battleId), notice.residentId, notice.id))
    )
      Object.assign(notice, { status: "cancelled", endedAt: at });
  }
  if (state.retired) return;
  for (const decision of runtime.pendingDecisions()) {
    if (!identityForResident(decision.residentId)) continue;
    if (!own(state.notices, decision.id)) {
      const data = present(state, decision.residentId);
      if (
        data.phase !== "battle" ||
        !data.options.some(
          (option) =>
            option.action.battleId === decision.battleId && option.action.composed === "command",
        )
      )
        continue;
      state.notices[decision.id] = {
        id: decision.id,
        residentId: decision.residentId,
        kind: "action_due",
        facts: { battleId: decision.battleId, body: `轮到你继续指挥雪堡战了。\n${render(data)}` },
        createdAt: at,
        status: "pending",
        letterId: null,
      };
    }
    runtime.markDecisionNotified(decision.battleId, decision.id);
  }
}
