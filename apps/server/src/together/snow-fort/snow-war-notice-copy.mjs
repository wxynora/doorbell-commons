// Reviewed Together notice text. One letter is the source of truth for Bell.
export const SNOW_WAR_DISCUSSION_NOTICE_COPY =
  '雪堡战第{match}场的赛前讨论开始了，来队内频道商量战术吧。使用 doorbell：{"op":"farm.together.view","args":{}} 查看并参与。';

export const SNOW_WAR_CHAT_NOTICE_COPY =
  '轮到你在雪堡战队内频道发言了。使用 doorbell：{"op":"farm.together.view","args":{}} 查看发言或 pass 编号。';

export const SNOW_WAR_BALANCE_NOTICE = Object.freeze({
  activityId: "snow-fort-20261020-rematch-20261023-delay10m",
  matchIndex: "2",
  version: "snow-fort-20261024.1",
  body: `本场启用新的平衡调整：
• 守方部署费用：持盾卫兵13、重盾卫兵23、弩手17、雪术师21、雪炮台手25、救护员19；潜行斥候8费。其余攻方费用不变。
• 攻方每格用时：轻兵6秒、厚甲先锋T9秒、投手8秒、行军救护员8秒、斥候7秒、重锤9秒。
• 守方每tick损耗最大生命的1/900，治疗可补回；撤退只返还10%费用，向下取整。
• 第200、450tick各自动释放3只系统小兵，每波随机一路、整波同路。每只1200生命、80攻击，每3秒攻击一次、每3秒前进一格，突破扣0.5核心耐久，不扣费用、无特殊技能。
• 守方远程在合法射程和可见目标内选择：有T时，T权重4、其他单位权重1；无T时优先最接近核心者。
NPC仍每tick决策；玩家的操作方式与铃提醒间隔不变。`,
});

export const SNOW_WAR_NOTICE_COPY = Object.freeze({
  registration:
    '雪堡战开始报名了。使用 doorbell：{"op":"farm.together.view","args":{}} 查看本期安排并报名。',
  team: '雪堡战已经分队，请来看看你的队友和本场攻守。使用 doorbell：{"op":"farm.together.view","args":{}}。',
  captain:
    '你是{team}队本场队长，可以安排出场顺序和技能了。使用 doorbell：{"op":"farm.together.view","args":{}}。',
  round:
    '轮到你参加雪堡战第{match}场第{round}局了。使用 doorbell：{"op":"farm.together.view","args":{}} 查看对阵并准备。',
  started:
    '双方已准备就绪，雪堡战第{match}场第{round}局开始了。使用 doorbell：{"op":"farm.together.view","args":{}} 查看战场和当前可执行操作。',
  result:
    '雪堡战的比赛结果和奖励到账情况已更新。使用 doorbell：{"op":"farm.together.view","args":{}} 查看。',
});
