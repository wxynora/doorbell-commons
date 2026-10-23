import { SNOW_WAR_CONFIG as CFG } from "./snow-war-config.mjs";

// Deterministic NPC decisions use exactly a participant's public view, never the battle object.
export function snowWarNpcPolicy({ view, role }) {
  const actions = [];
  const ownUnits = view.visibleUnits.filter((unit) => unit.side === role);
  const opponents = view.visibleUnits.filter((unit) => unit.side !== role);
  const lanes = Array.from({ length: CFG.laneCount }, (_, index) => index + 1);
  const definition = (unit) => {
    const base = (unit.side === "attack" ? CFG.attackerUnits : CFG.defenderUnits)[unit.typeKey];
    return unit.systemWave
      ? { ...base, hp: unit.maxHp, attack: unit.attack, blockedAttack: unit.attack,
          attackInterval: unit.attackInterval, moveSeconds: unit.moveSeconds,
          breakthrough: unit.breakthrough }
      : base;
  };
  const inLane = (units, lane) => units.filter((unit) => unit.lane === lane);
  const pressure = (lane) =>
    inLane(opponents, lane).reduce(
      (sum, unit) => sum + (definition(unit).breakthrough ?? 1) * (1 + unit.pos)
        + unit.hp / 500,
      0,
    );
  let budget = view.ownCost;
  if (role === "attack") {
    const resistance = (lane) =>
      inLane(opponents, lane).reduce(
        (sum, unit) => sum + (definition(unit).ground
          ? (unit.hp + unit.shieldAmount) / 500 + definition(unit).block
          : (definition(unit).attack ?? definition(unit).heal ?? 0)
            / definition(unit).attackInterval / 20),
        0,
      );
    // Reinforce a viable push, but a crowded, well-defended lane is not an order to stay there.
    const support = (lane) => inLane(ownUnits, lane)
      .filter((unit) => unit.pos <= Math.max(0, ...inLane(opponents, lane).map((enemy) => enemy.pos)))
      .reduce((sum, unit) => sum + unit.hp / unit.maxHp + Number(unit.systemWave === true), 0);
    const routeScore = (lane) => resistance(lane) - Math.min(6, support(lane)) * 0.7;
    const lane = lanes.toSorted(
      (a, b) => routeScore(a) - routeScore(b) || support(b) - support(a) || a - b,
    )[0];
    const theirs = inLane(opponents, lane), ours = inLane(ownUnits, lane);
    const blockers = theirs.filter((unit) => definition(unit).ground);
    const rangedThreat = theirs.some((unit) => definition(unit).range && definition(unit).attack);
    const lastEnemyCell = Math.max(0, ...theirs.map((unit) => unit.pos));
    const fighting = ours.filter((unit) => unit.pos <= lastEnemyCell || !theirs.length);
    const count = (type) => fighting.filter((unit) => unit.typeKey === type && unit.hp > unit.maxHp / 4).length;
    const reachesExit = (type) => CFG.attackerUnits[type].moveSeconds * (CFG.laneCells + 1) <= view.ticksLeft;
    const spawn = (type) => {
      const cost = CFG.attackerUnits[type].cost;
      if (budget < cost || !reachesExit(type)) return false;
      actions.push({ type: "spawn", unitType: type, lane });
      budget -= cost;
      return true;
    };
    const formation = [];
    // A breaker supplements the T; encountering a blocker must not remove the ranged-fire screen.
    if (!count("heavy_t") && (rangedThreat || fighting.length === 0)) formation.push("heavy_t");
    if (blockers.length && !count("hammer")) formation.push("hammer");
    if (!count("thrower") && (theirs.length || !fighting.length)) formation.push("thrower");
    const reachable = formation.filter(reachesExit);
    const formationCost = reachable.reduce((sum, type) => sum + CFG.attackerUnits[type].cost, 0);
    if (formationCost <= budget) {
      for (const type of reachable) spawn(type);
    } else if (reachable[0] === "heavy_t" && fighting.some((unit) => definition(unit).range)) {
      spawn("heavy_t"); // Exposed existing damage units need a screen before another complete group.
    }
    const missingHealth = fighting.reduce((sum, unit) => sum + unit.maxHp - unit.hp, 0);
    const healerNeeded = !count("march_medic") && fighting.length >= 2
      && missingHealth >= CFG.attackerUnits.march_medic.heal * 2;
    const savingForHealer = healerNeeded && !spawn("march_medic");
    if (!savingForHealer && (!reachable.length || formationCost <= view.ownCost)) {
      // Use uncovered routes and occupied blocking slots instead of waiting for an unneeded medic.
      const openBlocks = blockers.reduce((sum, unit) => sum + Math.max(0,
        definition(unit).block - unit.blocking.length), 0);
      const type = rangedThreat && openBlocks === 0 ? "scout" : "light_inf";
      while (spawn(type)) { /* Spend only through legal engine commands. */ }
    }
  } else {
    const occupied = new Set(ownUnits.map((unit) => `${unit.lane}:${unit.pos}`));
    const plannedHealers = [];
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
      if (CFG.defenderUnits[unitType].heal) plannedHealers.push({ lane, pos: cell, typeKey: unitType, side: "defend" });
      deployed++;
      return true;
    };
    const canSave = (cost, lane, cell) => {
      const wait = Math.max(0, cost - budget) * CFG.costRegenEveryTicks;
      return inLane(opponents, lane).every((unit) => {
        if (unit.blockedBy || unit.pos > cell) return true;
        const speed = Math.max(1,
          ...view.effects.filter((effect) => effect.kind === "speed" && effect.side === "attack"
            && effect.lane === lane).map((effect) => effect.value),
          ...(unit.activeEffects ?? []).filter((effect) => effect.kind === "sprint").map((effect) => effect.value));
        return (cell + 1 - unit.pos) * definition(unit).moveSeconds / speed > wait;
      });
    };
    const groundType = (lane, cell) => {
      const incoming = inLane(opponents, lane);
      const supported = inLane(ownUnits, lane).some((unit) => definition(unit).range
        && definition(unit).attack && unit.pos >= cell && unit.pos - cell <= definition(unit).range);
      return supported && (incoming.length > CFG.defenderUnits.shield_guard.block
        || incoming.filter((unit) => ["heavy_t", "hammer"].includes(unit.typeKey)).length >= 2)
        && canSave(CFG.defenderUnits.heavy_guard.cost, lane, cell) ? "heavy_guard" : "shield_guard";
    };
    const rangedType = (lane, cell) => {
      const enemies = inLane(opponents, lane);
      const hit = (type, enemy) => {
        const def = CFG.defenderUnits[type], target = definition(enemy);
        return def.damageType === "spell"
          ? def.attack * (1 - (target.spellResist ?? 0))
          : Math.max(1, def.attack - (target.armor ?? 0));
      };
      const score = (type) => {
        const def = CFG.defenderUnits[type];
        if (!enemies.length) return def.attack / def.attackInterval;
        // The T draws more shots; splash is valuable when its neighbours are also in the blast.
        const weight = (unit) => unit.typeKey === "heavy_t" ? (view.tankTargetWeight ?? 1) : 1;
        const totalWeight = enemies.reduce((sum, unit) => sum + weight(unit), 0);
        return enemies.reduce((sum, center) => {
          const targets = def.splash
            ? enemies.filter((unit) => Math.abs(unit.pos - center.pos) <= def.splash)
            : [center];
          return sum + weight(center) * targets.reduce((damage, unit) => damage + hit(type, unit), 0);
        }, 0) / totalWeight / def.attackInterval;
      };
      return Object.keys(CFG.defenderUnits)
        .filter((type) => CFG.defenderUnits[type].range && CFG.defenderUnits[type].attack)
        .sort((a, b) => score(b) - score(a) || CFG.defenderUnits[a].cost - CFG.defenderUnits[b].cost)
        .find((type) => CFG.defenderUnits[type].cost <= budget
          || canSave(CFG.defenderUnits[type].cost, lane, cell));
    };
    const healLane = (lane) => {
      const hurt = inLane(ownUnits, lane).filter((unit) => unit.hp < unit.maxHp);
      const missingHealth = hurt.reduce((sum, unit) => sum + unit.maxHp - unit.hp, 0);
      if (missingHealth < CFG.defenderUnits.medic.heal * 2
        && !hurt.some((unit) => unit.hp <= unit.maxHp / 2)) return false;
      const cell = CFG.highSlots.filter((cell) => !occupied.has(`${lane}:${cell}`))
        .map((cell) => ({ cell, need: hurt.filter((unit) => Math.abs(unit.pos - cell) <= CFG.defenderUnits.medic.healRadius
          && !inLane([...ownUnits, ...plannedHealers], lane).some((healer) => definition(healer).heal
            && Math.abs(healer.pos - unit.pos) <= definition(healer).healRadius))
          .reduce((sum, unit) => sum + unit.maxHp - unit.hp, 0) }))
        .sort((a, b) => b.need - a.need || a.cell - b.cell)[0];
      return cell?.need > 0 && budget >= CFG.defenderUnits.medic.cost
        ? deploy("medic", lane, cell.cell) : false;
    };
    for (const lane of order) {
      if (inLane(ownUnits, lane).some((unit) => definition(unit).ground
        && unit.hp <= unit.maxHp / 2 && (unit.blocking.length || !opponents.length))) healLane(lane);
    }
    for (const lane of order) {
      const ground = groundCell(lane),
        ranged = rangedCell(lane);
      // Complete a blocking + damage pair before buying another empty lane's blocker.
      if (!deploy(groundType(lane, ground), lane, ground)) break;
      if (!occupied.has(`${lane}:${ranged}`) && ranged !== undefined) {
        const type = rangedType(lane, ranged);
        if (!type || !deploy(type, lane, ranged)) break;
      }
      healLane(lane);
    }
    // Extra layers only follow an established fire line, never consume its reserved budget.
    if (!deployed && order.every((lane) => occupied.has(`${lane}:${rangedCell(lane)}`))) {
      for (const lane of order) {
        if (!inLane(opponents, lane).length) continue;
        for (const cell of CFG.groundSlots.filter((cell) => cell > middle))
          if (!deploy(groundType(lane, cell), lane, cell)) break;
        for (const cell of CFG.highSlots.filter((cell) => cell > middle)) {
          const type = rangedType(lane, cell);
          if (!type || !deploy(type, lane, cell)) break;
        }
      }
    }
  }
  const moving = (lane) => inLane(ownUnits, lane).filter((unit) => !unit.blockedBy);
  const engaged = (unit) => {
    const def = definition(unit);
    return (
      unit.blockedBy ||
      unit.blocking?.length ||
      (role === "attack" && inLane(opponents, unit.lane).some((enemy) => {
        const attacker = definition(enemy);
        return attacker.range && attacker.attack > 0
          && enemy.pos >= unit.pos && enemy.pos - unit.pos <= attacker.range;
      })) ||
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
    if (skill === "smoke") {
      if (view.effects?.some((effect) => effect.kind === "reveal" && effect.lane === lane)) return 0;
      return moving(lane).filter((unit) =>
        theirs.some(
          (enemy) =>
            definition(enemy).range &&
            definition(enemy).attack > 0 &&
            enemy.pos >= unit.pos &&
            enemy.pos - unit.pos <= definition(enemy).range,
        ),
      ).length;
    }
    if (skill === "assault") {
      const column = moving(lane);
      return column.length >= 2 || (view.ticksLeft < CFG.commanderSkills.attack.assault.cooldownTicks
        && column.length) ? column.length : 0;
    }
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
