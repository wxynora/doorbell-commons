import { HalloweenService } from './service.mjs';
import { installHalloweenSchema } from './schema.mjs';
import { createHalloweenFarmAuthorityAdapter } from './authority-adapter.mjs';
import { createHalloweenTogetherActivity } from './together-activity.mjs';
import { createHalloweenFarmEffectHooks } from './action-effects.mjs';
import { createHalloweenNpcDeliveryRuntime } from './npc-delivery-runtime.mjs';

// The Farm entrypoint supplies its one existing Lingye SQLite connection,
// economy backend, Farm persistence port, and verified Farm catalogues here.
// Event mechanics never open their own database connection or invent defaults.
export function createHalloweenFarmRuntime({ database, backend, persistence, getFarm,
  resolveFarmByDoorplate, listFarmNeighbors, listFarmIds, crops, titles,
  eventId = 'halloween-2026', opensAt, closesAt, economy, collection, rewards,
  appearance, renderCandy, npcRoster, random, generateId, generateSeed, resolveCollectionClearReward,
  now = Date.now, onNpcError, onRewardError }) {
  if (!((opensAt == null && closesAt == null) || (Number.isSafeInteger(opensAt) &&
      Number.isSafeInteger(closesAt) && closesAt > opensAt)) ||
      !economy || !collection || !rewards || !appearance || typeof renderCandy !== 'function' ||
      !Array.isArray(npcRoster) || !npcRoster.length || typeof listFarmIds !== 'function')
    throw new TypeError('halloween_runtime_configuration_unavailable');

  const authority = createHalloweenFarmAuthorityAdapter({ database, backend, persistence, getFarm,
    resolveFarmByDoorplate, listFarmNeighbors, crops, titles, eventId });
  installHalloweenSchema(database);
  const service = new HalloweenService(database, { eventId, opensAt, closesAt, economy, collection, rewards,
    appearance, renderCandy, npcRoster, titles, random, generateId, generateSeed,
    resolveCollectionClearReward, withRewardSavepoint: authority.withRewardSavepoint,
    debitSilver: authority.debitSilver, applyCurrency: authority.applyCurrency,
    grantReward: authority.grantReward, resolveNeighbor: authority.resolveNeighbor,
    listNeighbors: authority.listNeighbors });
  const effectHooks = createHalloweenFarmEffectHooks(service);
  const npcDelivery = createHalloweenNpcDeliveryRuntime({ service, listFarmIds, now, onError: onNpcError });
  const reportRewardError = onRewardError ?? (detail =>
    console.error('[halloween-reward] recovery pending', detail.farmId, detail.code));
  const pendingForFarm = database.prepare(`SELECT 1 FROM halloween_reward_outbox
    WHERE event_id=? AND farm_id=? AND status='pending' LIMIT 1`);
  const recoverPendingRewards = ({ farmId, side, requestId, now: recoveryTime }) => {
    try {
      if (!pendingForFarm.get(eventId, farmId)) return;
      authority.withAuthorityAction({ farmId, side, requestId: `reward-recovery:${requestId}`, now: recoveryTime },
        () => service.settleRewards(farmId, recoveryTime));
    } catch (error) {
      reportRewardError({ farmId, code: error.code ?? error.message });
    }
  };
  const actionAuthority = Object.freeze({ ...authority,
    withAuthorityAction(input, operation) {
      const result = authority.withAuthorityAction(input, operation);
      if (input.op && input.op !== 'gift') recoverPendingRewards(input);
      return result;
    },
  });
  const activityWithRecovery = createHalloweenTogetherActivity({ service,
    withAuthorityAction: actionAuthority.withAuthorityAction, ...(generateId ? { generateId } : {}) });

  return Object.freeze({ service, authority: actionAuthority, activity: activityWithRecovery, effectHooks, npcDelivery,
    scheduleFarm(farmId) { npcDelivery.scheduleFarm(farmId); },
    scheduleNewFarm(farmId) { npcDelivery.scheduleFarm(farmId); },
    // The existing Farm startup hook also restores any durable reward outbox.
    startNpcDelivery() {
      let pendingFarms = [];
      try {
        pendingFarms = database.prepare(`SELECT DISTINCT farm_id FROM halloween_reward_outbox
          WHERE event_id=? AND status='pending'`).all(eventId);
      } catch (error) {
        reportRewardError({ farmId: null, code: error.code ?? error.message });
      }
      const recoveryTime = now();
      for (const row of pendingFarms) recoverPendingRewards({ farmId: row.farm_id, side: 'human',
        requestId: 'startup', now: recoveryTime });
      npcDelivery.start();
    },
    stopNpcDelivery() { npcDelivery.stop(); },
  });
}
