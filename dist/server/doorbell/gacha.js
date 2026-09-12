import { MAX_BODY_BYTES } from "../../config.js";
import { FARM_DECORATION_CATALOG } from "../../domain/farm-decoration/catalog.js";
import {
  cooking,
  cookingIngredients,
  cookingRecipes,
  crops,
  materials,
} from "../../content.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import {
  FARM_DOORPLATE_RE,
  humanFieldError,
  isPlainObject,
  requireDoorbellHumanFieldService,
  validateFarmBinding,
} from "./contract.js";
import {
  createDoorbellGachaService,
  GachaError,
} from "./gacha-service.js";

const READ_KEYS = new Set(["farm_human_key", "expected_farm_doorplate"]);
const DRAW_KEYS = new Set([
  "farm_human_key",
  "expected_farm_doorplate",
  "idempotency_key",
]);

export const DOORBELL_GACHA_CATALOG = Object.freeze({
  crops,
  materials,
  decorations: FARM_DECORATION_CATALOG,
  cooking,
  cookingIngredients,
  cookingRecipes,
});

function exactKeys(body, expected) {
  return (
    isPlainObject(body) &&
    Object.keys(body).length === expected.size &&
    Object.keys(body).every((key) => expected.has(key))
  );
}

function parseBody(body, action) {
  const expected = action === "read" ? READ_KEYS : DRAW_KEYS;
  if (!exactKeys(body, expected)) {
    throw new GachaError("GACHA_INVALID_REQUEST", "The request body contains unsupported fields");
  }
  if (
    typeof body.farm_human_key !== "string" ||
    body.farm_human_key.length === 0 ||
    typeof body.expected_farm_doorplate !== "string" ||
    !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate)
  ) {
    throw new GachaError("GACHA_INVALID_REQUEST", "The farm binding is invalid");
  }
  return {
    body,
    input: {
      farmHumanKey: body.farm_human_key,
      expectedFarmDoorplate: body.expected_farm_doorplate,
      ...(action === "draw" ? { idempotencyKey: body.idempotency_key } : {}),
    },
  };
}

function gachaErrorResponse(error) {
  const code = error?.code;
  switch (code) {
    case "GACHA_INVALID_REQUEST":
      return { status: 400, code: "invalid_request" };
    case "GACHA_CREDENTIAL_INVALID":
    case "GACHA_DOORPLATE_MISMATCH":
    case "GACHA_BINDING_UNAVAILABLE":
      return { status: 401, code: "farm_credential_invalid" };
    case "GACHA_FARM_NOT_FOUND":
      return { status: 404, code: "farm_not_found" };
    case "GACHA_QUOTA_EXCEEDED":
      return { status: 409, code: "quota_exceeded" };
    case "GACHA_PRIZE_POOL_EMPTY":
      return { status: 409, code: "prize_pool_empty" };
    case "GACHA_INSUFFICIENT_GOLD":
      return { status: 409, code: "insufficient_gold" };
    case "GACHA_IDEMPOTENCY_CONFLICT":
      return { status: 409, code: "idempotency_conflict" };
    case "GACHA_STATE_CONFLICT":
      return { status: 409, code: "state_conflict" };
    case "GACHA_ECONOMY_UNAVAILABLE":
    case "GACHA_ECONOMY_ACCOUNT_UNAVAILABLE":
    case "GACHA_CATALOG_UNAVAILABLE":
    case "GACHA_STATE_INVALID":
      return { status: 502, code: "upstream_contract_unavailable" };
    case "GACHA_RANDOM_UNAVAILABLE":
    case "GACHA_TIME_UNAVAILABLE":
      return { status: 503, code: "farm_unavailable" };
    default:
      return null;
  }
}

function sendGachaError(res, error) {
  if (error instanceof GachaError) {
    const mapped = gachaErrorResponse(error);
    if (mapped) {
      return humanFieldError(res, mapped.status, mapped.code, error.message);
    }
  }
  throw error;
}

function invalidBodyError(res, error) {
  if (error instanceof PublicSyncError) {
    const tooLarge = error.status === 413;
    return humanFieldError(
      res,
      tooLarge ? 413 : 400,
      tooLarge ? "body_too_large" : "invalid_request",
      tooLarge ? "The request body is too large" : "The request body must be valid JSON",
    );
  }
  return sendGachaError(res, error);
}

function assertRuntime(runtime) {
  if (!runtime || typeof runtime.read !== "function" || typeof runtime.draw !== "function") {
    throw new GachaError("GACHA_ECONOMY_UNAVAILABLE", "The gacha service is unavailable");
  }
  return runtime;
}

export function createDoorbellGachaRuntime(options = {}) {
  const service = createDoorbellGachaService({
    ...options,
    catalog: options.catalog ?? DOORBELL_GACHA_CATALOG,
  });
  return Object.freeze({
    read: (input) => service.read(input),
    draw: (input) => service.draw(input),
  });
}

export async function handleDoorbellHumanGachaRead(req, res, method, runtime) {
  if (!requireDoorbellHumanFieldService(req, res, method)) return;
  try {
    const parsed = parseBody(await readJsonBody(req, MAX_BODY_BYTES), "read");
    const binding = validateFarmBinding(parsed.body);
    if (binding.error) {
      return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
    }
    const service = assertRuntime(runtime);
    return jsonOut(res, 200, await service.read(parsed.input));
  } catch (error) {
    return invalidBodyError(res, error);
  }
}

export async function handleDoorbellHumanGachaAction(req, res, method, runtime) {
  if (!requireDoorbellHumanFieldService(req, res, method)) return;
  try {
    const parsed = parseBody(await readJsonBody(req, MAX_BODY_BYTES), "draw");
    const binding = validateFarmBinding(parsed.body);
    if (binding.error) {
      return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
    }
    const service = assertRuntime(runtime);
    return jsonOut(res, 200, await service.draw(parsed.input));
  } catch (error) {
    return invalidBodyError(res, error);
  }
}
