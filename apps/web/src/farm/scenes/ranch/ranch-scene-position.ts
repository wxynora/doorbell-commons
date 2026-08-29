export interface RanchScenePosition {
  x: number;
  y: number;
}

export interface RanchSceneAnimalLayout {
  x: number;
  y: number;
  size: number;
  roam: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

const UINT32_RANGE = 0x1_0000_0000;

function hashResidentKey(residentKey: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < residentKey.length; index += 1) {
    hash ^= residentKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixSeed(seed: number): number {
  let mixed = seed >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

function unitFromSeed(seed: number): number {
  return (mixSeed(seed) + 0.5) / UINT32_RANGE;
}

export function createRanchSceneMountEntropy(): number {
  return Math.floor(Math.random() * UINT32_RANGE) >>> 0;
}

export function getRanchSceneInitialPosition(
  residentKey: string,
  layout: RanchSceneAnimalLayout,
  mountEntropy: number,
): RanchScenePosition {
  const residentSeed = hashResidentKey(residentKey) ^ (mountEntropy >>> 0);
  const xUnit = unitFromSeed(residentSeed ^ 0x9e3779b9);
  const yUnit = unitFromSeed(residentSeed ^ 0x85ebca6b);

  return {
    x: layout.roam.minX + (layout.roam.maxX - layout.roam.minX) * xUnit,
    y: layout.roam.minY + (layout.roam.maxY - layout.roam.minY) * yUnit,
  };
}
