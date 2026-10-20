import { SNOW_WAIT_MS } from "./snow-war-waits.mjs";

// Activate only when this match becomes actionable. Existing deadlines never
// move on a read/restart. A delayed previous match cannot consume the next
// team's discussion before that team could use it.
export function activateSnowMatch(state, series, now) {
  const match = series.matches.find((entry) => !entry.winner);
  if (!match) return;
  state.activatedMatches ??= {};
  if (Object.hasOwn(state.activatedMatches, match.index)) return;
  const counts = Object.fromEntries(
    ["A", "B"].map((side) => [
      side,
      series.teams[side].members.filter((member) => !member.isNpc).length,
    ]),
  );
  const discussionMs = state.chatEnabled ? Math.max(counts.A, counts.B) * 120_000 : 0;
  const start = Math.max(state.matchStartsAt[match.index], now + discussionMs);
  state.matchStartsAt[match.index] = start;
  state.lineupDeadlines ??= [];
  state.lineupDeadlines[match.index] = start + SNOW_WAIT_MS.lineup;
  state.chatWindows ??= {};
  for (const side of ["A", "B"]) {
    state.chatWindows[side] ??= [];
    for (const [index, plannedStart] of state.matchStartsAt.entries())
      state.chatWindows[side][index] ??= {
        matchIndex: index,
        memberCount: counts[side],
        opensAt: plannedStart - counts[side] * 120_000,
        closesAt: plannedStart,
      };
    state.chatWindows[side][match.index] = {
      matchIndex: match.index,
      memberCount: counts[side],
      opensAt: start - counts[side] * 120_000,
      closesAt: start,
    };
  }
  state.activatedMatches[match.index] = { activatedAt: now, startsAt: start };
}
