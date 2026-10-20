import { SNOW_WAR_CONFIG as CFG, SNOW_WAR_ECONOMY } from "./snow-war-config.mjs";
import {
  describeSnowCommanderSkill,
  describeSnowUnitSkill,
  renderSnowRuleCatalog,
  snowRuleInstructions,
} from "./snow-war-rules.mjs";

export const snowViewCall = { op: "farm.together.view", args: {} };
const paymentUnconfirmedText =
  "报名费付款结果尚未确认，暂不算报名成功。请保留原编号，不要换编号重复报名。";
const time = (value) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
const members = (data) => Object.values(data.series?.teams ?? {}).flatMap((team) => team.members);
const inlineName = (name) => JSON.stringify(name).slice(1, -1);
const memberName = (data, id) =>
  inlineName(members(data).find((member) => member.id === id)?.residentName ?? id);
const unitDefinition = (key) => CFG.attackerUnits[key] ?? CFG.defenderUnits[key];
const skillName = (key) =>
  CFG.commanderSkills.attack[key]?.name ?? CFG.commanderSkills.defend[key]?.name ?? key;
const currentMatch = (data) => data.series?.matches.findIndex((match) => !match.winner) ?? -1;

export function describeSnowOption(action, data) {
  if (action.kind === "rules") return "查看比赛规则";
  if (action.kind === "register")
    return `报名本期雪堡战（${SNOW_WAR_ECONOMY.registrationFeeGold}金币）`;
  if (action.kind === "chat") return "发送队内消息";
  if (action.kind === "chat_pass") return "pass";
  if (action.kind === "ready") return "确认本局准备就绪";
  if (action.kind === "lineup_order")
    return `把${memberName(data, action.member)}排在第${(data.draft?.order.length ?? 0) + 1}位`;
  if (action.kind === "lineup_skill") {
    const skill = describeSnowCommanderSkill(action.skill, data.rules ?? CFG);
    return `为${memberName(data, action.member)}配置「${skillName(action.skill)}」 · ${skill.效果} ${JSON.stringify({ 冷却秒: skill.冷却秒 })}`;
  }
  if (action.kind === "lineup_confirm") return `确认本队第${action.matchIndex + 1}场排阵`;
  if (action.kind === "lineup_reset") return `重置本队第${action.matchIndex + 1}场排阵`;
  const command = action.command;
  const definition = unitDefinition(command.unitType);
  if (command.type === "spawn")
    return `派出${definition.name} · 第${command.lane}路 · ${definition.cost}点部署费用`;
  if (command.type === "deploy")
    return `部署${definition.name} · 第${command.lane}路第${command.cell}格 · ${definition.cost}点部署费用`;
  const unit = data.battle?.visibleUnits.find((value) => value.id === command.unitId);
  if (command.type === "retreat")
    return `撤退${unitDefinition(unit.typeKey).name}（${unit.id}）· 返还${Math.floor(unitDefinition(unit.typeKey).cost / 2)}点部署费用`;
  if (command.type === "unit_skill") {
    const skill = describeSnowUnitSkill(unitDefinition(unit.typeKey).unitSkill);
    return `${unitDefinition(unit.typeKey).name}（${unit.id}）· ${skill.技能} · ${skill.效果} ${JSON.stringify({ 冷却秒: skill.冷却秒 })}`;
  }
  const skill = describeSnowCommanderSkill(command.skill, data.rules ?? CFG);
  return `第${command.lane}路 · ${skillName(command.skill)} · ${skill.效果} ${JSON.stringify({ 冷却秒: skill.冷却秒 })}`;
}

// This string is persisted with the operation, not re-created from a later phase.
export function renderSnowOperation(result) {
  const action = result.action,
    context = result.context ?? {},
    facts = result.facts ?? result;
  if (!result.ok) return `操作没有完成：${result.message}。`;
  switch (action.kind) {
    case "register":
      return `报名成功。已收取${result.registration.gold}金币，你已加入本期雪堡战。报名结束后统一分队。`;
    case "chat":
      return "队内消息已发送，只有本队成员可以读取。";
    case "chat_pass":
      return "已 pass，本轮没有发送消息。";
    case "lineup_order":
      return `已把${inlineName(context.memberName)}排在第${context.position}位。剩余待排成员：${JSON.stringify(context.remainingMembers)}`;
    case "lineup_skill":
      return `已为${inlineName(context.memberName)}配置「${context.skillName}」。本场已配置：${context.skills.join("、")}。`;
    case "lineup_reset":
      return `已清空本队第${action.matchIndex + 1}场的排阵草稿，请重新安排。`;
    case "lineup_confirm":
      return result.locked
        ? `双方第${action.matchIndex + 1}场排阵已锁定，对阵与配技已公开。`
        : `本队第${action.matchIndex + 1}场排阵已提交，等待另一队提交。`;
    case "ready":
      return result.started
        ? "双方已准备就绪，本局开始。"
        : "你已准备就绪，正在等对手准备；战斗计时尚未开始。";
    case "command": {
      const command = action.command;
      if (command.type === "spawn")
        return `已在第${command.lane}路派出${context.unitName}（${facts.unitId}），消耗${facts.cost}点部署费用，剩余${facts.remainingCost}点。`;
      if (command.type === "deploy")
        return `已在第${command.lane}路第${command.cell}格部署${context.unitName}（${facts.unitId}），消耗${facts.cost}点部署费用，剩余${facts.remainingCost}点。`;
      if (command.type === "retreat")
        return `${context.unitName}（${command.unitId}）已撤退，返还${facts.refund}点部署费用，剩余${facts.remainingCost}点。`;
      const effect = { ...context.effect, 冷却至战斗秒: context.cooldownUntil };
      return command.type === "unit_skill"
        ? `${context.unitName}（${command.unitId}）已使用「${context.skillName}」。${JSON.stringify(effect)}`
        : `已在第${command.lane}路使用「${context.skillName}」。${JSON.stringify(effect)}`;
    }
  }
}

function phaseText(data) {
  if (data.registration?.status === "pending") return paymentUnconfirmedText;
  const index = currentMatch(data),
    match = data.series?.matches[index];
  const round = match?.rounds.find((value) => !value.winner);
  const registration = data.registration?.status === "registered";
  switch (data.phase) {
    case "scheduled":
      return registration
        ? `你已报名本期雪堡战。报名截止：${time(data.schedule.closesAt)}，之后统一分队。`
        : `雪堡战将于${time(data.schedule.opensAt)}开放报名，${time(data.schedule.closesAt)}截止。你目前尚未报名。`;
    case "registration":
      return registration
        ? `你已报名本期雪堡战。报名截止：${time(data.schedule.closesAt)}，之后统一分队。`
        : `雪堡战正在报名。报名截止：${time(data.schedule.closesAt)}。报名费：${data.registration.gold}金币，本期只收一次。`;
    case "awaiting_teams":
      return registration
        ? "报名已结束，正在安排分队与队长。你的报名记录已保留，现在不需要重复报名。"
        : "你没有加入本期比赛，不能提交排阵或战斗操作。";
    case "not_participant":
      return "你没有加入本期比赛，不能提交排阵或战斗操作。";
    case "lineup":
      return data.draft && data.viewer.captain && !data.viewer.lineupSubmitted
        ? `你是${data.viewer.side}队本场队长。正在安排第${index + 1}场的出场顺序与技能。${JSON.stringify({ 出场顺序: data.draft.order.map((id) => memberName(data, id)), 配技: Object.fromEntries(Object.entries(data.draft.skills).map(([id, keys]) => [memberName(data, id), keys.map(skillName)])) })}`
        : `第${index + 1}场双方排阵尚未全部锁定。${data.viewer.lineupSubmitted ? "本队已提交" : "等待队长排阵"}；对方未公开的排阵不会显示。`;
    case "scheduled_match":
      return `第${index + 1}场排阵已锁定，开赛时间：${time(data.schedule.matchStartsAt[index])}。本场${match.attackSide}队进攻、${match.attackSide === "A" ? "B" : "A"}队防守。`;
    case "waiting_round": {
      const own = match.rounds.find(
        (value) => value.attackMember === data.viewer.id || value.defendMember === data.viewer.id,
      );
      return `第${index + 1}场第${round.index + 1}局正在准备或比赛。${own?.winner ? "" : `你排在第${own.index + 1}局，尚未轮到你。`}`;
    }
    case "preparation":
      return `轮到第${index + 1}场第${round.index + 1}局：${memberName(data, round.attackMember)}进攻，${memberName(data, round.defendMember)}防守。${JSON.stringify({ 准备就绪: Object.keys(data.battle.ready).map((id) => memberName(data, id)) })}`;
    case "battle":
      return `第${index + 1}场第${round.index + 1}局正在进行，你是${data.viewer.side === match.attackSide ? "攻方" : "守方"}。战斗已过${data.battle.tick}秒，核心耐久${data.battle.coreHp}/${CFG.coreMaxHp}，本方部署费用${data.battle.ownCost}。`;
    case "complete":
      return `三场比赛已结束。场比分：A队${data.series.matchWins.A}：${data.series.matchWins.B}B队，冠军是${data.series.seriesWinner}队。`;
    case "ended":
      return "本期雪堡战已结束。下面是这个编号当时已经保存的操作结果，不会再次执行。";
  }
  return "";
}

export function renderSnowResult(data) {
  if (data.result) return data.result.text ?? renderSnowOperation(data.result);
  if (data.section === "rules")
    return [
      "两队按队长排好的顺序逐局一对一，每局是独立战场，由出场队员自己操作。第1场A队进攻、B队防守，第2场交换，第3场抽签决定攻守。每场打完全部对阵，赢得局数较多的队伍赢得该场；先赢两场的队伍夺冠，第三场仍照常进行。",
      "队长赛前安排出场顺序，为每人配置2个指挥技能；双方确认后公开对阵。轮到你时先确认准备，双方就绪后开始计时，每局最多10分钟。",
      "战场有3路，每路12格。攻方选择路线派兵，单位自动前进；守方在地面位部署阻挡单位，在高台位部署远程或治疗单位。部署消耗本局费用，费用随时间恢复。使用当前返回的编号派兵、部署、撤退或释放技能；操作后可继续查看战场并下达下一条指令。",
      "攻方单位越过第12格会扣减核心耐久。10分钟内核心降到0，攻方获胜；时间结束核心仍有耐久，守方获胜。下一局重新开始，费用、单位、生命和冷却不继承。",
      ...snowRuleInstructions(data.rules ?? CFG),
      ...renderSnowRuleCatalog(data.rules ?? CFG),
    ].join("\n\n");
  const knownErrors = {
    option_not_available:
      "这个编号当前不可用，本次没有执行该编号对应的操作。请重新读取当前共行状态，使用返回的编号。",
    request_conflict:
      "这个编号已经用于另一份消息，不能改写原消息。请读取当前状态，使用新的队内消息编号。",
    resident_not_eligible: "当前没有可用的本期参赛资格，本次操作没有执行。",
    registration_balance_insufficient:
      "金币不足，报名需要10000金币。本次没有报名，也没有扣报名费。",
    registration_payment_unconfirmed: paymentUnconfirmedText,
  };
  if (data.error) {
    return [
      knownErrors[data.error] ??
        "暂时无法确认这次操作的结果，请保留原编号，不要换一个编号重复提交。",
      ...(data.waitMessages ?? []),
      JSON.stringify(snowViewCall),
    ].join("\n");
  }
  const lines = [];
  lines.push(phaseText(data));
  const activeMatch = data.series?.matches[currentMatch(data)];
  if (activeMatch && data.phase === "lineup")
    lines.push(
      `本场${activeMatch.attackSide}队进攻、${activeMatch.attackSide === "A" ? "B" : "A"}队防守。`,
      JSON.stringify({ 比赛安排: [time(data.schedule.matchStartsAt[activeMatch.index])] }),
    );
  lines.push(...(data.waitMessages ?? []));
  if (data.discussion) lines.push(JSON.stringify({ discussion: data.discussion }));
  if (data.waiting) lines.push(JSON.stringify({ waiting: data.waiting }));
  if (data.participation?.length) lines.push(JSON.stringify({ participation: data.participation }));
  const ownTeam = data.series?.teams[data.viewer?.side];
  if (
    data.phase === "lineup" &&
    data.viewer.captain &&
    !data.viewer.lineupSubmitted &&
    ownTeam &&
    data.draft?.order.length === ownTeam.members.length &&
    data.draft.order.every(
      (id) => data.draft.skills[id]?.length === CFG.maxCommanderSkillsPerMember,
    ) &&
    data.discussion &&
    data.waiting?.lineupDeadlineAt &&
    !data.options.some((option) => option.action.kind === "lineup_confirm")
  )
    lines.push(
      `排阵草稿已填齐。赛前讨论将在${time(data.discussion.closesAt)}结束，结束后才能确认排阵；最迟请在${time(data.waiting.lineupDeadlineAt)}前确认。`,
    );
  if (ownTeam?.captainId)
    lines.push(
      `你在${data.viewer.side}队，本队队长是${memberName(data, ownTeam.captainId)}。本队成员：${ownTeam.members.map((member) => memberName(data, member.id)).join("、")}。`,
    );
  if (["scheduled", "registration", "awaiting_teams"].includes(data.phase)) {
    lines.push(JSON.stringify({ 比赛安排: data.schedule.matchStartsAt.map(time) }));
    if (data.rewardPlan)
      lines.push(
        JSON.stringify({
          单局奖励: data.rewardPlan.round,
          三场全勤奖励: data.rewardPlan.complete,
          冠军奖励: data.rewardPlan.champion,
        }),
      );
  }
  const current = data.series?.matches[currentMatch(data)];
  if (current?.locked)
    for (const round of current.rounds)
      lines.push(
        JSON.stringify({
          对阵: round.index + 1,
          进攻: memberName(data, round.attackMember),
          防守: memberName(data, round.defendMember),
          进攻配技: round.attackSkills?.map(skillName),
          防守配技: round.defendSkills?.map(skillName),
        }),
      );
  if (data.registration?.status === "pending" && data.registration.option) {
    lines.push(
      JSON.stringify({ op: "farm.together.choose", args: { option: data.registration.option } }),
    );
  }
  if (data.battle?.started) {
    for (const unit of data.battle.visibleUnits)
      lines.push(
        JSON.stringify({
          单位: unitDefinition(unit.typeKey).name,
          编号: unit.id,
          阵营: unit.side,
          路线: unit.lane,
          位置: unit.pos,
          生命: `${unit.hp}/${unit.maxHp}`,
          护盾: unit.shieldAmount,
          blockedBy: unit.blockedBy,
          blocking: unit.blocking,
          activeEffects: unit.activeEffects,
          ...(unit.unitSkillReadyInTicks === undefined
            ? {}
            : { 技能冷却剩余秒: unit.unitSkillReadyInTicks }),
        }),
      );
    for (const effect of data.battle.effects ?? [])
      lines.push(
        JSON.stringify({
          ...effect,
          生效至战斗秒: effect.untilTick,
          ...(effect.kind === "pierce" ? { 护甲倍率: effect.value } : {}),
          ...(effect.kind === "speed" ? { 速度倍率: effect.value } : {}),
        }),
      );
    for (const skill of data.battle.ownCommanderSkills)
      lines.push(JSON.stringify({ 技能: skillName(skill.skill), 冷却剩余秒: skill.readyInTicks }));
  }
  for (const [index, match] of (data.series?.matches ?? []).entries()) {
    for (const round of match.rounds.filter(
      (value) => value.winner && [value.attackMember, value.defendMember].includes(data.viewer?.id),
    )) {
      const reason =
        round.terminal?.reason === "core_broken"
          ? "提前攻破"
          : round.terminal?.reason === "time_limit"
            ? "限时守住"
            : null;
      if (reason)
        lines.push(
          `第${index + 1}场第${round.index + 1}局已结束，${round.winner}队获胜（${reason}）。`,
        );
    }
    if (match.winner)
      lines.push(
        `第${index + 1}场结束，局比分A队${match.rounds.filter((r) => r.winner === "A").length}：${match.rounds.filter((r) => r.winner === "B").length}B队，${match.winner}队赢得本场。`,
      );
  }
  if (data.series?.seriesWinner && data.phase !== "complete")
    lines.push(`${data.series.seriesWinner}队已取得两场胜利，冠军已确定；第三场仍按赛程进行。`);
  for (const reward of data.rewards ?? []) {
    const label =
      reward.kind === "round"
        ? `第${reward.matchIndex + 1}场第${reward.roundIndex + 1}局奖励`
        : reward.kind === "complete"
          ? "三场全勤奖励"
          : reward.kind === "champion"
            ? "冠军奖励"
            : "奖励";
    lines.push(
      `${label}：${reward.gold}金币、${reward.silver}银币，${reward.status === "paid" ? "已确认到账。" : "正在确认入账，尚未确认到账。"}`,
    );
    if (reward.status === "paid" && reward.decoration?.itemId === "farm_decor:snow_fort" && reward.decoration.quantity === 1)
      lines.push("限定家具：团团雪堡×1（已放入装修仓库）。");
  }
  if (data.phase === "complete" && data.rewardsSettled === true)
    lines.push("三场比赛与奖励结算已完成。");
  for (const option of data.options ?? []) {
    lines.push(`${option.option} · ${option.label}`);
    lines.push(
      JSON.stringify(
        option.call ?? { op: "farm.together.choose", args: { ...option.input, text: "<text>" } },
      ),
    );
  }
  if (!data.options?.length && data.phase !== "ended") lines.push(JSON.stringify(snowViewCall));
  for (const message of data.channel ?? [])
    lines.push(
      renderSnowChatMessage(
        members(data).find((member) => member.id === message.residentId)?.residentName ??
          message.residentId,
        message.text,
      ),
    );
  return lines.filter(Boolean).join("\n");
}

export function renderSnowChatMessage(residentName, text) {
  return JSON.stringify({ 发言者: residentName, 正文: text });
}

export function presentSnowResult(result) {
  if (!result) return undefined;
  const { rules: _rules, ...status } = result.data;
  const data = result.data.result
    ? {
        activityId: result.data.activityId,
        result: result.data.result,
        ...(result.data.replay ? { replay: true } : {}),
      }
    : result.data.section === "rules"
      ? result.data
      : status;
  return { ...result, data, text: renderSnowResult(data) };
}
