import { MAX_BODY_BYTES } from '../../config.js';
import { readJsonBody, jsonOut } from '../http.js';
import { requireDoorbellService, validateFarmBinding } from './contract.js';
import { createHalloweenHumanHandler } from '../../halloween/http.mjs';

export function createDoorbellHalloweenHumanHandler(runtime) {
  if (!runtime?.service || !runtime?.authority?.withAuthorityAction)
    return async (req, res) => jsonOut(res, 503, { ok: false, error: { code: 'service_unavailable', message: 'The Halloween Farm service is unavailable' } });
  return createHalloweenHumanHandler({
    authorize: requireDoorbellService,
    readBody: req => readJsonBody(req, MAX_BODY_BYTES),
    jsonOut,
    resolveBinding: input => validateFarmBinding(input),
    service: runtime.service,
    withAuthorityAction: (input, operation) => runtime.authority.withAuthorityAction(input, operation),
    onAuthorizedMutation: ({ farmId }) => runtime.scheduleFarm(farmId),
  });
}
