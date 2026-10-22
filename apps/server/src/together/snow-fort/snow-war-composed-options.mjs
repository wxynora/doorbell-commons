// Activity-local composition, like the Mid-Autumn option prefixes. No MCP action or args change.
import { SNOW_WAR_CONFIG as CFG } from "./snow-war-config.mjs";
import { MIN_SNOW_DECISION_TICKS } from "./snow-war-decision-wakes.mjs";
import { describeSnowCommanderSkill } from "./snow-war-rules.mjs";
import { submitLineup } from "./snow-war-series.mjs";

export const SNOW_COMPOSITION_COPY = {
  lineup: "排阵：按出场顺序组合队员与两个技能，一次提交。",
  command:
    "战斗：按返回代号组合兵种、路线、位置或技能，一次提交。行动末尾加 | 和等待tick数。到点后铃会带来当前战场，请继续决策，直到本局结束。",
};

const invalid = () => {
  throw Error("option_not_available");
};
const codeAt = (code, prefix, entries) => {
  if (!new RegExp(`^${prefix}[1-9][0-9]*$`, "u").test(code)) return invalid();
  const index = Number(code.slice(prefix.length)) - 1;
  if (!Number.isSafeInteger(index) || !Object.hasOwn(entries, index)) return invalid();
  return entries[index];
};
const positive = (value) => {
  if (!/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(Number(value))) return invalid();
  return Number(value);
};
const roleOf = (match, side) => (match.attackSide === side ? "attack" : "defend");
const skillKeys = (role, assigned) =>
  Object.keys(CFG.commanderSkills[role]).filter(
    (key) => assigned === undefined || assigned.includes(key),
  );
const unitKeys = (role) => Object.keys(role === "attack" ? CFG.attackerUnits : CFG.defenderUnits);

export function snowCompositionMenu(action, data, token) {
  if (!action.composed) return undefined;
  const side = data.viewer.side;
  const match =
    action.composed === "lineup"
      ? data.series.matches[action.matchIndex]
      : data.series.matches.find((match) => !match.winner);
  const role = roleOf(match, side);
  const skills = skillKeys(
    role,
    action.composed === "lineup"
      ? undefined
      : data.battle.ownCommanderSkills.map((value) => value.skill),
  );
  const prefix = `${token}:`;
  const menu = {
    prefix,
    skills: skills.map((key, index) => ({
      code: `S${index + 1}`,
      name: CFG.commanderSkills[role][key].name,
      ...describeSnowCommanderSkill(key, CFG),
    })),
  };
  if (action.composed === "lineup") {
    menu.members = data.series.teams[side].members.map((member, index) => ({
      code: `M${index + 1}`,
      name: member.residentName ?? member.id,
    }));
    menu.format = menu.members.map((member) => `${member.code}+<S>+<S>`).join("/");
  } else {
    const units = role === "attack" ? CFG.attackerUnits : CFG.defenderUnits;
    menu.units = unitKeys(role).map((key, index) => ({
      code: `U${index + 1}`,
      name: units[key].name,
      cost: units[key].cost,
      ...(role === "defend" ? { cells: units[key].ground ? CFG.groundSlots : CFG.highSlots } : {}),
    }));
    menu.formats = [
      ...[
        ...(role === "attack"
          ? ["出兵+<U>+<路线>", "技能+<己方单位编号>"]
          : ["部署+<U>+<路线>+<格子>", "撤退+<己方单位编号>"]),
        "指挥+<S>+<路线>",
        "等待",
      ].map((format) => `${format}|<等待tick>`),
    ];
    menu.minimumWaitTicks = MIN_SNOW_DECISION_TICKS;
    menu.lanes = Array.from({ length: CFG.laneCount }, (_, index) => index + 1);
  }
  return menu;
}

export function resolveSnowComposition(action, payload, series, residentId, battleView) {
  if (typeof payload !== "string" || !payload || payload.includes(":")) return invalid();
  const side = ["A", "B"].find((key) =>
    series.teams[key].members.some((member) => member.id === residentId),
  );
  if (!side) return invalid();
  const match =
    action.composed === "lineup"
      ? series.matches[action.matchIndex]
      : series.matches.find((value) =>
          value.rounds.some((round) => round.battleId === action.battleId),
        );
  if (!match) return invalid();
  const role = roleOf(match, side);
  if (action.composed === "lineup") {
    if (series.captains[side] !== residentId || match.locked || match.lineups[side])
      return invalid();
    const members = series.teams[side].members;
    const order = [],
      skills = Object.create(null);
    for (const group of payload.split("/")) {
      const fields = group.split("+");
      if (fields.length !== 3) return invalid();
      const member = codeAt(fields[0], "M", members).id;
      if (Object.hasOwn(skills, member)) return invalid();
      order.push(member);
      skills[member] = fields.slice(1).map((code) => codeAt(code, "S", skillKeys(role)));
    }
    const lineup = { captain: residentId, order, skills };
    // Reuse the authority's complete-roster and role-specific skill checks on a disposable clone.
    try {
      submitLineup(structuredClone(series), action.matchIndex, side, lineup);
    } catch {
      return invalid();
    }
    return { ...action, lineup: { order, skills } };
  }
  if (action.composed !== "command" || !battleView?.started || battleView.substituted)
    return invalid();
  const parts = payload.split("|");
  if (parts.length !== 2) return invalid();
  const waitTicks = positive(parts[1]);
  if (waitTicks < MIN_SNOW_DECISION_TICKS || !Number.isSafeInteger(battleView.tick + waitTicks))
    return invalid();
  if (parts[0] === "等待") return { ...action, waitOnly: true, waitTicks };
  const fields = parts[0].split("+");
  let command;
  const skills = skillKeys(role, match.lineups[side]?.skills[residentId] ?? []);
  if (fields[0] === "出兵" && fields.length === 3 && role === "attack")
    command = {
      type: "spawn",
      unitType: codeAt(fields[1], "U", unitKeys(role)),
      lane: positive(fields[2]),
    };
  else if (fields[0] === "部署" && fields.length === 4 && role === "defend")
    command = {
      type: "deploy",
      unitType: codeAt(fields[1], "U", unitKeys(role)),
      lane: positive(fields[2]),
      cell: positive(fields[3]),
    };
  else if (fields[0] === "指挥" && fields.length === 3)
    command = {
      type: "commander_skill",
      skill: codeAt(fields[1], "S", skills),
      lane: positive(fields[2]),
    };
  else if (
    fields.length === 2 &&
    ((fields[0] === "撤退" && role === "defend") || (fields[0] === "技能" && role === "attack"))
  ) {
    if (!battleView.visibleUnits.some((unit) => unit.side === role && unit.id === fields[1]))
      return invalid();
    command = { type: fields[0] === "撤退" ? "retreat" : "unit_skill", unitId: fields[1] };
  } else return invalid();
  // Costs, occupancy, cooldowns and unit abilities remain authoritative in the original engine.
  return { ...action, command, waitTicks };
}
