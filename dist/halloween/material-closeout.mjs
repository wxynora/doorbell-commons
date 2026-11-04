import { MATERIALS } from './materials.mjs';

const materialTier = new Map(Object.entries(MATERIALS).flatMap(([tier, names]) =>
  names.map(name => [name, tier])));

// Rates are supplied by the approved event configuration, never inferred from
// shop silver prices. The existing reward outbox and wallet ledger own payment.
export function createHalloweenMaterialCloseout({ service, authority, rates,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onError = () => {} }) {
  if (!rates || Object.keys(MATERIALS).some(tier =>
    !Number.isSafeInteger(rates[tier]) || rates[tier] <= 0))
    throw new TypeError('halloween_closeout_rates_required');
  const price = Object.freeze({ ...rates });
  let timer = null;
  let stopped = false;
  let started = false;

  function settleFarm(farmId, current = now()) {
    if (stopped || service.phase(current) !== 'ended') return;
    try {
      // Do not create absent households or retry an existing pending reward
      // twice in one startup/action. The original outbox recovery handles it.
      if (!service.db.prepare(`SELECT 1 FROM halloween_households
        WHERE event_id=? AND farm_id=?`).get(service.options.eventId, farmId) ||
          service.store.load(farmId).materialCloseout) return;
      return authority.withAuthorityAction({ farmId, side: 'human',
        requestId: 'material-closeout', now: current }, () => {
        service.store.transaction(() => {
          const state = service.store.load(farmId);
          if (state.materialCloseout) return;
          const materials = {};
          let gold = 0;
          for (const [name, quantity] of Object.entries(state.materials)) {
            const tier = materialTier.get(name);
            if (!tier || !Number.isSafeInteger(quantity) || quantity < 0)
              throw new TypeError('invalid_closeout_material');
            if (quantity === 0) continue;
            gold += quantity * price[tier];
            if (!Number.isSafeInteger(gold)) throw new TypeError('invalid_closeout_total');
            materials[name] = quantity;
          }
          const rewardKey = 'material-closeout';
          if (gold > 0) service.store.queueReward(farmId, rewardKey, { gold });
          state.materialCloseout = { closedAt: service.options.closesAt, queuedAt: current,
            materials, rates: price, gold,
            rewardId: gold > 0 ? `${service.options.eventId}:${farmId}:${rewardKey}` : null };
          state.materials = {};
          service.store.save(farmId, state);
        });
        // Failed credits retain their durable pending reward. Existing startup
        // and successful activity actions recover it with the same ledger key.
        return service.settleRewards(farmId, current);
      });
    } catch (error) {
      onError({ farmId, code: error.code ?? error.message });
    }
  }

  function settleAll() {
    if (stopped) return;
    const current = now();
    if (service.phase(current) !== 'ended') return;
    try {
      const rows = service.db.prepare(`SELECT farm_id FROM halloween_households
        WHERE event_id=? ORDER BY farm_id`).all(service.options.eventId);
      for (const row of rows) settleFarm(row.farm_id, current);
    } catch (error) {
      onError({ farmId: null, code: error.code ?? error.message });
    }
  }

  function schedule() {
    if (stopped) return;
    const current = now();
    const phase = service.phase(current);
    if (phase === 'unconfigured') return;
    if (phase === 'ended') { settleAll(); return; }
    timer = setTimer(() => { timer = null; schedule(); }, service.options.closesAt - current);
    timer?.unref?.();
  }

  return Object.freeze({
    settleFarm,
    start() { if (!started && !stopped) { started = true; schedule(); } },
    stop() { stopped = true; if (timer !== null) clearTimer(timer); timer = null; },
  });
}
