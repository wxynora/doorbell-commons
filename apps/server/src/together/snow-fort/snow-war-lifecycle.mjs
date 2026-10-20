import { activeSnowChatTurn, currentSnowChatNotice, snowChatWindow } from "./snow-war-chat.mjs";
import { activateSnowMatch } from "./snow-war-schedule.mjs";
import { createSeries } from "./snow-war-series.mjs";
import { ensureSnowTitleRewards } from "./snow-war-title-rewards.mjs";
import { completeSnowDraft, playedSnowRound } from "./snow-war-waits.mjs";

const has = (object, key) => Object.hasOwn(object, key);

// Admission and payment are separate facts. Only confirmed local ineligibility
// closes admission; an unavailable membership service leaves identity intact.
export function reconcileSnowRegistrationEligibility(state, identityForResident, now) {
  const payments = Object.values(state.registrationPayments ?? {});
  if (now >= state.closesAt) {
    for (const payment of payments) {
      if (payment.status !== "pending" || payment.excludedFromSeries) continue;
      const identity = identityForResident(payment.residentId);
      if (!identity || identity.humanId !== payment.humanId)
        Object.assign(payment, { excludedFromSeries: true, excludedAt: now });
    }
  }
  return payments.some((payment) => payment.status === "pending" && !payment.excludedFromSeries);
}

export function currentSnowCaptainNotice(state, series, notice, now) {
  const match = series?.matches[Number(notice.facts.match) - 1];
  const side = notice.facts.team;
  if (!match || match.locked || match.lineups[side]) return false;
  const closesAt =
    state.chatWindows?.[side]?.[match.index]?.closesAt ?? state.matchStartsAt[match.index];
  const confirming = Boolean(state.chatEnabled && now >= closesAt);
  return confirming === (notice.facts.stage === "confirm");
}

export function registeredHomes(state, identityForResident) {
  const homes = new Map();
  for (const [id, registration] of Object.entries(state.registrations)) {
    const current = identityForResident(id);
    if (!current || current.humanId !== registration.humanId) continue;
    if (!homes.has(current.humanId)) homes.set(current.humanId, []);
    homes.get(current.humanId).push(id);
  }
  return [...homes].map(([humanId, residents]) => ({ humanId, residents }));
}

export function advanceSnowLifecycle({
  state,
  store,
  runtime,
  now,
  eligibleResidents,
  identityForResident,
}) {
  state.notices ??= {};
  state.rewards ??= {};
  if (state.retired) return;
  const notice = (id, residentId, kind, facts = {}) => {
    if (!identityForResident(residentId) || !state.configuration.copy || has(state.notices, id))
      return;
    state.notices[id] = {
      id,
      residentId,
      kind,
      facts,
      createdAt: now,
      status: "pending",
      letterId: null,
    };
  };
  if (now >= state.opensAt && now < state.closesAt) {
    for (const residentId of eligibleResidents)
      notice(`${state.activityId}:registration:${residentId}`, residentId, "registration");
  }
  for (const entry of Object.values(state.notices)) {
    if (entry.status === "pending" && entry.kind === "registration" && now >= state.closesAt)
      Object.assign(entry, { status: "cancelled", endedAt: now });
  }
  let series = store.loadSeries(state.activityId);
  if (
    !series &&
    now >= state.closesAt &&
    !reconcileSnowRegistrationEligibility(state, identityForResident, now)
  ) {
    const humanEntries = registeredHomes(state, identityForResident);
    if (humanEntries.length) {
      const preview = createSeries({ seriesId: state.activityId, humanEntries });
      const captains =
        state.adminCaptains ??
        Object.fromEntries(
          ["A", "B"].map((side) => [
            side,
            (
              preview.teams[side].members.find((member) => !member.isNpc) ??
              preview.teams[side].members[0]
            ).id,
          ]),
        );
      runtime.create({ seriesId: state.activityId, captains, humanEntries });
      series = store.loadSeries(state.activityId);
    } else state.registrationEmpty = true;
  }
  if (!series) return;
  activateSnowMatch(state, series, now);
  const unplayed = series.matches.find((match) => !match.winner);
  if (unplayed && !unplayed.locked && now >= state.lineupDeadlines[unplayed.index]) {
    state.autoLineups ??= {};
    for (const side of ["A", "B"]) {
      if (unplayed.lineups[side]) continue;
      const draft = completeSnowDraft(
        series,
        unplayed.index,
        side,
        state.drafts[`${unplayed.index}:${side}`],
      );
      runtime.forResident(series.captains[side]).lineup(state.activityId, unplayed.index, draft);
      state.autoLineups[`${unplayed.index}:${side}`] = true;
      state.drafts[`${unplayed.index}:${side}`] = draft;
    }
    series = store.loadSeries(state.activityId);
  }
  const members = Object.entries(series.teams).flatMap(([side, team]) =>
    team.members.map((member) => ({ ...member, side })),
  );
  for (const member of members.filter((member) => !member.isNpc))
    notice(`${state.activityId}:team:${member.id}`, member.id, "team");
  const index = series.matches.findIndex((match) => !match.winner);
  if (state.chatEnabled && index >= 0) {
    for (const side of ["A", "B"]) {
      const turn = activeSnowChatTurn(state, series, side, now, identityForResident);
      if (turn?.currentResidentId) {
        const messages = (state.messages ?? []).filter((message) => message.side === side);
        notice(
          `${state.activityId}:chat:${side}:${turn.turn}:${turn.currentResidentId}`,
          turn.currentResidentId,
          "chat_turn",
          {
            team: side,
            turn: String(turn.turn),
            matchIndex: String(turn.matchIndex),
            lastMessageId: messages.at(-1)?.messageId ?? "",
          },
        );
      }
    }
  }
  if (index >= 0) {
    const match = series.matches[index];
    if (!match.locked) {
      for (const side of ["A", "B"]) {
        if (match.lineups[side]) continue;
        const confirming =
          state.chatEnabled && now >= snowChatWindow(state, series, side, now).closesAt;
        notice(
          `${state.activityId}:captain:${index}:${confirming ? "confirm:" : ""}${series.captains[side]}`,
          series.captains[side],
          "captain",
          { team: side, match: String(index + 1), ...(confirming ? { stage: "confirm" } : {}) },
        );
      }
    } else if (now >= state.matchStartsAt[index]) {
      const round = match.rounds.find((round) => !round.winner);
      if (round) {
        if (!has(series.startedRounds, round.battleId))
          runtime.prepare(state.activityId, index, round.index);
        runtime.expirePreparation(round.battleId, now);
        const started = store.loadBattle(round.battleId)?.runtime?.started === true;
        for (const id of [round.attackMember, round.defendMember]) {
          if (
            members.some((member) => member.id === id && !member.isNpc) &&
            !store.loadBattle(round.battleId)?.runtime?.substitutes?.includes(id)
          )
            notice(
              `${round.battleId}:${started ? "started" : "ready"}:${id}`,
              id,
              started ? "started" : "round",
              {
                match: String(index + 1),
                round: String(round.index + 1),
              },
            );
        }
      }
    }
  }
  for (const entry of Object.values(state.notices).filter((entry) => entry.status === "pending")) {
    const match = series.matches[Number(entry.facts.match) - 1];
    const round = match?.rounds[Number(entry.facts.round) - 1];
    const obsolete =
      (entry.kind === "registration" && now >= state.closesAt) ||
      (entry.kind === "captain" && !currentSnowCaptainNotice(state, series, entry, now)) ||
      (entry.kind === "round" &&
        (round?.winner || (round && store.loadBattle(round.battleId)?.runtime?.started))) ||
      (entry.kind === "started" && round?.winner) ||
      (entry.kind === "chat_turn" && !currentSnowChatNotice(state, series, entry, now));
    if (obsolete || !identityForResident(entry.residentId))
      Object.assign(entry, { status: "cancelled", endedAt: now });
  }
  const rewards = state.configuration.rewards;
  ensureSnowTitleRewards(state, series);
  if (!rewards) return;
  const grant = (id, residentId, amounts, kind, matchIndex, roundIndex) => {
    if (has(state.rewards, id)) return;
    state.rewards[id] = {
      grantId: id,
      residentId,
      kind,
      matchIndex,
      roundIndex,
      gold: amounts.gold,
      silver: amounts.silver,
      ...(kind === "champion"
        ? { decoration: { itemId: "farm_decor:snow_fort", quantity: 1 } }
        : {}),
      status: "pending",
      receipt: null,
    };
  };
  for (const member of members.filter((member) => !member.isNpc)) {
    let completed = 0;
    for (const match of series.matches) {
      for (const round of match.rounds.filter((round) => playedSnowRound(round, member.id))) {
        completed++;
        grant(
          `${round.battleId}:reward:${member.id}`,
          member.id,
          rewards.round,
          "round",
          match.index,
          round.index,
        );
      }
      if (match.winner)
        notice(`${state.activityId}:result:${match.index}:${member.id}`, member.id, "result");
    }
    if (completed === series.matches.length)
      grant(`${state.activityId}:complete:${member.id}`, member.id, rewards.complete, "complete");
    if (series.status === "complete" && member.side === series.seriesWinner && completed > 0)
      grant(`${state.activityId}:champion:${member.id}`, member.id, rewards.champion, "champion");
  }
}
