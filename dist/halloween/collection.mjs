import { MATERIALS } from './materials.mjs';
import {
  availableTileIds, createCollectionPile, deriveStagePileSeed,
  settleCollectionPile, shakeCollectionPile,
} from './pile-physics.mjs';

export { availableTileIds };

export const COLLECTION_STAGE_DURATION_MS = Object.freeze([180_000, 300_000]);

const activeTiles = run => run.tiles.filter(tile => !tile.removed);

function shuffle(values, next) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(next() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function policyForStage(policy, stage) {
  const stagePolicy = policy?.stages?.[stage - 1];
  if (!stagePolicy) throw new TypeError('collection_unconfigured');
  return { capacity: policy.capacity, tierWeights: policy.tierWeights, ...stagePolicy };
}

export function createCollection({ random, generateId, policy, seed = 1 }) {
  if (!policy || !Number.isSafeInteger(policy.pieces) || policy.pieces <= 0 || policy.pieces % 3 ||
      !Number.isSafeInteger(policy.capacity) || policy.capacity < 3 ||
      (policy.distinctMaterials !== undefined &&
        (!Number.isSafeInteger(policy.distinctMaterials) || policy.distinctMaterials < 1 ||
          policy.distinctMaterials > policy.pieces / 3)))
    throw new TypeError('collection_unconfigured');
  const weights = Object.entries(policy.tierWeights ?? {});
  if (!weights.length || weights.some(([tier, weight]) => !MATERIALS[tier] || !(weight > 0)) ||
      Math.abs(weights.reduce((sum, [, weight]) => sum + weight, 0) - 1) > 0.00000001)
    throw new TypeError('collection_unconfigured');
  const next = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new TypeError('invalid_random');
    return value;
  };
  const groupCount = policy.pieces / 3;
  const groupsByTier = new Map(weights.map(([tier]) => [tier, []]));
  const groupTiers = new Array(groupCount);
  const groupMaterials = new Array(groupCount);
  for (let group = 0; group < groupCount; group++) {
    let roll = next(), selected = weights.at(-1)[0];
    for (const [tier, weight] of weights) { if (roll < weight) { selected = tier; break; } roll -= weight; }
    groupsByTier.get(selected).push(group);
    groupTiers[group] = selected;
    // Stage one keeps the existing draw order and material distribution.
    if (policy.distinctMaterials === undefined)
      groupMaterials[group] = MATERIALS[selected][Math.floor(next() * MATERIALS[selected].length)];
  }

  if (policy.distinctMaterials !== undefined) {
    const maxDistinct = [...groupsByTier].reduce((sum, [tier, groups]) =>
      sum + Math.min(groups.length, MATERIALS[tier].length), 0);
    const distinctMaterials = Math.min(policy.distinctMaterials, maxDistinct);
    if (!distinctMaterials) throw new TypeError('collection_unconfigured');
    const distinctByTier = new Map([...groupsByTier.keys()].map(tier => [tier, 0]));
    for (let left = distinctMaterials; left > 0; left--) {
      let selectedTier = null, selectedDeficit = -Infinity;
      for (const [tier, groups] of groupsByTier) {
        const quota = distinctByTier.get(tier);
        const limit = Math.min(groups.length, MATERIALS[tier].length);
        if (quota >= limit) continue;
        const deficit = distinctMaterials * groups.length / groupCount - quota;
        if (deficit > selectedDeficit) { selectedTier = tier; selectedDeficit = deficit; }
      }
      if (selectedTier === null) throw new TypeError('collection_unconfigured');
      distinctByTier.set(selectedTier, distinctByTier.get(selectedTier) + 1);
    }

    // Every drawn tier needs at least one name; otherwise its groups would
    // select from an empty list despite being part of this real pile.
    for (const [tier, groups] of groupsByTier) {
      if (!groups.length || distinctByTier.get(tier) > 0) continue;
      let donor = null, mostOverallocated = Infinity;
      for (const [candidate, candidateGroups] of groupsByTier) {
        const quota = distinctByTier.get(candidate);
        if (quota <= 1) continue;
        const deficit = distinctMaterials * candidateGroups.length / groupCount - quota;
        if (deficit < mostOverallocated) { donor = candidate; mostOverallocated = deficit; }
      }
      if (donor === null) throw new TypeError('collection_unconfigured');
      distinctByTier.set(donor, distinctByTier.get(donor) - 1);
      distinctByTier.set(tier, 1);
    }

    for (const [tier, groupIndexes] of groupsByTier) {
      if (!groupIndexes.length) continue;
      const quota = distinctByTier.get(tier);
      const names = shuffle(MATERIALS[tier], next).slice(0, quota);
      const shuffledGroups = shuffle(groupIndexes, next);
      for (let index = 0; index < quota; index++) groupMaterials[shuffledGroups[index]] = names[index];
      for (let index = quota; index < shuffledGroups.length; index++)
        groupMaterials[shuffledGroups[index]] = names[Math.floor(next() * names.length)];
    }
  }
  const materials = groupMaterials.flatMap((name, group) => {
    const tier = groupTiers[group];
    if (!name || !tier) throw new TypeError('collection_unconfigured');
    return Array.from({ length: 3 }, () => ({ name, tier }));
  });
  for (let i = materials.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [materials[i], materials[j]] = [materials[j], materials[i]];
  }
  const tiles = materials.map(material => ({ ...material, id: generateId(), removed: false }));
  const run = { id: generateId(), status: 'active', capacity: policy.capacity,
    tray: [], collected: {}, tiles };
  run.pile = createCollectionPile(tiles, seed, undefined, policy.sizeScale ?? 1);
  return run;
}

export function makeCollectionTimer(stage, durations = COLLECTION_STAGE_DURATION_MS) {
  if (!Array.isArray(durations) || durations.length !== 2 ||
      durations.some(duration => !Number.isSafeInteger(duration) || duration <= 0))
    throw new TypeError('collection_timer_unconfigured');
  const durationMs = durations[stage - 1];
  if (!Number.isSafeInteger(durationMs)) throw new TypeError('collection_timer_unconfigured');
  return { status: 'ready', durationMs, elapsedMs: 0, activeSince: null, transitionVersion: 0 };
}

export function initializeCollectionTimer(run, durations = COLLECTION_STAGE_DURATION_MS) {
  if (!run?.timer) run.timer = makeCollectionTimer(run.stage ?? 1, durations);
  return run.timer;
}

export function createCollectionTrip({ random, generateId, policy, day, seed, stage = 1,
  timerDurationsMs = COLLECTION_STAGE_DURATION_MS }) {
  const stagesTotal = policy?.stagesTotal;
  if (!Number.isSafeInteger(stagesTotal) || stagesTotal !== 2 || !Array.isArray(policy?.stages) ||
      policy.stages.length !== stagesTotal || typeof day !== 'string' || !day ||
      !Number.isSafeInteger(seed) || !Number.isSafeInteger(stage) || stage < 1 || stage > stagesTotal)
    throw new TypeError('collection_unconfigured');
  const tripSeed = seed >>> 0;
  const board = createCollection({ random, generateId, policy: policyForStage(policy, stage),
    seed: deriveStagePileSeed(tripSeed, stage) });
  return { ...board, id: generateId(), sessionId: generateId(), day, tripSeed,
    stage, stagesTotal, sessionStatus: 'active', timer: makeCollectionTimer(stage, timerDurationsMs) };
}

function assertCollectionRevision(run, { sessionId, revision } = {}) {
  if (sessionId !== undefined && sessionId !== run.sessionId) throw new Error('collection_stale_view');
  if (revision !== undefined && revision !== run.pile?.revision) throw new Error('collection_stale_view');
}

export function shakeCollection(run, { sessionId, revision }) {
  if (!run || run.status !== 'active') throw new Error('collection_finished');
  assertCollectionRevision(run, { sessionId, revision });
  shakeCollectionPile(run.tiles, run.pile, run.stage ?? 1);
  return { status: run.status, revision: run.pile.revision };
}

export function expireCollectionTimer(run, now) {
  const timer = run?.timer;
  if (!timer || timer.status !== 'running') return false;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(timer.activeSince))
    throw new TypeError('invalid_time');
  const elapsedMs = timer.elapsedMs + Math.max(0, now - timer.activeSince);
  if (elapsedMs < timer.durationMs) return false;
  timer.elapsedMs = timer.durationMs;
  timer.activeSince = null;
  timer.status = 'expired';
  run.status = 'failed';
  run.sessionStatus = 'failed';
  return true;
}

export function updateCollectionTimer(run, { action, sessionId, stage, transitionVersion }, now) {
  initializeCollectionTimer(run);
  if (!run?.timer || !Number.isSafeInteger(now)) throw new Error('collection_timer_unavailable');
  if (sessionId !== run.sessionId || stage !== run.stage) throw new Error('collection_stale_view');
  if (!['enter', 'pause'].includes(action) || !Number.isSafeInteger(transitionVersion) || transitionVersion < 1)
    throw new Error('invalid_request');
  if (expireCollectionTimer(run, now)) return { timedOut: true, timer: projectCollectionTimer(run, now) };
  const timer = run.timer;
  if (timer.status === 'expired') return { timedOut: true, timer: projectCollectionTimer(run, now) };
  if (run.status !== 'active') throw new Error('collection_finished');
  if (transitionVersion <= (timer.transitionVersion ?? 0))
    return { timedOut: false, superseded: true, timer: projectCollectionTimer(run, now) };
  timer.transitionVersion = transitionVersion;
  if (action === 'enter') {
    if (timer.status === 'ready' || timer.status === 'paused') {
      timer.status = 'running';
      timer.activeSince = now;
    } else if (timer.status !== 'running') throw new Error('collection_timer_unavailable');
  } else if (action === 'pause') {
    if (timer.status === 'running') {
      timer.elapsedMs += Math.max(0, now - timer.activeSince);
      timer.activeSince = null;
      if (timer.elapsedMs >= timer.durationMs) {
        timer.elapsedMs = timer.durationMs;
        timer.status = 'expired';
        run.status = 'failed';
        run.sessionStatus = 'failed';
        return { timedOut: true, timer: projectCollectionTimer(run, now) };
      }
      timer.status = 'paused';
    }
  }
  return { timedOut: false, timer: projectCollectionTimer(run, now) };
}

export function finishCollectionTimer(run, now, status) {
  const timer = run?.timer;
  if (!timer) return;
  if (timer.status === 'running') {
    timer.elapsedMs += Math.max(0, now - timer.activeSince);
    timer.activeSince = null;
  }
  timer.status = status;
}

export function pickCollectionTile(run, tileId, expected = {}) {
  if (run.status !== 'active') throw new Error('collection_finished');
  assertCollectionRevision(run, expected);
  const tile = run.tiles.find(entry => entry.id === tileId && !entry.removed);
  if (!tile || !availableTileIds(run).has(tileId)) throw new Error('tile_unavailable');
  tile.removed = true;
  run.tray.push({ id: tile.id, name: tile.name, tier: tile.tier });
  let reward = null;
  if (run.tray.filter(entry => entry.name === tile.name).length === 3) {
    run.tray = run.tray.filter(entry => entry.name !== tile.name);
  }
  settleCollectionPile(run.tiles, run.pile);
  if (!activeTiles(run).length && !run.tray.length) run.status = 'complete';
  else if (run.tray.length >= run.capacity) run.status = 'full';
  return { reward, status: run.status, revision: run.pile.revision };
}

export function advanceCollectionTrip(run, { random, generateId, policy,
  timerDurationsMs = COLLECTION_STAGE_DURATION_MS }) {
  if (run.status !== 'complete' || run.stage >= run.stagesTotal) return run;
  const tripSeed = run.tripSeed ?? run.pile.seed;
  const next = createCollection({ random, generateId, policy: policyForStage(policy, run.stage + 1),
    seed: deriveStagePileSeed(tripSeed, run.stage + 1) });
  next.pile.revision = run.pile.revision;
  return { ...next, id: run.id, sessionId: run.sessionId, day: run.day, tripSeed,
    stage: run.stage + 1, stagesTotal: run.stagesTotal,
    sessionStatus: 'active', collected: { ...run.collected },
    timer: makeCollectionTimer(run.stage + 1, timerDurationsMs) };
}

export function projectCollectionTimer(run, now) {
  const timer = run?.timer;
  if (!timer) return null;
  let status = timer.status;
  const elapsedMs = status === 'running' && Number.isSafeInteger(now)
    ? timer.elapsedMs + Math.max(0, now - timer.activeSince) : timer.elapsedMs;
  const remainingMs = Math.max(0, timer.durationMs - elapsedMs);
  if (status === 'running' && remainingMs === 0) status = 'expired';
  return { stage: run.stage, status, serverNow: Number.isSafeInteger(now) ? now : null,
    transitionVersion: timer.transitionVersion ?? 0,
    durationMs: timer.durationMs,
    elapsedMs: Math.min(timer.durationMs, elapsedMs), remainingMs,
    deadlineAt: status === 'running' && Number.isSafeInteger(now) ? now + remainingMs : null };
}

export function projectCollection(run, now) {
  if (!run) return null;
  const { seed: _seed, ...pile } = run.pile;
  const timer = projectCollectionTimer(run, now);
  const projectedStatus = timer?.status === 'expired' ? 'failed' : run.status;
  return { id: run.id, status: projectedStatus, capacity: run.capacity,
    stage: run.stage ?? 1, stagesTotal: run.stagesTotal ?? 1,
    session: run.sessionId ? { id: run.sessionId, day: run.day,
      status: timer?.status === 'expired' ? 'failed' : run.sessionStatus ?? run.status } : null,
    timer,
    pile: structuredClone(pile), tray: structuredClone(run.tray), collected: { ...run.collected },
    remaining: activeTiles(run).length,
    tiles: activeTiles(run).map(tile => ({ id: tile.id, name: tile.name, tier: tile.tier,
      collider: tile.collider, size: [...tile.size], position: [...tile.position],
      quaternion: [...tile.quaternion], selectable: Boolean(tile.selectable) })),
  };
}
