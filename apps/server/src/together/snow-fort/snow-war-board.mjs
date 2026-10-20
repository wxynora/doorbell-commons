// One public projection for the newspaper. No chat, draft, live unit or wallet fields.
export function projectSnowBoard({
  state,
  series,
  residentId,
  now,
  identityForResident,
  loadBattle,
}) {
  const person = (id, npc = false) => {
    const identity = npc ? undefined : identityForResident(id);
    return {
      name: npc ? id : (identity?.residentName ?? null),
      doorplate: identity?.farmDoorplate ?? null,
      npc,
    };
  };
  const registrations = Object.keys(state.registrations).filter((id) => identityForResident(id));
  const npcIds = new Set(
    series
      ? Object.values(series.teams).flatMap((team) =>
          team.members.filter((member) => member.isNpc).map((member) => member.id),
        )
      : [],
  );
  const matches = (series?.matches ?? []).map((match) => {
    const rounds = match.rounds
      .filter((round) => round.winner)
      .map((round) => {
        const battle = round.terminal ? null : loadBattle(round.battleId);
        if (!round.terminal && (!battle || battle.status === "running"))
          throw Error("terminal_battle_missing");
        return {
          index: round.index,
          attack: person(round.attackMember, npcIds.has(round.attackMember)),
          defend: person(round.defendMember, npcIds.has(round.defendMember)),
          winner: round.winner,
          reason: round.terminal?.reason ?? battle.endReason,
          ticks: round.terminal?.ticks ?? battle.tick,
        };
      });
    return {
      index: match.index,
      startsAt: state.matchStartsAt[match.index],
      attackSide: match.attackSide,
      winner: match.winner,
      score: {
        A: rounds.filter((round) => round.winner === "A").length,
        B: rounds.filter((round) => round.winner === "B").length,
      },
      rounds,
    };
  });
  return {
    activityId: state.activityId,
    phase:
      state.retired || state.registrationEmpty
        ? "ended"
        : now < state.opensAt
          ? "scheduled"
          : now < state.closesAt
            ? "registration"
            : !series
              ? "awaiting_teams"
              : series.status === "complete"
                ? "complete"
                : "competition",
    opensAt: state.opensAt,
    closesAt: state.closesAt,
    matchStartsAt: [...state.matchStartsAt],
    registeredCount: registrations.length,
    myRegistration: registrations.includes(residentId),
    registrationStatus: registrations.includes(residentId)
      ? "registered"
      : state.registrationPayments?.[residentId]?.status === "pending"
        ? "pending"
        : "not_registered",
    registrations: registrations.map((id) => person(id)),
    matches,
    champion: series?.seriesWinner ?? null,
    entry: { op: "farm.together.view", args: {} },
  };
}
