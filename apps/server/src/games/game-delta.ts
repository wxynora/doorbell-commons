import type { GamePatch } from './types.js';

export function changedGamePatch(input: unknown, patch: GamePatch): GamePatch {
  return patch.filter(change => {
    const old = change.path.reduce<unknown>((value, key) =>
      value !== null && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, input);
    return change.remove ? old !== undefined : JSON.stringify(old) !== JSON.stringify(change.value);
  });
}

export function applyGamePatch(input: unknown, patch: GamePatch): unknown {
  let result = structuredClone(input);
  for (const change of patch) {
    if (!change.path.length) { result = structuredClone(change.value); continue; }
    let target = result as Record<string | number, unknown>;
    for (const key of change.path.slice(0, -1)) target = target[key] as typeof target;
    const key = change.path.at(-1)!;
    if (change.remove) delete target[key];
    else target[key] = structuredClone(change.value);
  }
  return result;
}
