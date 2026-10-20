// 雪堡战战斗引擎（候选）。
// 实现 docs/snow-fort-war-proposal-20261012.md（2026-10-14 审阅稿）第六、七、八、十、十一节的逐局攻防：
// 纯函数风格，状态是可 JSON 序列化的普通对象，无随机数；命令幂等；tick 按审阅稿 10.3 的固定阶段推进。
// 组赛、报名、频道、日报与视图产品层不在本文件。

import { SNOW_WAR_CONFIG as CFG } from "./snow-war-config.mjs";

const EXIT_POS = CFG.laneCells + 1; // 越过第 12 格（pos >= 13）抵达终点

function unitAt(state, id) {
  return state.units[id] ?? null;
}

function unitDef(side, typeKey) {
  // 显式自有属性检查：拒绝 "constructor" 等沿原型链命中的键，防止费用被污染成 NaN。
  const table = side === "defend" ? CFG.defenderUnits : CFG.attackerUnits;
  return Object.hasOwn(table, typeKey) ? table[typeKey] : null;
}

function aliveUnits(state) {
  return Object.values(state.units).filter((u) => u.alive);
}

function laneEffect(state, kind, side, lane, tick) {
  return (
    state.effects.find(
      (e) => e.kind === kind && e.side === side && e.lane === lane && e.untilTick >= tick,
    ) ?? null
  );
}

function isRevealed(state, lane, tick) {
  return laneEffect(state, "reveal", "defend", lane, tick) !== null;
}

function isSmoked(state, lane, tick) {
  return laneEffect(state, "smoke", "attack", lane, tick) !== null;
}

function currentSpeedMult(state, unit, tick) {
  // §8.4 同种临时增益取较强、不累乘：突击号令与疾行都是加速，取最大值。
  let mult = 1;
  const assault = laneEffect(state, "speed", "attack", unit.lane, tick);
  if (assault) mult = Math.max(mult, assault.value);
  if (unit.sprintUntilTick && unit.sprintUntilTick >= tick) mult = Math.max(mult, unit.sprintMult);
  return mult;
}

function currentInterval(_state, unit, tick) {
  // 火力集中（§8.3「指定一路当前己方攻击单位」）：只惠及施放时已在场的单位，快照在单位字段上。
  let interval = unit.attackInterval;
  if (unit.fireFocusUntilTick && unit.fireFocusUntilTick >= tick) {
    interval = interval * CFG.commanderSkills.defend.fire_focus.intervalMult;
  }
  return interval;
}

function effectiveArmor(state, unit, tick) {
  let armor = unit.armor;
  if (unit.side === "defend" && unit.ground) {
    const pierce = laneEffect(state, "pierce", "attack", unit.lane, tick);
    if (pierce) armor = armor * pierce.value;
  }
  return armor;
}

function unitCell(unit) {
  return unit.ground && unit.side === "defend" ? unit.pos : Math.floor(unit.pos);
}

function applyShield(unit, amount, untilTick) {
  // §8.4 同种护盾不相加：新量与当前剩余量取较大值；新量不低于剩余量时用本次持续时间刷新，否则保留原量与原到期时点。
  if (!unit.shield || unit.shield.amount <= 0 || amount >= unit.shield.amount) {
    unit.shield = { amount, untilTick };
  }
}

function computeDamage(state, target, amount, damageType, tick) {
  // §6.4：物理 = 攻击力 − 护甲，最低 1；术式 = 攻击力 × (1 − 术式减伤) 向下取整，最低 1。
  let dmg;
  if (damageType === "physical") dmg = Math.max(1, amount - effectiveArmor(state, target, tick));
  else dmg = Math.max(1, Math.floor(amount * (1 - (target.spellResist ?? 0))));
  // 护盾先承受按防御计算后的实际伤害，剩余伤害再扣生命。
  if (target.shield && target.shield.untilTick >= tick && target.shield.amount > 0) {
    const absorbed = Math.min(target.shield.amount, dmg);
    target.shield.amount -= absorbed;
    dmg -= absorbed;
  }
  return dmg;
}

// —— 建局 ——

export function createBattle({
  battleId,
  roundId,
  attackSideId,
  defendSideId,
  participants,
  assignments,
}) {
  if (!battleId || !roundId) throw new Error("雪堡战对局必须携带 battleId 与 roundId");
  if (!Array.isArray(participants?.attack) || !Array.isArray(participants?.defend)) {
    throw new Error("participants 必须给出攻守双方出场成员");
  }
  for (const side of ["attack", "defend"]) {
    const pool = CFG.commanderSkills[side];
    const given = assignments?.[side] ?? {};
    for (const member of participants[side]) {
      const skills = given[member];
      if (
        !Array.isArray(skills) ||
        skills.length !== CFG.maxCommanderSkillsPerMember ||
        new Set(skills).size !== skills.length ||
        skills.some((s) => !Object.hasOwn(pool, s))
      ) {
        throw new Error(
          `成员 ${member} 的指挥技能配技必须是本方 ${CFG.maxCommanderSkillsPerMember} 个不同技能`,
        );
      }
    }
  }
  return {
    battleId,
    roundId,
    rulesVersion: CFG.rulesVersion,
    attackSideId,
    defendSideId,
    status: "running", // running | attack_win | defend_win
    endReason: null,
    tick: 0,
    coreHp: CFG.coreMaxHp,
    cost: { attack: CFG.initialCost, defend: CFG.initialCost },
    costAccum: 0,
    participants: { attack: [...participants.attack], defend: [...participants.defend] },
    assignments: { attack: { ...assignments.attack }, defend: { ...assignments.defend } },
    units: {}, // id -> unit
    nextUnitId: 1,
    effects: [], // {id, kind, side, lane, value, untilTick}
    nextEffectId: 1,
    cooldowns: {}, // "side:member:skill" -> readyTick
    commandLog: [], // 已处理的命令回执（供审计，只增不减）
    // 无原型索引：requestId 是外部输入，"constructor"/"__proto__" 不得借原型链伪造回执或污染状态。
    processedCommands: Object.create(null), // requestId -> 原回执，重放据此返回同一结果
  };
}

export function restoreBattle(state) {
  if (!state || typeof state !== "object" || typeof state.tick !== "number" || !state.units) {
    throw new Error("无法从给定状态恢复雪堡战对局");
  }
  if (state.rulesVersion !== CFG.rulesVersion) throw new Error("snow_war_rules_version_mismatch");
  // JSON 恢复后把回执索引重新落到无原型对象上，覆盖 "__proto__" 等键的读写安全。
  if (state.processedCommands && Object.getPrototypeOf(state.processedCommands) !== null) {
    state.processedCommands = Object.assign(Object.create(null), state.processedCommands);
  }
  return state; // 状态本身即权威 JSON，恢复即原样接管
}

// —— 命令 ——
// 命令在两次 tick 之间同步处理（等价于下一 tick 的指令阶段）；回执长期保存供幂等重放。

export function submitCommand(state, command) {
  // 对局归属先于幂等检查：带其他对局编号的旧请求必须被拒绝，不得凭 requestId 取回历史回执。
  if (command.battleId !== state.battleId || command.roundId !== state.roundId) {
    return {
      requestId: command.requestId ?? null,
      ok: false,
      error: "wrong_battle",
      message: "命令不属于当前对局，已拒绝",
    };
  }
  if (command.requestId && Object.hasOwn(state.processedCommands, command.requestId)) {
    return { ...state.processedCommands[command.requestId], replay: true };
  }
  const receipt = { requestId: command.requestId ?? null, ok: false, error: null, facts: null };
  const finish = (patch) => {
    Object.assign(receipt, patch);
    if (!receipt.error) receipt.ok = true;
    if (receipt.requestId) {
      // 回执无上限永久保存：一局最多 600 tick 的命令量级很小，截断会破坏幂等重放。
      state.processedCommands[receipt.requestId] = receipt;
      state.commandLog.push(receipt);
    }
    return receipt;
  };

  if (state.status !== "running") {
    return finish({ error: "battle_over", message: "对局已结束，不再接收命令" });
  }
  const side = command.side;
  if (side !== "attack" && side !== "defend")
    return finish({ error: "bad_side", message: "命令必须属于攻方或守方" });

  try {
    switch (command.type) {
      case "deploy":
        return finish(handleDeploy(state, side, command));
      case "spawn":
        return finish(handleSpawn(state, side, command));
      case "retreat":
        return finish(handleRetreat(state, side, command));
      case "unit_skill":
        return finish(handleUnitSkill(state, side, command));
      case "commander_skill":
        return finish(handleCommanderSkill(state, side, command));
      default:
        return finish({ error: "unknown_command", message: "未知命令类型" });
    }
  } catch (err) {
    return finish({ error: "rejected", message: String(err.message ?? err) });
  }
}

function newUnitId(state) {
  return `u${state.nextUnitId++}`;
}

function newEffect(state, entry) {
  const effect = { id: state.nextEffectId++, ...entry };
  state.effects.push(effect);
  return effect;
}

function requireMember(state, side, member) {
  if (!member || !state.participants[side].includes(member)) {
    throw new Error("成员不属于本方出场名单");
  }
  return member;
}

function handleDeploy(state, side, command) {
  if (side !== "defend") throw new Error("只有守方可以部署");
  const def = unitDef(side, command.unitType);
  if (!def) throw new Error("未知守方单位类型");
  const lane = command.lane;
  if (!Number.isInteger(lane) || lane < 1 || lane > CFG.laneCount) throw new Error("非法路线");
  const cell = command.cell;
  const isGroundSlot = def.ground && CFG.groundSlots.includes(cell);
  const isHighSlot = !def.ground && CFG.highSlots.includes(cell);
  if (!isGroundSlot && !isHighSlot) throw new Error("该位置不是此单位的合法部署位");
  if (aliveUnits(state).some((u) => u.side === "defend" && u.lane === lane && u.pos === cell)) {
    throw new Error("部署位已被占用");
  }
  if (state.cost.defend < def.cost) throw new Error("战备费用不足");
  state.cost.defend -= def.cost;
  const id = newUnitId(state);
  state.units[id] = {
    id,
    side: "defend",
    typeKey: command.unitType,
    lane,
    pos: cell,
    ground: def.ground,
    hp: def.hp,
    maxHp: def.hp,
    armor: def.armor,
    spellResist: def.spellResist ?? 0,
    attackInterval: def.attackInterval,
    attack: def.attack ?? 0,
    damageType: def.damageType ?? null,
    heal: def.heal ?? 0,
    healRadius: def.healRadius ?? 0,
    range: def.range ?? 0,
    splash: def.splash ?? 0,
    blockCapacity: def.block ?? 0,
    blocking: [],
    attackTimer: 0,
    alive: true,
  };
  const unit = state.units[id];
  // 部署时机：已在阻挡格内的攻方单位按到达顺序（稳定编号）被接住，直到容量满；已越过该格的不回头追拦。
  if (def.block) {
    const candidates = aliveUnits(state)
      .filter((u) => u.side === "attack" && !u.blockedBy && u.lane === lane && u.pos === cell)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const a of candidates) {
      if (unit.blocking.length >= unit.blockCapacity) break;
      a.blockedBy = id;
      unit.blocking.push(a.id);
    }
  }
  return { facts: { unitId: id, cost: def.cost, remainingCost: state.cost.defend } };
}

function handleSpawn(state, side, command) {
  if (side !== "attack") throw new Error("只有攻方可以出兵");
  const def = unitDef(side, command.unitType);
  if (!def) throw new Error("未知攻方单位类型");
  const lane = command.lane;
  if (!Number.isInteger(lane) || lane < 1 || lane > CFG.laneCount) throw new Error("非法路线");
  if (state.cost.attack < def.cost) throw new Error("战备费用不足");
  state.cost.attack -= def.cost;
  const id = newUnitId(state);
  state.units[id] = {
    id,
    side: "attack",
    typeKey: command.unitType,
    lane,
    pos: 1,
    moveProgress: 0,
    ground: true,
    hp: def.hp,
    maxHp: def.hp,
    armor: def.armor,
    spellResist: def.spellResist ?? 0,
    moveSeconds: def.moveSeconds,
    attackInterval: def.blockedAttackInterval ?? def.attackInterval,
    attack: def.blockedAttack ?? def.attack ?? 0,
    damageType: def.damageType ?? "physical",
    heal: def.heal ?? 0,
    healRadius: def.healRadius ?? 0,
    range: def.range ?? 0,
    splash: def.splash ?? 0,
    breakthrough: def.breakthrough,
    stealth: def.stealth ?? false,
    sprintUntilTick: 0,
    sprintMult: def.unitSkill?.speedMult ?? null,
    unitSkill: def.unitSkill ?? null,
    unitSkillReadyTick: 0,
    blockedBy: null,
    attackTimer: 0,
    alive: true,
  };
  return { facts: { unitId: id, cost: def.cost, remainingCost: state.cost.attack } };
}

function handleRetreat(state, side, command) {
  if (side !== "defend") throw new Error("只有守方可以撤退部署单位");
  const unit = unitAt(state, command.unitId);
  if (unit?.side !== "defend" || !unit.alive) throw new Error("单位不存在或已离场");
  const refund = Math.floor(
    (costOfType(unit) * CFG.retreatRefundNumerator) / CFG.retreatRefundDenominator,
  );
  removeUnit(state, unit);
  state.cost.defend += refund;
  return { facts: { unitId: unit.id, refund, remainingCost: state.cost.defend } };
}

function costOfType(unit) {
  return unitDef(unit.side, unit.typeKey)?.cost ?? 0;
}

function removeUnit(state, unit) {
  unit.alive = false;
  for (const attackerId of unit.blocking ?? []) {
    const attacker = unitAt(state, attackerId);
    if (attacker) attacker.blockedBy = null;
  }
  unit.blocking = [];
  // 反向清理：被移除单位自身若正被阻挡，从阻挡者的 blocking 名单中摘除，释放阻挡容量。
  if (unit.blockedBy) {
    const blocker = unitAt(state, unit.blockedBy);
    if (blocker) blocker.blocking = blocker.blocking.filter((id) => id !== unit.id);
    unit.blockedBy = null;
  }
  delete state.units[unit.id];
}

function handleUnitSkill(state, side, command) {
  const unit = unitAt(state, command.unitId);
  if (!unit || unit.side !== side || !unit.alive) throw new Error("单位不存在或不属于本方");
  const skill = unit.unitSkill;
  if (!skill) throw new Error("该单位没有主动技能");
  if (skill.kind === "silence") {
    if (!unit.blockedBy) throw new Error("破阵震击需要有单位正在阻挡自己");
    const blocker = unitAt(state, unit.blockedBy);
    if (!blocker?.alive) throw new Error("阻挡者已离场");
  }
  // 全部校验通过后才进入冷却：目标失效或请求被拒不消耗冷却。
  const key = `${unit.id}:skill`;
  if ((state.cooldowns[key] ?? 0) > state.tick) throw new Error("技能冷却中");
  state.cooldowns[key] = state.tick + skill.cooldownTicks;
  if (skill.kind === "sprint") {
    unit.sprintUntilTick = state.tick + skill.durationTicks;
    return {
      facts: {
        unitId: unit.id,
        effect: { speedMult: unit.sprintMult },
        targetUnitIds: [unit.id],
        untilTick: unit.sprintUntilTick,
      },
    };
  }
  if (skill.kind === "silence") {
    const blocker = unitAt(state, unit.blockedBy);
    blocker.silencedUntilTick = state.tick + skill.silenceTicks;
    return {
      facts: {
        unitId: unit.id,
        blockerId: blocker.id,
        targetUnitIds: [blocker.id],
        silencedUntilTick: blocker.silencedUntilTick,
      },
    };
  }
  throw new Error("未知单位技能");
}

function handleCommanderSkill(state, side, command) {
  const member = requireMember(state, side, command.member);
  const pool = CFG.commanderSkills[side];
  if (!Object.hasOwn(pool, command.skill)) throw new Error("未知指挥技能");
  const skill = pool[command.skill];
  const assigned = state.assignments[side][member] ?? [];
  if (!assigned.includes(command.skill)) throw new Error("该成员没有配置此指挥技能");
  const lane = command.lane;
  if (!Number.isInteger(lane) || lane < 1 || lane > CFG.laneCount) throw new Error("非法路线");
  // 校验全部通过后才进入冷却。
  const key = `${side}:${member}:${command.skill}`;
  if ((state.cooldowns[key] ?? 0) > state.tick) throw new Error("技能冷却中");
  state.cooldowns[key] = state.tick + skill.cooldownTicks;

  const t = state.tick;
  const facts = { member, skill: command.skill, lane };
  if (skill.instant) {
    // 应急救护：即时恢复，不产生持续效果条目；合法施放各自生效，不做去重。
    let healed = 0;
    facts.targetUnitIds = [];
    for (const u of aliveUnits(state)) {
      if (u.side !== side || u.lane !== lane) continue;
      facts.targetUnitIds.push(u.id);
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + skill.heal);
      healed += u.hp - before;
    }
    facts.healed = healed;
    return facts;
  }
  if (skill.shield) {
    facts.shields = [];
    for (const u of aliveUnits(state)) {
      if (u.side !== side || u.lane !== lane) continue;
      if (skill.groundOnly && !u.ground) continue;
      const before = u.shield?.untilTick >= t ? u.shield.amount : 0;
      applyShield(u, skill.shield, t + skill.durationTicks);
      facts.shields.push({
        unitId: u.id,
        added: Math.max(0, u.shield.amount - before),
        untilTick: u.shield.untilTick,
      });
    }
    facts.targetUnitIds = facts.shields.map((target) => target.unitId);
    return facts;
  }
  if (command.skill === "fire_focus") {
    // 「当前己方攻击单位」：快照到施放时在场的单位，之后部署的单位不受惠及。
    facts.targetUnitIds = [];
    facts.untilTick = t + skill.durationTicks;
    facts.effect = { intervalMult: skill.intervalMult };
    for (const u of aliveUnits(state)) {
      if (u.side !== side || u.lane !== lane || !(u.attack > 0)) continue;
      u.fireFocusUntilTick = t + skill.durationTicks;
      facts.targetUnitIds.push(u.id);
    }
    return facts;
  }
  // 持续型路径效果：同种取较强，替换/刷新规则见 applyLaneEffect。
  const kindMap = {
    break_armor: "pierce",
    assault: "speed",
    smoke: "smoke",
    searchlight: "reveal",
  };
  const kind = kindMap[command.skill];
  const value = skill.armorMult ?? skill.speedMult ?? 1;
  const applied = applyLaneEffect(state, kind, side, lane, value, t + skill.durationTicks);
  facts.untilTick = applied.untilTick;
  facts.effect = {
    ...(skill.armorMult === undefined ? {} : { armorMult: applied.value }),
    ...(skill.speedMult === undefined ? {} : { speedMult: applied.value }),
  };
  return facts;
}

function applyLaneEffect(state, kind, side, lane, value, untilTick) {
  const existing = state.effects.find(
    (e) => e.kind === kind && e.side === side && e.lane === lane && e.untilTick >= state.tick,
  );
  if (!existing) {
    newEffect(state, { kind, side, lane, value, untilTick });
    return laneEffect(state, kind, side, lane, state.tick);
  }
  // §8.4：更强替换并使用新到期时点；同强度从新施放时刻重算持续；弱效果不替换也不延长。
  if (value > existing.value) {
    existing.value = value;
    existing.untilTick = untilTick;
  } else if (value === existing.value) {
    existing.untilTick = untilTick;
  }
  return existing;
}

// —— tick ——

export function tick(state) {
  if (state.status !== "running") return state.status;
  state.tick += 1;
  const t = state.tick;

  moveAndBlock(state, t);
  const actions = collectActions(state, t);
  resolveActions(state, actions, t);
  breakthroughAndWin(state, t);
  if (state.status === "running") regenAndExpire(state, t);
  if (state.status === "running" && t >= CFG.battleTicks) {
    state.status = "defend_win";
    state.endReason = "time_limit";
  }
  return state.status;
}

function moveAndBlock(state, t) {
  const attackers = aliveUnits(state)
    .filter((u) => u.side === "attack")
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const u of attackers) {
    if (u.blockedBy) continue;
    let remaining = currentSpeedMult(state, u, t) / u.moveSeconds; // 本 tick 前进的格数
    let guard = 0;
    while (remaining > 0 && !u.blockedBy && guard++ < 64) {
      const need = 1 - u.moveProgress;
      if (remaining < need - 1e-9) {
        u.moveProgress += remaining;
        remaining = 0;
        break;
      }
      remaining -= need;
      u.moveProgress = 0;
      u.pos += 1;
      if (u.pos >= EXIT_POS) break;
      const cell = Math.floor(u.pos);
      const blocker = aliveUnits(state).find(
        (d) =>
          d.side === "defend" &&
          d.ground &&
          d.lane === u.lane &&
          d.pos === cell &&
          d.blocking.length < d.blockCapacity,
      );
      if (blocker) {
        // 到达顺序：同 tick 内按稳定单位编号先后接住；被接住后停在阻挡格。
        u.pos = cell;
        u.blockedBy = blocker.id;
        blocker.blocking.push(u.id);
      }
    }
  }
}

function settleAttackTimer(unit, interval) {
  // 攻击后保留不足 1 tick 的真实余量（火力集中 3→2.4 秒靠它生效）。
  // 机械容差：间隔与累加都是不可尽小数，负向微小残差截断为零；
  // 只有"就绪封顶后再等 1 tick"的溢出（余量 ≥ 1）才归零，避免相位漂移连发。
  const remainder = unit.attackTimer - interval;
  unit.attackTimer = remainder >= 1 - 1e-9 ? 0 : Math.max(0, remainder);
}

function collectActions(state, t) {
  const units = aliveUnits(state).sort((a, b) => a.id.localeCompare(b.id));
  for (const u of units) u.attackTimer += 1;
  const actions = [];
  for (const u of units) {
    const interval = currentInterval(state, u, t);
    if (u.silencedUntilTick && u.silencedUntilTick >= t) {
      // 被震击的阻挡者停止普通攻击；计时保持就绪，不无限累积。
      u.attackTimer = Math.min(u.attackTimer, interval);
      continue;
    }
    if (u.attackTimer < interval - 1e-9) continue;
    if (u.heal > 0) {
      const target = pickHealTarget(state, u);
      if (!target) {
        u.attackTimer = interval; // 没有合法目标时保持就绪
        continue;
      }
      actions.push({ actor: u, kind: "heal", targets: [{ unit: target, amount: u.heal }] });
      settleAttackTimer(u, interval);
      continue;
    }
    const targets = pickAttackTargets(state, u);
    if (!targets.length) {
      u.attackTimer = interval; // 没有合法目标时保持就绪
      continue;
    }
    actions.push({ actor: u, kind: "attack", targets });
    settleAttackTimer(u, interval);
  }
  return actions;
}

function pickHealTarget(state, u) {
  // §6.4：治疗只作用于本路范围内的己方存活单位（含自身），优先生命比例最低者，平手按稳定单位编号；不复活。
  let best = null;
  for (const ally of aliveUnits(state)) {
    if (ally.side !== u.side || ally.lane !== u.lane) continue;
    if (u.healRadius > 0 && Math.abs(ally.pos - u.pos) > u.healRadius) continue;
    const ratio = ally.hp / ally.maxHp;
    if (!best || ratio < best.ratio || (ratio === best.ratio && ally.id < best.unit.id)) {
      best = { unit: ally, ratio };
    }
  }
  return best?.unit ?? null;
}

function isHiddenFromDefenderRanged(state, attacker, t) {
  if (attacker.blockedBy) return false; // 已被阻挡的目标不靠隐蔽免伤
  if (attacker.stealth && !isRevealed(state, attacker.lane, t)) return true;
  if (isSmoked(state, attacker.lane, t) && !isRevealed(state, attacker.lane, t)) return true;
  return false;
}

function pickAttackTargets(state, u) {
  const t = state.tick;
  const results = [];
  if (u.side === "defend") {
    if (u.ground) {
      // 地面单位只攻击被自己挡住的敌人
      for (const attackerId of u.blocking) {
        const a = unitAt(state, attackerId);
        if (a?.alive) results.push({ unit: a, amount: u.attack, damageType: u.damageType });
      }
      return results;
    }
    // 高台：本路向入口覆盖 range 格，优先最接近核心者，平手按稳定编号；潜行／烟幕遵守可见性。
    let best = null;
    for (const e of aliveUnits(state)) {
      if (e.side !== "attack" || e.lane !== u.lane) continue;
      const distance = u.pos - e.pos;
      if (distance < 0 || distance > u.range) continue;
      if (isHiddenFromDefenderRanged(state, e, t)) continue;
      if (!best || e.pos > best.pos || (e.pos === best.pos && e.id < best.id)) best = e;
    }
    if (best) {
      if (u.splash > 0) {
        const center = unitCell(best);
        for (const e of aliveUnits(state)) {
          if (e.side !== "attack" || e.lane !== u.lane) continue;
          const cell = unitCell(e);
          if (Math.abs(cell - center) <= u.splash)
            results.push({ unit: e, amount: u.attack, damageType: u.damageType });
        }
      } else {
        results.push({ unit: best, amount: u.attack, damageType: u.damageType });
      }
    }
    return results;
  }
  // 攻方
  if (u.range > 0) {
    // 远程投手：本路射程内的守方地面或高台；优先正在阻挡本路队友的地面单位，再按固定距离与编号。
    const blockersOfAllies = new Set(
      aliveUnits(state)
        .filter((a) => a.side === "attack" && a.lane === u.lane && a.blockedBy)
        .map((a) => a.blockedBy),
    );
    let best = null;
    for (const d of aliveUnits(state)) {
      if (d.side !== "defend" || d.lane !== u.lane) continue;
      const distance = Math.abs(d.pos - u.pos);
      if (distance > u.range) continue;
      const isBlocker = blockersOfAllies.has(d.id);
      const key = { blocker: isBlocker ? 0 : 1, distance, id: d.id };
      if (
        !best ||
        key.blocker < best.key.blocker ||
        (key.blocker === best.key.blocker &&
          (key.distance < best.key.distance ||
            (key.distance === best.key.distance && key.id < best.key.id)))
      ) {
        best = { unit: d, key };
      }
    }
    if (best) results.push({ unit: best.unit, amount: u.attack, damageType: u.damageType });
    return results;
  }
  // 近战：只攻击挡住自己的单位；未被阻挡的近战继续行进，不远距离攻击高台。
  if (u.blockedBy) {
    const blocker = unitAt(state, u.blockedBy);
    if (blocker?.alive) results.push({ unit: blocker, amount: u.attack, damageType: u.damageType });
  }
  return results;
}

function resolveActions(state, actions, t) {
  // 同一快照结算：阶段开始时仍存活的单位都能产生一次合法效果；伤害先经护盾，再与本阶段合法治疗合并。
  const hpDamage = {};
  const heals = {};
  for (const action of actions) {
    for (const { unit, amount, damageType } of action.targets) {
      if (action.kind === "heal") {
        heals[unit.id] = (heals[unit.id] ?? 0) + amount;
      } else {
        hpDamage[unit.id] =
          (hpDamage[unit.id] ?? 0) + computeDamage(state, unit, amount, damageType, t);
      }
    }
  }
  const touched = new Set([...Object.keys(hpDamage), ...Object.keys(heals)]);
  for (const id of touched) {
    const unit = unitAt(state, id);
    if (!unit?.alive) continue; // 快照后已被移除（例如阻挡者撤退）
    const next = Math.min(unit.maxHp, unit.hp + (heals[id] ?? 0) - (hpDamage[id] ?? 0));
    if (next <= 0) removeUnit(state, unit);
    else unit.hp = next;
  }
}

function breakthroughAndWin(state, _t) {
  // 死亡单位不参与本 tick 核心突破；只有结算伤害后仍存活并到达终点的单位才扣核心耐久。
  const escapers = aliveUnits(state)
    .filter((u) => u.side === "attack" && u.pos >= EXIT_POS)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const u of escapers) {
    state.coreHp = Math.max(0, state.coreHp - u.breakthrough);
    removeUnit(state, u);
  }
  if (state.coreHp <= 0) {
    state.status = "attack_win";
    state.endReason = "core_broken";
  }
}

function regenAndExpire(state, t) {
  state.costAccum += 1;
  if (state.costAccum >= CFG.costRegenEveryTicks) {
    state.costAccum -= CFG.costRegenEveryTicks;
    state.cost.attack += 1;
    state.cost.defend += 1;
  }
  state.effects = state.effects.filter((e) => e.untilTick >= t);
  for (const u of Object.values(state.units)) {
    if (u.shield && (u.shield.untilTick < t || u.shield.amount <= 0)) u.shield = null;
  }
}

// —— 读取投影 ——
// §13：潜行等隐藏机制遵守实际可见性，不全量泄露未被发现单位；费用与冷却只给本方。

export function viewForSide(state, side) {
  const t = state.tick;
  const visibleUnits = [];
  for (const u of Object.values(state.units).sort((a, b) => a.id.localeCompare(b.id))) {
    // 敌方攻方单位遵守隐蔽可见性；守方单位无隐蔽机制，全部可见。
    if (side === "defend" && u.side === "attack" && isHiddenFromDefenderRanged(state, u, t))
      continue;
    visibleUnits.push({
      id: u.id,
      side: u.side,
      typeKey: u.typeKey,
      lane: u.lane,
      pos: u.pos,
      hp: u.hp,
      maxHp: u.maxHp,
      shieldAmount: u.shield?.untilTick >= t ? u.shield.amount : 0,
      blockedBy: u.blockedBy ?? null,
      blocking: [...(u.blocking ?? [])],
      activeEffects: [
        ...(u.fireFocusUntilTick >= t && u.fireFocusUntilTick > 0
          ? [
              {
                kind: "fire_focus",
                value: CFG.commanderSkills.defend.fire_focus.intervalMult,
                untilTick: u.fireFocusUntilTick,
              },
            ]
          : []),
        ...(u.sprintUntilTick >= t && u.sprintUntilTick > 0
          ? [{ kind: "sprint", value: u.sprintMult, untilTick: u.sprintUntilTick }]
          : []),
        ...(u.silencedUntilTick >= t && u.silencedUntilTick > 0
          ? [{ kind: "silence", untilTick: u.silencedUntilTick }]
          : []),
        ...(u.shield?.untilTick >= t && u.shield.amount > 0
          ? [{ kind: "shield", value: u.shield.amount, untilTick: u.shield.untilTick }]
          : []),
      ],
      ...(u.side === side && u.unitSkill
        ? { unitSkillReadyInTicks: Math.max(0, (state.cooldowns[`${u.id}:skill`] ?? 0) - t) }
        : {}),
    });
  }
  return {
    battleId: state.battleId,
    roundId: state.roundId,
    status: state.status,
    endReason: state.endReason,
    tick: state.tick,
    ticksLeft: Math.max(0, CFG.battleTicks - state.tick),
    coreHp: state.coreHp,
    ownCost: state.cost[side],
    ownCommanderSkills: state.participants[side].flatMap((member) =>
      state.assignments[side][member].map((skill) => ({
        member,
        skill,
        readyInTicks: Math.max(0, (state.cooldowns[`${side}:${member}:${skill}`] ?? 0) - t),
      })),
    ),
    effects: state.effects
      .filter((effect) => effect.untilTick >= t)
      .map((effect) => ({ ...effect })),
    visibleUnits,
  };
}
