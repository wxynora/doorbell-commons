import { randomUUID } from 'node:crypto';
import { MidAutumnService, MidAutumnError } from './service.js';
import { DIY_OPTIONS } from './scoring.js';
import { OPENS_AT, CLOSES_AT } from './catalog.js';
import { midAutumnSeedEntryText } from '../mid-autumn-seeds.js';

export const isMidAutumnOption = option => typeof option === 'string' && (option === '中秋' || option.startsWith('中秋:'));
const call = option => `doorbell(${JSON.stringify({op:'farm.together.choose',args:{option}})})`;
const OPENING = '中秋快到了，铃野的邻居们正好有几份委托，帮他们做完，也许能获得一些做月饼礼盒的食材。';
const ENDING = '最后一张委托纸收进抽屉，食材、模具和印纹都备好了。桌上还留着一只空礼盒，现在可以做属于你自己的月饼礼盒了，送给你想念的那个ta。';
export const midAutumnActivityStatusText = now =>
  now >= OPENS_AT && now < CLOSES_AT
    ? `🌕 中秋特别活动《月满心间》已开放。使用 ${call('中秋')} 进入；月饼制作与赠送都在这里。`
    : '';
export const midAutumnEntryText = (now, farm) => [
  now >= OPENS_AT && now < CLOSES_AT ? `【下一步】\n中秋特别版《月满心间》\n${call('中秋')}` : '',
  midAutumnSeedEntryText(now, farm),
].filter(Boolean).join('\n');
const cakeText = cake => `${DIY_OPTIONS.fillings[cake.filling]}·${cake.shape}·${cake.pattern}·火候${cake.bake}·${cake.yolk ? '加蛋黄' : '不加蛋黄'}`;
export function renderMidAutumnReceipt(result, view, options, operation = 'view') {
  const lines = ['🧭 铃野共行｜中秋特别版《月满心间》'];
  if (result.cakeId) lines.push(`【制作结果】\n${result.cakeId}`);
  if (result.score !== undefined) lines.push(`【制作结果】\n${result.score}分\n${result.feedback ?? ''}`.trim());
  if (result.sentAt !== undefined) lines.push('赠送成功');
  else if (result.boxId && result.orderId === undefined) lines.push('装盒成功');
  if (result.reward?.coins !== undefined) lines.push(`1314 金币、520 银币、称号「月满心间」`);
  if (operation === 'begin' && result.started) lines.push('已进入月饼任务');
  if (operation === 'restock' && result.restocked) lines.push('食材已补足');
  if (operation === 'accept' && result.accepted === true && result.orderId) lines.push(`已接取：${result.orderId}`);
  if (operation === 'choose_stamp' && result.pattern) lines.push(`印纹已解锁：${result.pattern}`);
  if (operation === 'unpack' && result.unpackedBoxId) lines.push('礼盒已拆开');
  if (operation === 'deliver' && view.orders.length && view.orders.every(order => order.completed)) lines.push(ENDING);
  const sentGifts = (view.gifts ?? []).filter(box => box.status === 'sent');
  if (sentGifts.some(box => box.side === 'human')) lines.push('🥮你的人类送了你一盒月饼');
  if (view.phase !== 'open' || view.destination === 'memorial') {
    if (sentGifts.length) lines.push('纪念册', ...sentGifts.map(box => [box.letter, box.cakes.map(c=>cakeText(c.cake)).join('\n')].filter(Boolean).join('\n')));
    if (!sentGifts.length) lines.push(view.phase === 'ended' || view.destination === 'memorial' ? '纪念册' : '活动尚未开放');
    return lines.join('\n\n');
  }
  if (operation !== 'view') {
    lines.push(`【下一步】\n读取当前状态\n${call('中秋')}`);
    return lines.join('\n\n');
  }
  const orders = view.orders.filter(o=>o.available);
  if (orders.length) lines.push('【当前委托】\n'+orders.map(o=>`${o.id}：${o.request}\n${o.size}枚${o.size===4?'礼盒':''} · ${o.accepted?'已接取':'未接取'}`).join('\n\n'));
  const next=[];
  if (!view.started) {
    lines.push(OPENING);
    next.push(`开始\n${call(options.begin)}`);
  }
  else {
    const traits=view.options.traits;
    const tags=(group,item)=> (traits[group].find(t=>group==='fillings'?t.id===Number(item.code.slice(1))-1:t.name===item.name)?.tags ?? []).join('、');
    lines.push('【月饼搭配】\n'+[
      '口味：'+options.cook.A.map(x=>`${x.code} ${x.name}（${tags('fillings',x)}）`).join('；'),
      '外形：'+options.cook.B.map(x=>`${x.code} ${x.name}（${tags('shapes',x)}）`).join('；'),
      view.options.stages.pattern ? '印纹：'+options.cook.C.map(x=>`${x.code} ${x.name}`).join('；') : '',
      view.options.stages.bake ? '火候：D后填0～100；D75为火候75，偏金棕色。' : '',
      view.options.yolk ? '蛋黄：E0不加蛋黄；E1加蛋黄，增加浓郁度、降低甜度与清淡度。' : '',
    ].filter(Boolean).join('\n'));
    if(options.cook.A.length&&options.cook.B.length) next.push(`制作：按上面的代号替换组合\n${call(options.cook.prefix+[options.cook.A[0].code,options.cook.B[0].code,...(view.options.stages.pattern?[options.cook.C[0].code]:[]),...(view.options.stages.bake?['D75']:[]),...(view.options.yolk?['E0']:[])].join('+'))}`);
    next.push(`补充食材\n${call(options.restock)}`);
  }
  const acceptOptions=options.accept.filter(entry=>!orders.find(order=>order.id===entry.orderId)?.accepted);
  if(acceptOptions.length) next.push(`【接取委托】\n${acceptOptions.map(entry=>`${entry.orderId}：${call(entry.option)}`).join('\n')}`);
  const packedBoxes=view.gifts.filter(box=>box.side==='ai'&&box.status==='packed');
  const canReview=orders.some(order=>order.accepted&&(order.size===1?view.cakes.length>0:packedBoxes.length>0));
  if(canReview) next.push(`【评分预览与交付】\n评分预览：${call(options.preview.prefix+'<委托编号>+<成品编号或礼盒编号>')}\n交付：${call(options.deliver.prefix+'<委托编号>+<成品编号或礼盒编号>')}`);
  if(view.cakes.length) lines.push('【制作结果】\n'+view.cakes.map((c,i)=>`${i+1}. ${cakeText(c.cake)}\n${c.id}`).join('\n'));
  const giftOptions=[];
  for(const box of options.boxes) giftOptions.push(`礼盒 ${box.boxId}\n赠送\n${call(box.send)}\n拆盒\n${call(box.unpack)}`);
  if(view.cakes.length>=4) giftOptions.push(`装盒：选择四枚成品；附信时在末尾加 | 和来信正文。\n${call(options.pack.prefix+view.cakes.slice(0,4).map(c=>c.id).join('+'))}`);
  if(view.orders.length && view.orders.every(order=>order.completed)) next.unshift(...giftOptions);
  else next.push(...giftOptions);
  lines.push('【下一步】\n'+next.join('\n\n'));
  return lines.join('\n\n');
}
const invalid = () => { throw new MidAutumnError('invalid_request', 400); };

export function decodeMidAutumnOption(option) {
  if (option === '中秋') return { op: 'view', args: {} };
  const parts = /^中秋:([^:]+):([^:]+):([\s\S]*)$/.exec(option);
  if (!parts) invalid();
  const [, op, requestId, payload] = parts;
  if (op !== 'pack' && payload.includes(':')) invalid();
  let args;
  if (['view','memorial','begin','restock'].includes(op)) {
    if (payload) invalid();
    args = {};
  } else if (op === 'cook') {
    const match = /^A([1-4])\+B([1-3])(?:\+C([1-9]|1[0-8]))?(?:\+D(100|[1-9]?\d))?(?:\+E([01]))?$/.exec(payload);
    if (!match) invalid();
    args = { cake: { filling: Number(match[1])-1, shape: DIY_OPTIONS.shapes[Number(match[2])-1],
      pattern: match[3] ? DIY_OPTIONS.patterns[Number(match[3])-1] : '无', bake: match[4] === undefined ? 75 : Number(match[4]), yolk: match[5] === '1' } };
  } else if (op === 'accept') args = { orderId: payload };
  else if (op === 'choose_stamp') {
    const match = /^C([1-9]|1[0-8])$/.exec(payload);
    if (!match) invalid();
    args = { pattern: DIY_OPTIONS.patterns[Number(match[1])-1] };
  } else if (['send','unpack'].includes(op)) args = { boxId: payload };
  else if (['preview','deliver'].includes(op)) {
    const [orderId, id, ...extra] = payload.split('+');
    if (!id || extra.length) invalid();
    args = ['variety','matching'].includes(orderId) ? {orderId,boxId:id} : {orderId,cakeIds:[id]};
  } else if (op === 'pack') {
    const separator = payload.indexOf('|');
    const ids = (separator < 0 ? payload : payload.slice(0, separator)).split('+');
    if (ids.length !== 4 || ids.some(id => !id || id.includes(':'))) invalid();
    args = { cakeIds: ids, letter: separator < 0 ? '' : payload.slice(separator + 1) };
  } else invalid();
  return {op,args,requestId};
}

export function runMidAutumnTogether(database, farmId, option, now, opensAt = null, serviceFactory = (db, options) => new MidAutumnService(db, options)) {
  try {
    const service = serviceFactory(database, {opensAt});
    const command = decodeMidAutumnOption(option);
    const result = service.execute({farmId,side:'ai',...command},now);
    const view = command.op === 'memorial' ? result : service.execute({farmId,side:'ai',op:'view'},now);
    const prefix = op => `中秋:${op}:${randomUUID()}:`;
    const options = view.phase === 'open' && view.destination !== 'memorial' ? {
      begin: prefix('begin'), restock: prefix('restock'),
      cook: { prefix: prefix('cook'), format: 'A1+B1+C1+D75+E0',
        A: view.options.fillings.map(({id,name})=>({code:`A${id+1}`,name})),
        B: view.options.shapes.map(name=>({code:`B${DIY_OPTIONS.shapes.indexOf(name)+1}`,name})),
        C: view.options.patterns.map(name=>({code:`C${DIY_OPTIONS.patterns.indexOf(name)+1}`,name})),
        D: view.options.bake, E: view.options.yolk ? [0,1] : [0] },
      accept: view.orders.filter(order=>order.available).map(order=>({orderId:order.id,option:prefix('accept')+order.id})),
      preview: {prefix:prefix('preview'),format:'orderId+cakeId_or_boxId'},
      deliver: {prefix:prefix('deliver'),format:'orderId+cakeId_or_boxId'},
      pack: {prefix:prefix('pack'),format:'cakeId+cakeId+cakeId+cakeId|来信正文'},
      boxes: view.gifts.filter(box=>box.side==='ai'&&box.status==='packed').map(box=>({boxId:box.id,send:prefix('send')+box.id,unpack:prefix('unpack')+box.id})),
    } : {};
    return {status:200,json:{ok:true,text:renderMidAutumnReceipt(result,view,options,command.op)}};
  } catch(error) {
    if (error instanceof MidAutumnError) return {status:error.status,json:{ok:false,code:error.code,text:error.code}};
    throw error;
  }
}
