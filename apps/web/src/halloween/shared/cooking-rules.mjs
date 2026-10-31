// Shared human-facing candy cooking rules. Keep this file dependency-free so
// the browser and Farm service can import the same catalog and calculations.
export const COOKING_RULES_VERSION = 'halloween-cooking-v1';

export const COOKING_PALETTE = Object.freeze([
  Object.freeze({ id: 'amber', name: '琥珀金', hex: '#F4A941', rgb: Object.freeze([244, 169, 65]) }),
  Object.freeze({ id: 'rose', name: '莓果粉', hex: '#D16B87', rgb: Object.freeze([209, 107, 135]) }),
  Object.freeze({ id: 'plum', name: '葡萄紫', hex: '#9972B8', rgb: Object.freeze([153, 114, 184]) }),
  Object.freeze({ id: 'cream', name: '奶油白', hex: '#F5E5BB', rgb: Object.freeze([245, 229, 187]) }),
  Object.freeze({ id: 'mint', name: '薄荷绿', hex: '#79B8A3', rgb: Object.freeze([121, 184, 163]) }),
  Object.freeze({ id: 'blue', name: '晴空蓝', hex: '#84B7D6', rgb: Object.freeze([132, 183, 214]) }),
]);

const makeMold = (id, name, category, categoryName) =>
  Object.freeze({ id, name, category, categoryName });

export const COOKING_MOLDS = Object.freeze([
  makeMold('star', '星星', 'classic', '经典模具'),
  makeMold('heart', '爱心', 'classic', '经典模具'),
  makeMold('pumpkin', '南瓜', 'classic', '经典模具'),
  makeMold('ghost', '幽灵', 'classic', '经典模具'),

  makeMold('apple', '苹果', 'fruit', '水果模具'),
  makeMold('strawberry', '草莓', 'fruit', '水果模具'),
  makeMold('orange', '橙子', 'fruit', '水果模具'),
  makeMold('lemon', '柠檬', 'fruit', '水果模具'),
  makeMold('grape', '葡萄', 'fruit', '水果模具'),
  makeMold('peach', '桃子', 'fruit', '水果模具'),
  makeMold('cherry', '樱桃', 'fruit', '水果模具'),
  makeMold('watermelon', '西瓜', 'fruit', '水果模具'),
  makeMold('banana', '香蕉', 'fruit', '水果模具'),
  makeMold('pear', '梨子', 'fruit', '水果模具'),
  makeMold('pineapple', '菠萝', 'fruit', '水果模具'),
  makeMold('kiwi', '奇异果', 'fruit', '水果模具'),

  makeMold('chiikawa', '吉伊卡哇', 'chiikawa', 'Chiikawa'),
  makeMold('hachiware', '小八', 'chiikawa', 'Chiikawa'),
  makeMold('usagi', '乌萨奇', 'chiikawa', 'Chiikawa'),
  makeMold('momonga', '飞鼠', 'chiikawa', 'Chiikawa'),
  makeMold('kurimanju', '栗子馒头', 'chiikawa', 'Chiikawa'),
  makeMold('shisa', '师萨', 'chiikawa', 'Chiikawa'),
  makeMold('rakko', '海獭', 'chiikawa', 'Chiikawa'),

  makeMold('hello_kitty', '凯蒂猫', 'sanrio', 'Sanrio'),
  makeMold('my_melody', '美乐蒂', 'sanrio', 'Sanrio'),
  makeMold('kuromi', '酷洛米', 'sanrio', 'Sanrio'),
  makeMold('cinnamoroll', '玉桂狗', 'sanrio', 'Sanrio'),
  makeMold('pompompurin', '布丁狗', 'sanrio', 'Sanrio'),
  makeMold('pochacco', '帕恰狗', 'sanrio', 'Sanrio'),
  makeMold('keroppi', '大眼蛙', 'sanrio', 'Sanrio'),
  makeMold('badtz_maru', '酷企鹅', 'sanrio', 'Sanrio'),
  makeMold('tuxedosam', '山姆企鹅', 'sanrio', 'Sanrio'),
  makeMold('hangyodon', '人鱼汉顿', 'sanrio', 'Sanrio'),
]);

// Keep the full catalog ordered for stable M codes and saved candy rendering.
// This allow-list controls only new candy production choices.
export const SELECTABLE_COOKING_MOLD_IDS = Object.freeze(COOKING_MOLDS
  .filter(({ id }) => !['momonga', 'kurimanju', 'shisa', 'rakko',
    'badtz_maru', 'tuxedosam', 'hangyodon'].includes(id))
  .map(({ id }) => id));

// Candidate food colors and preferred pot-entry phases for player testing.
// Pigments name existing output colors; they do not declare extra effects.
const materialRows = [
  ['砂糖', 'N', 'cream', 'early'], ['红糖', 'N', 'amber', 'early'],
  ['蜂蜜', 'N', 'amber', 'middle'], ['牛奶', 'N', 'cream', 'middle'],
  ['黄油', 'N', 'cream', 'early'], ['南瓜泥', 'N', 'amber', 'early'],
  ['苹果', 'N', 'rose', 'early'], ['肉桂', 'N', 'amber', 'late'],
  ['薄荷叶', 'N', 'mint', 'late'], ['紫薯', 'N', 'plum', 'early'],
  ['栗子', 'N', 'amber', 'early'], ['玉米粒', 'N', 'amber', 'early'],

  ['焦糖', 'R', 'amber', 'middle'], ['黑巧克力', 'R', 'plum', 'middle'],
  ['夜影莓', 'R', 'plum', 'late'], ['蔓越莓', 'R', 'rose', 'late'],
  ['枫糖浆', 'R', 'amber', 'middle'], ['香草荚', 'R', 'cream', 'late'],
  ['桂花蜜', 'R', 'amber', 'late'], ['蛛丝棉花糖', 'R', 'rose', 'middle'],
  ['蝙蝠翼糖片', 'R', 'plum', 'late'],

  ['月光露', 'SR', 'blue', 'middle'], ['幽灵奶霜', 'SR', 'cream', 'late'],
  ['星屑糖粉', 'SR', 'blue', 'late'], ['魔女紫罗兰花瓣', 'SR', 'plum', 'late'],
  ['午夜黑醋栗', 'SR', 'plum', 'middle'], ['骷髅糖霜', 'SR', 'cream', 'late'],
  ['幽光岩盐', 'SR', 'blue', 'late'],

  ['南瓜王糖心', 'SSR', 'amber', 'middle'], ['血月石榴', 'SSR', 'rose', 'middle'],
  ['幽灵蜂后蜜', 'SSR', 'amber', 'late'], ['月影薄荷', 'SSR', 'mint', 'late'],
  ['极光糖浆', 'SSR', 'blue', 'middle'], ['黑猫私藏奶油', 'SSR', 'plum', 'late'],

  ['金南瓜籽', 'SP', 'amber', 'early'], ['永夜花蜜', 'SP', 'plum', 'late'],
  ['魔女秘制焦糖', 'SP', 'amber', 'middle'], ['午夜蜂巢糖', 'SP', 'amber', 'late'],
  ['星落糖晶', 'SP', 'blue', 'late'],
];

export const MATERIAL_COOKING_RULES = Object.freeze(Object.fromEntries(
  materialRows.map(([name, tier, pigment, phase]) => [name,
    Object.freeze({ name, tier, pigment, phase })]),
));

const MATERIAL_NAMES = Object.freeze(Object.keys(MATERIAL_COOKING_RULES));
const PHASE_CODE = Object.freeze({ early: 'T1', middle: 'T2', late: 'T3' });
const PHASE_BY_CODE = Object.freeze({ T1: 'early', T2: 'middle', T3: 'late' });
const PHASE_NAMES = Object.freeze({ early: '开锅前', middle: '搅拌中', late: '出锅前' });
const PHASE_POSITION = Object.freeze({ early: 0, middle: 38, late: 88 });
const MOLD_BY_CODE = new Map(COOKING_MOLDS.map((mold, index) => [`M${index + 1}`, mold]));

export function additionPhaseAt(at) {
  if (!Number.isFinite(at) || at < 0 || at > 100) throw new TypeError('invalid_addition_time');
  return at === 0 ? 'early' : at < 75 ? 'middle' : 'late';
}

// Stable codes are assigned from the complete approved catalogs. Projection
// filters unavailable inventory/artwork without renumbering any remaining item.
export function projectSemanticCraftCatalog(inventory, availableMoldIds = SELECTABLE_COOKING_MOLD_IDS) {
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory) || !Array.isArray(availableMoldIds))
    throw new TypeError('invalid_semantic_craft_catalog');
  for (const [name, quantity] of Object.entries(inventory)) {
    if (!MATERIAL_COOKING_RULES[name] || !Number.isSafeInteger(quantity) || quantity < 0)
      throw new TypeError('invalid_semantic_craft_catalog');
  }
  const artworkMolds = new Set(availableMoldIds);
  const selectableMolds = new Set(SELECTABLE_COOKING_MOLD_IDS);
  const phases = Object.freeze([
    Object.freeze({ code: 'T1', phase: 'early', name: '开锅前' }),
    Object.freeze({ code: 'T2', phase: 'middle', name: '搅拌中' }),
    Object.freeze({ code: 'T3', phase: 'late', name: '出锅前' }),
  ]);
  return {
    materials: MATERIAL_NAMES.flatMap((material, index) => {
      const quantity = inventory[material] ?? 0;
      if (quantity <= 0) return [];
      const phase = MATERIAL_COOKING_RULES[material].phase;
      return [{ code: `A${index + 1}`, material, quantity,
        suitableTime: { code: PHASE_CODE[phase], name: PHASE_NAMES[phase] } }];
    }),
    phases,
    molds: COOKING_MOLDS.flatMap((mold, index) => artworkMolds.has(mold.id) && selectableMolds.has(mold.id)
      ? [{ code: `M${index + 1}`, id: mold.id, name: mold.name }] : []),
  };
}

export function parseSemanticCraftCombination(value) {
  if (typeof value !== 'string') throw new TypeError('invalid_semantic_craft_combination');
  const parts = value.split('+');
  if (parts.length !== 4) throw new TypeError('invalid_semantic_craft_combination');
  const moldMatch = /^M([1-9][0-9]*)$/.exec(parts[3]);
  const mold = moldMatch ? MOLD_BY_CODE.get(`M${Number(moldMatch[1])}`) : null;
  if (!mold || `M${COOKING_MOLDS.indexOf(mold) + 1}` !== parts[3])
    throw new TypeError('invalid_semantic_craft_combination');
  const materials = {};
  const additions = parts.slice(0, 3).map(part => {
    const match = /^A([1-9][0-9]*)T([1-3])$/.exec(part);
    if (!match) throw new TypeError('invalid_semantic_craft_combination');
    const index = Number(match[1]) - 1;
    const material = MATERIAL_NAMES[index];
    const phase = PHASE_BY_CODE[`T${match[2]}`];
    if (!material || `A${index + 1}` !== `A${match[1]}` || !phase)
      throw new TypeError('invalid_semantic_craft_combination');
    materials[material] = (materials[material] ?? 0) + 1;
    return { material, phase };
  });
  return { materials, shape: mold.id, additions };
}

const toHex = rgb => `#${rgb.map(value => Math.max(0, Math.min(255, Math.round(value)))
  .toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const PHASE_INDEX = Object.freeze({ early: 0, middle: 1, late: 2 });
const PHASE_CENTER = Object.freeze({ early: 0, middle: 38, late: 88 });
const TIME_TINTS = Object.freeze([
  Object.freeze({ at: 0, rgb: [244, 169, 65] }),
  Object.freeze({ at: 50, rgb: [245, 229, 187] }),
  Object.freeze({ at: 100, rgb: [153, 114, 184] }),
]);

function tintAt(at) {
  const pair = at <= 50 ? [TIME_TINTS[0], TIME_TINTS[1]] : [TIME_TINTS[1], TIME_TINTS[2]];
  const ratio = (at - pair[0].at) / (pair[1].at - pair[0].at);
  return pair[0].rgb.map((value, index) => value + (pair[1].rgb[index] - value) * ratio);
}

function additionColorWeight(rule, at) {
  const distance = Math.abs(PHASE_INDEX[rule.phase] - PHASE_INDEX[additionPhaseAt(at)]);
  const phaseWeight = distance === 0 ? 1 : distance === 1 ? 0.72 : 0.46;
  const centerWeight = 0.85 + 0.15 * Math.max(0, 1 - Math.abs(at - PHASE_CENTER[rule.phase]) / 50);
  return phaseWeight * centerWeight;
}

export function mixCookingColor(additions) {
  if (!Array.isArray(additions) || additions.length < 1 || additions.length > 3)
    throw new TypeError('invalid_cooking_process');
  const mixed = [0, 0, 0];
  let totalWeight = 0;
  for (const addition of additions) {
    const rule = MATERIAL_COOKING_RULES[addition?.material];
    if (!rule) throw new TypeError('invalid_material');
    additionPhaseAt(addition.at);
    const pigment = COOKING_PALETTE.find(color => color.id === rule.pigment).rgb;
    const tint = tintAt(addition.at);
    const weight = additionColorWeight(rule, addition.at);
    for (let channel = 0; channel < 3; channel++)
      mixed[channel] += (pigment[channel] * 0.78 + tint[channel] * 0.22) * weight;
    totalWeight += weight;
  }
  const rgb = mixed.map(value => Math.round(value / totalWeight));
  const selected = COOKING_PALETTE.reduce((best, color) => {
    const distance = color.rgb.reduce((sum, channel, index) => sum + (channel - rgb[index]) ** 2, 0);
    return distance < best.distance ? { color, distance } : best;
  }, { color: COOKING_PALETTE[0], distance: Infinity }).color;
  return { id: selected.id, hex: toHex(rgb), rgb };
}

function fillAccuracy(value) {
  if (!Number.isFinite(value) || value < 0.8 || value > 1.25) throw new TypeError('invalid_fill');
  if (value >= 0.96 && value <= 1.04) return 100;
  const distance = value < 0.96 ? 0.96 - value : value - 1.04;
  const maximumDistance = value < 0.96 ? 0.16 : 0.21;
  return Math.max(0, 100 * (1 - distance / maximumDistance));
}

export function scoreCookingQuality({ timingHits, stirTurns, fills }) {
  if (!Number.isSafeInteger(timingHits) || timingHits < 0 || timingHits > 3 ||
      !Number.isSafeInteger(stirTurns) || stirTurns < 4 || !Array.isArray(fills) || fills.length !== 6)
    throw new TypeError('invalid_cooking_process');
  const timingScore = timingHits / 3 * 100;
  const stirScore = Math.max(0, 100 - Math.abs(stirTurns - 6) * 20);
  const fillScore = fills.reduce((sum, fill) => sum + fillAccuracy(fill), 0) / fills.length;
  const score = Math.round(timingScore * 0.55 + stirScore * 0.25 + fillScore * 0.2);
  return { score, timingHits, timingScore, stirScore, fillScore: Math.round(fillScore) };
}

export function upgradeRarityOnce(baseRarity, quality, random) {
  const rarities = ['ordinary', 'rare', 'precious', 'legendary'];
  const baseIndex = rarities.indexOf(baseRarity);
  if (baseIndex < 0 || !Number.isFinite(quality) || quality < 0 || quality > 100 || typeof random !== 'function')
    throw new TypeError('invalid_cooking_quality');
  const probability = quality >= 90 ? 0.35 : quality >= 70 ? 0.15 : 0;
  if (!probability || baseIndex === rarities.length - 1) return { rarity: baseRarity, upgraded: false, probability };
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new TypeError('invalid_random');
  return roll < probability
    ? { rarity: rarities[baseIndex + 1], upgraded: true, probability }
    : { rarity: baseRarity, upgraded: false, probability };
}

export function evaluateCookingProcess({ materials, process }) {
  if (!materials || typeof materials !== 'object' || Array.isArray(materials) ||
      !process || typeof process !== 'object' || Array.isArray(process) ||
      Object.keys(process).sort().join(',') !== 'additions,fills,stirTurns' ||
      !Array.isArray(process.additions) || process.additions.length !== 3 ||
      !Number.isSafeInteger(process.stirTurns) || process.stirTurns < 4 ||
      !Array.isArray(process.fills) || process.fills.length !== 6)
    throw new TypeError('invalid_cooking_process');
  const counts = new Map();
  for (const [name, quantity] of Object.entries(materials)) {
    if (!MATERIAL_COOKING_RULES[name] || !Number.isSafeInteger(quantity) || quantity <= 0)
      throw new TypeError('invalid_recipe');
    counts.set(name, quantity);
  }
  if ([...counts.values()].reduce((sum, quantity) => sum + quantity, 0) !== 3)
    throw new TypeError('invalid_recipe');
  let timingHits = 0;
  for (const addition of process.additions) {
    if (!addition || typeof addition !== 'object' || Array.isArray(addition) ||
        Object.keys(addition).sort().join(',') !== 'at,material' ||
        !counts.has(addition.material)) throw new TypeError('invalid_cooking_process');
    if (!Number.isInteger(addition.at) || addition.at < 0 || addition.at > 100)
      throw new TypeError('invalid_addition_time');
    if (additionPhaseAt(addition.at) === MATERIAL_COOKING_RULES[addition.material].phase) timingHits++;
    counts.set(addition.material, counts.get(addition.material) - 1);
  }
  if ([...counts.values()].some(quantity => quantity !== 0)) throw new TypeError('invalid_cooking_process');
  const quality = scoreCookingQuality({ timingHits, stirTurns: process.stirTurns, fills: process.fills });
  const color = mixCookingColor(process.additions);
  return { color, quality };
}

function validatedMaterialCounts(materials) {
  if (!materials || typeof materials !== 'object' || Array.isArray(materials))
    throw new TypeError('invalid_recipe');
  const counts = new Map();
  for (const [name, quantity] of Object.entries(materials)) {
    if (!MATERIAL_COOKING_RULES[name] || !Number.isSafeInteger(quantity) || quantity <= 0)
      throw new TypeError('invalid_recipe');
    counts.set(name, quantity);
  }
  if ([...counts.values()].reduce((sum, quantity) => sum + quantity, 0) !== 3)
    throw new TypeError('invalid_recipe');
  return counts;
}

// This pure helper evaluates a semantic recipe choice for the AI composition
// route; human motor/process scoring remains separate above.
export function evaluateSemanticTimingPlan({ materials, additions }) {
  const counts = validatedMaterialCounts(materials);
  if (!Array.isArray(additions) || additions.length !== 3)
    throw new TypeError('invalid_semantic_timing_plan');
  let timingHits = 0;
  const colorAdditions = [];
  for (const addition of additions) {
    if (!addition || typeof addition !== 'object' || Array.isArray(addition) ||
        Object.keys(addition).sort().join(',') !== 'material,phase' || !counts.has(addition.material) ||
        !['early', 'middle', 'late'].includes(addition.phase))
      throw new TypeError('invalid_semantic_timing_plan');
    if (addition.phase === MATERIAL_COOKING_RULES[addition.material].phase) timingHits++;
    colorAdditions.push({ material: addition.material, at: PHASE_POSITION[addition.phase] });
    counts.set(addition.material, counts.get(addition.material) - 1);
  }
  if ([...counts.values()].some(quantity => quantity !== 0))
    throw new TypeError('invalid_semantic_timing_plan');
  return {
    color: mixCookingColor(colorAdditions),
    timingHits,
    quality: timingHits / 3 * 100,
    upgradeProbability: timingHits / 3 * 0.35,
  };
}

export function upgradeRarityBySemanticTiming(baseRarity, timingHits, random) {
  const rarities = ['ordinary', 'rare', 'precious', 'legendary'];
  const baseIndex = rarities.indexOf(baseRarity);
  if (baseIndex < 0 || !Number.isSafeInteger(timingHits) || timingHits < 0 || timingHits > 3 ||
      typeof random !== 'function') throw new TypeError('invalid_semantic_timing_plan');
  const probability = baseIndex === rarities.length - 1 ? 0 : timingHits / 3 * 0.35;
  if (!probability)
    return { rarity: baseRarity, upgraded: false, probability };
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new TypeError('invalid_random');
  return roll < probability
    ? { rarity: rarities[baseIndex + 1], upgraded: true, probability }
    : { rarity: baseRarity, upgraded: false, probability };
}
