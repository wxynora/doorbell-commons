import { MATERIALS } from './materials.mjs';
import { drawCollectionClearReward as drawReward } from './collection-reward.mjs';
const PRICE = Object.freeze({ N: 60, R: 160, SR: 360, SSR: 700, SP: 700 });
export const HALLOWEEN_ECONOMY = Object.freeze({
  unitsPerCell: 1, unitsPerBatch: 3, candiesPerBatch: 6,
  shopByMaterial: Object.freeze(Object.fromEntries(Object.entries(MATERIALS).flatMap(([tier, names]) =>
    names.map(name => [name, Object.freeze({ price: PRICE[tier], quantity: 3 })])))),
  rarityByTier: Object.freeze({ N: 'ordinary', R: 'rare', SR: 'precious', SSR: 'legendary', SP: 'legendary' }),
});
export const HALLOWEEN_COLLECTION = Object.freeze({ capacity: 7, stagesTotal: 2,
  tierWeights: Object.freeze({ N: 0.70, R: 0.20, SR: 0.07, SSR: 0.025, SP: 0.005 }),
  stages: Object.freeze([Object.freeze({ pieces: 18 }), Object.freeze({ pieces: 120, distinctMaterials: 24, sizeScale: 1.12 })]),
});
export const HALLOWEEN_REWARDS = Object.freeze({ dailyThreshold: 10, daily: Object.freeze({ gold: 10000 }), milestones: Object.freeze([
  Object.freeze({ threshold: 10, reward: Object.freeze({ gold: 10000, title: 'halloween_2026_sugar_bag_ghost', seeds: Object.freeze({ SSR: 1 }) }) }),
  Object.freeze({ threshold: 30, reward: Object.freeze({ gold: 30000, title: 'halloween_2026_sweet_accomplice', seeds: Object.freeze({ SSR: 2 }) }) }),
  Object.freeze({ threshold: 70, reward: Object.freeze({ gold: 80000, title: 'halloween_2026_candy_tycoon', seeds: Object.freeze({ SP: 1, SSR: 2 }) }) }),
]) });
export function drawCollectionClearReward({ random, stage }) {
  return drawReward({ random, stage, tierWeights: HALLOWEEN_COLLECTION.tierWeights });
}
export function readHalloweenReleaseWindow(env = process.env) {
  const raw = env?.DOORBELL_HALLOWEEN_PUBLISHED_AT;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const publishedAt = Number(value);
  const duration = 72 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(publishedAt) || !Number.isSafeInteger(publishedAt + duration)) return null;
  return Object.freeze({ publishedAt, opensAt: publishedAt, closesAt: publishedAt + duration });
}
