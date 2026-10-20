// 雪堡战组赛与赛程层（候选）。
// 实现 docs/snow-fort-war-proposal-20261012.md（2026-10-14 审阅稿）第三、四、十一节：
// 报名分队（按机数平衡、NPC 补齐、奇数席位规则）、三天三场两胜赛程、第三场抽签、
// 队长排阵同时暗排、逐局开局对接战斗引擎、场与系列赛结算。
// 状态是可 JSON 序列化的普通对象；抽签用 seriesId 的确定性哈希，可复现、可审计。
// 频道、通知、日报、时段与奖励等产品层不在本文件。

import { createHash } from "node:crypto";
import { SNOW_WAR_CONFIG as CFG } from "./snow-war-config.mjs";
import { createBattle } from "./snow-war-engine.mjs";

function hashBit(key) {
  // 与 Main 侧 home-weather-engine 同思路的确定性采样：无需随机数即可复现抽签。
  const digest = createHash("sha256").update(key, "utf8").digest();
  return digest[0] & 1;
}

function skillPoolValid(role, skills) {
  // 技能池按当日攻守角色（attack/defend）划分，不按队字母：同一队第 1 天与第 2 天的可用池不同。
  const pool = CFG.commanderSkills[role];
  return (
    Array.isArray(skills) &&
    skills.length === CFG.maxCommanderSkillsPerMember &&
    new Set(skills).size === skills.length &&
    skills.every((s) => Object.hasOwn(pool, s))
  );
}

// —— 建立系列赛：报名名单 → 分队 → 赛程与抽签 ——

export function createSeries({ seriesId, humanEntries }) {
  if (!seriesId) throw new Error("系列赛必须携带 seriesId");
  if (!Array.isArray(humanEntries) || humanEntries.length === 0) {
    throw new Error("报名名单为空");
  }
  const seen = new Set();
  for (const entry of humanEntries) {
    if (!entry?.humanId || !Array.isArray(entry.residents) || entry.residents.length === 0) {
      throw new Error(`报名项不完整：${JSON.stringify(entry)}`);
    }
    for (const rid of entry.residents) {
      if (seen.has(rid)) throw new Error(`小机重复报名：${rid}`);
      seen.add(rid);
    }
  }
  // 分队：按机数从多到少，把整家分到当前机数较少的一队（确定性贪心，同名册顺序稳定）。
  const ordered = [...humanEntries].sort(
    (a, b) =>
      b.residents.length - a.residents.length || String(a.humanId).localeCompare(String(b.humanId)),
  );
  const teams = {
    A: { members: [] },
    B: { members: [] },
  };
  const machineCount = () => teams.A.members.length - teams.B.members.length;
  for (const entry of ordered) {
    const side = machineCount() <= 0 ? "A" : "B";
    for (const rid of entry.residents) {
      teams[side].members.push({ id: rid, humanId: entry.humanId, isNpc: false });
    }
  }
  // NPC 补齐到两队机数相同：差距可能超过 1（如一家 3 机对一家 1 机），必须循环补足实际差额；
  // 补齐后席位数为偶数时，两队各加 1 名 NPC 形成奇数局数（审阅稿 3.2 建议）。
  let npcSeq = 1;
  const addNpc = (side) => {
    teams[side].members.push({ id: `NPC-${npcSeq++}`, humanId: null, isNpc: true });
  };
  while (teams.A.members.length > teams.B.members.length) addNpc("B");
  while (teams.B.members.length > teams.A.members.length) addNpc("A");
  if (teams.A.members.length === teams.B.members.length && teams.A.members.length % 2 === 0) {
    addNpc("A");
    addNpc("B");
  }
  if (teams.A.members.length !== teams.B.members.length) {
    throw new Error("分队后席位不平衡，属于内部错误");
  }
  if (teams.A.members.length % 2 === 0) {
    throw new Error("席位数为偶数，无法保证场内不出现平局，属于内部错误");
  }

  // 第三场只抽攻守不抽胜负：结果先持久保存（审阅稿 3.1），由 seriesId 确定性导出，重启不能重抽。
  const day3AttackSide = hashBit(`${seriesId}:day3-draw`) === 0 ? "A" : "B";
  const attackSides = ["A", "B", day3AttackSide];
  const matches = attackSides.map((attackSide, index) => ({
    index,
    day: index < 2 ? 1 : 2,
    period: index === 1 ? "afternoon" : "morning",
    attackSide,
    defendSide: attackSide === "A" ? "B" : "A",
    lineups: { A: null, B: null },
    locked: false,
    rounds: [],
    winner: null,
  }));
  return {
    seriesId,
    status: "awaiting_lineup", // awaiting_lineup | complete（三场全部出结果；冠军提前决出不改此值，第 3 天照常）
    teams,
    matchWins: { A: 0, B: 0 },
    seriesWinner: null,
    matches,
    reportedRounds: Object.create(null), // battleId -> winnerSide（重放幂等）
    startedRounds: Object.create(null), // battleId -> true（该局已初始化；重复开局被拒绝，恢复走持久战斗状态）
  };
}

export function restoreSeries(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.matches)) {
    throw new Error("无法从给定状态恢复雪堡战系列赛");
  }
  // 以自有键重建无原型索引：JSON 往返后这些字典回到普通对象，constructor 等键不得落入原型链。
  for (const key of ["reportedRounds", "startedRounds"]) {
    const src = state[key] ?? {};
    const rebased = Object.create(null);
    for (const k of Object.keys(src)) rebased[k] = src[k];
    state[key] = rebased;
  }
  return state;
}

function teamMemberIds(state, side) {
  return state.teams[side].members.map((m) => m.id);
}

function requireMatch(state, matchIndex) {
  const match = state.matches[matchIndex];
  // 冠军已定不封锁后续场次：2:0 后第 3 天仍按排期举行，结果照常记录，冠军不因后续结果改写（审阅稿 3.1）。
  if (!match) throw new Error("场次不存在");
  return match;
}

// —— 排阵：两队各自提交，双方都锁定后才同时公开（审阅稿 4.2 同时暗排）——

export function submitLineup(state, matchIndex, side, lineup) {
  const match = requireMatch(state, matchIndex);
  if (side !== "A" && side !== "B") throw new Error("排阵必须属于 A 队或 B 队");
  if (match.locked) throw new Error("本场排阵已锁定并公开，不能再修改");
  const { captain, order, skills } = lineup ?? {};
  const memberIds = teamMemberIds(state, side);
  if (!memberIds.includes(captain)) throw new Error("队长必须是本队出场成员");
  if (
    !Array.isArray(order) ||
    order.length !== memberIds.length ||
    new Set(order).size !== order.length ||
    order.some((id) => !memberIds.includes(id))
  ) {
    throw new Error("出场顺序必须是本队全体成员的一个排列");
  }
  const role = match.attackSide === side ? "attack" : "defend";
  for (const member of memberIds) {
    if (!skillPoolValid(role, skills?.[member])) {
      throw new Error(
        `成员 ${member} 的配技必须是本方 ${CFG.maxCommanderSkillsPerMember} 个不同技能`,
      );
    }
  }
  match.lineups[side] = { captain, order: [...order], skills: JSON.parse(JSON.stringify(skills)) };
  // 双方都提交即视为同时锁定：此后本场排阵公开，不得再改（审阅稿 4.2.4）。
  if (match.lineups.A && match.lineups.B) {
    match.locked = true;
    const attackOrder = match.lineups[match.attackSide].order;
    const defendOrder = match.lineups[match.defendSide].order;
    match.rounds = attackOrder.map((aMember, i) => ({
      index: i,
      battleId: `${state.seriesId}:m${match.index}:r${i}`,
      attackMember: aMember,
      defendMember: defendOrder[i],
      winner: null,
    }));
  }
  return { ok: true, locked: match.locked };
}

// —— 逐局开局：按锁定排阵的顺序配对，攻守由当日场次决定 ——

export function startRound(state, matchIndex, roundIndex) {
  const match = requireMatch(state, matchIndex);
  if (!match.locked) throw new Error("本场双方排阵尚未锁定");
  // 赛程顺序：前一场未出结果，不能开下一场（第 3 场在 2:0 后仍按此规则正常可开）。
  if (matchIndex > 0 && !state.matches[matchIndex - 1].winner) {
    throw new Error("前一场尚未结束，不能开下一场");
  }
  const round = match.rounds[roundIndex];
  if (!round) throw new Error("局不存在");
  if (round.winner) throw new Error("该局已有结果");
  // 唯一开局边界：同一局只初始化一次；中断恢复必须走持久化的战斗状态，不能重新createBattle清零战场。
  if (Object.hasOwn(state.startedRounds, round.battleId)) {
    throw new Error("该局已开局，必须从持久化的战斗状态恢复，不能重新初始化");
  }
  if (roundIndex > 0 && !match.rounds[roundIndex - 1].winner) {
    throw new Error("前一局尚未出结果");
  }
  const attackLineup = match.lineups[match.attackSide];
  const defendLineup = match.lineups[match.defendSide];
  const battle = createBattle({
    battleId: round.battleId,
    roundId: state.seriesId,
    attackSideId: `${match.attackSide}队:${round.attackMember}`,
    defendSideId: `${match.defendSide}队:${round.defendMember}`,
    participants: { attack: [round.attackMember], defend: [round.defendMember] },
    assignments: {
      attack: { [round.attackMember]: attackLineup.skills[round.attackMember] },
      defend: { [round.defendMember]: defendLineup.skills[round.defendMember] },
    },
  });
  state.startedRounds[round.battleId] = true;
  return battle;
}

// —— 结算：局 → 场 → 系列赛 ——

export function reportRound(state, matchIndex, roundIndex, winnerSide) {
  const match = requireMatch(state, matchIndex);
  if (!match.locked) throw new Error("本场尚未锁定排阵");
  const round = match.rounds[roundIndex];
  if (!round) throw new Error("局不存在");
  // 只能报告真实开过局的战斗；未开局不得凭空补结果，场序与局序由开局门槛间接守住。
  if (!Object.hasOwn(state.startedRounds, round.battleId)) {
    throw new Error("该局尚未开局，不能报告结果");
  }
  if (winnerSide !== "A" && winnerSide !== "B") throw new Error("胜方必须是 A 队或 B 队");
  if (Object.hasOwn(state.reportedRounds, round.battleId)) {
    const prior = state.reportedRounds[round.battleId];
    if (prior === winnerSide) return { ok: true, replay: true };
    throw new Error("该局已记录了不同的结果");
  }
  // 胜方必须是本局的出场席位之一（服务器集成层另需校验战斗引擎的实际终局）。
  const winnerMember = winnerSide === match.attackSide ? round.attackMember : round.defendMember;
  if (!winnerMember) throw new Error("胜方不是本局出场席位");
  state.reportedRounds[round.battleId] = winnerSide;
  round.winner = winnerSide;
  if (match.rounds.every((r) => r.winner)) {
    const aWins = match.rounds.filter((r) => r.winner === "A").length;
    const bWins = match.rounds.filter((r) => r.winner === "B").length;
    if (aWins === bWins) throw new Error("局数相等，场胜无法判定——席位奇偶规则被破坏");
    match.winner = aWins > bWins ? "A" : "B";
    state.matchWins[match.winner] += 1;
    // 先获得两场胜利者赢系列赛；2:0 后第 3 天仍按排期举行，结果照常记录，冠军只记录一次（审阅稿 3.1、11.3）。
    if (state.matchWins[match.winner] >= 2 && !state.seriesWinner) {
      state.seriesWinner = match.winner;
    }
  }
  // status 只表示三场全部出结果；冠军提前决出（2:0）不改它，第 3 天照常开赛。
  if (state.matches.every((m) => m.winner)) {
    state.status = "complete";
  }
  return { ok: true };
}

// —— 真实终局接入：把战斗引擎的终局转成局胜报告（服务器集成层的唯一合法结算入口）——

export function settleRoundFromBattle(state, matchIndex, roundIndex, battle) {
  const match = requireMatch(state, matchIndex);
  const round = match.rounds[roundIndex];
  if (!round) throw new Error("局不存在");
  if (battle?.battleId !== round.battleId) {
    throw new Error("战斗对局与该局编号不一致，拒绝结算");
  }
  if (battle.status !== "attack_win" && battle.status !== "defend_win") {
    throw new Error("对局尚未结束，不能结算");
  }
  const match2 = state.matches[matchIndex];
  const winnerSide = battle.status === "attack_win" ? match2.attackSide : match2.defendSide;
  const result = reportRound(state, matchIndex, roundIndex, winnerSide);
  round.substitutes = [...(battle.runtime?.substitutes ?? [])];
  round.terminal = { ticks: battle.tick, reason: battle.endReason };
  return result;
}

export function seriesView(state) {
  return {
    seriesId: state.seriesId,
    status: state.status,
    matchWins: { ...state.matchWins },
    seriesWinner: state.seriesWinner,
    day3AttackSide: state.matches[2]?.attackSide ?? null,
    teams: {
      A: {
        captainId: state.captains?.A ?? null,
        members: state.teams.A.members.map((m) => ({ id: m.id, isNpc: m.isNpc })),
      },
      B: {
        captainId: state.captains?.B ?? null,
        members: state.teams.B.members.map((m) => ({ id: m.id, isNpc: m.isNpc })),
      },
    },
    matches: state.matches.map((m) => ({
      day: m.day,
      period: m.period,
      attackSide: m.attackSide,
      locked: m.locked,
      winner: m.winner,
      rounds: m.rounds.map((r) => ({
        index: r.index,
        winner: r.winner,
        ...(r.terminal ? { terminal: { ...r.terminal } } : {}),
        // 暗排：未锁定前不公开对阵与配技；双锁后公开本局双方出场与配技（审阅稿 4.2.3）
        attackMember: m.locked ? r.attackMember : null,
        defendMember: m.locked ? r.defendMember : null,
        attackSkills: m.locked ? m.lineups[m.attackSide].skills[r.attackMember] : null,
        defendSkills: m.locked ? m.lineups[m.defendSide].skills[r.defendMember] : null,
        substitutes: [...(r.substitutes ?? [])],
      })),
    })),
  };
}
