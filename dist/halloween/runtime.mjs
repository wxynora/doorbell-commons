import { installHalloweenSchema } from './schema.mjs';
import { HalloweenError, HalloweenService } from './service.mjs';
import { createHalloweenFarmEffectHooks } from './action-effects.mjs';

const requiredText = value => typeof value === 'string' && value.trim().length > 0;

export function createHalloweenFarmRuntime({ database, eventId = 'halloween-2026', random } = {}) {
  if (!database || typeof database.exec !== 'function' || typeof database.prepare !== 'function' ||
      !requiredText(eventId) || (random !== undefined && typeof random !== 'function'))
    throw new TypeError('halloween_runtime_configuration_unavailable');

  installHalloweenSchema(database);
  const service = new HalloweenService(database, { eventId, ...(random ? { random } : {}) });
  const effectHooks = createHalloweenFarmEffectHooks(service);
  const authority = Object.freeze({
    withAuthorityAction({ farmId, side, requestId, now }, operation) {
      if (!requiredText(farmId) || !['human', 'ai'].includes(side) || !requiredText(requestId) ||
          !Number.isSafeInteger(now) || typeof operation !== 'function')
        throw new HalloweenError('invalid_request', 400);
      database.exec('SAVEPOINT halloween_farm_action');
      try {
        const result = operation();
        if (result && typeof result.then === 'function') throw new HalloweenError('async_farm_action_not_supported', 503);
        database.exec('RELEASE halloween_farm_action');
        return result;
      } catch (error) {
        database.exec('ROLLBACK TO halloween_farm_action; RELEASE halloween_farm_action');
        throw error;
      }
    },
  });
  return Object.freeze({ service, authority, effectHooks });
}
