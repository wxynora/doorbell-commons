import { createHalloweenFarmRuntime } from './runtime.mjs';

export function createHalloweenFarmIntegration({ database, random } = {}) {
  return createHalloweenFarmRuntime({ database, ...(random ? { random } : {}) });
}
