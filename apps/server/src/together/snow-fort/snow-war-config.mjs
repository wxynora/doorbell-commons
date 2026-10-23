// 雪堡战权威数值；引擎、NPC与玩家规则目录共用。
// 时间单位为战斗秒／tick（1 tick = 1 战斗秒）。

export const SNOW_WAR_ECONOMY = {
  registrationFeeGold: 10000,
  rewards: {
    round: { gold: 30000, silver: 30 },
    complete: { gold: 50000, silver: 50 },
    champion: { gold: 100000, silver: 100 },
  },
};

export const SNOW_WAR_CONFIG = {
  rulesVersion: "snow-fort-20261024.1",
  laneCount: 3,
  laneCells: 12, // 地面位置 1..12，越过第 12 格抵达终点
  groundSlots: [4, 7, 10], // 守方地面部署位
  highSlots: [5, 8, 11], // 守方高台部署位（在第 5、8、11 格旁）
  coreMaxHp: 20,
  initialCost: 30,
  costRegenEveryTicks: 3, // 每 3 个战斗秒自然 +1，不设存量截断
  battleTicks: 600, // 10 分钟
  retreatRefundNumerator: 1, // 撤退返还部署费用的 10%，向下取整
  retreatRefundDenominator: 10,
  defenderDecayTicks: 900,
  tankTargetWeight: 4,
  systemWaves: {
    ticks: [200, 450],
    count: 3,
    unit: { hp: 1200, blockedAttack: 80, blockedAttackInterval: 3, moveSeconds: 3, breakthrough: 0.5 },
  },
  commanderSkillCooldownTicks: 60, // 指挥技能统一 60 秒冷却，成功施放后开始计时
  unitSkillCooldownTicks: 60,
  maxCommanderSkillsPerMember: 2, // 每位队员 2 个不同的本方指挥技能（4 选 2）

  // 守方单位（§7.1）：地面单位阻挡并攻击被自己挡住的敌人；高台单位不阻挡。
  defenderUnits: {
    shield_guard: {
      name: "持盾卫兵",
      cost: 13,
      hp: 1200,
      armor: 60,
      spellResist: 0,
      attackInterval: 3,
      attack: 140,
      damageType: "physical",
      ground: true,
      block: 2,
    },
    heavy_guard: {
      name: "重盾卫兵",
      cost: 23,
      hp: 2200,
      armor: 110,
      spellResist: 0,
      attackInterval: 4,
      attack: 100,
      damageType: "physical",
      ground: true,
      block: 3,
    },
    crossbow: {
      name: "弩手",
      cost: 17,
      hp: 700,
      armor: 10,
      spellResist: 0,
      attackInterval: 3,
      attack: 210,
      damageType: "physical",
      ground: false,
      range: 3,
    },
    snow_mage: {
      name: "雪术师",
      cost: 21,
      hp: 650,
      armor: 10,
      spellResist: 0,
      attackInterval: 4,
      attack: 170,
      damageType: "spell",
      ground: false,
      range: 3,
    },
    artillery: {
      name: "雪炮台手",
      cost: 25,
      hp: 650,
      armor: 10,
      spellResist: 0,
      attackInterval: 5,
      attack: 160,
      damageType: "physical",
      ground: false,
      range: 3,
      splash: 1,
    },
    medic: {
      name: "救护员",
      cost: 19,
      hp: 750,
      armor: 15,
      spellResist: 0,
      attackInterval: 4,
      heal: 140,
      ground: false,
      healRadius: 3,
    },
  },

  // 攻方单位（§7.2）：沿路自动前进，被阻挡时停下攻击阻挡者。
  attackerUnits: {
    light_inf: {
      name: "雪地轻兵",
      cost: 4,
      hp: 825,
      armor: 10,
      spellResist: 0,
      moveSeconds: 6,
      blockedAttackInterval: 3,
      blockedAttack: 125,
      breakthrough: 1,
    },
    heavy_t: {
      name: "厚甲先锋T",
      cost: 12,
      hp: 2600,
      armor: 90,
      spellResist: 0.2,
      moveSeconds: 9,
      blockedAttackInterval: 4,
      blockedAttack: 100,
      breakthrough: 3,
    },
    thrower: {
      name: "远程投手",
      cost: 12,
      hp: 900,
      armor: 20,
      spellResist: 0,
      moveSeconds: 8,
      attackInterval: 4,
      attack: 170,
      damageType: "physical",
      range: 3,
      breakthrough: 2,
    },
    march_medic: {
      name: "行军救护员",
      cost: 10,
      hp: 850,
      armor: 20,
      spellResist: 0,
      moveSeconds: 8,
      attackInterval: 5,
      heal: 120,
      healRadius: 3,
      breakthrough: 1,
    },
    scout: {
      name: "潜行斥候",
      cost: 8,
      hp: 700,
      armor: 10,
      spellResist: 0,
      moveSeconds: 7,
      blockedAttackInterval: 2,
      blockedAttack: 140,
      breakthrough: 2,
      stealth: true, // 移动中不被守方远程直接选中；被地面阻挡或探照揭示后可被正常攻击
      unitSkill: {
        kind: "sprint",
        name: "疾行",
        speedMult: 1.4,
        durationTicks: 10,
        cooldownTicks: 60,
      },
    },
    hammer: {
      name: "破阵重锤手",
      cost: 14,
      hp: 1700,
      armor: 50,
      spellResist: 0,
      moveSeconds: 9,
      blockedAttackInterval: 6,
      blockedAttack: 330,
      breakthrough: 3,
      unitSkill: { kind: "silence", name: "破阵震击", silenceTicks: 3, cooldownTicks: 60 }, // 令阻挡自己的地面单位停止普通攻击，不解除阻挡
    },
  },

  // 队长可分配的指挥技能（§8）：每人从本方 4 个里选 2 个；无随机成功率，不消耗战备费用。
  commanderSkills: {
    attack: {
      break_armor: {
        name: "破甲号令",
        target: "lane",
        armorMult: 0.5,
        durationTicks: 15,
        cooldownTicks: 60,
      },
      assault: {
        name: "突击号令",
        target: "lane",
        speedMult: 1.4,
        durationTicks: 10,
        cooldownTicks: 60,
      },
      smoke: { name: "烟幕掩护", target: "lane", durationTicks: 8, cooldownTicks: 60 }, // 未被阻挡的己方单位不被守方远程选中
      march_shield: {
        name: "行军护盾",
        target: "lane",
        shield: 300,
        durationTicks: 15,
        cooldownTicks: 60,
      },
    },
    defend: {
      fire_focus: {
        name: "火力集中",
        target: "lane",
        intervalMult: 0.8,
        durationTicks: 15,
        cooldownTicks: 60,
      },
      guard_shield: {
        name: "坚守护盾",
        target: "lane",
        shield: 400,
        durationTicks: 15,
        cooldownTicks: 60,
        groundOnly: true,
      },
      searchlight: { name: "探照", target: "lane", durationTicks: 20, cooldownTicks: 60 }, // 揭示该路潜行／烟幕
      emergency_heal: {
        name: "应急救护",
        target: "lane",
        heal: 350,
        instant: true,
        cooldownTicks: 60,
      },
    },
  },
};
