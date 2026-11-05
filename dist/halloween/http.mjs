import { humanHalloweenCommand } from './protocol.mjs';
import { HalloweenError } from './service.mjs';

// Narrow adapter for the existing Farm internal router, authorization, and binding authority.
export function createHalloweenHumanHandler({ authorize, readBody, jsonOut, resolveBinding, service,
  withAuthorityAction, now = Date.now }) {
  return async (request, response, method) => {
    if (!authorize(request, response, method)) return;
    const errorOut = (status, code) => jsonOut(response, status, { ok: false, error: { code } });
    let body;
    try { body = await readBody(request); } catch { return errorOut(400, 'invalid_request'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorOut(400, 'invalid_request');
    const { farm_human_key, expected_farm_doorplate, ...command } = body;
    if (typeof farm_human_key !== 'string' || !farm_human_key || typeof expected_farm_doorplate !== 'string' || !expected_farm_doorplate) return errorOut(400, 'invalid_request');
    const parsed = humanHalloweenCommand.safeParse(command);
    if (!parsed.success) return errorOut(400, 'invalid_request');
    const binding = resolveBinding({ farm_human_key, expected_farm_doorplate });
    if (binding.error) return errorOut(binding.error.status, binding.error.code);
    try {
      const requestTime = now();
      const operation = () => {
        return service.execute({ ...parsed.data, farmId: binding.farm.id, side: 'human' }, requestTime);
      };
      const result = parsed.data.op === 'view' || !withAuthorityAction ? operation()
        : withAuthorityAction({ farmId: binding.farm.id, side: 'human', op: parsed.data.op,
          requestId: parsed.data.requestId, now: requestTime }, operation);
      return jsonOut(response, 200, { ok: true, data: result });
    } catch (error) {
      if (error instanceof HalloweenError) return errorOut(error.status, error.code);
      return errorOut(503, 'service_unavailable');
    }
  };
}
