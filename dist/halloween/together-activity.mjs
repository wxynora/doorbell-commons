import { randomUUID } from 'node:crypto';
import { HalloweenError, beijingDay } from './service.mjs';
import { ReceiptConflictError, canonical } from './store.mjs';
import { parseSemanticCraftCombination } from './cooking-rules.mjs';

const PREFIX = '万圣节';
const HOME = '🎃 糖果大作战\n女巫打开了橱柜，坩埚已经咕嘟上了。小幽灵们正忙着把糖果偷偷塞进邻居的盒子。';
const PAGE = Object.freeze({
  shop: '🗝️ 女巫的橱柜\n缺哪一味，就来柜子里找找。每种食材整场可买一包，每包有3份。',
  craft: '🫕 咕嘟糖坊\n看糖坊里的食材、合适时机和模具，挑好一锅，用一个「制作」组合交上去；三份食材各自的时机和模具都放在同一条里。',
  candies: '🍬 门前的糖果盒\n自己做的、邻居送的，都在这里。糖果名后的括号里，写着是谁送来的。',
  materials: '🎒 材料背包\n翻翻口袋，看看今天攒了哪些稀奇食材。',
  attic: '🕯️ 女巫家的阁楼\n拎好小灯，上楼寻宝去。今天这一趟，从12步开始。',
});
const call = option => `doorbell(${JSON.stringify({ op: 'farm.together.choose', args: { option } })})`;
const pageOption = page => `${PREFIX}:page:${page}`;
const returnHome = () => `返回糖果大作战：${call(PREFIX)}`;
const ATTIC_RULE = '碰到新楼梯、待选奇遇，或步数用完时会停下；后半段路线留给你重新决定。楼梯就在脚下时，上楼不花步，还补4步。';
const CANDY_EXPLANATION = '小幽灵把祝福和恶作剧藏进了糖里，吃下才揭晓。谁吃下，效果就落在谁身上。';
const CANDY_RULE = '吃下才揭晓，一颗管下一次适用动作，24小时内有效；同一个目标不叠加多颗。';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const ACTIONS = new Set(['view', 'explore_start', 'explore_move', 'explore_ascend', 'explore_end', 'craft', 'buy', 'gift', 'eat']);
const CONTINUATION_PAGE = Object.freeze({ buy: 'shop', craft: 'candies', gift: 'candies', eat: 'candies',
  explore_start: 'attic', explore_move: 'attic', explore_ascend: 'attic', explore_end: 'attic' });

export const isHalloweenOption = option => typeof option === 'string' &&
  (option === PREFIX || option.startsWith(`${PREFIX}:`));

export function isHalloweenMutationOption(option) {
  if (!isHalloweenOption(option)) return false;
  try {
    const command = decodeHalloweenOption(option);
    return typeof command.op === 'string' && command.op !== 'view';
  } catch { return false; }
}

function makeActionOption(op, args, generateId) {
  return `${PREFIX}:${op}:${generateId()}:${JSON.stringify(args)}`;
}

export function decodeHalloweenOption(option) {
  if (option === PREFIX) return { page: 'home' };
  const page = /^万圣节:page:([^:]+)(?::([\s\S]*))?$/.exec(option);
  if (page) {
    if (page[1] === 'doorstep') {
      let giftTarget;
      try { giftTarget = decodeURIComponent(page[2] ?? ''); }
      catch { throw new HalloweenError('invalid_request', 400); }
      if (!text(giftTarget)) throw new HalloweenError('invalid_request', 400);
      return { page: 'doorstep', giftTarget };
    }
    if (page[2] !== undefined || !['shop', 'craft', 'candies', 'materials', 'attic'].includes(page[1]))
      throw new HalloweenError('invalid_request', 400);
    return { page: page[1] };
  }
  const match = /^万圣节:([^:]+):([^:]+):([\s\S]*)$/.exec(option);
  if (!match || !ACTIONS.has(match[1]) || !text(match[2])) throw new HalloweenError('invalid_request', 400);
  if (match[1] === 'craft') {
    try {
      return { op: 'craft', requestId: match[2], args: parseSemanticCraftCombination(decodeURIComponent(match[3])) };
    } catch {
      throw new HalloweenError('invalid_request', 400);
    }
  }
  let args;
  try { args = JSON.parse(decodeURIComponent(match[3])); }
  catch { throw new HalloweenError('invalid_request', 400); }
  if (!record(args)) throw new HalloweenError('invalid_request', 400);
  return { op: match[1], requestId: match[2], args };
}

const materialList = materials => Object.entries(materials ?? {}).filter(([, quantity]) => quantity > 0)
  .map(([name, quantity]) => `${name}×${quantity}`).join('、');
const candyInventoryLine = candy => `${candy.appearance.name}${candy.senderName ? `（${candy.senderName}送的）` : ''}｜${candy.id}`;
const eatOptions = generateId => [
  `自己吃：${call(makeActionOption('eat', { candyId: '', target: 'self' }, generateId))}`,
  `喂ta吃：${call(makeActionOption('eat', { candyId: '', target: 'other' }, generateId))}`,
].join('\n');

function readDailyStatusFacts(service, farmId, now) {
  if (!text(farmId) || !Number.isSafeInteger(now)) return null;
  const day = beijingDay(now);
  const state = service.store.load(farmId);
  const run = state.exploration;
  const runIsToday = run?.day === day;
  const clearedStages = [1, 2].filter(stage => {
    if (state.collectionRewardClaims?.[day]?.[String(stage)]) return true;
    const collection = state.collection;
    if (state.collectionRewardClaimsVersion === 1 || collection?.day !== day ||
        !Number.isSafeInteger(collection.stage)) return false;
    const clearedThrough = collection.sessionStatus === 'complete' || collection.status === 'complete'
      ? collection.stage : collection.stage - 1;
    return stage <= clearedThrough;
  }).length;
  const sentToday = Object.values(state.deliveredToByDay?.[day] ?? {}).reduce(
    (sum, count) => sum + (Number.isSafeInteger(count) && count > 0 ? count : 0), 0);
  const receivedUnconsumed = service.store.availableCandies(farmId)
    .filter(candy => text(candy.senderName)).length;
  return {
    explorationUses: runIsToday ? 1 : 0,
    explorationState: run?.status === 'active' ? 'in_progress'
      : runIsToday && run.status === 'finished' ? 'finished' : 'not_started',
    collectionStagesCleared: clearedStages,
    candiesSentToday: sentToday,
    receivedUnconsumed,
  };
}

function mapText(run, { includeGuide = true } = {}) {
  if (!run) return '';
  const rows = [];
  for (let row = 0; row < run.rows; row++) {
    const cells = [];
    for (let column = 0; column < run.columns; column++) {
      const index = row * run.columns + column;
      const cell = run.cells[index];
      cells.push(index === run.position ? '🤖' : cell.kind === 'stairs' ? '✨' : cell.visited ? '○' : '？');
    }
    rows.push(cells.join(' '));
  }
  const guide = includeGuide
    ? '\n地图图例：🤖你在这儿 · ○来过 · ？还没看 · ✨可以上楼\n行、列从1开始；上下左右走一格，花一步。'
    : '';
  return `第${run.floor}层｜余${run.steps}步\n${rows.join('\n')}${guide}`;
}

function sampleRoute(run) {
  const directions = [['right', 0, 1], ['down', 1, 0], ['left', 0, -1], ['up', -1, 0]];
  const visited = new Set(run.cells.filter(cell => cell.visited).map(cell => cell.index));
  const stairs = new Set(run.cells.filter(cell => cell.visited && cell.kind === 'stairs').map(cell => cell.index));
  const route = [];
  let position = run.position;
  while (visited.size < run.cells.length) {
    const queue = [position];
    const previous = new Map([[position, null]]);
    let target;
    for (let i = 0; i < queue.length && target === undefined; i++) {
      const current = queue[i], row = Math.floor(current / run.columns), column = current % run.columns;
      for (const [direction, dr, dc] of directions) {
        const nextRow = row + dr, nextColumn = column + dc;
        if (nextRow < 0 || nextRow >= run.rows || nextColumn < 0 || nextColumn >= run.columns) continue;
        const next = nextRow * run.columns + nextColumn;
        if (previous.has(next) || stairs.has(next)) continue;
        previous.set(next, { from: current, direction });
        if (!visited.has(next)) { target = next; break; }
        queue.push(next);
      }
    }
    if (target === undefined) break;
    const path = [];
    for (let cell = target; cell !== position;) {
      const step = previous.get(cell);
      path.push({ cell, direction: step.direction });
      cell = step.from;
    }
    for (const step of path.reverse()) {
      const last = route.at(-1);
      if (last?.direction === step.direction) last.distance++;
      else route.push({ direction: step.direction, distance: 1 });
      position = step.cell;
      visited.add(position);
    }
  }
  if (route.length) return route;
  const row = Math.floor(position / run.columns), column = position % run.columns;
  const next = directions.find(([, dr, dc]) => row + dr >= 0 && row + dr < run.rows &&
    column + dc >= 0 && column + dc < run.columns && !stairs.has((row + dr) * run.columns + column + dc));
  return [{ direction: next[0], distance: 1 }];
}

function defaultSemanticCombination(crafting) {
  let remaining = crafting.unitsPerBatch;
  const additions = [];
  for (const item of crafting.materials) {
    const take = Math.min(item.quantity, remaining);
    for (let index = 0; index < take; index++)
      additions.push(`${item.code}${item.suitableTime.code}`);
    remaining -= take;
    if (!remaining) break;
  }
  if (remaining || !crafting.molds.length) return null;
  return `${additions.join('+')}+${crafting.molds[0].code}`;
}

function rewardSource(id, { service, farmId, now }) {
  const prefix = `${service.options.eventId}:${farmId}`;
  if (id === `${prefix}:daily:${beijingDay(now)}`) return 'daily';
  if (service.options.rewards?.milestones?.some(item => id === `${prefix}:milestone:${item.threshold}`)) return 'milestone';
  return null;
}

function rewardProgress(view, service) {
  const threshold = service?.options.rewards?.dailyThreshold;
  if (!Number.isSafeInteger(threshold)) return '';
  return `今日送出：${view.deliveredToday}／${threshold}颗；累计送出：${view.deliveredTotal}颗。`;
}

function rewardTable(view, { service, farmId, now }) {
  const policy = service?.options.rewards;
  if (!policy) return [];
  const rows = new Map((view.rewards ?? []).map(row => [row.id, row]));
  const prefix = `${service.options.eventId}:${farmId}`;
  const status = (id, count, threshold) => {
    const row = rows.get(id);
    if (row?.status === 'paid') return '已到账';
    if (row?.status === 'pending') return '待到账';
    return count < threshold ? '未达成' : null;
  };
  const result = [];
  const daily = status(`${prefix}:daily:${beijingDay(now)}`, view.deliveredToday, policy.dailyThreshold);
  if (daily) result.push(`今日送出${policy.dailyThreshold}颗：${renderReward(policy.daily, { titles: service.options.titles })}｜${daily}`);
  for (const milestone of policy.milestones) {
    const achieved = status(`${prefix}:milestone:${milestone.threshold}`, view.deliveredTotal, milestone.threshold);
    if (achieved) result.push(`累计送出${milestone.threshold}颗：${renderReward(milestone.reward, { titles: service.options.titles })}｜${achieved}`);
  }
  return result;
}

function renderHome(view, context = {}) {
  const progress = rewardProgress(view, context.service);
  const rewards = context.service ? rewardTable(view, context) : [];
  return [HOME,
    `${PAGE.attic}\n${call(pageOption('attic'))}`,
    `${PAGE.shop}\n${call(pageOption('shop'))}`,
    `${PAGE.craft.split('\n')[0]}\n${call(pageOption('craft'))}`,
    `${PAGE.candies}\n${call(pageOption('candies'))}`,
    `${PAGE.materials}\n${call(pageOption('materials'))}`,
    `材料：${materialList(view.materials) || '—'}\n糖果：${view.candies.length}`,
    ...(progress ? [progress, rewards.join('\n')] : []),
  ].join('\n\n');
}

function upcomingText(opensAt) {
  const beijing = new Date(opensAt + 8 * 60 * 60 * 1000);
  return `🎃 女巫还在收拾橱柜，${beijing.getUTCMonth() + 1}月${beijing.getUTCDate()}日开门。`;
}

function renderPage(page, view, { farmId, service, generateId, now, giftTarget }) {
  if (view.phase === 'upcoming') return upcomingText(service.options.opensAt);
  if (view.phase === 'ended' && page !== 'candies')
    return `🎃 女巫收摊啦。糖果和礼物都替你收好了，想吃的时候，随时拆一颗。\n\n${call(pageOption('candies'))}`;
  if (!['open', 'ended'].includes(view.phase)) throw new HalloweenError('event_window_unconfigured', 503);
  if (page === 'home') return renderHome(view, { farmId, service, now });
  if (page === 'materials') return `${PAGE.materials}\n${materialList(view.materials) || '—'}\n\n${returnHome()}`;
  if (page === 'shop') {
    const purchased = new Set(view.purchases);
    const catalog = view.catalog.map(item => {
      const price = Number.isSafeInteger(item.price) && item.price > 0 ? `${item.price}银` : '—';
      const status = purchased.has(item.name) ? '｜已购' : '';
      return `${item.name}｜${item.tier}｜${price}${status}`;
    });
    const canBuy = view.catalog.some(item => !purchased.has(item.name) &&
      Number.isSafeInteger(item.price) && item.price > 0);
    const buy = canBuy ? `\n${call(makeActionOption('buy', { material: '' }, generateId))}` : '';
    return `${PAGE.shop}\n${catalog.join('\n')}${buy}\n\n${returnHome()}`;
  }
  if (page === 'craft') {
    const crafting = view.crafting;
    if (!crafting) return `${PAGE.craft}\n\n${returnHome()}`;
    const materials = crafting.materials.map(item =>
      `${item.code} ${item.material}×${item.quantity}｜合适时机：${item.suitableTime.code} ${item.suitableTime.name}`).join('；');
    const phases = crafting.phases.map(item => `${item.code} ${item.name}`).join('｜');
    const molds = crafting.molds.map(item => `${item.code} ${item.name}`).join('｜');
    const combination = defaultSemanticCombination(crafting);
    const example = combination ? `\n组合例子：${combination}` : '';
    const callToCraft = combination
      ? `\n制作：\n${call(`万圣节:craft:${generateId()}:${combination}`)}` : '';
    const rule = `每锅用${crafting.unitsPerBatch}份食材，做出${crafting.candiesPerBatch}颗糖；材料从口袋里实打实扣。`;
    return `${PAGE.craft}\n${rule}\n这一锅怎么搭：${materials || '—'}\n时机：${phases}\n模具：${molds}${example}${callToCraft}\n\n${returnHome()}`;
  }
  if (page === 'candies' || page === 'doorstep') {
    const candies = view.candies.map(candyInventoryLine);
    const neighbors = service.options.listNeighbors?.({ farmId }) ?? [];
    const target = page === 'doorstep'
      ? neighbors.find(neighbor => neighbor.doorplate === giftTarget)
      : undefined;
    if (page === 'doorstep' && !target) throw new HalloweenError('neighbor_unavailable', 404);
    const hasCandies = view.candies.length > 0;
    const eat = page === 'candies' && hasCandies ? `\n${eatOptions(generateId)}` : '';
    const giftNeighbors = target ? [target] : neighbors;
    const gift = view.phase === 'open' && hasCandies && giftNeighbors.length
      ? `\n打包送到谁家：${giftNeighbors.map(neighbor => `${neighbor.name}（${neighbor.doorplate}）`).join('、')}\n${call(makeActionOption('gift', {
        candyIds: [], doorplate: target?.doorplate ?? '',
      }, generateId))}` : '';
    const effects = (view.effects ?? []).map(entry => {
      const date = new Date(entry.expiresAt + 8 * 3600000);
      const until = `${date.getUTCMonth() + 1}月${date.getUTCDate()}日${date.getUTCHours()}时${String(date.getUTCMinutes()).padStart(2, '0')}分`;
      return `等待生效：${renderEffect(entry.effect)}｜有效至北京时间${until}`;
    });
    const progress = rewardProgress(view, service);
    return [PAGE.candies, CANDY_EXPLANATION, CANDY_RULE, candies.join('\n') || '—', ...effects,
      ...(progress ? [progress] : []), `${eat}${gift}`.trim(), returnHome()].filter(Boolean).join('\n');
  }
  if (page === 'attic') {
    const run = view.exploration;
    if (!run || run.status !== 'active') return `${PAGE.attic}\n${view.explorationAvailable
      ? `${ATTIC_RULE}\n${call(makeActionOption('explore_start', {}, generateId))}` : '今天的小灯已经提过啦，明天再上阁楼。'}\n\n${returnHome()}`;
    const row = Math.floor(run.position / run.columns), column = run.position % run.columns;
    const atStairs = run.cells[run.position]?.kind === 'stairs';
    const operations = [];
    if (run.steps > 0) {
      const route = sampleRoute(run);
      operations.push(`一口气走：${call(makeActionOption('explore_move', { route }, generateId))}`);
    }
    if (atStairs) operations.push(`楼梯就在脚下：${call(makeActionOption('explore_ascend', {}, generateId))}`);
    operations.push(`这趟先收工：${call(makeActionOption('explore_end', {}, generateId))}`);
    return `${PAGE.attic}\n${mapText(run)}\n坐标：第${row + 1}行、第${column + 1}列\n${operations.join('\n')}\n\n${returnHome()}`;
  }
  throw new HalloweenError('invalid_request', 400);
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

function renderReward(reward, { titles = [], titleName, seeds = [] } = {}) {
  if (!record(reward)) return '';
  const parts = [];
  if (Number.isSafeInteger(reward.gold) && reward.gold > 0) parts.push(`${reward.gold}金币`);
  if (text(reward.title)) {
    const title = text(titleName) ? titleName : titles.find(entry =>
      entry?.manual === true && entry.id === reward.title && text(entry.name))?.name;
    if (text(title)) parts.push(`称号「${title}」`);
  }
  for (const [tier, quantity] of Object.entries(reward.seeds ?? {})) {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) continue;
    const actualSeeds = seeds.filter(seed => seed?.tier === tier && text(seed.name) &&
      Number.isSafeInteger(seed.quantity) && seed.quantity > 0);
    if (actualSeeds.length) {
      for (const seed of actualSeeds) parts.push(`${seed.name}种子×${seed.quantity}`);
    } else parts.push(`${tier}种子×${quantity}`);
  }
  return parts.join('＋');
}

function renderExplorationResult(result, op) {
  const run = result.exploration;
  const lines = [mapText(run, { includeGuide: false })];
  if (op === 'explore_move') {
    const directions = { up: '上', down: '下', left: '左', right: '右' };
    if (result.actualRoute?.length) lines.push(`实际走过：${result.actualRoute.map(
      segment => `${directions[segment.direction]}${segment.distance}步`).join('、')}`);
    lines.push(`当前位置：第${Math.floor(run.position / run.columns) + 1}行、第${run.position % run.columns + 1}列`);
  }
  for (const event of result.events ?? []) {
    if (event.kind === 'material') lines.push(`翻到好东西了：${event.name}×${event.quantity}。`);
    if (event.kind === 'supply') lines.push(`补步+${event.steps}`);
    if (event.kind === 'money') lines.push(event.currency === 'gold' ? `+${event.amount}金币` : `+${event.amount}银币`);
    if (event.kind === 'trick') lines.push(event.currency === 'gold' ? `${event.appliedAmount}金币` : `${event.appliedAmount}银币`);
  }
  if (run?.status === 'active' && run.cells[run.position]?.kind === 'stairs')
    lines.push('✨ 墙角露出一段小楼梯。上去看看，还是再翻翻这一层？');
  if (run?.status === 'finished')
    lines.push(`小灯歇一歇，口袋里找到的东西都带回来啦。${materialList(result.gatheredMaterials) || '—'}`);
  return lines.filter(Boolean).join('\n');
}

function renderResult(op, result, { titles = [] } = {}) {
  if (op === 'buy') return `橱柜开了一条缝，你抱走了${result.material}×${result.quantity}，花了${result.spentSilver}银币。`;
  if (op === 'craft') return `咕嘟——开锅！${result.candyIds.length}颗「${result.appearance.name}」做好啦。`;
  if (op === 'gift') {
    const lines = [`叩叩！${result.delivered}颗糖已经放进${result.recipientName || result.doorplate}的糖果盒。`];
    if (Number.isSafeInteger(result.deliveredToRecipientToday)) lines.push(`今天已送对方${result.deliveredToRecipientToday}颗糖。`);
    const withSource = (row, value) => row.sourceKind === 'daily' ? `今日送糖奖励：${value}`
      : row.sourceKind === 'milestone' ? `累计送糖奖励：${value}` : value;
    const pendingRows = result.pendingRewards ?? (result.rewards ?? []).filter(reward => reward.status === 'pending');
    const pending = pendingRows.map(reward => withSource(reward,
      renderReward(reward.reward, { titles, titleName: reward.titleName }) || '奖励'));
    const paid = (result.newlyPaidRewards ?? []).map(reward =>
      withSource(reward, renderReward(reward.reward, { titles, titleName: reward.titleName, seeds: reward.seeds ?? [] }))).filter(Boolean);
    if (pending.length) lines.push(`送糖进度已记下，${pending.join('、')}还在排队。`);
    if (paid.length) lines.push(`送糖小分队有奖啦！${paid.join('、')}。`);
    return lines.join('\n');
  }
  if (op === 'eat') {
    const effect = renderEffect(result.effect);
    return result.target === 'other'
      ? `咔嚓！ta吃下了这颗糖：${effect.replace(/。$/u, '')}。`
      : `咔嚓！这颗糖的小秘密是：${effect}`;
  }
  if (op === 'explore_start') return result.resumed
    ? `阁楼里的小灯还亮着，接着刚才那一趟走吧。\n${mapText(result.exploration, { includeGuide: false })}`
    : `${PAGE.attic}\n${mapText(result.exploration)}`;
  if (op === 'explore_ascend') return `小灯往上一提——到第${result.exploration.floor}层啦，补上4步，现在还有${result.exploration.steps}步。\n${mapText(result.exploration, { includeGuide: false })}`;
  if (op === 'explore_move' || op === 'explore_end') return renderExplorationResult(result, op);
  const receipts = (result.events ?? []).map(event => {
    if (event.kind === 'material') return `翻到好东西了：${event.name}×${event.quantity}。`;
    if (event.kind === 'supply') return `补步+${event.steps}`;
    if (event.kind === 'money') return event.currency === 'gold' ? `+${event.amount}金币` : `+${event.amount}银币`;
    if (event.kind === 'trick') return event.currency === 'gold' ? `${event.appliedAmount}金币` : `${event.appliedAmount}银币`;
    return '';
  }).filter(Boolean);
  return receipts.join('\n');
}

function errorText(error, phase, option, opensAt) {
  const operation = option.startsWith(`${PREFIX}:`) ? option.slice(PREFIX.length + 1).split(':', 1)[0] : '';
  if (['invalid_request', 'invalid_recipe'].includes(error?.code) && operation === 'craft')
    return PAGE.craft;
  if (error?.code === 'invalid_material') return PAGE.shop;
  if (error?.code === 'invalid_selection') return PAGE.candies;
  if (error?.code === 'already_purchased') return '这一格橱柜已经买过啦。';
  if (error?.code === 'insufficient_materials') {
    const missing = error.details?.missingMaterials;
    if (Array.isArray(missing) && missing.length)
      return `锅边还差：${missing.map(({ name, quantity }) => `${name}×${quantity}`).join('、')}。重新选一锅吧。`;
    return PAGE.craft;
  }
  if (error?.code === 'insufficient_silver') return '女巫数了数银币：还差一点，这笔没有扣款。';
  if (error?.code === 'candy_unavailable') return '这颗糖已经不在盒子里了，打开糖果盒再挑一颗吧。';
  if (error?.code === 'neighbor_unavailable') return '这家的糖果盒暂时找不到，换位邻居试试吧。';
  if (error?.code === 'self_gift_not_allowed') return '自己的糖已经在盒子里啦，直接留着吃就好。';
  if (error?.code === 'exploration_unavailable') return '今天的小灯已经提过啦，明天再上阁楼。';
  if (['invalid_route', 'outside_map'].includes(error?.code)) return '这条路走不通，脚步还停在原处，换个方向吧。';
  if (error?.code === 'not_on_stairs') return '脚下还没有楼梯，再找找那点亮光吧。';
  if (error?.code === 'tile_unavailable') return '它还压在下面呢，先拿开上面的东西。';
  if (error?.code === 'receipt_conflict') return '这张小纸条已经用过啦；重新打开页面，再写一张。';
  if (['payment_unconfirmed', 'wallet_receipt_unavailable'].includes(error?.code))
    return '这次还没收到准信，先重试刚才那一次。';
  if (error?.code === 'event_not_open') {
    if (phase === 'ended') return '🎃 女巫收摊啦。糖果和礼物都替你收好了，想吃的时候，随时拆一颗。';
    if (phase === 'upcoming') return upcomingText(opensAt);
    return '小屋的门暂时没敲开，过会儿再来试试吧。';
  }
  if (error?.code === 'invalid_request') {
    if (['buy', 'buy_cart'].includes(operation)) return PAGE.shop;
    if (['gift', 'eat'].includes(operation)) return PAGE.candies;
    if (operation.startsWith('explore_')) return PAGE.attic;
    return renderHome({ materials: {}, candies: [] });
  }
  if (error?.status >= 500) return '小屋的门暂时没敲开，过会儿再来试试吧。';
  if (['buy', 'buy_cart'].includes(operation)) return PAGE.shop;
  if (['gift', 'eat'].includes(operation)) return PAGE.candies;
  if (operation.startsWith('explore_')) return PAGE.attic;
  return renderHome({ materials: {}, candies: [] });
}

function recoveryOption(error, phase, option) {
  if (error.status >= 500 || !['open', 'ended'].includes(phase)) return '';
  if (phase === 'ended') return `\n\n${call(pageOption('candies'))}`;
  const operation = option.startsWith(`${PREFIX}:`) ? option.slice(PREFIX.length + 1).split(':', 1)[0] : '';
  if (['buy', 'buy_cart'].includes(operation)) return `\n\n回橱柜看看：${call(pageOption('shop'))}`;
  if (operation === 'craft') return `\n\n重新选一锅：${call(pageOption('craft'))}`;
  if (['gift', 'eat'].includes(operation)) return `\n\n${PAGE.candies.split('\n')[0]}\n${call(pageOption('candies'))}`;
  if (operation.startsWith('explore_')) return `\n\n${PAGE.attic.split('\n')[0]}\n${call(pageOption('attic'))}`;
  return `\n\n${returnHome()}`;
}

export function createHalloweenTogetherActivity({ service, withAuthorityAction, generateId = randomUUID }) {
  if (!service || typeof service.execute !== 'function' || typeof generateId !== 'function')
    throw new TypeError('halloween_together_unavailable');
  return Object.freeze({
    execute({ farmId, option, now = Date.now() }) {
      if (!text(farmId) || !isHalloweenOption(option) || !Number.isSafeInteger(now))
        return { status: 400, json: { ok: false, code: 'invalid_request', text: HOME } };
      const phase = service.phase(now);
      try {
        const command = decodeHalloweenOption(option);
        const op = command.op ?? 'view';
        const execute = () => {
          if (op === 'gift') {
            const commandJson = JSON.stringify(canonical({ side: 'ai', op, args: command.args ?? {} }));
            let saved;
            try { saved = service.store.receipt(farmId, command.requestId, commandJson); }
            catch (error) {
              if (error instanceof ReceiptConflictError) throw new HalloweenError('receipt_conflict');
              throw error;
            }
            if (saved) {
              service.settleRewards(farmId, now);
              return saved;
            }
            return service.store.transaction(() => {
              let result = service.execute({ farmId, side: 'ai', op,
                args: command.args ?? {}, requestId: command.requestId }, now);
              const settlement = service.settleRewards(farmId, now);
              const titleNameFor = reward => service.options.titles?.find(entry =>
                entry?.manual === true && entry.id === reward?.title && text(entry.name))?.name;
              result = { ...result,
                newlyPaidRewards: (settlement.newlyPaid ?? []).map(reward => ({
                  ...reward, titleName: titleNameFor(reward.reward),
                  sourceKind: rewardSource(reward.id, { service, farmId, now }),
                })),
                pendingRewards: (settlement.rewards ?? []).filter(reward => reward.status === 'pending')
                  .map(reward => ({ ...reward, titleName: titleNameFor(reward.reward),
                    sourceKind: rewardSource(reward.id, { service, farmId, now }) })),
              };
              if (service.store.updateReceipt(farmId, command.requestId, commandJson, result) !== 1)
                throw new HalloweenError('wallet_receipt_unavailable', 503);
              return result;
            });
          }
          let result = service.execute({ farmId, side: 'ai', op,
            args: command.args ?? {}, ...(command.requestId ? { requestId: command.requestId } : {}) }, now);
          return result;
        };
        const view = op === 'view' || !withAuthorityAction ? execute()
          : withAuthorityAction({ farmId, side: 'ai', op, requestId: command.requestId, now }, execute);
        const page = command.page ?? (command.op === 'view' ? 'home' : null);
        if (page) return { status: 200, json: { ok: true, text: renderPage(page, view,
          { farmId, service, generateId, now, giftTarget: command.giftTarget }) } };
        const continuationPage = CONTINUATION_PAGE[command.op];
        const continuation = continuationPage ? `\n\n${call(pageOption(continuationPage))}` : '';
        const finished = ['explore_move', 'explore_end'].includes(command.op) && view.exploration?.status === 'finished'
          ? `\n${returnHome()}` : '';
        return { status: 200, json: { ok: true,
          text: `${renderResult(command.op, view, { titles: service.options.titles ?? [] })}${continuation}${finished}` } };
      } catch (error) {
        if (!(error instanceof HalloweenError)) throw error;
        return { status: error.status, json: { ok: false, code: error.code,
          text: `${errorText(error, phase, option, service.options.opensAt)}${recoveryOption(error, phase, option)}` } };
      }
    },
    visitEntry({ farmId, targetDoorplate, now = Date.now() }) {
      if (!text(farmId) || !text(targetDoorplate) || !Number.isSafeInteger(now) || service.phase(now) !== 'open')
        return '';
      const target = (service.options.listNeighbors?.({ farmId }) ?? [])
        .find(neighbor => neighbor.doorplate === targetDoorplate);
      if (!target) return '';
      return `${PAGE.candies.split('\n')[0]}\n打包送到谁家：${target.name}（${target.doorplate}）\n${call(pageOption(`doorstep:${encodeURIComponent(target.doorplate)}`))}`;
    },
    bagEntry({ farmId, now = Date.now() }) {
      if (!text(farmId) || !Number.isSafeInteger(now) || !['open', 'ended'].includes(service.phase(now))) return '';
      const candies = service.store.availableCandies(farmId);
      if (!candies.length) return '';
      return [PAGE.candies.split('\n')[0], CANDY_EXPLANATION, CANDY_RULE, ...candies.map(candyInventoryLine),
        eatOptions(generateId)].join('\n');
    },
    receivedEntry({ farmId, now = Date.now() }) {
      if (!text(farmId) || !Number.isSafeInteger(now) || !['open', 'ended'].includes(service.phase(now))) return '';
      const candies = service.store.availableCandies(farmId).filter(candy => candy.senderName);
      return candies.length ? [PAGE.candies.split('\n')[0], ...candies.map(candyInventoryLine)].join('\n') : '';
    },
    statusEntry({ farmId, now = Date.now() } = {}, opensAt = service.options.opensAt,
      closesAt = service.options.closesAt) {
      if (!text(farmId) || !Number.isSafeInteger(now) || !Number.isSafeInteger(opensAt) || !Number.isSafeInteger(closesAt) ||
          closesAt <= opensAt || now < opensAt || now >= closesAt) return '';
      const facts = readDailyStatusFacts(service, farmId, now);
      if (!facts) return '';
      const explorationState = facts.explorationState === 'in_progress' ? '探索中'
        : facts.explorationState === 'finished' ? '已收工' : '未出发';
      return [
        `🕯️ 女巫家的阁楼：今日${facts.explorationUses}/1 · ${explorationState}`,
        `🧳 翻箱倒罐：今日通关${facts.collectionStagesCleared}/2`,
        `🎁 今日已送出：${facts.candiesSentToday}颗`,
        `🍬 收到未吃：${facts.receivedUnconsumed}颗`,
        HOME,
        call(PREFIX),
      ].join('\n');
    },
    dailyStatusFacts({ farmId, now = Date.now() } = {}) {
      return readDailyStatusFacts(service, farmId, now);
    },
  });
}
