import { randomInt, randomUUID } from 'node:crypto';
import { MATERIALS, selectPrimaryMaterial } from './materials.mjs';
import { createCollectionTrip, pickCollectionTile, shakeCollection, advanceCollectionTrip,
  expireCollectionTimer, finishCollectionTimer, initializeCollectionTimer, projectCollection,
  updateCollectionTimer } from './collection.mjs';
import { createRun, canStartRun, moveOne, ascend, finishRun, projectRun } from './exploration.mjs';
import { createActorHiddenEffects, effectDurationMs, queueEatenEffect, resolveActorHiddenEffects } from './effects.mjs';
import { HalloweenStore, ReceiptConflictError, canonical } from './store.mjs';
import { COOKING_MOLDS, COOKING_PALETTE, COOKING_RULES_VERSION, MATERIAL_COOKING_RULES,
  SELECTABLE_COOKING_MOLD_IDS,
  evaluateCookingProcess, evaluateSemanticTimingPlan, projectSemanticCraftCatalog,
  upgradeRarityBySemanticTiming, upgradeRarityOnce } from './cooking-rules.mjs';

export class HalloweenError extends Error {
  constructor(code, status = 409, details) {
    super(code);
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}
const fail = (code, status, details) => { throw new HalloweenError(code, status, details); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const TIERS = Object.keys(MATERIALS);
const MATERIAL_ORDER = Object.values(MATERIALS).flat();
const TIER_BY_NAME = new Map(Object.entries(MATERIALS).flatMap(([tier, names]) => names.map(name => [name, tier])));
const NPC_RARITY = Object.freeze([[0.70, 'ordinary'], [0.25, 'rare'], [0.04, 'precious'], [0.01, 'legendary']]);
const ACTION_KEYS = {
  view: [], collection_start: [], collection_pick: ['tileId', 'sessionId', 'revision'],
  collection_shake: ['sessionId', 'revision'], collection_timer: ['action', 'sessionId', 'stage', 'transitionVersion'],
  explore_start: [], explore_move: ['route'], explore_ascend: [], explore_end: [],
  craft: [], buy: ['material'], buy_cart: ['materials'], gift: ['candyIds', 'doorplate'], eat: ['candyId', 'target'],
};
const humanCraftingKeys = ['materials', 'shape', 'process'];
const aiCraftingKeys = ['materials', 'shape', 'additions'];
export const beijingDay = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);

function legacyCollectionStageClaimed(state, day, stage) {
  if (state.collectionRewardClaimsVersion === 1) return false;
  const run = state.collection;
  if (!run || run.day !== day || !Number.isSafeInteger(run.stage)) return false;
  const clearedThrough = run.sessionStatus === 'complete' || run.status === 'complete'
    ? run.stage : run.stage - 1;
  return stage <= clearedThrough;
}

function collectionStageRewardClaimed(state, day, stage) {
  return Boolean(state.collectionRewardClaims?.[day]?.[String(stage)]) ||
    legacyCollectionStageClaimed(state, day, stage);
}

function migrateCollectionRewardClaims(state) {
  state.collectionRewardClaims ??= {};
  if (state.collectionRewardClaimsVersion === 1) return;
  const run = state.collection;
  if (run && typeof run.day === 'string' && Number.isSafeInteger(run.stage)) {
    const clearedThrough = run.sessionStatus === 'complete' || run.status === 'complete'
      ? run.stage : run.stage - 1;
    if (clearedThrough > 0) {
      const dayClaims = state.collectionRewardClaims[run.day] ??= {};
      for (let stage = 1; stage <= clearedThrough; stage++) {
        dayClaims[String(stage)] ??= { legacy: true, sessionId: run.sessionId ?? null };
      }
    }
  }
  state.collectionRewardClaimsVersion = 1;
}

function gatheredExplorationMaterials(run, unitsPerCell) {
  if (!run || !Number.isSafeInteger(unitsPerCell) || unitsPerCell <= 0) return {};
  const materials = {};
  for (const floor of run.floors ?? []) for (const cell of floor.cells ?? []) {
    if (cell.visited && cell.kind === 'material')
      materials[cell.name] = (materials[cell.name] ?? 0) + unitsPerCell;
  }
  return materials;
}

function saveCollectionStageRewardClaim(state, { day, stage, materials, requestId, sessionId, now }) {
  migrateCollectionRewardClaims(state);
  const dayClaims = state.collectionRewardClaims[day] ??= {};
  dayClaims[String(stage)] = { materials: { ...materials }, requestId, sessionId, claimedAt: now };
}

export class HalloweenService {
  constructor(database, options) {
    if (!text(options?.eventId)) throw new TypeError('event_id_required');
    this.db = database;
    this.store = new HalloweenStore(database, options.eventId);
    this.options = options;
    this.id = options.generateId ?? randomUUID;
    this.random = options.random ?? (() => randomInt(0x100000000) / 0x100000000);
    this.seed = options.generateSeed ?? (() => randomInt(0x100000000));
    // No guessed event deadline, recipe, collection capacity or reward values.
    if (options.opensAt != null && !Number.isSafeInteger(options.opensAt)) throw new TypeError('invalid_event_window');
    if (options.closesAt != null && (!Number.isSafeInteger(options.closesAt) || options.closesAt <= options.opensAt)) throw new TypeError('invalid_event_window');
  }
  phase(now) {
    if (!Number.isSafeInteger(now)) fail('invalid_time', 400);
    if (this.options.opensAt == null || this.options.closesAt == null) return 'unconfigured';
    return now < this.options.opensAt ? 'upcoming' : now >= this.options.closesAt ? 'ended' : 'open';
  }
  view(farmId, now, side = 'ai') {
    const state = this.store.load(farmId);
    const rewards = this.store.rewards(farmId);
    const collection = projectCollection(state.collection, now);
    if (side === 'human' && collection) {
      collection.stageClearRewardClaimed = collectionStageRewardClaimed(
        state, beijingDay(now), state.collection.stage ?? 1);
    }
    const shapeOptions = this.options.appearance?.shapeOptions ?? this.options.appearance?.shapes ?? [];
    const shapeIds = shapeOptions.map(shape => typeof shape === 'string' ? shape : shape?.id);
    const availableMolds = COOKING_MOLDS.filter(mold =>
      SELECTABLE_COOKING_MOLD_IDS.includes(mold.id) && shapeIds.includes(mold.id));
    let neighbors;
    if (side === 'human') {
      const listedNeighbors = this.options.listNeighbors?.({ farmId }) ?? [];
      if (!Array.isArray(listedNeighbors) || listedNeighbors.some(neighbor =>
        !text(neighbor?.doorplate) || !text(neighbor?.name))) fail('neighbor_list_unavailable', 503);
      neighbors = listedNeighbors.map(neighbor => ({
        doorplate: neighbor.doorplate,
        displayName: neighbor.name,
      }));
    }
    return {
        eventId: this.options.eventId, phase: this.phase(now),
        opensAt: this.options.opensAt ?? null, closesAt: this.options.closesAt ?? null,
        ...(side === 'human' ? { neighbors } : {}),
        collection,
        materials: { ...state.materials }, purchases: [...state.purchases],
        candies: this.store.availableCandies(farmId),
        exploration: state.exploration ? projectRun(state.exploration) : null,
        explorationAvailable: this.phase(now) === 'open' && canStartRun({ run: state.exploration, lastStartedDay: state.lastExplorationDay }, beijingDay(now)),
        collectionAvailable: this.phase(now) === 'open' && (side !== 'ai'
          ? Boolean(this.options.collection)
          : collection?.status === 'active' || state.lastCollectionDay !== beijingDay(now)),
        effects: structuredClone(state.eatenEffects.filter(entry =>
          entry.actorSide === side && entry.expiresAt > now)),
        deliveredToday: state.deliveredByDay[beijingDay(now)] ?? 0,
        deliveredTotal: state.deliveredTotal,
        rewards,
        catalog: Object.entries(MATERIALS).flatMap(([tier, names]) => names.map(name => ({ name, tier,
          price: this.options.economy?.shopByMaterial?.[name]?.price ?? null }))),
        crafting: side === 'human' && this.options.economy && this.options.appearance && this.options.renderCandy ? {
          rulesVersion: COOKING_RULES_VERSION,
          unitsPerBatch: this.options.economy.unitsPerBatch,
          candiesPerBatch: this.options.economy.candiesPerBatch,
          molds: availableMolds,
          palette: COOKING_PALETTE,
          materials: MATERIAL_COOKING_RULES,
          availableMoldIds: availableMolds.map(mold => mold.id),
          stirTurns: { minimum: 4, best: 6 },
          fill: { minimum: 0.8, maximum: 1.25, idealMinimum: 0.96, idealMaximum: 1.04 },
        } : side === 'ai' && this.options.economy && this.options.appearance && this.options.renderCandy ? {
          unitsPerBatch: this.options.economy.unitsPerBatch,
          candiesPerBatch: this.options.economy.candiesPerBatch,
          ...projectSemanticCraftCatalog(state.materials, shapeIds),
        } : null,
    };
  }
  projectHumanCollection(state, now) {
    const collection = projectCollection(state.collection, now);
    if (collection) collection.stageClearRewardClaimed = collectionStageRewardClaimed(
      state, beijingDay(now), state.collection.stage ?? 1);
    return collection;
  }
  prepareNpcDelivery(farmId, now) {
    if (!text(farmId)) fail('invalid_request', 400);
    const phase = this.phase(now);
    if (phase !== 'open') return { delivered: 0, phase };
    const roster = this.options.npcRoster;
    const shapes = this.options.appearance?.shapes;
    const colors = this.options.appearance?.colors;
    if (!Array.isArray(roster) || !roster.length || roster.some(npc => !text(npc?.id) || !text(npc?.name)) ||
        !Array.isArray(shapes) || !shapes.length || !Array.isArray(colors) || !colors.length || !this.options.renderCandy)
      fail('npc_delivery_unconfigured', 503);
    const choose = values => {
      const roll = this.random();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new TypeError('invalid_random');
      return values[Math.floor(roll * values.length)];
    };
    return this.store.transaction(() => {
      const state = this.store.load(farmId);
      const day = beijingDay(now);
      state.npcDeliveryDays ??= [];
      if (state.npcDeliveryDays.includes(day)) return { delivered: 0, alreadyDelivered: true, day };
      state.npcMissedDays ??= [];
      state.npcMissedDays = state.npcMissedDays.filter(existingDay => existingDay !== day);
      state.npcArrivals ??= {};
      let arrival = state.npcArrivals[day];
      if (!arrival) {
        const dayStart = Date.parse(`${day}T00:00:00+08:00`);
        const dayEnd = dayStart + 86400000;
        const openStart = Math.max(dayStart, this.options.opensAt);
        const openEnd = Math.min(dayEnd, this.options.closesAt);
        if (openEnd <= openStart) return { delivered: 0, phase: 'closed_for_day' };
        const timeRoll = this.random();
        if (!Number.isFinite(timeRoll) || timeRoll < 0 || timeRoll >= 1) throw new TypeError('invalid_random');
        arrival = { at: openStart + Math.floor(timeRoll * (openEnd - openStart)),
          npcId: choose(roster).id, token: this.id(), status: 'scheduled' };
        state.npcArrivals[day] = arrival;
      }
      if (arrival.status === 'delivered') return { delivered: 0, alreadyDelivered: true, day };
      // A due arrival remains recoverable during this Beijing day. The runtime
      // schedules its stored timestamp immediately when that timestamp passed.
      if (arrival.status === 'missed') arrival.status = 'scheduled';
      this.store.save(farmId, state);
      return { delivered: 0, scheduled: true, overdue: now > arrival.at, day,
        arrivalAt: arrival.at, npcId: arrival.npcId, token: arrival.token };
    });
  }
  runNpcDelivery(farmId, now, { day, token } = {}) {
    if (!text(farmId) || !text(day) || !text(token)) fail('invalid_request', 400);
    if (!Number.isSafeInteger(now)) fail('invalid_time', 400);
    if (beijingDay(now) !== day) return { delivered: 0, stale: true, day };
    if (this.phase(now) !== 'open') return { delivered: 0, phase: this.phase(now) };
    const roster = this.options.npcRoster;
    const shapes = this.options.appearance?.shapes;
    const colors = this.options.appearance?.colors;
    if (!Array.isArray(roster) || !roster.length || roster.some(npc => !text(npc?.id) || !text(npc?.name)) ||
        !Array.isArray(shapes) || !shapes.length || !Array.isArray(colors) || !colors.length || !this.options.renderCandy)
      fail('npc_delivery_unconfigured', 503);
    const shapeId = value => typeof value === 'string' ? value : value?.id;
    const drawRarity = () => {
      let roll = this.random();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new TypeError('invalid_random');
      for (const [weight, rarity] of NPC_RARITY) {
        if (roll < weight) return rarity;
        roll -= weight;
      }
      return 'legendary';
    };
    const choose = values => {
      const roll = this.random();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new TypeError('invalid_random');
      return values[Math.floor(roll * values.length)];
    };
    return this.store.transaction(() => {
      const state = this.store.load(farmId);
      state.npcDeliveryDays ??= [];
      state.npcMissedDays ??= [];
      if (state.npcDeliveryDays.includes(day)) return { delivered: 0, alreadyDelivered: true, day };
      if (state.npcMissedDays.includes(day)) return { delivered: 0, missed: true, day };
      const arrival = state.npcArrivals?.[day];
      if (!arrival || arrival.status !== 'scheduled' || arrival.token !== token) return { delivered: 0, stale: true, day };
      if (now < arrival.at) return { delivered: 0, notDue: true, day, arrivalAt: arrival.at };
      const npc = roster.find(entry => entry.id === arrival.npcId);
      if (!npc) fail('npc_delivery_unconfigured', 503);
      const candyIds = [];
      for (let index = 0; index < 2; index++) {
        const rarity = drawRarity();
        const flavorMaterial = choose(MATERIAL_ORDER);
        const shape = shapeId(choose(shapes));
        const color = shapeId(choose(colors));
        const rendered = this.options.renderCandy({ shape, color, flavorMaterial,
          flavor: `${flavorMaterial}味`, materials: {}, source: { kind: 'npc', npcId: npc.id, day } });
        if (!record(rendered?.appearance) || !text(rendered?.image) || !text(rendered.appearance.name)) fail('candy_art_unavailable', 503);
        const id = this.id();
        this.store.insertCandy({ id, owner: farmId, source: { kind: 'npc', npcId: npc.id, day },
          senderName: npc.name, ...rendered, rarity,
          effect: createActorHiddenEffects(rarity, this.random), now });
        candyIds.push(id);
      }
      state.npcDeliveryDays.push(day);
      arrival.status = 'delivered';
      arrival.candyIds = candyIds;
      this.store.save(farmId, state);
      return { delivered: candyIds.length, day, npcId: npc.id, candyIds };
    });
  }
  execute({ farmId, side, op, args = {}, requestId }, now = Date.now()) {
    if (!text(farmId) || !['human', 'ai'].includes(side) || !Object.hasOwn(ACTION_KEYS, op) || !record(args)) fail('invalid_request', 400);
    const keys = op === 'craft' ? (side === 'human' ? humanCraftingKeys : aiCraftingKeys) : ACTION_KEYS[op];
    const argKeys = Object.keys(args);
    const requiredKeys = op === 'eat' ? ['candyId'] : keys;
    if (requiredKeys.some(key => !Object.hasOwn(args, key)) || argKeys.some(key => !keys.includes(key)) ||
        (op !== 'eat' && argKeys.length !== keys.length) ||
        (op === 'eat' && Object.hasOwn(args, 'target') && !['self', 'other'].includes(args.target)))
      fail('invalid_request', 400);
    if (op === 'view') return this.view(farmId, now, side);
    if (!text(requestId)) fail('invalid_request', 400);
    const receiptArgs = op === 'eat' && args.target === 'self'
      ? { candyId: args.candyId }
      : args;
    const command = JSON.stringify(canonical({ side, op, args: receiptArgs }));
    return this.store.transaction(() => {
      let receipt;
      try { receipt = this.store.receipt(farmId, requestId, command); }
      catch (error) {
        if (error instanceof ReceiptConflictError) fail('receipt_conflict');
        throw error;
      }
      if (receipt) return receipt;
      // Saved candy remains edible after closing. A replay remains available
      // regardless of phase, without another charge, transfer or random draw.
      const phase = this.phase(now);
      if (phase !== 'open' && !(op === 'eat' && phase === 'ended')) fail('event_not_open');
      const state = this.store.load(farmId);
      const result = this.perform({ farmId, side, op, args, requestId, now, state });
      if (op.startsWith('explore_') && result.exploration?.status === 'finished')
        result.gatheredMaterials = gatheredExplorationMaterials(
          state.exploration, this.options.economy?.unitsPerCell);
      this.store.save(farmId, state);
      this.store.saveReceipt(farmId, requestId, command, result);
      return result;
    });
  }
  applyExplorationEvents(farmId, side, state, events, operationId) {
    for (const [index, event] of events.entries()) {
      if (event.kind === 'material') {
        const units = this.options.economy?.unitsPerCell;
        if (!Number.isSafeInteger(units) || units <= 0) fail('material_economy_unconfigured', 503);
        state.materials[event.name] = (state.materials[event.name] ?? 0) + units;
        event.quantity = units;
      } else if (event.kind === 'money' || event.kind === 'trick') {
        if (!this.options.applyCurrency) fail('wallet_unavailable', 503);
        // Adapter caps losses to the available balance in this same connection.
        const result = this.options.applyCurrency({ farmId, side, currency: event.currency, amount: event.amount, operationId: `${operationId}:${index}`, capLoss: true });
        if (!record(result) || !Number.isSafeInteger(result.appliedAmount)) fail('wallet_receipt_unavailable', 503);
        event.appliedAmount = result.appliedAmount;
      }
    }
  }
  applyCollectionClearReward({ farmId, state, run, requestId, now, day }) {
    const resolve = this.options.resolveCollectionClearReward;
    if (typeof resolve !== 'function') fail('collection_reward_unconfigured', 503);
    let reward;
    try {
      reward = resolve({ farmId, requestId, now, random: this.random, day, sessionId: run.sessionId,
        stage: run.stage, stagesTotal: run.stagesTotal });
    } catch {
      fail('collection_reward_unconfigured', 503);
    }
    if (!record(reward?.materials) || !Object.keys(reward.materials).length)
      fail('collection_reward_unconfigured', 503);
    const entries = Object.entries(reward.materials);
    if (entries.some(([name, quantity]) => !TIER_BY_NAME.has(name) ||
        !Number.isSafeInteger(quantity) || quantity <= 0))
      fail('collection_reward_invalid', 503);
    run.collected ??= {};
    for (const [name, quantity] of entries) {
      state.materials[name] = (state.materials[name] ?? 0) + quantity;
      run.collected[name] = (run.collected[name] ?? 0) + quantity;
    }
    return { materials: Object.fromEntries(entries) };
  }
  perform({ farmId, side, op, args, requestId, now, state }) {
    if (op.startsWith('collection_')) {
      if (side !== 'human') fail('actor_not_allowed', 403);
      migrateCollectionRewardClaims(state);
      if (state.collection) {
        initializeCollectionTimer(state.collection);
        const timedOut = expireCollectionTimer(state.collection, now);
        if (timedOut && op !== 'collection_start')
          return { timedOut: true, collection: this.projectHumanCollection(state, now) };
      }
      if (op === 'collection_start') {
        const previous = state.collection;
        if (previous?.status === 'active' && previous.sessionStatus !== 'failed') {
          const collection = this.projectHumanCollection(state, now);
          return { collection, resumed: true, stageClearRewardClaimed: collection.stageClearRewardClaimed };
        }
        if (!this.options.collection) fail('collection_unconfigured', 503);
        const day = beijingDay(now);
        const retryingFailure = Boolean(previous && (previous.sessionStatus === 'failed' ||
          previous.status === 'failed' || previous.status === 'full' || previous.timer?.status === 'expired'));
        const retryStage = retryingFailure ? previous.stage ?? 1 : 1;
        const retryReason = retryingFailure
          ? previous.status === 'full' ? 'full' : previous.timer?.status === 'expired' || previous.status === 'failed' ? 'timeout' : 'failed'
          : undefined;
        const wasComplete = Boolean(previous && (previous.sessionStatus === 'complete' || previous.status === 'complete'));
        const collected = retryingFailure ? { ...(previous.collected ?? {}) } : {};
        state.collection = createCollectionTrip({ random: this.random, generateId: this.id,
          policy: this.options.collection, day, seed: this.seed(), stage: retryStage });
        state.collection.collected = collected;
        state.lastCollectionDay = day;
        const collection = this.projectHumanCollection(state, now);
        return { collection, started: !retryingFailure && !wasComplete,
          ...(retryingFailure ? { restarted: true, retryStage, retryReason } : {}),
          ...(wasComplete ? { replayed: true } : {}),
          stageClearRewardClaimed: collection.stageClearRewardClaimed };
      }
      if (op === 'collection_timer') {
        let result;
        try { result = updateCollectionTimer(state.collection, args, now); }
        catch (error) { fail(error.message); }
        return { ...result, collection: this.projectHumanCollection(state, now) };
      }
      if (op === 'collection_shake') {
        if (!state.collection) fail('collection_unavailable');
        if (state.collection.timer?.status !== 'running') fail('collection_timer_paused');
        let result;
        try { result = shakeCollection(state.collection, args); }
        catch (error) { fail(error.message); }
        return { ...result, collection: this.projectHumanCollection(state, now) };
      }
      if (!text(args.tileId) || !state.collection) fail('tile_unavailable');
      if (state.collection.timer?.status !== 'running') fail('collection_timer_paused');
      let result;
      try { result = pickCollectionTile(state.collection, args.tileId, args); }
      catch (error) { fail(error.message); }
      let stageCompleted = false;
      let clearReward = null;
      let clearRewardGranted = false;
      let stageClearRewardClaimed = collectionStageRewardClaimed(state, beijingDay(now), state.collection.stage);
      const clearedStage = state.collection.stage;
      if (state.collection.status === 'full') {
        state.collection.sessionStatus = 'failed';
        finishCollectionTimer(state.collection, now, 'failed');
      }
      if (state.collection.status === 'complete') {
        stageCompleted = true;
        finishCollectionTimer(state.collection, now, 'completed');
        const day = beijingDay(now);
        if (!collectionStageRewardClaimed(state, day, clearedStage)) {
          clearReward = this.applyCollectionClearReward({ farmId, state,
            run: state.collection, requestId, now, day });
          saveCollectionStageRewardClaim(state, { day, stage: clearedStage,
            materials: clearReward.materials, requestId, sessionId: state.collection.sessionId, now });
          clearRewardGranted = true;
        }
        stageClearRewardClaimed = true;
        if (state.collection.stage < state.collection.stagesTotal) {
          state.collection = advanceCollectionTrip(state.collection, { random: this.random,
            generateId: this.id, policy: this.options.collection });
        } else state.collection.sessionStatus = 'complete';
      }
      return { ...result, stageCompleted, clearedStage, clearReward, clearRewardGranted,
        stageClearRewardClaimed, collection: this.projectHumanCollection(state, now) };
    }
    if (op.startsWith('explore_')) {
      if (side !== 'ai') fail('actor_not_allowed', 403);
      if (op === 'explore_start') {
        if (!this.options.economy?.unitsPerCell) fail('material_economy_unconfigured', 503);
        if (state.exploration?.status === 'active')
          return { exploration: projectRun(state.exploration), events: [], resumed: true };
        if (!canStartRun({ run: state.exploration, lastStartedDay: state.lastExplorationDay }, beijingDay(now))) fail('exploration_unavailable');
        state.exploration = createRun({ day: beijingDay(now), seed: this.seed() });
        state.lastExplorationDay = beijingDay(now);
        return { exploration: projectRun(state.exploration), events: [] };
      }
      const run = state.exploration;
      if (!run || run.status !== 'active') fail('exploration_unavailable');
      const events = [], actualRoute = [];
      try {
        if (op === 'explore_move') {
          if (!Array.isArray(args.route) || !args.route.length || args.route.some(segment => !record(segment) || Object.keys(segment).length !== 2 || !['up', 'down', 'left', 'right'].includes(segment.direction) || !Number.isSafeInteger(segment.distance) || segment.distance <= 0)) fail('invalid_route', 400);
          let paused = false;
          for (const segment of args.route) {
            let moved = 0;
            for (let step = 0; step < segment.distance; step++) {
              const result = moveOne(run, segment.direction);
              moved++;
              events.push(...result.events);
              if (result.onStairs || run.status === 'finished') { paused = true; break; }
            }
            actualRoute.push({ direction: segment.direction, distance: moved });
            if (paused) break;
          }
        } else if (op === 'explore_ascend') ascend(run);
        else if (op === 'explore_end') finishRun(run);
      } catch (error) {
        if (error instanceof HalloweenError) throw error;
        fail(error.message, 409);
      }
      this.applyExplorationEvents(farmId, side, state, events, requestId);
      return { exploration: projectRun(run), actualRoute, events };
    }
    if (op === 'buy' || op === 'buy_cart') {
      if (op === 'buy_cart' && side !== 'human') fail('actor_not_allowed', 403);
      const materials = op === 'buy_cart' ? args.materials : [args.material];
      if (!Array.isArray(materials) || !materials.length || materials.some(name => !text(name)) ||
          new Set(materials).size !== materials.length) fail('invalid_selection', 400);
      const purchases = [];
      let totalPrice = 0;
      for (const material of materials) {
        const tier = TIER_BY_NAME.get(material);
        if (!tier) fail('invalid_material', 400);
        if (state.purchases.includes(material)) fail('already_purchased');
        const offer = this.options.economy?.shopByMaterial?.[material];
        const price = offer?.price;
        const quantity = offer?.quantity;
        if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0)
          fail('shop_unconfigured', 503);
        totalPrice += price;
        if (!Number.isSafeInteger(totalPrice)) fail('shop_unconfigured', 503);
        purchases.push({ material, quantity, spentSilver: price });
      }
      if (!this.options.debitSilver) fail('wallet_unavailable', 503);
      const payment = this.options.debitSilver({ farmId, side, amount: totalPrice, operationId: requestId });
      if (payment?.paid !== true) fail('payment_unconfirmed', 503);
      for (const { material, quantity } of purchases) {
        state.purchases.push(material);
        state.materials[material] = (state.materials[material] ?? 0) + quantity;
      }
      return op === 'buy_cart' ? { purchased: purchases, totalSpentSilver: totalPrice }
        : { material: purchases[0].material, quantity: purchases[0].quantity, spentSilver: totalPrice };
    }
    if (op === 'craft') {
      const policy = this.options.economy;
      if (!policy || !this.options.renderCandy || !this.options.appearance) fail('crafting_unconfigured', 503);
      const shapeOptions = this.options.appearance.shapeOptions ?? this.options.appearance.shapes ?? [];
      const hasOption = (options, id) => options.some(option => (typeof option === 'string' ? option : option?.id) === id);
      if (!COOKING_MOLDS.some(mold => mold.id === args.shape)) fail('invalid_recipe', 400);
      if (!SELECTABLE_COOKING_MOLD_IDS.includes(args.shape)) fail('invalid_recipe', 400);
      if (!record(args.materials) || !Object.keys(args.materials).length ||
          !hasOption(shapeOptions, args.shape))
        fail('candy_art_unavailable', 503);
      let total = 0, highest = 'N';
      const missingMaterials = [];
      for (const [name, quantity] of Object.entries(args.materials)) {
        const tier = TIER_BY_NAME.get(name);
        if (!tier || !Number.isSafeInteger(quantity) || quantity <= 0) fail('invalid_recipe', 400);
        const available = state.materials[name] ?? 0;
        if (available < quantity) missingMaterials.push({ name, quantity: quantity - available });
        total += quantity;
        if (TIERS.indexOf(tier) > TIERS.indexOf(highest)) highest = tier;
      }
      if (missingMaterials.length) fail('insufficient_materials', 409, { missingMaterials });
      if (total !== policy.unitsPerBatch) fail('invalid_recipe', 400);
      if (!Number.isSafeInteger(policy.candiesPerBatch) || policy.candiesPerBatch <= 0) fail('crafting_unconfigured', 503);
      const baseRarity = policy.rarityByTier?.[highest];
      if (!['ordinary', 'rare', 'precious', 'legendary'].includes(baseRarity)) fail('crafting_unconfigured', 503);
      const primary = selectPrimaryMaterial(args.materials);
      let rendered, quality = null, colorMix = null, rarity = baseRarity;
      if (policy.unitsPerBatch !== 3 || policy.candiesPerBatch !== 6) fail('crafting_unconfigured', 503);
      if (side === 'human' || side === 'ai') {
        try {
          const evaluated = side === 'human'
            ? evaluateCookingProcess({ materials: args.materials, process: args.process })
            : evaluateSemanticTimingPlan({ materials: args.materials, additions: args.additions });
          colorMix = evaluated.color;
          quality = evaluated.quality;
          if (side === 'ai') quality = { score: evaluated.quality, timingHits: evaluated.timingHits };
        } catch (error) {
          fail(error.message === 'invalid_recipe' ? 'invalid_recipe'
            : side === 'human' ? 'invalid_cooking_process' : 'invalid_recipe', 400);
        }
        const colorMeta = COOKING_PALETTE.find(color => color.id === colorMix.id);
        if (!colorMeta) fail('cooking_color_unavailable', 503);
        rendered = this.options.renderCandy({ shape: args.shape, color: colorMix.id,
          materials: canonical(args.materials), flavorMaterial: primary.name, flavor: `${primary.name}味` });
        if (!record(rendered?.appearance) || !text(rendered?.image) || !text(rendered.appearance.name)) fail('candy_art_unavailable', 503);
        const rarityResult = side === 'human'
          ? upgradeRarityOnce(baseRarity, quality.score, this.random)
          : upgradeRarityBySemanticTiming(baseRarity, quality.timingHits, this.random);
        rarity = rarityResult.rarity;
        quality = { ...quality, rarityUpgraded: rarityResult.upgraded,
          upgradeChance: rarityResult.probability };
        rendered = { ...rendered, appearance: { ...rendered.appearance,
          colorName: colorMeta.name, colorHex: colorMix.hex,
          colorRgb: colorMix.rgb, quality: structuredClone(quality) } };
      }
      for (const [name, quantity] of Object.entries(args.materials)) state.materials[name] -= quantity;
      const candyIds = [];
      for (let i = 0; i < policy.candiesPerBatch; i++) {
        const id = this.id();
        this.store.insertCandy({ id, owner: farmId, source: { kind: 'crafted' }, ...rendered,
          rarity, effect: createActorHiddenEffects(rarity, this.random), now });
        candyIds.push(id);
      }
      return { candyIds, appearance: rendered.appearance, image: rendered.image, rarity,
        ...(quality ? { quality: structuredClone(quality) } : {}) };
    }
    if (op === 'gift') {
      if (!Array.isArray(args.candyIds) || !args.candyIds.length || args.candyIds.some(id => !text(id)) || new Set(args.candyIds).size !== args.candyIds.length || !text(args.doorplate)) fail('invalid_selection', 400);
      const neighbor = this.options.resolveNeighbor?.({ farmId, doorplate: args.doorplate });
      if (!neighbor || !text(neighbor.farmId) || !text(neighbor.senderName)) fail('neighbor_unavailable', 404);
      if (neighbor.farmId === farmId) fail('self_gift_not_allowed');
      const candies = args.candyIds.map(id => this.store.ownedCandy(farmId, id));
      if (candies.some(candy => !candy)) fail('candy_unavailable');
      let counted = 0;
      for (const candy of candies) {
        if (candy.first_gift_by === null) counted++;
        this.db.prepare(`UPDATE halloween_candies SET owner_farm_id=?,sender_name=?,first_gift_by=coalesce(first_gift_by,?) WHERE candy_id=?`)
          .run(neighbor.farmId, neighbor.senderName, farmId, candy.candy_id);
      }
      const day = beijingDay(now);
      state.deliveredToByDay ??= {};
      state.deliveredToByDay[day] ??= {};
      state.deliveredToByDay[day][neighbor.farmId] =
        (state.deliveredToByDay[day][neighbor.farmId] ?? 0) + candies.length;
      state.deliveredTotal += counted;
      state.deliveredByDay[day] = (state.deliveredByDay[day] ?? 0) + counted;
      this.queueEarnedRewards(farmId, state, day);
      return { delivered: candies.length, counted, recipientName: neighbor.recipientName ?? args.doorplate,
        deliveredToday: state.deliveredByDay[day],
        deliveredToRecipientToday: state.deliveredToByDay[day][neighbor.farmId],
        deliveredTotal: state.deliveredTotal, rewards: this.store.rewards(farmId) };
    }
    if (op === 'eat') {
      if (!text(args.candyId)) fail('invalid_selection', 400);
      const candy = this.store.ownedCandy(farmId, args.candyId);
      if (!candy) fail('candy_unavailable');
      const target = args.target ?? 'self';
      const eaterSide = target === 'self' ? side : side === 'ai' ? 'human' : 'ai';
      let resolved;
      try { resolved = resolveActorHiddenEffects(JSON.parse(candy.hidden_effect_json), eaterSide, this.random); }
      catch { fail('candy_effect_unavailable', 503); }
      const storedEffects = JSON.parse(candy.hidden_effect_json);
      if (!storedEffects?.ai || !storedEffects?.human) {
        if (this.store.updateCandyHiddenEffects(farmId, candy.candy_id, resolved.hiddenEffects) !== 1)
          fail('candy_unavailable');
      } else if (JSON.stringify(storedEffects) !== JSON.stringify(resolved.hiddenEffects)) {
        // An unusable Human mapping is rerolled from the stored quality and fixed before eating.
        if (this.store.updateCandyHiddenEffects(farmId, candy.candy_id, resolved.hiddenEffects) !== 1)
          fail('candy_unavailable');
      }
      const effect = resolved.effect;
      this.db.prepare("UPDATE halloween_candies SET status='eaten',eaten_at=? WHERE candy_id=?").run(now, candy.candy_id);
      state.eatenEffects = queueEatenEffect(state.eatenEffects, { candyId: candy.candy_id, effect,
        side: eaterSide, eatenAt: now });
      return { candyId: candy.candy_id, target, eaterSide, effect,
        expiresAt: now + effectDurationMs(effect, eaterSide) };
    }
    fail('invalid_request', 400);
  }
  queueEarnedRewards(farmId, state, day) {
    const rewards = this.options.rewards;
    if (!rewards) return;
    if (state.deliveredByDay[day] >= rewards.dailyThreshold) this.store.queueReward(farmId, `daily:${day}`, rewards.daily);
    for (const milestone of rewards.milestones) if (state.deliveredTotal >= milestone.threshold) {
      this.store.queueReward(farmId, `milestone:${milestone.threshold}`, milestone.reward);
    }
  }
  settleRewards(farmId, now = Date.now()) {
    const newlyPaid = [];
    if (!this.options.grantReward) {
      const rewards = this.store.rewards(farmId);
      return { newlyPaid, pending: rewards.filter(row => row.status === 'pending').length, rewards };
    }
    for (const row of this.store.rewards(farmId).filter(row => row.status === 'pending')) {
      // A failed wallet/seed grant leaves this durable entitlement pending. The
      // next settlement retries the same reward ID, without asking for a new gift.
      try {
        let grant;
        const settle = () => this.store.transaction(() => {
          const current = this.db.prepare('SELECT status FROM halloween_reward_outbox WHERE reward_id=?').get(row.id);
          if (current.status !== 'pending') return;
          grant = this.options.grantReward({ farmId, rewardId: row.id, reward: row.reward });
          if (grant?.paid !== true) fail('reward_unconfirmed', 503);
          this.db.prepare("UPDATE halloween_reward_outbox SET status='paid',paid_at=? WHERE reward_id=?").run(now, row.id);
        });
        if (this.options.withRewardSavepoint) this.options.withRewardSavepoint(settle);
        else settle();
        if (grant?.paid === true) newlyPaid.push({ id: row.id, reward: row.reward,
          seeds: Array.isArray(grant.seeds) ? grant.seeds : [] });
      } catch (error) {
        this.options.onRewardPending?.({ farmId, rewardId: row.id, code: error.code ?? 'reward_unconfirmed' });
      }
    }
    return { newlyPaid, rewards: this.store.rewards(farmId) };
  }
}
