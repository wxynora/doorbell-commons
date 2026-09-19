import { DIY_OPTIONS } from './scoring.js';

export const EVENT_ID = 'mid-autumn-2026';
export const OPENS_AT = Date.parse('2026-09-24T00:00:00+08:00');
export const CLOSES_AT = Date.parse('2026-09-26T08:00:00+08:00');
export const ORDERS = Object.freeze([
  { id: 'traditional', npcId: 'npc_atu', requires: ['sweet_cute'], size: 1,
    reward: { recipe: 1, shape: '花朵', patterns: ['樱花'], yolks: 4 } },
  { id: 'rich', npcId: 'npc_beiheng', requires: ['traditional'], size: 1,
    reward: { recipe: 3, patterns: ['小雏菊'] } },
  { id: 'sweet_cute', npcId: 'npc_liyuan', requires: [], size: 1,
    reward: { recipe: 2, shape: '玉兔', patterns: ['乌萨奇', '星月'] } },
  { id: 'light_elegant', npcId: 'npc_pupu', requires: ['rich'], size: 1,
    reward: { stampChoices: 1 } },
  { id: 'variety', npcId: 'npc_modian', requires: ['rich'], size: 4,
    reward: { stampChoices: 2 } },
  { id: 'matching', npcId: 'npc_songmo', requires: ['traditional'], size: 4,
    reward: { stampChoices: 2 } },
].map(order => Object.freeze(order)));

export const SWEET_CUTE_TEXT = Object.freeze({
  request: '我想要甜蜜又可爱的月饼。',
  excellent: '甜甜的，模样也可爱，正是我想要的！',
});

export const ORDER_DESCRIPTIONS = {
  traditional: { request: '想要传统些的口味，圆圆的，再印个月亮，就有团圆的意思了。', dimensions: ['传统口味', '圆形', '月纹'] },
  rich: { request: '我喜欢馅香浓些的，饼皮也烤得金棕一点。', dimensions: ['浓郁', '金棕烘色'] },
  sweet_cute: { request: SWEET_CUTE_TEXT.request, dimensions: ['甜度', '可爱'] },
  light_elegant: { request: '想吃清淡些的，模样也素雅一点，配茶正好。', dimensions: ['清淡', '素雅'] },
  variety: { request: '想要四枚花样多些的月饼，口味、形状和花纹都变一变，打开盒子有惊喜。', dimensions: ['口味变化', '外形变化', '花纹变化'] },
  matching: { request: '想要四枚摆在一起像一套的，形状和花纹统一，烘色也尽量相近。', dimensions: ['外形统一', '花纹统一', '烘色相近'] },
};

export function approvedFeedback(kind, result) {
  if (kind !== 'sweet_cute') {
    const rules = {
      light_elegant: [[.6,.4], ['清淡些','素雅些'], '清清淡淡，模样也雅致，配这杯茶刚刚好。', word => `挺合心意的，要是再${word}就更好了。`, word => `谢谢你，不过我更想要${word}的月饼。`],
      rich: [[.7,.3], ['馅再浓郁些','烘色再接近金棕色'], '馅香浓，饼皮的颜色也正合心意！', word => `挺喜欢的，要是${word}就更好了。`, word => `谢谢你，不过我希望${word}。`],
      traditional: [[.4,.3,.3], ['口味再传统些','外形再圆一些','印上月亮纹样'], '圆圆的月饼配上月纹，口味也合心意，很有团圆的味道。', word => `挺好的，要是${word}就更合心意了。`, word => `谢谢你，不过这次我更希望${word}。`],
      variety: [[.5,.25,.25], ['口味','外形','花纹'], '每一枚都有不同的样子，口味也丰富，这盒真让人惊喜！', word => `已经很丰富了，要是${word}再多些变化就更好了。`, word => `谢谢你，不过我希望这盒的${word}能多些变化。`],
      matching: [[.4,.4,.2], ['外形再统一些','花纹再统一些','烘色再接近些'], '整整齐齐，摆在一起很协调，正是我想要的一套。', word => `挺协调的，要是${word}就更好了。`, word => `谢谢你，不过我希望${word}。`],
    };
    const [weights, words, excellent, pleased, ordinary] = rules[kind];
    const losses = weights.map((weight, i) => weight * (100 - result.dimensionScores[i]));
    const word = words[losses.indexOf(Math.max(...losses))];
    return result.grade === 'excellent' ? excellent : result.grade === 'pleased' ? pleased(word) : ordinary(word);
  }
  if (result.grade === 'excellent') return SWEET_CUTE_TEXT.excellent;
  const word = result.dimensionScores[0] <= result.dimensionScores[1] ? '甜一些' : '可爱一些';
  return result.grade === 'pleased'
    ? `挺喜欢的，要是再${word}就更好了。`
    : `谢谢你，不过我更想要${word}的月饼。`;
}

export function initialState() {
  return { started: false, recipes: [], shapes: [], patterns: ['无'],
    materials: { dough: 0, fillings: [0, 0, 0, 0], yolks: 0 },
    stampChoices: 0, completed: [], accepted: [], humanChapters: [] };
}

export function rewardOrder(state, order) {
  const first = !state.completed.includes(order.id);
  const reward = order.reward;
  if (first) {
    if (reward.recipe !== undefined && !state.recipes.includes(reward.recipe)) state.recipes.push(reward.recipe);
    if (reward.shape && !state.shapes.includes(reward.shape)) state.shapes.push(reward.shape);
    for (const pattern of reward.patterns ?? []) if (!state.patterns.includes(pattern)) state.patterns.push(pattern);
    state.stampChoices += reward.stampChoices ?? 0;
    state.completed.push(order.id);
  }
  // A successful repeat supplies ingredients only, never another unlock reward.
  for (const filling of state.recipes) state.materials.fillings[filling] += 4;
  state.materials.dough += state.recipes.length * 4;
  state.materials.yolks += first ? reward.yolks ?? 0 : 0;
  return { first, unlockedRecipe: first ? reward.recipe ?? null : null };
}

export function availableOptions(state) {
  return { stages: { pattern: state.completed.includes('sweet_cute'), bake: state.completed.includes('traditional') }, fillings: state.recipes.map(id => ({ id, name: DIY_OPTIONS.fillings[id] })),
    traits: {
      fillings: state.recipes.map(id => ({ id, tags: [['偏甜'],['甜润'],['浓郁'],['相对清淡','坚果香']][id] })),
      shapes: state.shapes.map(name => ({ name, tags: { 圆月:['传统'], 花朵:['雅致','可爱'], 玉兔:['可爱'] }[name] })),
      patterns: state.patterns.map(name => ({ name, tags: name === '无' ? [] : [['樱花','小雏菊','桂枝'].includes(name) ? '花草' : ['星星','弯月','星月','流云'].includes(name) ? '星月' : '动物'] })),
      yolk: ['增加浓郁度','降低甜度与清淡度'],
    },
    shapes: [...state.shapes], patterns: [...state.patterns], bake: DIY_OPTIONS.bake };
}
