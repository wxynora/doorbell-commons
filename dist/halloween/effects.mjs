// Approved one-shot effect values; all economy writes stay with Farm authority.
const HOUR = 60 * 60 * 1000;
const ODDS = Object.freeze({
  ordinary: [0.55, 0.10], rare: [0.45, 0.30],
  precious: [0.30, 0.55], legendary: [0.15, 0.80],
});
const POSITIVE = Object.freeze(['harvest_gold', 'plant_time', 'fishing_junk']);
const TRICKS = Object.freeze(['fishing_junk_add', 'plant_time_add', 'dog_block_probability_add', 'theft_caught_gold']);
const AI_KINDS = new Set([...POSITIVE, ...TRICKS]);
const HUMAN_POSITIVE = Object.freeze(['human_harvest_gold', 'human_ranch_yield', 'human_cook_extra']);
const HUMAN_TRICKS = Object.freeze(['human_block_harvest', 'human_block_ranch_collect',
  'human_block_cook', 'human_block_dispatch']);
const HUMAN_KINDS = new Set([...HUMAN_POSITIVE, ...HUMAN_TRICKS]);
const HUMAN_DEBUFFS = new Set(HUMAN_TRICKS);

function draw(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new TypeError('invalid_random');
  return value;
}

// Called exactly once by the future crafting/NPC transaction. The returned
// hidden effect belongs to that candy and must be persisted, never rerolled.
export function createHiddenEffect(rarity, random) {
  const odds = ODDS[rarity];
  if (!odds) throw new TypeError('invalid_rarity');
  const roll = draw(random);
  const quality = roll < odds[0] ? 'normal' : roll < odds[0] + odds[1] ? 'premium' : 'trick';
  const pool = quality === 'trick' ? TRICKS : POSITIVE;
  const kind = pool[Math.floor(draw(random) * pool.length)];
  const values = {
    harvest_gold: quality === 'premium' ? 0.5 : 0.2,
    plant_time: quality === 'premium' ? -0.2 : -0.1,
    fishing_junk: quality === 'premium' ? 0.3 : 0.7,
    fishing_junk_add: 0.15, plant_time_add: 0.05,
    dog_block_probability_add: 0.1, theft_caught_gold: 200,
  };
  return { kind, value: values[kind], quality };
}

function drawHumanEffect(quality, random) {
  const pool = quality === 'trick' ? HUMAN_TRICKS : HUMAN_POSITIVE;
  const kind = pool[Math.floor(draw(random) * pool.length)];
  const value = quality === 'trick' ? undefined : kind === 'human_cook_extra'
    ? quality === 'premium' ? 2 : 1
    : quality === 'premium' ? 1 : 0.5;
  return { kind, ...(value === undefined ? {} : { value }), quality };
}

export function createActorHiddenEffects(rarity, random) {
  const ai = createHiddenEffect(rarity, random);
  return { ai, human: drawHumanEffect(ai.quality, random) };
}

const isQuality = value => value === 'normal' || value === 'premium' || value === 'trick';
const isValidAiEffect = effect => effect && AI_KINDS.has(effect.kind) && isQuality(effect.quality);
const isValidHumanEffect = (effect, quality) => effect && HUMAN_KINDS.has(effect.kind) &&
  effect.quality === quality && (quality === 'trick'
    ? HUMAN_DEBUFFS.has(effect.kind) && effect.value === undefined
    : HUMAN_POSITIVE.includes(effect.kind) && Number.isFinite(effect.value) && effect.value > 0);

// Old local candy rows contain only the AI effect. Add the Human side on first
// read, preserving the candy's already-rolled quality and valence.
export function resolveActorHiddenEffects(hidden, side, random) {
  if (!['ai', 'human'].includes(side)) throw new TypeError('invalid_effect_side');
  const ai = hidden?.ai ?? hidden;
  if (!isValidAiEffect(ai)) throw new TypeError('invalid_hidden_effect');
  const human = isValidHumanEffect(hidden?.human, ai.quality)
    ? hidden.human
    : drawHumanEffect(ai.quality, random);
  return { effect: side === 'ai' ? ai : human, hiddenEffects: { ai, human } };
}

export function effectDurationMs(effect, side) {
  return side === 'human' && HUMAN_DEBUFFS.has(effect?.kind) ? 2 * HOUR : 24 * HOUR;
}

export function isHumanDebuff(effect) { return HUMAN_DEBUFFS.has(effect?.kind); }

export function queueEatenEffect(queue, { candyId, effect, side = 'ai', eatenAt }) {
  // Removing the candy and adding this entry must share the caller's transaction.
  return [...queue, { candyId, actorSide: side, effect: structuredClone(effect), eatenAt,
    expiresAt: eatenAt + effectDurationMs(effect, side) }];
}

const TARGETS = Object.freeze({
  harvest: ['harvest_gold', 'human_harvest_gold'],
  ranch_collect: ['human_ranch_yield'], cook: ['human_cook_extra'],
  plant: ['plant_time', 'plant_time_add'],
  fish: ['fishing_junk', 'fishing_junk_add'],
  dog_block: ['dog_block_probability_add'], theft: ['theft_caught_gold'],
});

// A target is one real plot/fishing result/theft attempt. Call once per target
// in the authority's existing order; invalid actions must set effective=false.
export function takeTargetEffect(queue, { kind, now, targetAt = now, effective, caught = false, actorSide = 'ai' }) {
  if (!TARGETS[kind]) throw new TypeError('invalid_target');
  if (!effective) return { queue, effect: null };
  const index = queue.findIndex(entry =>
    entry.actorSide === actorSide && entry.eatenAt <= targetAt && entry.expiresAt > now && TARGETS[kind].includes(entry.effect.kind)
    && (entry.effect.kind !== 'theft_caught_gold' || caught));
  if (index < 0) return { queue, effect: null };
  return { queue: queue.filter((_, i) => i !== index), effect: structuredClone(queue[index].effect) };
}

const probability = value => Math.min(1, Math.max(0, value));

export function applyEffect(effect, base) {
  // Return only the relevant adjustment. Rounding/ledger posting belongs to the
  // actual harvest/planting/fishing/theft authority, not this isolated candidate.
  switch (effect.kind) {
    case 'harvest_gold': return { baseGoldBonus: base.baseGold * effect.value };
    case 'human_harvest_gold': return { baseGoldBonus: base.baseGold * effect.value };
    case 'human_ranch_yield': return { additionalCount: Math.max(1, Math.round(base.count * effect.value)) };
    case 'human_cook_extra': return { additionalDishes: effect.value };
    case 'plant_time':
    case 'plant_time_add': return { growthDuration: base.growthDuration * (1 + effect.value) };
    case 'fishing_junk': return { junkProbability: probability(base.junkProbability * effect.value) };
    case 'fishing_junk_add': return { junkProbability: probability(base.junkProbability + effect.value) };
    case 'dog_block_probability_add': return { dogBlockProbability: probability(base.dogBlockProbability + effect.value) };
    case 'theft_caught_gold': return { goldLoss: Math.min(base.goldBalance, effect.value) };
    default: throw new TypeError('invalid_effect');
  }
}
