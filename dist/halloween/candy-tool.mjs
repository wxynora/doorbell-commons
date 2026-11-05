import { randomUUID } from 'node:crypto';
import { HalloweenError } from './service.mjs';

const PREFIX = '万圣节';
const CANDY_TITLE = '🍬 糖果';
const CANDY_EXPLANATION = '小幽灵把祝福和恶作剧藏进了糖里，吃下才揭晓。谁吃下，效果就落在谁身上。';
const text = value => typeof value === 'string' && value.trim().length > 0;
const call = option => `doorbell(${JSON.stringify({ op: 'farm.together.choose', args: { option } })})`;

export const isHalloweenCandyEatOption = option => typeof option === 'string' &&
  option.startsWith(`${PREFIX}:eat:`);

function decodeCandyEatOption(option) {
  if (!isHalloweenCandyEatOption(option)) throw new HalloweenError('invalid_request', 400);
  const match = /^万圣节:eat:([^:]+):([\s\S]*)$/u.exec(option);
  if (!match || !text(match[1])) throw new HalloweenError('invalid_request', 400);
  let args;
  try { args = JSON.parse(decodeURIComponent(match[2])); }
  catch { throw new HalloweenError('invalid_request', 400); }
  if (!args || typeof args !== 'object' || Array.isArray(args) || !text(args.candyId) ||
      Object.keys(args).some(key => !['candyId', 'target'].includes(key)) ||
      (Object.hasOwn(args, 'target') && !['self', 'other'].includes(args.target)))
    throw new HalloweenError('invalid_request', 400);
  return { requestId: match[1], args };
}

function actionOption(candyId, target, generateId) {
  const args = { candyId, target };
  return `${PREFIX}:eat:${generateId()}:${JSON.stringify(args)}`;
}

function inventoryLine(candy) {
  return `${candy.appearance.name}${candy.senderName ? `（${candy.senderName}送的）` : ''}｜${candy.id}`;
}

function eatOptions(generateId) {
  return [
    `自己吃：${call(actionOption('', 'self', generateId))}`,
    `喂ta吃：${call(actionOption('', 'other', generateId))}`,
  ].join('\n');
}

function renderEffect(effect) {
  const percent = Math.round(Math.abs(effect.value) * 100);
  if (effect.kind === 'harvest_gold') return `下一块亲自收获的地，本次基础金币多${percent}%。`;
  if (effect.kind === 'human_harvest_gold') return `下一次收菜（包括帮收），这株作物的基础金币多${percent}%。`;
  if (effect.kind === 'human_ranch_yield') return `下一次收牧场产物，这只动物的产物数量多${percent}%。`;
  if (effect.kind === 'human_cook_extra') return `下一次成功做出正常料理，额外得到${effect.value}份同样的料理。`;
  if (effect.kind === 'human_block_harvest') return '接下来2小时，暂时不能收菜或帮收。';
  if (effect.kind === 'human_block_ranch_collect') return '接下来2小时，暂时不能收取牧场产物。';
  if (effect.kind === 'human_block_cook') return '接下来2小时，暂时不能做饭。';
  if (effect.kind === 'human_block_dispatch') return '接下来2小时，暂时不能派遣动物。';
  if (effect.kind === 'plant_time') return `下一株亲自播种的作物，基础总生长时间缩短${percent}%。`;
  if (effect.kind === 'plant_time_add') return `下一株亲自播种的作物，基础总生长时间延长${percent}%。`;
  if (effect.kind === 'fishing_junk') return `下一次常规钓鱼，杂物概率变为原来的${percent}%。`;
  if (effect.kind === 'fishing_junk_add') return `下一次常规钓鱼，杂物概率增加${percent}个百分点。`;
  if (effect.kind === 'dog_block_probability_add') return `下一次遇到看家狗时，它拦住你的概率增加${percent}个百分点。`;
  if (effect.kind === 'theft_caught_gold') return '下一次偷菜被抓，额外掉200金币；不够就只掉现有的。';
  throw new TypeError('invalid_effect');
}

function renderEatReceipt(result) {
  const effect = renderEffect(result.effect);
  return result.target === 'other'
    ? `咔嚓！ta吃下了这颗糖：${effect.replace(/。$/u, '')}。`
    : `咔嚓！这颗糖的小秘密是：${effect}`;
}

function renderEffectExpiry(entry) {
  const date = new Date(entry.expiresAt + 8 * 60 * 60 * 1000);
  const until = `${date.getUTCMonth() + 1}月${date.getUTCDate()}日${date.getUTCHours()}时${String(date.getUTCMinutes()).padStart(2, '0')}分`;
  return `等待生效：${renderEffect(entry.effect)}｜有效至北京时间${until}`;
}

function eatErrorText(error) {
  if (error?.code === 'candy_unavailable') return '这颗糖已经不在了，请从农场背包重新挑一颗。';
  if (error?.code === 'receipt_conflict') return '这张小纸条已经用过啦，请从农场背包重新挑一颗糖。';
  if (error?.code === 'invalid_request') return CANDY_TITLE;
  if (error?.status >= 500) return '小屋的门暂时没敲开，过会儿再来试试吧。';
  return CANDY_TITLE;
}

export function createHalloweenCandyTool({ service, generateId = randomUUID } = {}) {
  if (!service || typeof service.execute !== 'function' || typeof service.store?.availableCandies !== 'function' ||
      typeof generateId !== 'function') throw new TypeError('halloween_candy_tool_unavailable');
  return Object.freeze({
    execute({ farmId, option, now = Date.now() }) {
      if (!text(farmId) || !Number.isSafeInteger(now) || !isHalloweenCandyEatOption(option))
        return { status: 400, json: { ok: false, code: 'invalid_request', text: CANDY_TITLE } };
      try {
        const command = decodeCandyEatOption(option);
        const result = service.execute({ farmId, side: 'ai', op: 'eat', ...command }, now);
        return { status: 200, json: { ok: true, text: renderEatReceipt(result) } };
      } catch (error) {
        if (!(error instanceof HalloweenError)) throw error;
        return { status: error.status, json: { ok: false, code: error.code, text: eatErrorText(error) } };
      }
    },
    bagEntry({ farmId, now = Date.now() }) {
      if (!text(farmId) || !Number.isSafeInteger(now)) return '';
      const view = service.view(farmId, now, 'ai');
      if (!view.candies.length && !view.effects.length) return '';
      const lines = [CANDY_TITLE, CANDY_EXPLANATION, ...view.candies.map(inventoryLine),
        ...view.effects.map(renderEffectExpiry)];
      if (view.candies.length) lines.push(eatOptions(generateId));
      return lines.join('\n');
    },
  });
}
