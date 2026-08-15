import { allFarms, playerFarms } from "../store.js";
import {
    BASE,
    MAX_BODY_BYTES,
    MAX_FARMS,
    REGISTRATION_CAP,
    REGISTRATION_CLOSED_TEXT,
    REGISTRATION_FULL_TEXT,
    REGISTRATION_OPEN,
    SYNC_MAX_BODY_BYTES,
} from "../config.js";
import { allowCreate } from "../guard.js";
import {
    claimSyncedFarm,
    exportSyncedFarm,
    PublicSyncError,
    registerSyncedFarm,
    syncFarm,
    syncPageHtml,
} from "../public-sync.js";
import { AGENT_HEADERS, jsonOut, readJsonBody } from "./http.js";

export async function handleSyncRoute({ req, res, parts, method, ip, now }) {
    if (method === "GET" && parts.length === 1) {
        res.writeHead(200, AGENT_HEADERS);
        return res.end(syncPageHtml());
    }
    if (method === "POST" && parts[1] === "register" && parts.length === 2) {
        if (!REGISTRATION_OPEN)
            throw new PublicSyncError(503, REGISTRATION_CLOSED_TEXT);
        if (REGISTRATION_CAP > 0 && playerFarms().length >= REGISTRATION_CAP)
            throw new PublicSyncError(503, REGISTRATION_FULL_TEXT);
        if (allFarms().length >= MAX_FARMS)
            throw new PublicSyncError(503, "全服农场数量已达上限。");
        if (!allowCreate(ip, now))
            throw new PublicSyncError(429, "迁入农场太频繁了，过会儿再来。");
        const body = await readJsonBody(req, SYNC_MAX_BODY_BYTES);
        const result = registerSyncedFarm(body);
        return jsonOut(res, 201, {
            ok: true,
            farmId: result.farm.id,
            farmName: result.farm.name,
            revision: result.revision,
            syncKey: result.syncKey,
            humanUrl: `${BASE}/ui/${result.farm.humanKey}`,
            playUrl: `${BASE}/a/${result.farm.agentKey}`,
            snapshot: result.snapshot,
            ugc: result.ugc,
        });
    }
    if (method === "POST" && parts[1] === "claim" && parts.length === 2) {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const result = claimSyncedFarm(String(body.farmId ?? ""), String(body.token ?? ""));
        return jsonOut(res, 200, {
            ok: true,
            farmId: result.farm.id,
            revision: result.revision,
            syncKey: result.syncKey,
        });
    }
    const farmId = String(parts[1] ?? "");
    const syncKey = String(req.headers["x-farm-sync-key"] ?? "");
    if (method === "POST" && parts.length === 2) {
        const body = await readJsonBody(req, SYNC_MAX_BODY_BYTES);
        const result = syncFarm(farmId, syncKey, body);
        return jsonOut(res, 200, { ok: true, ...result });
    }
    if (method === "GET" && parts[2] === "export" && parts.length === 3) {
        return jsonOut(res, 200, { ok: true, ...exportSyncedFarm(farmId, syncKey) });
    }
    throw new PublicSyncError(404, "同步入口不存在。");
}
