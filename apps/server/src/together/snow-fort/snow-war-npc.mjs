import { SNOW_WAR_CONFIG as CFG } from "./snow-war-config.mjs";

// Deterministic NPC decisions use exactly a participant's public view, never the battle object.
export function snowWarNpcPolicy({ view, role }) {
  const actions = [];
  const ownUnits = view.visibleUnits.filter((unit) => unit.side === role);
  const opponents = view.visibleUnits.filter((unit) => unit.side !== role);
  const lanes = Array.from({ length: CFG.laneCount }, (_, index) => index + 1);
  const definition = (unit) =>
    (unit.side === "attack" ? CFG.attackerUnits : CFG.defenderUnits)[unit.typeKey];
  const inLane = (units, lane) => units.filter((unit) => unit.lane === lane);
  const pressure = (lane) =>
    inLane(opponents, lane).reduce(
      (sum, unit) => sum + (definition(unit).breakthrough ?? 1) * (1 + unit.pos),
      0,
    );
  let budget = view.ownCost;
  if (role === "attack") {
    const army = (lane) => inLane(ownUnits, lane).length;
    const resistance = (lane) =>
      inLane(opponents, lane).reduce(
        (sum, unit) =>
          sum +
          unit.hp / definition(unit).hp +
          (definition(unit).attack ?? 0) / definition(unit).cost,
        0,
      );
    const lane = lanes.toSorted(
      (a, b) => army(b) - army(a) || resistance(a) - resistance(b) || a - b,
    )[0];
    const blockedRoute = inLane(opponents, lane).some((unit) => definition(unit).ground);
    const wave = [blockedRoute ? "hammer" : "heavy_t", "thrower", "march_medic"];
    const cost = wave.reduce((sum, key) => sum + CFG.attackerUnits[key].cost, 0);
    if (budget >= cost) {
      for (const unitType of wave) actions.push({ type: "spawn", unitType, lane });
      budget -= cost;
    } else if (wave.every((type) => inLane(ownUnits, lane).some((unit) => unit.typeKey === type))) {
      // Keep a complete frontline, damage and support group; save for replacements otherwise.
      while (budget >= CFG.attackerUnits.light_inf.cost) {
        actions.push({ type: "spawn", unitType: "light_inf", lane });
        budget -= CFG.attackerUnits.light_inf.cost;
      }
    }
  } else {
    const occupied = new Set(ownUnits.map((unit) => `${unit.lane}:${unit.pos}`));
    let deployed = 0;
    const middle = CFG.groundSlots[Math.floor(CFG.groundSlots.length / 2)];
    const front = (lane) => Math.max(middle, ...inLane(opponents, lane).map((unit) => unit.pos));
    const groundCell = (lane) => CFG.groundSlots.find((cell) => cell >= front(lane));
    const rangedCell = (lane) =>
      CFG.highSlots.find((cell) => cell >= (groundCell(lane) ?? front(lane)));
    const incomplete = (lane) =>
      Number(occupied.has(`${lane}:${groundCell(lane)}`)) !==
      Number(occupied.has(`${lane}:${rangedCell(lane)}`));
    const order = lanes.toSorted(
      (a, b) =>
        pressure(b) - pressure(a) ||
        Number(incomplete(b)) - Number(incomplete(a)) ||
        inLane(ownUnits, a).length - inLane(ownUnits, b).length ||
        a - b,
    );
    const deploy = (unitType, lane, cell) => {
      if (cell === undefined || occupied.has(`${lane}:${cell}`)) return true;
      const price = CFG.defenderUnits[unitType].cost;
      if (budget < price) return false;
      actions.push({ type: "deploy", unitType, lane, cell });
      budget -= price;
      occupied.add(`${lane}:${cell}`);
      deployed++;
      return true;
    };
    for (const lane of order) {
      const ground = groundCell(lane),
        ranged = rangedCell(lane);
      // Complete a blocking + damage pair before buying another empty lane's blocker.
      if (!deploy("shield_guard", lane, ground)) break;
      if (!deploy("crossbow", lane, ranged)) break;
      const hurt = inLane(ownUnits, lane).filter((unit) => unit.hp < unit.maxHp);
      const healingCell = CFG.highSlots.find(
        (cell) =>
          cell < middle &&
          !occupied.has(`${lane}:${cell}`) &&
          hurt.some((unit) => Math.abs(unit.pos - cell) <= CFG.defenderUnits.medic.healRadius),
      );
      if (hurt.length && !inLane(ownUnits, lane).some((unit) => definition(unit).heal)) {
        if (!deploy("medic", lane, healingCell)) break;
      }
    }
    // Extra layers only follow an established fire line, never consume its reserved budget.
    if (!deployed && order.every((lane) => occupied.has(`${lane}:${rangedCell(lane)}`))) {
      for (const lane of order) {
        for (const cell of CFG.groundSlots.filter((cell) => cell > middle))
          if (!deploy("shield_guard", lane, cell)) break;
        for (const cell of CFG.highSlots.filter((cell) => cell > middle))
          if (!deploy("crossbow", lane, cell)) break;
      }
    }
  }
  const moving = (lane) => inLane(ownUnits, lane).filter((unit) => !unit.blockedBy);
  const engaged = (unit) => {
    const def = definition(unit);
    return (
      unit.blockedBy ||
      unit.blocking?.length ||
      inLane(opponents, unit.lane).some(
        (enemy) =>
          def.range &&
          Math.abs(enemy.pos - unit.pos) <= def.range &&
          (role === "attack" || enemy.pos <= unit.pos),
      )
    );
  };
  const skillScore = (skill, lane) => {
    const ours = inLane(ownUnits, lane),
      theirs = inLane(opponents, lane);
    const def = CFG.commanderSkills[role][skill];
    if (skill === "emergency_heal") {
      const healed = ours.reduce((sum, unit) => sum + Math.min(def.heal, unit.maxHp - unit.hp), 0);
      return healed >= def.heal || ours.some((unit) => unit.hp <= unit.maxHp / 2) ? healed : 0;
    }
    if (skill === "guard_shield" || skill === "march_shield")
      return ours
        .filter((unit) => (!def.groundOnly || definition(unit).ground) && engaged(unit))
        .reduce((sum, unit) => sum + Math.max(0, def.shield - unit.shieldAmount), 0);
    if (skill === "fire_focus")
      return ours
        .filter((unit) => definition(unit).attack > 0 && engaged(unit))
        .reduce((sum, unit) => sum + definition(unit).attack, 0);
    if (skill === "searchlight")
      return ours.some((unit) => definition(unit).range) &&
        (theirs.some((unit) => definition(unit).stealth) ||
          view.effects?.some((effect) => effect.kind === "smoke" && effect.lane === lane))
        ? pressure(lane) + 1
        : 0;
    if (skill === "break_armor")
      return ours.some(engaged)
        ? theirs
            .filter((unit) => definition(unit).ground)
            .reduce((sum, unit) => sum + definition(unit).armor, 0)
        : 0;
    if (skill === "smoke")
      return moving(lane).filter((unit) =>
        theirs.some(
          (enemy) =>
            definition(enemy).range &&
            definition(enemy).attack > 0 &&
            enemy.pos >= unit.pos &&
            enemy.pos - unit.pos <= definition(enemy).range,
        ),
      ).length;
    if (skill === "assault") return moving(lane).length;
    return 0;
  };
  for (const entry of view.ownCommanderSkills.filter((skill) => skill.readyInTicks === 0)) {
    const target = lanes
      .map((lane) => ({ lane, score: skillScore(entry.skill, lane) }))
      .sort((a, b) => b.score - a.score || a.lane - b.lane)[0];
    if (target.score > 0)
      actions.push({ type: "commander_skill", skill: entry.skill, lane: target.lane });
  }
  for (const unit of ownUnits) {
    if (
      unit.unitSkillReadyInTicks === 0 &&
      (unit.typeKey === "scout" ? !unit.blockedBy : unit.blockedBy)
    )
      actions.push({ type: "unit_skill", unitId: unit.id });
  }
  return actions;
}
