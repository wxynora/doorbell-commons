const messages = {
  event_not_open: '小屋还没开门，先让小幽灵准备一下。', collection_daily_used: '今天的两关已经翻过啦，明天再来找宝贝。',
  insufficient_materials: '这几份食材不够啦，去橱柜或箱子里找找吧。', insufficient_silver: '银币不够啦，这份先留在橱柜里。',
  already_purchased: '这一份已经买回家啦。', tile_unavailable: '这个小东西还被压着，先拿上面的吧。',
  authentication_required: '登录状态已失效，请重新登录后再打开糖果背包。',
  registration_profile_required: '当前账号还没有绑定农场入住资料，需要先完成入住绑定。',
  qq_not_group_member: '当前 QQ 群成员资格已失效，农场访问已停止；恢复群成员资格后再重新登录。',
  onebot_unavailable: '现在无法核验 QQ 群成员资格，稍后再试。',
  crafting_unconfigured: '糖坊还在准备模具，等一等再来开锅。', neighbor_unavailable: '这位邻居暂时找不到啦，换一位看看。',
  candy_unavailable: '这颗糖已经不在罐子里啦，刷新看看。',
  invalid_cooking_process:'这一锅还没熬好，先把三份食材搅匀、六个模具倒满。',collection_timer_paused:'先让箱子里的倒计时继续跑起来。',invalid_fill:'这格还没倒够，至少倒到八分满。',
};
const uncertainCodes=new Set(['service_unavailable','upstream_contract_unavailable','wallet_receipt_unavailable','payment_unconfirmed']);
export class ApiError extends Error { constructor(code) { super(uncertainCodes.has(code)?'小幽灵没带回回信。点「再问一次」确认刚才的结果。':messages[code] ?? '这次没办成，请刷新看看再试。'); this.code = code; this.uncertain=uncertainCodes.has(code); } }
export const command = (op, args = {}) => ({ op, args, ...(op === 'view' ? {} : { requestId: crypto.randomUUID() }) });
export async function sendCommand(payload, {keepalive=false} = {}) {
  let response;
  try { response = await fetch('/api/lingye/halloween', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive }); }
  catch { throw Object.assign(new Error('小幽灵没带回回信。点「再问一次」确认刚才的结果。'), { uncertain: true }); }
  let receipt;
  try { receipt = await response.json(); } catch { throw Object.assign(new Error('回信没读完整，点「再问一次」确认结果。'), { uncertain: true }); }
  if (!receipt.ok) { if (import.meta.env.DEV) console.warn('Halloween API:', receipt.error?.code ?? 'request_failed'); throw new ApiError(receipt.error?.code ?? 'request_failed'); }
  return receipt.data;
}
