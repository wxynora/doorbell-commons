import { MATERIALS } from './materials.mjs';

export function drawCollectionClearReward({ random, stage, tierWeights }) {
  if (typeof random !== 'function' || !Number.isSafeInteger(stage) || ![1, 2].includes(stage) ||
      !tierWeights || typeof tierWeights !== 'object') throw new TypeError('collection_reward_unconfigured');
  const rollTier = random();
  if (!Number.isFinite(rollTier) || rollTier < 0 || rollTier >= 1) throw new TypeError('invalid_random');
  let remainder = rollTier;
  let tier = 'SP';
  for (const [candidate, weight] of Object.entries(tierWeights)) {
    if (remainder < weight) { tier = candidate; break; }
    remainder -= weight;
  }
  const names = MATERIALS[tier];
  if (!names?.length) throw new TypeError('collection_reward_unconfigured');
  const rollName = random();
  if (!Number.isFinite(rollName) || rollName < 0 || rollName >= 1) throw new TypeError('invalid_random');
  return { materials: { [names[Math.floor(rollName * names.length)]]: stage === 1 ? 3 : 6 } };
}
