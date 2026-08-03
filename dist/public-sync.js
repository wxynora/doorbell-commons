import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { makeFarm } from "./game.js";
import { getCrop } from "./content.js";
import { allUgc, dumpUgc, loadUgc, registerUgc } from "./ugc.js";
import { allFarms, getFarm, insertFarm, normalizeFarm, replaceFarm } from "./store.js";
export class PublicSyncError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
const B62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const IDENTITY_KEYS = new Set(["id", "token", "humanKey", "agentKey", "syncHub"]);
const SOCIAL_RESET_KEYS = new Set([
    "inbox", "messages", "trail", "blocked", "visitedIds", "waterVisits", "stealCooldowns", "market",
]);
function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function clone(value) {
    return structuredClone(value);
}
function assertSafeJson(value, depth = 0) {
    if (depth > 48)
        throw new PublicSyncError(400, "存档嵌套层级异常。");
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new PublicSyncError(400, "存档里有无效数字。");
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            assertSafeJson(item, depth + 1);
        return;
    }
    if (!isRecord(value))
        throw new PublicSyncError(400, "存档包含不支持的数据类型。");
    for (const [key, item] of Object.entries(value)) {
        if (key === "__proto__" || key === "prototype" || key === "constructor") {
            throw new PublicSyncError(400, "存档包含不安全字段。");
        }
        assertSafeJson(item, depth + 1);
    }
}
function hashSecret(secret) {
    return createHash("sha256").update(secret, "utf8").digest("hex");
}
function secretMatches(secret, expectedHex) {
    const actual = Buffer.from(hashSecret(secret), "hex");
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function payloadHash(value) {
    return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function newSyncKey() {
    return randomBytes(32).toString("base64url");
}
function newAgentKey() {
    for (let tries = 0; tries < 50; tries++) {
        const buf = randomBytes(8);
        let key = "";
        for (const byte of buf)
            key += B62[byte % B62.length];
        if (!allFarms().some((farm) => farm.agentKey === key))
            return key;
    }
    return randomBytes(12).toString("base64url");
}
function withoutHubAndSecrets(farm) {
    const out = clone(farm);
    delete out.syncHub;
    delete out.token;
    delete out.humanKey;
    delete out.agentKey;
    return out;
}
function collectStringRefs(value, refs = new Set()) {
    if (typeof value === "string")
        refs.add(value);
    else if (Array.isArray(value))
        for (const item of value)
            collectStringRefs(item, refs);
    else if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) {
            refs.add(key);
            collectStringRefs(item, refs);
        }
    }
    return refs;
}
function remapRefs(value, mapping) {
    if (typeof value === "string")
        return mapping.get(value) ?? value;
    if (Array.isArray(value))
        return value.map((item) => remapRefs(item, mapping));
    if (!isRecord(value))
        return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        out[mapping.get(key) ?? key] = remapRefs(item, mapping);
    }
    return out;
}
function freshUgcId() {
    let id;
    do {
        id = `ugc_${randomBytes(8).toString("hex")}`;
    } while (getCrop(id));
    return id;
}
function installRelevantUgc(farmLike, supplied, existingRefs = new Set()) {
    const arr = Array.isArray(supplied) ? supplied : [];
    const refs = collectStringRefs(farmLike);
    const relevant = arr.filter((crop) => isRecord(crop) && typeof crop.id === "string" && refs.has(crop.id));
    const mapping = new Map();
    const seen = new Set();
    for (const crop of relevant) {
        const oldId = String(crop.id);
        if (seen.has(oldId))
            throw new PublicSyncError(400, `原创作物 ID 重复：${oldId}`);
        seen.add(oldId);
        if (!(existingRefs.has(oldId) && getCrop(oldId)))
            mapping.set(oldId, freshUgcId());
    }
    const remappedFarm = remapRefs(farmLike, mapping);
    const installed = [];
    for (const raw of relevant) {
        const oldId = String(raw.id);
        const id = mapping.get(oldId);
        if (!id)
            continue;
        const crop = {
            ...remapRefs(raw, mapping),
            id,
            category: "ugc",
            designer: String(remappedFarm.aiName || remappedFarm.name || "迁入农场").slice(0, 24),
            buyers: [],
            sales: 0,
            reports: 0,
            banned: false,
            listed: false,
        };
        registerUgc(crop);
        installed.push(crop);
    }
    return { farm: remappedFarm, installed };
}
function requireFarmShape(value) {
    if (!isRecord(value))
        throw new PublicSyncError(400, "没有找到可导入的农场对象。");
    assertSafeJson(value);
    if (!Array.isArray(value.plots))
        throw new PublicSyncError(400, "存档缺少地块数据。");
    for (const key of ["coins", "landTier", "rngState", "lastTickAt", "createdAt"]) {
        if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
            throw new PublicSyncError(400, `存档字段 ${key} 无效。`);
        }
    }
    for (const key of ["codex", "materials", "seeds", "items", "shop"]) {
        if (!isRecord(value[key]))
            throw new PublicSyncError(400, `存档字段 ${key} 无效。`);
    }
    return clone(value);
}
function importedFarm(source, overrides) {
    const seed = makeFarm(String(overrides.name ?? source.name ?? ""), undefined, {
        aiName: String(overrides.aiName ?? source.aiName ?? ""),
        humanName: String(overrides.humanName ?? source.humanName ?? ""),
    });
    const imported = { ...source };
    for (const key of IDENTITY_KEYS)
        delete imported[key];
    for (const key of SOCIAL_RESET_KEYS)
        delete imported[key];
    imported.id = seed.id;
    imported.name = seed.name;
    imported.aiName = seed.aiName;
    imported.humanName = seed.humanName;
    imported.token = seed.token;
    imported.humanKey = seed.humanKey;
    imported.agentKey = newAgentKey();
    imported.inbox = [];
    imported.messages = [];
    imported.trail = [];
    imported.blocked = [];
    imported.visitedIds = [];
    imported.waterVisits = {};
    imported.stealCooldowns = {};
    imported.market = [];
    if (isRecord(imported.shop?.potionSet))
        imported.shop.potionSet.buyers = [];
    return normalizeFarm(imported);
}
function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
function additivePath(path) {
    const root = path[0] ?? "";
    const leaf = path.at(-1) ?? "";
    if (path.length === 1 && [
        "coins", "silver", "harvested", "watered", "stolen", "crafted", "designCount",
        "expRuns", "gotStolen", "tasksDone", "expConcord",
    ].includes(root))
        return true;
    if (["materials", "seeds", "items"].includes(root))
        return true;
    if (root === "codex" && leaf === "count")
        return true;
    if (root === "plots" && ["progress", "waterCount"].includes(leaf))
        return true;
    if (root === "ranch" && ["coins", "pending", "ticksSinceProduce"].includes(leaf))
        return true;
    return false;
}
function stableArrayKey(value) {
    if (!isRecord(value))
        return undefined;
    if (typeof value.id === "string" || typeof value.id === "number")
        return `id:${value.id}`;
    if (typeof value.kindId === "string")
        return `kind:${value.kindId}`;
    return undefined;
}
function mergeThreeWay(base, owner, server, path = []) {
    if (same(server, base))
        return clone(owner);
    if (same(owner, base))
        return clone(server);
    if (typeof base === "number" && typeof owner === "number" && typeof server === "number" && additivePath(path)) {
        return owner + (server - base);
    }
    if (Array.isArray(base) && Array.isArray(owner) && Array.isArray(server)) {
        const keyed = [...base, ...owner, ...server].every((item) => stableArrayKey(item) !== undefined);
        if (keyed) {
            const b = new Map(base.map((item) => [stableArrayKey(item), item]));
            const o = new Map(owner.map((item) => [stableArrayKey(item), item]));
            const s = new Map(server.map((item) => [stableArrayKey(item), item]));
            const order = [...new Set([...o.keys(), ...s.keys()])];
            return order.map((key) => {
                if (!b.has(key))
                    return clone(s.get(key) ?? o.get(key));
                if (!o.has(key))
                    return clone(s.get(key));
                if (!s.has(key))
                    return clone(o.get(key));
                return mergeThreeWay(b.get(key), o.get(key), s.get(key), [...path, key]);
            }).filter((item) => item !== undefined);
        }
        if (base.length === owner.length && base.length === server.length) {
            return base.map((item, index) => mergeThreeWay(item, owner[index], server[index], [...path, String(index)]));
        }
        return clone(server);
    }
    if (isRecord(base) && isRecord(owner) && isRecord(server)) {
        const out = {};
        const keys = new Set([...Object.keys(base), ...Object.keys(owner), ...Object.keys(server)]);
        for (const key of keys) {
            const b = base[key];
            const o = owner[key];
            const s = server[key];
            if (!(key in server) && !(key in owner))
                continue;
            if (!(key in base))
                out[key] = clone((key in server) ? s : o);
            else if (!(key in owner))
                out[key] = clone(s);
            else if (!(key in server))
                out[key] = clone(o);
            else
                out[key] = mergeThreeWay(b, o, s, [...path, key]);
        }
        return out;
    }
    return clone(server);
}
function incomingForFarm(source, current) {
    const incoming = clone(source);
    delete incoming.syncHub;
    incoming.id = current.id;
    incoming.token = current.token;
    incoming.humanKey = current.humanKey;
    incoming.agentKey = current.agentKey;
    incoming.name = String(incoming.name ?? current.name).trim().slice(0, 24) || current.name;
    incoming.aiName = String(incoming.aiName ?? current.aiName ?? "").trim().slice(0, 24) || undefined;
    incoming.humanName = String(incoming.humanName ?? current.humanName ?? "").trim().slice(0, 24) || undefined;
    return normalizeFarm(incoming);
}
function farmUgc(farm) {
    const refs = collectStringRefs(farm);
    return allUgc().filter((crop) => refs.has(crop.id)).map((crop) => clone(crop));
}
function remoteEvents(owner, canonical) {
    const ownerMessages = new Set((Array.isArray(owner.messages) ? owner.messages : []).map((m) => String(m?.id ?? "")));
    const ownerTrail = new Set((Array.isArray(owner.trail) ? owner.trail : []).map((e) => `${e?.t ?? ""}:${e?.kind ?? ""}:${e?.by ?? ""}`));
    return {
        messages: (canonical.messages ?? []).filter((m) => !ownerMessages.has(String(m.id))),
        trail: (canonical.trail ?? []).filter((e) => !ownerTrail.has(`${e.t}:${e.kind}:${e.by}`)),
    };
}
export function registerSyncedFarm(body) {
    if (!isRecord(body))
        throw new PublicSyncError(400, "请求格式无效。");
    const source = requireFarmShape(body.farm ?? body.snapshot);
    const ugcBefore = dumpUgc();
    try {
        const installed = installRelevantUgc(source, body.ugc);
        const farm = importedFarm(installed.farm, body);
        const syncKey = newSyncKey();
        farm.syncHub = {
            schemaVersion: 1,
            revision: 1,
            syncKeyHash: hashSecret(syncKey),
            lastClientSeq: 0,
            updatedAt: Date.now(),
            ownerBaseline: withoutHubAndSecrets(farm),
        };
        insertFarm(farm);
        return { farm, snapshot: withoutHubAndSecrets(farm), ugc: farmUgc(farm), syncKey, revision: 1 };
    }
    catch (err) {
        loadUgc(ugcBefore);
        throw err;
    }
}
export function claimSyncedFarm(farmId, token) {
    const farm = getFarm(farmId);
    if (!farm || !farm.token || farm.token !== token)
        throw new PublicSyncError(403, "门牌号或主钥匙不正确。");
    const syncKey = newSyncKey();
    const updated = clone(farm);
    updated.syncHub = {
        schemaVersion: 1,
        revision: (farm.syncHub?.revision ?? 0) + 1,
        syncKeyHash: hashSecret(syncKey),
        lastClientSeq: 0,
        updatedAt: Date.now(),
        ownerBaseline: withoutHubAndSecrets(farm),
    };
    replaceFarm(farm.id, updated);
    return { farm: updated, syncKey, revision: updated.syncHub.revision };
}
function authenticatedFarm(farmId, syncKey) {
    const farm = getFarm(farmId);
    if (!farm?.syncHub || !secretMatches(syncKey, farm.syncHub.syncKeyHash)) {
        throw new PublicSyncError(403, "同步门牌号或同步钥匙不正确。");
    }
    return farm;
}
export function syncFarm(farmId, syncKey, body) {
    if (!isRecord(body))
        throw new PublicSyncError(400, "请求格式无效。");
    const current = authenticatedFarm(farmId, syncKey);
    const hub = current.syncHub;
    const seq = Number(body.clientSeq);
    if (!Number.isSafeInteger(seq) || seq < 1)
        throw new PublicSyncError(400, "clientSeq 必须是正整数。");
    const source = requireFarmShape(body.farm ?? body.snapshot);
    const digest = payloadHash({ clientSeq: seq, snapshot: source, ugc: body.ugc ?? [] });
    if (seq < hub.lastClientSeq)
        throw new PublicSyncError(409, "这份本地同步序号已经落后，请先拉取当前规范存档。");
    if (seq === hub.lastClientSeq) {
        if (hub.lastPayloadHash !== digest)
            throw new PublicSyncError(409, "同一个 clientSeq 对应了不同存档，已拒绝覆盖。");
        return {
            snapshot: withoutHubAndSecrets(current),
            ugc: farmUgc(current),
            revision: hub.revision,
            events: { messages: [], trail: [] },
            idempotent: true,
        };
    }
    const ugcBefore = dumpUgc();
    try {
        const installed = installRelevantUgc(source, body.ugc, collectStringRefs(current));
        const owner = incomingForFarm(installed.farm, current);
        const base = incomingForFarm(hub.ownerBaseline, current);
        const merged = normalizeFarm(mergeThreeWay(base, owner, current));
        merged.id = current.id;
        merged.token = current.token;
        merged.humanKey = current.humanKey;
        merged.agentKey = current.agentKey;
        const events = remoteEvents(owner, merged);
        const nextHub = {
            ...hub,
            revision: hub.revision + 1,
            lastClientSeq: seq,
            lastPayloadHash: digest,
            updatedAt: Date.now(),
            ownerBaseline: withoutHubAndSecrets(merged),
        };
        merged.syncHub = nextHub;
        replaceFarm(current.id, merged);
        return {
            snapshot: withoutHubAndSecrets(merged),
            ugc: farmUgc(merged),
            revision: nextHub.revision,
            events,
            idempotent: false,
        };
    }
    catch (err) {
        loadUgc(ugcBefore);
        throw err;
    }
}
export function exportSyncedFarm(farmId, syncKey) {
    const farm = authenticatedFarm(farmId, syncKey);
    return {
        format: "aifarm-sync-package",
        version: 1,
        exportedAt: new Date().toISOString(),
        farm: withoutHubAndSecrets(farm),
        ugc: farmUgc(farm),
        revision: farm.syncHub.revision,
    };
}
export function syncPageHtml() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>把农场带来</title>
  <style>
    :root{color-scheme:light;--soil:#46362a;--paper:#f6f1df;--leaf:#466b45;--seed:#bd6b3d;--line:#c9b993}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--soil);font:16px/1.65 Georgia,"Noto Serif SC",serif}
    main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:clamp(36px,8vw,88px) 0}
    h1{font-size:clamp(2.5rem,8vw,5.4rem);line-height:.96;letter-spacing:-.05em;margin:0 0 18px;color:var(--leaf)}
    .lead{max-width:38rem;font-size:1.08rem;margin:0 0 38px}
    form{border-top:2px solid var(--soil);border-bottom:1px solid var(--line);padding:26px 0 30px;display:grid;gap:20px}
    label{display:grid;gap:7px;font-weight:700}.hint{font-weight:400;font-size:.88rem;color:#756653}
    input,select,button{font:inherit}input[type=file],input[type=text],select{width:100%;border:1px solid var(--line);background:#fffaf0;padding:12px}
    button{justify-self:start;border:0;background:var(--leaf);color:#fffaf0;padding:12px 22px;cursor:pointer}
    button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #d89a52;outline-offset:2px}
    #farms{display:none}.result{margin-top:28px;padding:22px 0;border-bottom:2px solid var(--soil);white-space:pre-wrap;overflow-wrap:anywhere}
    .error{color:#982f25}.links{display:grid;gap:9px;margin-top:12px}.links a{color:var(--leaf);font-weight:700}
    code{font-family:ui-monospace,SFMono-Regular,monospace;background:#eee3c8;padding:.12em .35em}
  </style>
</head>
<body><main>
  <h1>把农场<br>带来</h1>
  <p class="lead">平时仍在自己的单机农场种田。把存档同步到这里，想串门时再来联机；私有单机文件不会交给其他玩家。</p>
  <form id="form">
    <label>农场存档
      <span class="hint">支持 CLI 的 farm_save.json、服务端 farms.json，或本站导出的同步包。</span>
      <input id="farmFile" type="file" accept=".json,application/json" required>
    </label>
    <label id="farms">选择要带来的农场<select id="farmSelect"></select></label>
    <label>原创作物存档（可选）
      <span class="hint">CLI 对应 ugc_save.json；没有原创作物可不选。</span>
      <input id="ugcFile" type="file" accept=".json,application/json">
    </label>
    <label>新的农场名（可选）<input id="name" type="text" maxlength="24" placeholder="留空沿用存档名称"></label>
    <button id="submit" type="submit">带到联机服</button>
  </form>
  <div id="result" class="result" hidden></div>
</main>
<script>
let farms=[];
const farmFile=document.querySelector('#farmFile'), farmsWrap=document.querySelector('#farms'), farmSelect=document.querySelector('#farmSelect');
async function jsonFile(input){const file=input.files[0];return file?JSON.parse(await file.text()):undefined}
farmFile.addEventListener('change',async()=>{try{const raw=await jsonFile(farmFile);farms=Array.isArray(raw)?raw:(Array.isArray(raw?.farms)?raw.farms:[raw?.farm??raw]);farmSelect.innerHTML=farms.map((f,i)=>'<option value="'+i+'">'+(f?.name||f?.id||('农场 '+(i+1)))+'</option>').join('');farmsWrap.style.display=farms.length>1?'grid':'none'}catch{farms=[]}});
document.querySelector('#form').addEventListener('submit',async(e)=>{e.preventDefault();const out=document.querySelector('#result'),btn=document.querySelector('#submit');out.hidden=false;out.className='result';out.textContent='正在搬运存档…';btn.disabled=true;try{if(!farms.length){const raw=await jsonFile(farmFile);farms=Array.isArray(raw)?raw:(Array.isArray(raw?.farms)?raw.farms:[raw?.farm??raw])}const ugc=await jsonFile(document.querySelector('#ugcFile'));const body={farm:farms[Number(farmSelect.value||0)],ugc:Array.isArray(ugc)?ugc:(ugc?.ugc??[]),name:document.querySelector('#name').value};const r=await fetch('./sync/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error||p.text||'上传失败');out.innerHTML='<strong>农场已到联机服</strong><div class="links"><a href="'+p.humanUrl+'">给人类看的农场</a><a href="'+p.playUrl+'">给 AI 玩的农场</a></div><p>公开门牌号：<code>'+p.farmId+'</code></p><p>同步钥匙只显示这一次，请保存：<code>'+p.syncKey+'</code></p>'}catch(err){out.className='result error';out.textContent=err?.message||String(err)}finally{btn.disabled=false}});
</script></body></html>`;
}
//# sourceMappingURL=public-sync.js.map