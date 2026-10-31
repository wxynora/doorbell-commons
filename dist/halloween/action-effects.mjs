import { AsyncLocalStorage } from 'node:async_hooks';
import { takeTargetEffect, applyEffect } from './effects.mjs';
import { HalloweenStore } from './store.mjs';

const actionScope = new AsyncLocalStorage();
const requiredText = value => typeof value === 'string' && value.trim().length > 0;
const sameEffect = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

// The farm action reads an effect before its existing roll/settlement, but the
// queue removal and target receipt are deferred until the current Farm world
// commit transaction. If that commit fails, SQLite rolls both back together.
class FarmActionEffects {
  constructor(service, context) {
    this.service = service;
    this.store = service.store;
    this.db = service.db;
    this.context = Object.freeze({ ...context });
    this.virtualStates = new Map();
    this.pending = [];
    this.byTarget = new Map();
    this.capturedThefts = new Set();
  }

  target({ farmId, kind, targetId, now, targetAt = now, effective = true, caught = false, base = null }) {
    if (!requiredText(farmId) || !requiredText(kind) || !requiredText(targetId) || !Number.isSafeInteger(now))
      throw new TypeError('invalid_halloween_effect_target');
    if (!effective) return { effect: null, adjustment: null };
    const actorSide = this.context.side;
    const key = `${actorSide}\u0000${farmId}\u0000${kind}\u0000${targetId}`;
    const priorInAction = this.byTarget.get(key);
    if (priorInAction) return this.result(priorInAction.effect, base);

    const previous = this.store.effectReceipt(farmId, kind, targetId);
    if (previous !== undefined) {
      this.byTarget.set(key, { effect: previous, persisted: true });
      return this.result(previous, base);
    }

    let state = this.virtualStates.get(farmId);
    if (!state) {
      state = this.store.load(farmId);
      this.virtualStates.set(farmId, state);
    }
    const taken = takeTargetEffect(state.eatenEffects, { kind, now, targetAt, effective: true, caught, actorSide });
    const pending = { farmId, kind, targetId, now, targetAt, caught, effect: taken.effect };
    if (taken.effect) {
      state.eatenEffects = taken.queue;
      this.pending.push(pending);
    }
    this.byTarget.set(key, pending);
    return this.result(taken.effect, base);
  }

  result(effect, base) {
    return { effect: effect ? structuredClone(effect) : null,
      adjustment: effect && base ? applyEffect(effect, base) : null };
  }

  targetId(kind, suffix) {
    return `${this.context.side}:${this.context.operationId}:${kind}:${String(suffix)}`;
  }

  ownsFarm(farmId) { return this.context.actorFarmId === farmId; }

  blockedOperation(operation, now, farmId = this.context.actorFarmId) {
    if (this.context.side !== 'human' || !this.ownsFarm(farmId)) return null;
    const kinds = {
      harvest: 'human_block_harvest',
      ranch_collect: 'human_block_ranch_collect',
      cook: 'human_block_cook',
      dispatch: 'human_block_dispatch',
    };
    const kind = kinds[operation];
    if (!kind || !Number.isSafeInteger(now)) return null;
    const state = this.store.load(farmId);
    const expiresAt = Math.max(0, ...state.eatenEffects
      .filter(entry => entry.actorSide === 'human' && entry.effect?.kind === kind &&
        entry.eatenAt <= now && entry.expiresAt > now)
      .map(entry => entry.expiresAt));
    return expiresAt ? { code: 'human_effect_blocked', operation, expires_at: expiresAt } : null;
  }

  dogBlockProbability({ farmId, targetId, now, baseProbability, effective }) {
    return this.target({ farmId, kind: 'dog_block', targetId, now, effective,
      base: { dogBlockProbability: baseProbability } }).adjustment?.dogBlockProbability ?? baseProbability;
  }

  harvestBonus({ farmId, targetId, now, baseGold, effective }) {
    return this.target({ farmId, kind: 'harvest', targetId, now, effective,
      base: { baseGold } }).adjustment?.baseGoldBonus ?? 0;
  }

  plantDuration({ farmId, targetId, now, growTicks, effective }) {
    const change = this.target({ farmId, kind: 'plant', targetId, now, effective,
      base: { growthDuration: growTicks } }).adjustment?.growthDuration;
    return change ?? growTicks;
  }

  fishingJunkProbability({ farmId, targetId, now, baseProbability, effective }) {
    return this.target({ farmId, kind: 'fish', targetId, now, effective,
      base: { junkProbability: baseProbability } }).adjustment?.junkProbability ?? baseProbability;
  }

  caughtTheft({ farmId, targetId, now, occurredAt = now, worldFarm }) {
    if (!worldFarm || !Number.isSafeInteger(worldFarm.coins) || worldFarm.coins < 0)
      throw new TypeError('invalid_halloween_theft_settlement');
    if (this.store.effectReceipt(farmId, 'theft', targetId) !== undefined) return 0;
    const key = `${farmId}\u0000${targetId}`;
    if (this.capturedThefts.has(key)) return 0;
    this.capturedThefts.add(key);
    const { adjustment } = this.target({ farmId, kind: 'theft', targetId, now, targetAt: occurredAt,
      effective: true, caught: true, base: { goldBalance: worldFarm.coins } });
    const goldLoss = adjustment?.goldLoss ?? 0;
    worldFarm.coins = Math.max(0, worldFarm.coins - goldLoss);
    return goldLoss;
  }

  capturePlayerPatrolTheft({ actorFarmId, sourceId, occurredAt, now, world }) {
    const thief = world.farms.find(farm => farm.id === actorFarmId);
    if (!thief) return 0;
    return this.caughtTheft({ farmId: actorFarmId, targetId: sourceId, occurredAt, now, worldFarm: thief });
  }

  commitBeforeBalanceProjection({ world }) {
    if (!this.pending.length) return;
    if (!this.db.isTransaction) throw new Error('halloween_effect_commit_transaction_required');
    if (!world || !Array.isArray(world.farms)) throw new TypeError('invalid_halloween_world');
    const states = new Map();
    for (const target of this.pending) {
      if (target.persisted) continue;
      const existing = this.store.effectReceipt(target.farmId, target.kind, target.targetId);
      if (existing !== undefined) {
        if (!sameEffect(existing, target.effect)) throw new Error('halloween_effect_receipt_conflict');
        continue;
      }
      let state = states.get(target.farmId);
      if (!state) {
        state = this.store.load(target.farmId);
        states.set(target.farmId, state);
      }
      const taken = takeTargetEffect(state.eatenEffects, { kind: target.kind, now: target.now,
        targetAt: target.targetAt, effective: true, caught: target.caught, actorSide: this.context.side });
      if (!sameEffect(taken.effect, target.effect)) throw new Error('halloween_effect_changed_before_commit');
      state.eatenEffects = taken.queue;
      this.store.saveEffectReceipt(target.farmId, target.kind, target.targetId, target.effect, target.now);
    }
    for (const [farmId, state] of states) this.store.save(farmId, state);
  }
}

export function createHalloweenFarmActionSession(service, context) {
  if (!service?.store) throw new TypeError('invalid_halloween_action_context');
  if (!requiredText(context?.actorFarmId) || !requiredText(context?.operationId) ||
      !['ai', 'human'].includes(context?.side) || !Number.isSafeInteger(context?.now))
    throw new TypeError('invalid_halloween_action_context');
  return new FarmActionEffects(service, context);
}

export function withHalloweenFarmAction(service, context, operation) {
  if (typeof operation !== 'function') throw new TypeError('invalid_halloween_action_context');
  const session = createHalloweenFarmActionSession(service, context);
  return actionScope.run(session, () => operation(session));
}

export function withHalloweenFarmEffectSession(session, operation) {
  if (!(session instanceof FarmActionEffects) || typeof operation !== 'function')
    throw new TypeError('invalid_halloween_action_session');
  return actionScope.run(session, operation);
}

export function currentHalloweenFarmAction() { return actionScope.getStore() ?? null; }

export function halloweenDogBlockProbability({ victimFarmId, plotId, now, baseProbability, eligible }) {
  const session = currentHalloweenFarmAction();
  if (!session || !eligible) return baseProbability;
  return session.dogBlockProbability({ farmId: session.context.actorFarmId,
    targetId: session.targetId('dog_block', `${victimFarmId}:${plotId}`), now,
    baseProbability, effective: true });
}

export function halloweenHarvestGoldBonus({ farmId, plotId, now, baseGold, effective }) {
  const session = currentHalloweenFarmAction();
  if (!session || !session.ownsFarm(farmId)) return 0;
  return session.harvestBonus({ farmId, targetId: session.targetId('harvest', `${farmId}:${plotId}`),
    now, baseGold, effective });
}

export function halloweenHumanOperationBlock({ farmId, operation, now }) {
  return currentHalloweenFarmAction()?.blockedOperation(operation, now, farmId) ?? null;
}

export function halloweenRanchYieldCount({ farmId, targetId, now, count }) {
  const session = currentHalloweenFarmAction();
  if (!session || session.context.side !== 'human' || !session.ownsFarm(farmId) ||
      !Number.isSafeInteger(count) || count <= 0) return count;
  const adjustment = session.target({ farmId, kind: 'ranch_collect',
    targetId: session.targetId('ranch_collect', targetId), now, effective: true, base: { count } }).adjustment;
  return count + (adjustment?.additionalCount ?? 0);
}

export function halloweenCookExtraDishes({ farmId, targetId, now }) {
  const session = currentHalloweenFarmAction();
  if (!session || session.context.side !== 'human' || !session.ownsFarm(farmId)) return 0;
  return session.target({ farmId, kind: 'cook', targetId: session.targetId('cook', targetId),
    now, effective: true, base: {} }).adjustment?.additionalDishes ?? 0;
}

export function halloweenPlantGrowTicks({ farmId, plotId, now, growTicks }) {
  const session = currentHalloweenFarmAction();
  if (!session || !session.ownsFarm(farmId)) return growTicks;
  return session.plantDuration({ farmId, targetId: session.targetId('plant', `${farmId}:${plotId}`),
    now, growTicks, effective: true });
}

export function halloweenFishingJunkProbability({ farmId, castIndex, now, baseProbability }) {
  const session = currentHalloweenFarmAction();
  if (!session || !session.ownsFarm(farmId)) return baseProbability;
  return session.fishingJunkProbability({ farmId, targetId: session.targetId('fish', `${farmId}:${castIndex}`),
    now, baseProbability, effective: true });
}

// This callback is composed into the existing Farm coordinator's
// before-farm-balance-projection hook, which runs inside its SQLite transaction.
export function createHalloweenFarmEffectHooks(service) {
  return Object.freeze({
    beforeFarmBalanceProjection({ world, capturedPlayerThefts = [], now = Date.now() }) {
      const session = currentHalloweenFarmAction();
      for (const capture of capturedPlayerThefts) {
        if (!requiredText(capture?.actorFarmId) || !requiredText(capture?.sourceId) ||
            !Number.isSafeInteger(capture?.occurredAt)) continue;
        const activeForActor = session?.context.side === 'ai' && session?.context.actorFarmId === capture.actorFarmId;
        const captureSession = activeForActor ? session : createHalloweenFarmActionSession(service, {
          actorFarmId: capture.actorFarmId,
          side: 'ai',
          operationId: `player-patrol:${capture.sourceId}`,
          now,
        });
        captureSession.capturePlayerPatrolTheft({ ...capture, now, world });
        if (!activeForActor) captureSession.commitBeforeBalanceProjection({ world });
      }
      session?.commitBeforeBalanceProjection({ world });
    },
    recordNpcPatrolCapture({ actorFarmId, sourceId, occurredAt, now, world }) {
      const session = currentHalloweenFarmAction();
      if (!session || session.context.side !== 'ai') return 0;
      const thief = world.farms.find(farm => farm.id === actorFarmId);
      if (!thief) return 0;
      return session.caughtTheft({ farmId: actorFarmId, targetId: sourceId,
        occurredAt, now, worldFarm: thief });
    },
  });
}
