import type { SnowPixelBattle, SnowPixelEvent } from "@doorbell/protocol";

type Role = "attack" | "defend";
type RawUnit = { moveSeconds?: number; sprintUntilTick?: number; sprintMult?: number };
type PublicUnit = { id: string; typeKey: string; side: Role; lane: number; pos: number;
  hp: number; maxHp: number; shieldAmount: number; blockedBy: string | null; blocking: string[]; systemWave?: boolean };
export type PixelEngineView = {
  tick: number; status: SnowPixelBattle["status"]; coreHp: number;
  visibleUnits: PublicUnit[];
  effects: { id: string | number; kind: string; side: Role; lane: number; value?: number; untilTick: number }[];
};
export type PixelRawBattle = { battleId: string; tick: number; units: Record<string, RawUnit>;
  runtime?: { started?: boolean };
  lastVisualFrame?: { tick: number; events: SnowPixelEvent[] } };
type Definitions = { coreMaxHp: number; groundSlots: readonly number[]; highSlots: readonly number[];
  attackerUnits: Record<string, { name: string }>; defenderUnits: Record<string, { name: string; ground: boolean }> };

/** Reads an already-authoritative state. Visibility is owned by the original engine, not this renderer. */
export function projectSnowPixelBattle(
  battle: PixelRawBattle,
  viewForSide: (state: PixelRawBattle, side: "defend") => PixelEngineView,
  definitions: Definitions,
): SnowPixelBattle {
  const view = viewForSide(battle, "defend");
  const started = battle.runtime?.started === true;
  return {
    id: battle.battleId, tick: view.tick, status: view.status, started,
    coreHp: view.coreHp, coreMaxHp: definitions.coreMaxHp,
    groundSlots: [...definitions.groundSlots], highSlots: [...definitions.highSlots],
    units: view.visibleUnits.map((unit) => {
      const raw = battle.units[unit.id];
      if (!raw) throw new Error("pixel_unit_not_in_authority");
      let multiplier = 1;
      for (const effect of view.effects) if (effect.kind === "speed" && effect.side === "attack" && effect.lane === unit.lane && effect.untilTick >= view.tick)
        multiplier = Math.max(multiplier, effect.value ?? 1);
      if ((raw.sprintUntilTick ?? 0) >= view.tick && (raw.sprintUntilTick ?? 0) > 0)
        multiplier = Math.max(multiplier, raw.sprintMult ?? 1);
      const moving = started && view.status === "running" && unit.side === "attack" && !unit.blockedBy;
      return {
        id: unit.id, type: unit.systemWave ? "system_inf" : unit.typeKey,
        name: unit.systemWave ? "系统小兵" : (unit.side === "attack" ? definitions.attackerUnits : definitions.defenderUnits)[unit.typeKey]!.name,
        role: unit.side, ground: unit.side === "attack" || definitions.defenderUnits[unit.typeKey]!.ground,
        lane: unit.lane, position: unit.pos, hp: unit.hp, maxHp: unit.maxHp,
        shield: unit.shieldAmount, blockedBy: unit.blockedBy, blocking: [...unit.blocking],
        motion: { moving: Boolean(moving && raw.moveSeconds), secondsPerCell: raw.moveSeconds ?? null, speedMultiplier: multiplier },
      };
    }),
    effects: view.effects.filter(effect => effect.untilTick >= view.tick).map(effect => ({
      id: String(effect.id), kind: effect.kind, role: effect.side, lane: effect.lane, untilTick: effect.untilTick,
    })),
    // These are engine-captured public observations at the event's own tick, not raw command logs.
    events: battle.lastVisualFrame?.tick === view.tick ? structuredClone(battle.lastVisualFrame.events) : [],
  };
}
