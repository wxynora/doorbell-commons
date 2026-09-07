import { createHash } from "node:crypto";
import { replaceFarm, getNatureWorld } from "../store.js";
import { natureSnapshot } from "../nature.js";
import { decorationResource, decorationRevision, decorationState } from "../domain/farm-decoration/state.js";
import { validateDecorationLayout } from "../domain/farm-decoration/layout.js";
import { createMinimalHumanActionReceipt, replayMinimalHumanActionReceipt } from "../minimal-action-receipt.js";

export function projectHumanFarmDecorations(farm, now = Date.now()) {
  const nature = natureSnapshot(getNatureWorld(), now);
  const hour = ((now / 3600000 + 8) % 24 + 24) % 24;
  const night = hour < 5 || hour >= 19 ? 1 : hour < 7 ? (7 - hour) / 2 : hour < 17 ? 0 : (hour - 17) / 2;
  return {
    data: { ...decorationResource(farm), environment: {
      status: nature.status,
      season: nature.season ? { id: nature.season.id, name: nature.season.name } : null,
      weather: nature.weather ? { condition: nature.weather.condition } : null,
      night,
      disaster: nature.currentEvent ? { type: nature.currentEvent.type, phase: nature.currentEvent.phase } : null,
    } },
    revision: decorationRevision(farm), server_time: new Date(now).toISOString(),
  };
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
function error(code, current_revision) {
  return { status: code === "invalid_request" ? 400 : code === "farm_unavailable" ? 503 : 409, json: { error: { code, message: code, ...(current_revision ? { current_revision } : {}) } } };
}
function response(farm, now, result) {
  const view = projectHumanFarmDecorations(farm, now);
  return { data: { result, resource: view.data }, revision: view.revision, server_time: view.server_time };
}
export function handleHumanFarmDecorationSave(farm, body, now = Date.now()) {
  const keys = ["farm_human_key", "expected_farm_doorplate", "idempotency_key", "expected_revision", "layout"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== keys.length || !keys.every(key => Object.hasOwn(body, key)) || typeof body.farm_human_key !== "string" || !body.farm_human_key || !/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(body.expected_farm_doorplate) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key) || typeof body.expected_revision !== "string") return error("invalid_request");
  const fingerprint = createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
  try {
    const receipts = farm.doorbellHumanFarmDecorationReceipts ?? {};
    if (receipts[body.idempotency_key] !== undefined) {
      const replay = replayMinimalHumanActionReceipt(receipts[body.idempotency_key], fingerprint, response(farm, now, null));
      return replay ? { status: 200, json: replay } : error("idempotency_conflict");
    }
    const revision = decorationRevision(farm);
    if (body.expected_revision !== revision) return error("state_conflict", revision);
    const state = decorationState(farm), invalid = validateDecorationLayout(farm, body.layout, state.owned);
    if (invalid) return error(invalid);
    const working = structuredClone(farm);
    working.farmDecorations = { ...state, layout: structuredClone(body.layout) };
    const out = response(working, now, { receipt_id: body.idempotency_key });
    working.doorbellHumanFarmDecorationReceipts = { ...receipts, [body.idempotency_key]: createMinimalHumanActionReceipt(fingerprint, out) };
    replaceFarm(farm.id, working);
    return { status: 200, json: out };
  } catch { return error("farm_unavailable"); }
}
