import { SNOW_WAR_CONFIG as CFG } from "./snow-war-config.mjs";

// Deterministic NPC decisions use exactly a participant's public view, never the battle object.
export function snowWarNpcPolicy({ view, role }) {
  const actions = [];
  const ownUnits = view.visibleUnits.filter((unit) => unit.side === role);
  const opponents = view.visibleUnits.filter((unit) => unit.side !== role);
  const lanes = Array.from({ length: CFG.laneCount }, (_, index) => index + 1);
  const lane = lanes.sort(
    (a, b) =>
      opponents.filter((unit) => unit.lane === a).length -
        opponents.filter((unit) => unit.lane === b).length || a - b,
  )[0];
  let budget = view.ownCost;
  if (role === "attack") {
    const wave = ["heavy_t", "thrower", "march_medic"];
    const cost = wave.reduce((sum, key) => sum + CFG.attackerUnits[key].cost, 0);
    if (budget >= cost) {
      for (const unitType of wave) actions.push({ type: "spawn", unitType, lane });
      budget -= cost;
    } else if (ownUnits.length) {
      while (budget >= CFG.attackerUnits.light_inf.cost) {
        actions.push({ type: "spawn", unitType: "light_inf", lane });
        budget -= CFG.attackerUnits.light_inf.cost;
      }
    }
  } else {
    const occupied = new Set(ownUnits.map((unit) => `${unit.lane}:${unit.pos}`));
    const plan = [
      ...lanes.map((lane) => ({ unitType: "shield_guard", lane, cell: CFG.groundSlots[0] })),
      ...lanes.map((lane) => ({ unitType: "artillery", lane, cell: CFG.highSlots[0] })),
      ...lanes.map((lane) => ({ unitType: "medic", lane, cell: CFG.highSlots[1] })),
    ];
    for (const slot of plan) {
      const key = `${slot.lane}:${slot.cell}`,
        price = CFG.defenderUnits[slot.unitType].cost;
      if (!occupied.has(key) && budget >= price) {
        actions.push({ type: "deploy", ...slot });
        occupied.add(key);
        budget -= price;
      }
    }
  }
  if (ownUnits.length) {
    for (const entry of view.ownCommanderSkills.filter((skill) => skill.readyInTicks === 0))
      actions.push({ type: "commander_skill", skill: entry.skill, lane: ownUnits[0].lane });
  }
  for (const unit of ownUnits) {
    if (unit.unitSkillReadyInTicks === 0 && (unit.typeKey === "scout" || unit.blockedBy))
      actions.push({ type: "unit_skill", unitId: unit.id });
  }
  return actions;
}
