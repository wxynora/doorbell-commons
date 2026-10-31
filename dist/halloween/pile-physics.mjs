import {
  Body, Box, Cylinder, NaiveBroadphase, Plane, Quaternion, Ray, Sphere, Vec3, World,
} from './vendor/cannon-es/dist/cannon-es.mjs';
import { LATEST_PILE_MODEL_VERSION, materialColliderProfile } from './material-profiles.mjs';

export const PILE_MODEL_VERSION = LATEST_PILE_MODEL_VERSION;
export const PILE_CONFIG = Object.freeze({
  modelVersion: PILE_MODEL_VERSION,
  container: Object.freeze({
    shape: 'circle', innerRadius: 3.2, floorY: 0, wallHeight: 4, wallThickness: 0.24,
  }),
  gravity: Object.freeze([0, -9.82, 0]),
});

const FIXED_STEP = 1 / 60;
const INITIAL_STEPS = 240;
const PICK_SETTLE_STEPS = 84;
const SHAKE_SETTLE_STEPS = 150;
const WALL_SEGMENTS = 32;
const TILE_COLLISION_GROUP = 1;
const WALL_COLLISION_GROUPS = 30;
const WALL_COLLISION_EPSILON = 1e-9;

function intSeed(value) {
  if (!Number.isSafeInteger(value)) throw new TypeError('invalid_pile_seed');
  return value >>> 0;
}

export function seededPileRandom(seed) {
  let state = intSeed(seed) || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function deriveStagePileSeed(seed, stage) {
  if (!Number.isSafeInteger(stage) || stage < 1) throw new TypeError('invalid_collection_stage');
  let value = (intSeed(seed) ^ Math.imul(stage, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

function randomQuaternion(random) {
  const yaw = random() * Math.PI * 2;
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

function makeShape(tile) {
  const [width, height, depth] = tile.size;
  if (tile.collider === 'sphere') return new Sphere(width / 2);
  if (tile.collider === 'box') return new Box(new Vec3(width / 2, height / 2, depth / 2));
  if (tile.collider === 'cylinder') return new Cylinder(width / 2, width / 2, height, 12);
  throw new TypeError('invalid_pile_collider');
}

function makeWorld(pile) {
  const world = new World({ gravity: new Vec3(...pile.gravity) });
  world.broadphase = new NaiveBroadphase();
  world.allowSleep = false;
  world.solver.iterations = 10;
  world.solver.tolerance = 0.001;
  world.defaultContactMaterial.friction = 0.62;
  world.defaultContactMaterial.restitution = 0.035;
  world.defaultContactMaterial.frictionEquationStiffness = 1e7;
  world.defaultContactMaterial.frictionEquationRelaxation = 3;

  const { innerRadius, floorY, wallThickness } = pile.container;
  const floor = new Body({ mass: 0, position: new Vec3(0, floorY, 0),
    quaternion: new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2) });
  floor.addShape(new Plane());
  world.addBody(floor);

  const wallBody = new Body({ mass: 0 });
  const wallCollisionPlanes = [];
  const wallRadius = innerRadius + wallThickness / 2;
  for (let index = 0; index < WALL_SEGMENTS; index++) {
    const angle = 2 * Math.PI * index / WALL_SEGMENTS;
    const orientation = new Quaternion(0, Math.sin((Math.PI + angle) / 2), 0,
      Math.cos((Math.PI + angle) / 2));
    const center = new Vec3(
      Math.sin(angle) * wallRadius,
      floorY,
      Math.cos(angle) * wallRadius,
    );
    const wallShape = new Plane();
    wallShape.collisionFilterGroup = 1 << ((index % WALL_COLLISION_GROUPS) + 1);
    wallShape.collisionFilterMask = TILE_COLLISION_GROUP;
    wallBody.addShape(wallShape, center, orientation);

    const shapeIndex = wallBody.shapes.length - 1;
    const worldOrientation = wallBody.quaternion.mult(wallBody.shapeOrientations[shapeIndex], new Quaternion());
    const normal = worldOrientation.vmult(new Vec3(0, 0, 1));
    const point = wallBody.quaternion.vmult(wallBody.shapeOffsets[shapeIndex]);
    point.vadd(wallBody.position, point);
    wallCollisionPlanes.push({ group: wallShape.collisionFilterGroup, normal, point });
  }
  world.addBody(wallBody);
  return { world, wallCollisionPlanes };
}

function addTileBodies(world, tiles) {
  const bodies = new Map();
  for (const tile of tiles) {
    if (tile.removed) continue;
    if (!Array.isArray(tile.position) || tile.position.length !== 3 || !tile.position.every(Number.isFinite) ||
        !Array.isArray(tile.quaternion) || tile.quaternion.length !== 4 || !tile.quaternion.every(Number.isFinite) ||
        !Array.isArray(tile.size) || tile.size.length !== 3 || !tile.size.every(value => Number.isFinite(value) && value > 0))
      throw new TypeError('invalid_pile_pose');
    const body = new Body({
      mass: 1,
      position: new Vec3(...tile.position),
      quaternion: new Quaternion(...tile.quaternion),
      angularFactor: new Vec3(0, 1, 0),
      linearDamping: 0.12,
      angularDamping: 0.16,
      allowSleep: false,
    });
    const shape = makeShape(tile);
    shape.collisionFilterGroup = TILE_COLLISION_GROUP;
    shape.collisionFilterMask = TILE_COLLISION_GROUP;
    body.addShape(shape);
    body.tileId = tile.id;
    world.addBody(body);
    bodies.set(tile.id, body);
  }
  return bodies;
}

function updateWallCollisionMasks(bodies, wallCollisionPlanes) {
  for (const body of bodies.values()) {
    const { x, y, z } = body.position;
    let mask = TILE_COLLISION_GROUP;
    for (const plane of wallCollisionPlanes) {
      const distance = (x - plane.point.x) * plane.normal.x +
        (y - plane.point.y) * plane.normal.y + (z - plane.point.z) * plane.normal.z;
      // planeConvex only creates contacts for vertices on the plane's negative side.
      // If the whole body's bounding sphere is on the positive side, no vertex can contact it.
      // Keep all negative-side bodies eligible, matching the original infinite-plane behavior.
      if (distance <= body.boundingRadius + WALL_COLLISION_EPSILON) mask |= plane.group;
    }
    body.shapes[0].collisionFilterMask = mask;
  }
}

function bodySamples(tile) {
  const [width, , depth] = tile.size;
  const points = [];
  if (tile.collider === 'sphere' || tile.collider === 'cylinder') {
    const radiusX = width * 0.29;
    const radiusZ = depth * 0.29;
    points.push([0, 0, 0]);
    for (let index = 0; index < 8; index++) {
      const angle = 2 * Math.PI * index / 8;
      points.push([Math.cos(angle) * radiusX, 0, Math.sin(angle) * radiusZ]);
    }
  } else {
    for (const x of [-0.72, 0, 0.72]) {
      for (const z of [-0.72, 0, 0.72]) points.push([x * width / 2, 0, z * depth / 2]);
    }
  }
  return points;
}

function visibleTileIds(world, tiles, pile) {
  const active = tiles.filter(tile => !tile.removed);
  const highest = active.reduce((value, tile) => Math.max(value, tile.position[1] + tile.size[1]), pile.container.wallHeight);
  const ray = new Ray();
  const fromY = highest + 1;
  const toY = pile.container.floorY - 1;
  const visible = new Set();
  for (const tile of active) {
    const quaternion = new Quaternion(...tile.quaternion);
    for (const [x, y, z] of bodySamples(tile)) {
      const offset = quaternion.vmult(new Vec3(x, y, z));
      const from = new Vec3(tile.position[0] + offset.x, fromY, tile.position[2] + offset.z);
      const to = new Vec3(from.x, toY, from.z);
      if (ray.intersectWorld(world, { mode: Ray.CLOSEST, from, to }) && ray.result.body?.tileId === tile.id) {
        visible.add(tile.id);
        break;
      }
    }
  }
  return visible;
}

function syncPile(tiles, pile, { steps, impulseSeed } = {}) {
  const { world, wallCollisionPlanes } = makeWorld(pile);
  const bodies = addTileBodies(world, tiles);
  const random = impulseSeed == null ? null : seededPileRandom(impulseSeed);
  for (let index = 0; index < steps; index++) {
    // Three short shakes redistribute the actual bodies before they settle.
    if (random && (index === 0 || index === 20 || index === 40)) {
      for (const body of bodies.values()) {
        body.wakeUp();
        body.applyImpulse(new Vec3((random() - 0.5) * 16, random() * 6, (random() - 0.5) * 16));
        body.angularVelocity.set(0, (random() - 0.5) * 12, 0);
      }
    }
    updateWallCollisionMasks(bodies, wallCollisionPlanes);
    world.step(FIXED_STEP);
  }
  for (const tile of tiles) {
    const body = bodies.get(tile.id);
    if (!body) {
      tile.selectable = false;
      continue;
    }
    body.quaternion.normalize();
    tile.position = [body.position.x, body.position.y, body.position.z];
    tile.quaternion = [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w];
    tile.selectable = false;
  }
  const visible = visibleTileIds(world, tiles, pile);
  for (const tile of tiles) tile.selectable = !tile.removed && visible.has(tile.id);
  if (tiles.some(tile => !tile.removed) && visible.size === 0) throw new Error('pile_has_no_selectable_items');
}

export function createCollectionPile(tiles, seed, modelVersion = PILE_MODEL_VERSION, sizeScale = 1) {
  if (!Number.isFinite(sizeScale) || sizeScale <= 0) throw new TypeError('invalid_pile_size_scale');
  const normalizedSeed = intSeed(seed);
  const random = seededPileRandom(normalizedSeed);
  const { innerRadius } = PILE_CONFIG.container;
  for (let index = 0; index < tiles.length; index++) {
    const tile = tiles[index];
    const profile = materialColliderProfile(tile.name, modelVersion);
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * (innerRadius - 0.72);
    tile.collider = profile.collider;
    tile.size = profile.size.map(size => size * sizeScale);
    tile.position = [
      Math.cos(angle) * radius,
      4 + Math.floor(index / 12) * 0.85 + random() * 0.25,
      Math.sin(angle) * radius,
    ];
    tile.quaternion = randomQuaternion(random);
    tile.selectable = false;
  }
  const pile = {
    modelVersion,
    seed: normalizedSeed,
    revision: 0,
    container: { ...PILE_CONFIG.container },
    gravity: [...PILE_CONFIG.gravity],
  };
  syncPile(tiles, pile, { steps: INITIAL_STEPS });
  return pile;
}

export function settleCollectionPile(tiles, pile) {
  syncPile(tiles, pile, { steps: PICK_SETTLE_STEPS });
  pile.revision++;
}

export function shakeCollectionPile(tiles, pile, stage) {
  const nextRevision = pile.revision + 1;
  const impulseSeed = deriveStagePileSeed(pile.seed ^ nextRevision, stage);
  syncPile(tiles, pile, { steps: SHAKE_SETTLE_STEPS, impulseSeed });
  pile.revision = nextRevision;
}

export function availableTileIds(run) {
  return new Set(run.tiles.filter(tile => !tile.removed && tile.selectable).map(tile => tile.id));
}
