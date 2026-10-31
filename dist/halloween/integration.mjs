import { readFileSync } from 'node:fs';
import { createFarmWorldSqlitePersistence } from '../farm-world-sqlite-persistence.js';
import { crops, titles } from '../content.js';
import { getFarm, playerFarms } from '../store.js';
import { LINGYE_NPCS } from '../npc/registry.js';
import { projectHumanMessageBoards } from '../server/farm-catalog-structured.js';
import { createCandyArt } from './candy-art.mjs';
import { createHalloweenFarmRuntime } from './runtime.mjs';
import { HALLOWEEN_COLLECTION, HALLOWEEN_ECONOMY, HALLOWEEN_REWARDS,
  drawCollectionClearReward, readHalloweenReleaseWindow } from './config.mjs';

const manifest = JSON.parse(readFileSync(new URL('./candy-manifest.json', import.meta.url), 'utf8'));
const candyArt = createCandyArt(manifest);

export function createHalloweenFarmIntegration({ database, backend, now = Date.now, onNpcError } = {}) {
  const window = readHalloweenReleaseWindow(process.env);
  const runtime = createHalloweenFarmRuntime({ database, backend,
    persistence: createFarmWorldSqlitePersistence(database), getFarm,
    resolveFarmByDoorplate: doorplate => getFarm(doorplate) ?? null,
    listFarmNeighbors: farmId => {
      const farm = getFarm(farmId);
      if (!farm) return [];
      const boards = projectHumanMessageBoards(farm);
      if (!Array.isArray(boards)) throw new Error('neighbor_catalog_unavailable');
      return boards.filter(board => board?.is_own !== true && typeof board?.farm_doorplate === 'string')
        .map(board => ({ id: board.farm_doorplate, name: String(board.farm_name ?? board.farm_doorplate) }));
    },
    listFarmIds: () => playerFarms().map(farm => farm.id),
    crops, titles, ...(window ? { opensAt: window.opensAt, closesAt: window.closesAt } : { opensAt: null, closesAt: null }),
    economy: HALLOWEEN_ECONOMY, collection: HALLOWEEN_COLLECTION, rewards: HALLOWEEN_REWARDS,
    resolveCollectionClearReward: drawCollectionClearReward,
    appearance: candyArt.appearance, renderCandy: candyArt.renderCandy,
    npcRoster: LINGYE_NPCS.map(({ npcId, name }) => ({ id: npcId, name })), now, onNpcError,
  });
  return Object.freeze({ ...runtime, publishedAt: window?.publishedAt ?? null,
    startNpcDelivery() { runtime.startNpcDelivery(); },
    scheduleNewFarm(farmId) { runtime.scheduleNewFarm(farmId); },
    stopNpcDelivery() { runtime.stopNpcDelivery(); },
  });
}
