// Approved player explanations, with numeric facts from the same public rules.
export function snowRuleInstructions(rules) {
  return [
    "攻方从第1格出兵，单位自动前进；被地面单位挡住时停下交战。守方在地面位或高台位部署。物理伤害扣护甲，术式伤害按术式减伤计算。守方可撤退，返还一半部署费用，向下取整。",
    `队长为每位队员从本场攻守方的${Object.keys(rules.commanderSkills.attack).length}个指挥技能中选${rules.maxCommanderSkillsPerMember}个。指挥技能不消耗部署费用，各自冷却。`,
    "同类加速取较强效果；同类护盾取较大剩余量。",
  ];
}

export function describeSnowCommanderSkill(key, rules) {
  const definition = rules.commanderSkills.attack[key] ?? rules.commanderSkills.defend[key];
  const effects = {
    break_armor: () =>
      `立即清除指定路敌方地面单位当前已有的护盾，并使其护甲×${definition.armorMult}，持续${definition.durationTicks}秒；之后新施加的护盾不受本次清除影响。`,
    assault: () =>
      `指定路己方单位移动速度×${definition.speedMult}，持续${definition.durationTicks}秒。`,
    smoke: () =>
      `指定路未被阻挡的己方单位不被守方远程直接选中，持续${definition.durationTicks}秒；探照可揭示。`,
    march_shield: () =>
      `为指定路当前己方单位各添加${definition.shield}护盾，持续${definition.durationTicks}秒。`,
    fire_focus: () =>
      `指定路当前己方攻击单位的攻击间隔×${definition.intervalMult}，持续${definition.durationTicks}秒；之后部署的单位不获得本次效果。`,
    guard_shield: () =>
      `为指定路当前己方地面单位各添加${definition.shield}护盾，持续${definition.durationTicks}秒。`,
    searchlight: () => `揭示指定路的潜行和烟幕，持续${definition.durationTicks}秒。`,
    emergency_heal: () => `立即为指定路当前己方单位各恢复${definition.heal}生命，不超过生命上限。`,
  };
  return { 效果: effects[key](), 冷却秒: definition.cooldownTicks };
}

export function describeSnowUnitSkill(skill) {
  return {
    技能: skill.name,
    效果:
      skill.kind === "sprint"
        ? `自身移动速度×${skill.speedMult}，持续${skill.durationTicks}秒。`
        : `使挡住自己的单位停止普通攻击${skill.silenceTicks}秒，阻挡仍保留。`,
    冷却秒: skill.cooldownTicks,
  };
}

function unitAbilities(side, definition) {
  const abilities = [];
  if (definition.heal) abilities.push("治疗本路范围内生命比例最低的受伤友军，包含自己；不攻击。");
  else if (side === "defend")
    abilities.push(
      definition.ground
        ? "攻击自己挡住的所有敌人。"
        : "攻击本路向入口方向射程内的敌人，优先最接近核心者。",
    );
  else
    abilities.push(
      definition.range
        ? "攻击本路前后射程内的地面或高台敌人，优先阻挡队友的单位。"
        : "攻击挡住自己的单位。",
    );
  if (definition.stealth) abilities.push("未被阻挡且未被探照揭示时，不被守方远程直接选中。");
  if (definition.splash) abilities.push("命中目标所在格前后范围内的同路敌人受到伤害。");
  return abilities;
}

export function renderSnowRuleCatalog(rules) {
  const lines = [
    JSON.stringify({
      对局秒数上限: rules.battleTicks,
      核心耐久: rules.coreMaxHp,
      初始部署费用: rules.initialCost,
      费用恢复间隔秒: rules.costRegenEveryTicks,
      地面格子: rules.groundSlots,
      高台格子: rules.highSlots,
    }),
  ];
  for (const [side, units] of [
    ["attack", rules.attackerUnits],
    ["defend", rules.defenderUnits],
  ]) {
    for (const definition of Object.values(units))
      lines.push(
        JSON.stringify({
          阵营: side,
          兵种: definition.name,
          部署费用: definition.cost,
          生命: definition.hp,
          护甲: definition.armor,
          术式减伤: definition.spellResist ?? 0,
          特殊能力: unitAbilities(side, definition),
          ...(side === "defend" ? { 部署位置: definition.ground ? "地面位" : "高台位" } : {}),
          ...(definition.block ? { 阻挡数: definition.block } : {}),
          ...(definition.range
            ? {
                射程格数: definition.range,
                射程方向: side === "defend" ? "本路向入口" : "本路前后",
              }
            : {}),
          ...(definition.healRadius
            ? { 治疗范围格数: definition.healRadius, 治疗范围方向: "本路前后" }
            : {}),
          ...(definition.splash ? { 溅射范围格数: definition.splash } : {}),
          ...(definition.breakthrough ? { 突破扣核心耐久: definition.breakthrough } : {}),
          ...(definition.unitSkill
            ? { 单位技能: describeSnowUnitSkill(definition.unitSkill) }
            : {}),
          ...(definition.attack || definition.blockedAttack
            ? {
                攻击: definition.attack ?? definition.blockedAttack,
                攻击间隔秒: definition.attackInterval ?? definition.blockedAttackInterval,
                伤害类型: definition.damageType === "spell" ? "术式" : "物理",
              }
            : {}),
          ...(definition.heal
            ? { 治疗: definition.heal, 治疗间隔秒: definition.attackInterval }
            : {}),
          ...(definition.moveSeconds ? { 移动每格秒: definition.moveSeconds } : {}),
          ...definition,
        }),
      );
    for (const [key, definition] of Object.entries(rules.commanderSkills[side]))
      lines.push(
        JSON.stringify({
          阵营: side,
          技能: definition.name,
          ...describeSnowCommanderSkill(key, rules),
          ...definition,
        }),
      );
  }
  return lines;
}
