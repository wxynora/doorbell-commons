import { SNOW_WAR_CONFIG as CFG } from "./snow-war-config.mjs";

export const SNOW_WAIT_MS = Object.freeze({ chat: 60_000, lineup: 120_000, ready: 120_000 });

// Preserve every valid draft choice; deterministic completion never searches or
// retries until a desired result appears.
export function completeSnowDraft(series, matchIndex, side, draft = {}) {
  const members = series.teams[side].members.map((member) => member.id);
  const order = [...new Set((draft.order ?? []).filter((id) => members.includes(id)))];
  order.push(...members.filter((id) => !order.includes(id)));
  const role = series.matches[matchIndex].attackSide === side ? "attack" : "defend";
  const pool = Object.keys(CFG.commanderSkills[role]);
  const skills = Object.fromEntries(
    order.map((id) => {
      const selected = [...new Set((draft.skills?.[id] ?? []).filter((key) => pool.includes(key)))];
      for (const key of pool) {
        if (selected.length >= CFG.maxCommanderSkillsPerMember) break;
        if (!selected.includes(key)) selected.push(key);
      }
      return [id, selected.slice(0, CFG.maxCommanderSkillsPerMember)];
    }),
  );
  return { order, skills };
}

export function playedSnowRound(round, residentId) {
  return Boolean(
    round.winner &&
      [round.attackMember, round.defendMember].includes(residentId) &&
      !round.substitutes?.includes(residentId),
  );
}

export function snowWaitBoundaries(state, series, loadBattle) {
  const boundaries = [];
  const current = series?.matches.find((match) => !match.winner);
  if (current) boundaries.push(state.matchStartsAt[current.index]);
  if (current && !current.locked)
    boundaries.push(
      state.lineupDeadlines?.[current.index] ??
        state.matchStartsAt[current.index] + SNOW_WAIT_MS.lineup,
    );
  for (const turn of Object.values(state.chatTurns ?? {}))
    if (!turn.stopped && turn.deadlineAt) boundaries.push(turn.deadlineAt);
  for (const round of current?.rounds ?? []) {
    if (round.winner || !Object.hasOwn(series.startedRounds, round.battleId)) continue;
    const battle = loadBattle(round.battleId);
    if (battle && !battle.runtime.started) boundaries.push(battle.runtime.readyDeadlineAt);
  }
  return boundaries.filter(Number.isFinite);
}
