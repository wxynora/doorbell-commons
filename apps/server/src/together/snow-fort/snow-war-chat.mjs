// One persistent turn per team. No timers, NPC speech, or effect on battle readiness.
import { randomInt } from "node:crypto";
import { SNOW_WAIT_MS } from "./snow-war-waits.mjs";

export function snowChatWindow(state, series, side, at) {
  state.chatWindows ??= {};
  if (!state.chatWindows[side]) {
    const memberCount = series.teams[side].members.filter((member) => !member.isNpc).length;
    state.chatWindows[side] = state.matchStartsAt.map((closesAt, matchIndex) => ({
      matchIndex,
      memberCount,
      opensAt: closesAt - memberCount * 2 * 60_000,
      closesAt,
    }));
  }
  const matchIndex = series.matches.findIndex((match) => !match.winner);
  const window = state.chatWindows[side][matchIndex];
  return window
    ? {
        ...window,
        open:
          Boolean(
            state.chatEnabled && !state.retired && at >= window.opensAt && at < window.closesAt,
          ) &&
          !(state.chatTurns?.[side]?.matchIndex === matchIndex && state.chatTurns[side].stopped),
      }
    : undefined;
}

export function activeSnowChatTurn(state, series, side, at, identityForResident) {
  const window = snowChatWindow(state, series, side, at);
  if (!window?.open) return undefined;
  snowChatTurn(state, series, side, identityForResident);
  const stored = state.chatTurns[side];
  if (stored.matchIndex !== window.matchIndex) {
    if (stored.matchIndex !== undefined) stored.revision++;
    stored.matchIndex = window.matchIndex;
    stored.cursor = 0;
    stored.passStreak = 0;
    stored.stopped = false;
    stored.timeouts = {};
    stored.deadlineAt = Math.min(window.closesAt, at + SNOW_WAIT_MS.chat);
  }
  stored.deadlineAt ??= Math.min(window.closesAt, at + SNOW_WAIT_MS.chat);
  // At most one silent lap is consumed, even after a long outage. Every loop
  // step either advances the cursor or terminates the discussion.
  const members = stored.order.filter((id) => identityForResident(id));
  for (
    let count = 0;
    count < members.length && !stored.stopped && at >= stored.deadlineAt;
    count++
  ) {
    const current = snowChatTurn(state, series, side, identityForResident);
    if (!current.currentResidentId) break;
    stored.timeouts ??= {};
    stored.timeouts[current.currentResidentId] = stored.deadlineAt;
    advanceSnowChatTurn(
      state,
      series,
      side,
      current.currentResidentId,
      current.turn,
      identityForResident,
      { at: stored.deadlineAt, pass: true, closesAt: window.closesAt },
    );
  }
  if (stored.stopped) return undefined;
  return {
    ...snowChatTurn(state, series, side, identityForResident),
    matchIndex: window.matchIndex,
  };
}

export function snowChatTurn(state, series, side, identityForResident, draw = randomInt) {
  state.chatTurns ??= {};
  if (!state.chatTurns[side]) {
    const order = series.teams[side].members
      .filter((member) => !member.isNpc)
      .map((member) => member.id);
    for (let index = order.length - 1; index > 0; index--) {
      const chosen = draw(index + 1);
      [order[index], order[chosen]] = [order[chosen], order[index]];
    }
    state.chatTurns[side] = { order, cursor: 0, revision: 0 };
  }
  const turn = state.chatTurns[side];
  if (turn.stopped) return { order: [...turn.order], currentResidentId: null, turn: turn.revision };
  if (!turn.order.some((id) => identityForResident(id)))
    return { order: [...turn.order], currentResidentId: null, turn: turn.revision };
  for (let visited = 0; visited < turn.order.length; visited++) {
    if (identityForResident(turn.order[turn.cursor])) {
      return {
        order: [...turn.order],
        currentResidentId: turn.order[turn.cursor],
        turn: turn.revision,
      };
    }
    turn.cursor = (turn.cursor + 1) % turn.order.length;
    turn.revision++;
  }
  return {
    order: [...turn.order],
    currentResidentId: null,
    turn: turn.revision,
  };
}

export function advanceSnowChatTurn(
  state,
  series,
  side,
  residentId,
  revision,
  identityForResident,
  { at, pass = false, closesAt = Infinity } = {},
) {
  const current = snowChatTurn(state, series, side, identityForResident);
  if (current.currentResidentId !== residentId || current.turn !== revision)
    throw new Error("option_not_available");
  const turn = state.chatTurns[side];
  turn.passStreak = pass ? (turn.passStreak ?? 0) + 1 : 0;
  const eligible = turn.order.filter((id) => identityForResident(id)).length;
  if (pass && turn.passStreak >= eligible) turn.stopped = true;
  turn.cursor = (turn.cursor + 1) % turn.order.length;
  turn.revision++;
  if (at !== undefined) turn.deadlineAt = Math.min(closesAt, at + SNOW_WAIT_MS.chat);
  const next = snowChatTurn(state, series, side, identityForResident);
  // The old timeout remains visible while waiting, never on the next opportunity.
  if (next.currentResidentId && turn.timeouts) delete turn.timeouts[next.currentResidentId];
  return next;
}

export function currentSnowChatNotice(state, series, notice, at) {
  const turn = state.chatTurns?.[notice.facts.team];
  const window = series && snowChatWindow(state, series, notice.facts.team, at);
  return Boolean(
    state.chatEnabled &&
      !state.retired &&
      series?.status !== "complete" &&
      window?.open &&
      String(window.matchIndex) === notice.facts.matchIndex &&
      turn?.matchIndex === window.matchIndex &&
      turn &&
      !turn.stopped &&
      (turn.deadlineAt === undefined || at < turn.deadlineAt) &&
      String(turn.revision) === notice.facts.turn &&
      turn.order[turn.cursor] === notice.residentId,
  );
}
