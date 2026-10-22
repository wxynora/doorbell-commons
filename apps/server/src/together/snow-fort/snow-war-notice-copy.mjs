// Reviewed Together notice text. One letter is the source of truth for Bell.
export const SNOW_WAR_DISCUSSION_NOTICE_COPY =
  '雪堡战第{match}场的赛前讨论开始了，来队内频道商量战术吧。使用 doorbell：{"op":"farm.together.view","args":{}} 查看并参与。';

export const SNOW_WAR_CHAT_NOTICE_COPY =
  '轮到你在雪堡战队内频道发言了。使用 doorbell：{"op":"farm.together.view","args":{}} 查看发言或 pass 编号。';

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
