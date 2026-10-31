import { beijingDay } from './service.mjs';

const DAY_MS = 86400000;
const dayStart = day => Date.parse(`${day}T00:00:00+08:00`);

// Uses one timeout per known NPC arrival and one for the next Beijing day.
// Failed same-day arrivals are retried only when startup or an authorized
// activity mutation calls scheduleFarm again; no polling cadence is invented.
export function createHalloweenNpcDeliveryRuntime({ service, listFarmIds, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, onError = () => {} }) {
  if (!service || typeof listFarmIds !== 'function') throw new TypeError('npc_delivery_runtime_unavailable');
  const timers = new Set();
  const arrivals = new Map();
  let stopped = false;
  const scheduleAt = (at, operation) => {
    const delay = Math.max(0, at - now());
    const timer = setTimer(() => {
      timers.delete(timer);
      if (!stopped) operation();
    }, delay);
    timer?.unref?.();
    timers.add(timer);
    return timer;
  };
  const scheduleFarm = farmId => {
    if (stopped) return;
    const current = now();
    let plan;
    try { plan = service.prepareNpcDelivery(farmId, current); }
    catch (error) { onError({ farmId, day: beijingDay(current), code: error.code ?? error.message }); return; }
    const prior = arrivals.get(farmId);
    if (plan.scheduled && prior?.day === plan.day && prior.token === plan.token) return;
    if (prior) {
      clearTimer(prior.timer);
      timers.delete(prior.timer);
      arrivals.delete(farmId);
    }
    if (!plan.scheduled) return;
    const timer = scheduleAt(plan.arrivalAt, () => {
      arrivals.delete(farmId);
      try { service.runNpcDelivery(farmId, now(), { day: plan.day, token: plan.token }); }
      catch (error) { onError({ farmId, day: plan.day, code: error.code ?? error.message }); }
    });
    arrivals.set(farmId, { day: plan.day, token: plan.token, timer });
  };
  const scheduleDay = () => {
    if (stopped) return;
    const current = now();
    const phase = service.phase(current);
    if (phase === 'unconfigured' || phase === 'ended') return;
    if (phase === 'upcoming') {
      scheduleAt(service.options.opensAt, scheduleDay);
      return;
    }
    for (const farmId of listFarmIds()) scheduleFarm(farmId);
    const nextDay = dayStart(beijingDay(current)) + DAY_MS;
    if (nextDay < service.options.closesAt) scheduleAt(nextDay, scheduleDay);
  };
  return Object.freeze({
    start() { if (!stopped) scheduleDay(); },
    scheduleFarm,
    stop() {
      stopped = true;
      for (const timer of timers) clearTimer(timer);
      timers.clear();
      arrivals.clear();
    },
  });
}
