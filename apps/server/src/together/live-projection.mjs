import { SNOW_WAR_CONFIG as CFG } from "./snow-fort/snow-war-config.mjs";
import { viewForSide } from "./snow-fort/snow-war-engine.mjs";

// Public spectator projection. No authority preparation, clock pump or writes.
export function projectSnowLive({ state, series, loadBattle, nameOf, now }) {
  if (!state) return null;
  const people = new Map(
    Object.values(series?.teams ?? {}).flatMap((team) => team.members.map((m) => [m.id, m])),
  );
  const person = (id) => ({
    name: people.get(id)?.isNpc ? id : nameOf(id),
    npc: people.get(id)?.isNpc === true,
  });
  const matches = (series?.matches ?? []).map((match) => ({
    index: match.index,
    startsAt: state.matchStartsAt[match.index],
    attackSide: match.attackSide,
    score: {
      A: match.rounds.filter((r) => r.winner === "A").length,
      B: match.rounds.filter((r) => r.winner === "B").length,
    },
    winner: match.winner,
    rounds: match.locked
      ? match.rounds.map((r) => ({
          index: r.index,
          attack: person(r.attackMember),
          defend: person(r.defendMember),
          winner: r.winner,
        }))
      : [],
  }));
  const match = series?.matches.find((m) => !m.winner);
  const round = match?.locked ? match.rounds.find((r) => !r.winner) : undefined;
  const battle = round ? loadBattle(round.battleId) : undefined;
  const view = battle ? viewForSide(battle, "defend") : undefined;
  return {
    activityId: state.activityId,
    phase: state.retired
      ? "ended"
      : now < state.opensAt
        ? "scheduled"
        : now < state.closesAt
          ? "registration"
          : series?.status === "complete"
            ? "complete"
            : "competition",
    matches,
    champion: series?.seriesWinner ?? null,
    battle: view
      ? {
          id: battle.battleId,
          matchIndex: match.index,
          roundIndex: round.index,
          attack: person(round.attackMember),
          defend: person(round.defendMember),
          attackSide: match.attackSide,
          started: battle.runtime?.started === true,
          tick: view.tick,
          ticksLeft: view.ticksLeft,
          coreHp: view.coreHp,
          coreMaxHp: CFG.coreMaxHp,
          status: view.status,
          groundSlots: [...CFG.groundSlots],
          highSlots: [...CFG.highSlots],
          units: view.visibleUnits.map((u) => ({
            id: u.id,
            type: u.typeKey,
            name: u.systemWave
              ? "系统小兵"
              : (u.side === "attack" ? CFG.attackerUnits : CFG.defenderUnits)[u.typeKey].name,
            role: u.side,
            ground: u.side === "attack" || CFG.defenderUnits[u.typeKey].ground,
            lane: u.lane,
            position: u.pos,
            hp: u.hp,
            maxHp: u.maxHp,
            shield: u.shieldAmount,
            blockedBy: u.blockedBy,
            blocking: [...u.blocking],
          })),
        }
      : null,
  };
}
