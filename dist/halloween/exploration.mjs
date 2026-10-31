import { MATERIALS } from './materials.mjs';

// Pure domain model. Inventory quantities, story copy, persistence and HTTP/MCP
// routing are deliberately supplied by the owning Farm service after review.
export const FLOORS = Object.freeze([
  { rows: 4, columns: 4, steps: 12, materials: 7, supplies: [3], money: 1, tricks: 1, gold: 100, silver: 30, goldLoss: 10, silverLoss: 1, tiers: ['N', 'N'] },
  { rows: 4, columns: 5, steps: 4, materials: 7, supplies: [3], money: 2, tricks: 3, gold: 200, silver: 60, goldLoss: 20, silverLoss: 2, tiers: ['N', 'R'] },
  { rows: 5, columns: 6, steps: 4, materials: 9, supplies: [3, 3], money: 2, tricks: 5, gold: 400, silver: 120, goldLoss: 30, silverLoss: 3, tiers: ['R', 'SR'] },
  { rows: 6, columns: 7, steps: 4, materials: 11, supplies: [4, 4], money: 3, tricks: 8, gold: 800, silver: 250, goldLoss: 40, silverLoss: 4, tiers: ['SR', 'SSR'] },
  { rows: 7, columns: 8, steps: 4, materials: 13, supplies: [4, 4, 4], money: 4, tricks: 11, gold: 1500, silver: 500, goldLoss: 50, silverLoss: 5, tiers: ['SSR', 'SP'] },
].map(floor => Object.freeze({ ...floor, supplies: Object.freeze(floor.supplies), tiers: Object.freeze(floor.tiers) })));

const DIRECTIONS = Object.freeze({ up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] });

function random(run) {
  // The PRNG state travels with the run; a restored snapshot never rerolls a floor.
  run.randomState = (run.randomState + 0x6D2B79F5) >>> 0;
  let x = run.randomState;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function makeFloor(run, index) {
  const config = FLOORS[index];
  const cells = [{ kind: 'blank', visited: true }];
  for (let i = 0; i < config.materials; i++) {
    const tier = config.tiers[random(run) < 0.85 ? 0 : 1];
    const name = MATERIALS[tier][Math.floor(random(run) * MATERIALS[tier].length)];
    cells.push({ kind: 'material', tier, name, visited: false });
  }
  for (const steps of config.supplies) cells.push({ kind: 'supply', steps, visited: false });
  for (const [kind, count] of [['money', config.money], ['trick', config.tricks]]) {
    for (let i = 0; i < count; i++) {
      const currency = random(run) < 0.5 ? 'gold' : 'silver';
      const amount = kind === 'money' ? config[currency] : -config[`${currency}Loss`];
      cells.push({ kind, currency, amount, visited: false });
    }
  }
  if (index < FLOORS.length - 1) cells.push({ kind: 'stairs', visited: false });
  while (cells.length < config.rows * config.columns) cells.push({ kind: 'blank', visited: false });
  // Index zero stays safe. All other contents are fixed when entering the floor.
  for (let i = cells.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(random(run) * i);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return { rows: config.rows, columns: config.columns, cells };
}

export function createRun({ seed, day }) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('invalid_seed');
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new TypeError('invalid_day');
  const run = { version: 1, day, randomState: seed, floor: 0, position: 0, steps: FLOORS[0].steps, status: 'active', floors: [] };
  run.floors.push(makeFloor(run, 0));
  return run;
}

export function canStartRun({ run = null, lastStartedDay = null }, day) {
  return run?.status !== 'active' && lastStartedDay !== day;
}

function requireActive(run) {
  if (run.status !== 'active') throw new Error('run_finished');
}

export function moveOne(run, direction) {
  requireActive(run);
  const delta = DIRECTIONS[direction];
  if (!delta) throw new TypeError('invalid_direction');
  if (run.steps <= 0) throw new Error('no_steps');
  const floor = run.floors[run.floor];
  const row = Math.floor(run.position / floor.columns) + delta[0];
  const column = run.position % floor.columns + delta[1];
  if (row < 0 || column < 0 || row >= floor.rows || column >= floor.columns) throw new RangeError('outside_map');
  run.position = row * floor.columns + column;
  run.steps--;
  const cell = floor.cells[run.position];
  const firstVisit = !cell.visited;
  cell.visited = true;
  const events = [];
  if (firstVisit && cell.kind === 'supply') {
    run.steps += cell.steps;
    events.push({ kind: 'supply', steps: cell.steps });
  } else if (firstVisit && cell.kind === 'material') {
    events.push({ kind: 'material', tier: cell.tier, name: cell.name });
  } else if (firstVisit && ['money', 'trick'].includes(cell.kind)) {
    events.push({ kind: cell.kind, currency: cell.currency, amount: cell.amount });
  }
  const allSearched = run.floor === FLOORS.length - 1 && floor.cells.every(item => item.visited);
  if (allSearched || (run.steps === 0 && cell.kind !== 'stairs')) run.status = 'finished';
  return { events, firstVisit, onStairs: cell.kind === 'stairs' };
}

export function ascend(run) {
  requireActive(run);
  const cell = run.floors[run.floor].cells[run.position];
  if (cell.kind !== 'stairs' || !cell.visited || run.floor >= FLOORS.length - 1) throw new Error('not_on_stairs');
  run.floor++;
  run.position = 0;
  run.steps += FLOORS[run.floor].steps;
  run.floors.push(makeFloor(run, run.floor));
}

export function finishRun(run) {
  requireActive(run);
  run.status = 'finished';
}

// Structured facts only. Tool legend, coordinates and route syntax remain under
// copy review; no new model-visible instructions are embedded in this module.
export function projectRun(run) {
  const floor = run.floors[run.floor];
  return {
    version: run.version, day: run.day, floor: run.floor + 1,
    rows: floor.rows, columns: floor.columns,
    position: run.position, steps: run.steps, status: run.status,
    cells: floor.cells.map((cell, index) => ({
      index, visited: cell.visited,
      ...(cell.visited ? { kind: cell.kind } : {}),
    })),
  };
}
