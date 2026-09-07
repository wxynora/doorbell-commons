import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import { projectHumanFarmDecorations, handleHumanFarmDecorationSave } from "../farm-decoration-action.js";
import { humanFieldError, isPlainObject, requireDoorbellHumanFieldService, validateFarmBinding } from "./contract.js";

export async function handleDoorbellHumanFarmDecorations(req, res, method, action) {
  if (!requireDoorbellHumanFieldService(req, res, method)) return;
  try {
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (!isPlainObject(body) || (action === "read" && (Object.keys(body).length !== 2 || !Object.hasOwn(body, "farm_human_key") || !Object.hasOwn(body, "expected_farm_doorplate")))) return humanFieldError(res, 400, "invalid_request", "invalid_request");
    const binding = validateFarmBinding(body);
    if (binding.error) return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
    if (action === "read") return jsonOut(res, 200, projectHumanFarmDecorations(binding.farm));
    const out = handleHumanFarmDecorationSave(binding.farm, body);
    return jsonOut(res, out.status, out.json);
  } catch (err) {
    if (err instanceof PublicSyncError) return humanFieldError(res, err.status === 413 ? 413 : 400, err.status === 413 ? "body_too_large" : "invalid_request", "invalid_request");
    return humanFieldError(res, 503, "farm_unavailable", "farm_unavailable");
  }
}
