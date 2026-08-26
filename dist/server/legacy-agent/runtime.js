import { randomUUID } from "node:crypto";
import { htmlAgentPage, htmlNotice, takeNonce } from "../../agent.js";
import { AGENT_HEADERS } from "../http.js";
import { autoPickMaterials } from "./offers.js";
import { createLegacyAgentPages } from "./pages.js";

const AGENT_FLASH_TTL = 5 * 60 * 1000;

export function createLegacyAgentHandler({ runFarm, resolveAgent }) {
    if (typeof runFarm !== "function" || typeof resolveAgent !== "function")
        throw new TypeError("createLegacyAgentHandler requires runFarm and resolveAgent");

    const pages = createLegacyAgentPages({ runFarm, resolveAgent });
    const agentFlashes = new Map();

    function sweepFlashes(now) {
        for (const [k, v] of agentFlashes)
            if (v.exp < now)
                agentFlashes.delete(k);
    }

    function putFlash(playKey, target, now) {
        sweepFlashes(now);
        const k = randomUUID().replace(/-/g, "").slice(0, 16);
        agentFlashes.set(k, { playKey, target, exp: now + AGENT_FLASH_TTL });
        return k;
    }

    function takeFlash(playKey, key, now) {
        if (!key)
            return undefined;
        const v = agentFlashes.get(key);
        if (!v)
            return undefined;
        agentFlashes.delete(key);
        return v.playKey === playKey && v.exp >= now ? v.target : undefined;
    }

    function agentRedirect(playKey, target, now) {
        const flash = putFlash(playKey, target, now);
        return { redirect: `/agent/${playKey}/view?flash=${flash}&v=${randomUUID().replace(/-/g, "").slice(0, 8)}` };
    }

    function agentDo(playKey, nonce, now) {
        const f = resolveAgent(playKey);
        if (!f)
            return { html: htmlAgentPage(playKey, "这个 Agent 链接无效或已被撤销。", []) };
        const n = takeNonce(nonce, now);
        if (!n || n.playKey !== playKey)
            return { html: htmlNotice("✅ 此操作已执行（或链接已过期）。\n旧的操作链接不会重复生效——点下面回农场看当前真实状态，再继续操作。", `/agent/${playKey}/view?v=${randomUUID().replace(/-/g, "").slice(0, 8)}`, "↻ 回农场看最新状态") };
        const tok = f.token, a = n.action, p = n.params;
        if (a === "status")
            return agentRedirect(playKey, { kind: "self" }, now);
        if (a === "shop")
            return agentRedirect(playKey, { kind: "shop" }, now);
        if (a === "bag")
            return agentRedirect(playKey, { kind: "bag" }, now);
        if (a === "market")
            return agentRedirect(playKey, { kind: "market" }, now);
        if (a === "kitchen" && !p.op)
            return agentRedirect(playKey, { kind: "kitchen" }, now);
        if (a === "leaderboard")
            return agentRedirect(playKey, { kind: "leaderboard" }, now);
        if (a === "mypage")
            return agentRedirect(playKey, { kind: "mypage" }, now);
        if (a === "wander")
            return agentRedirect(playKey, { kind: "wander" }, now);
        if (a === "visit")
            return agentRedirect(playKey, { kind: "visit", targetId: String(p.target) }, now);
        let banner;
        if (a === "craft") {
            const mats = p.auto ? autoPickMaterials(f)
                : (Array.isArray(p.materials) ? p.materials : String(p.materials ?? "").split(",").map((s) => s.trim()).filter(Boolean));
            banner = (mats && mats.length >= 3) ? runFarm(f.id, "craft", { token: tok, materials: mats }, undefined, now).json.text : "素材不足 3 个，没法熔炼。";
            return agentRedirect(playKey, { kind: "self", banner: pages.stripFooter(banner) }, now);
        }
        else if (a === "buy") {
            banner = runFarm(String(p.target), "buy", { by: f.id, token: tok, kind: p.kind, id: p.id, qty: p.qty }, undefined, now).json.text;
        }
        else if (a === "steal") {
            banner = runFarm(String(p.target), "steal", { by: f.id, token: tok, plotId: p.plotId }, undefined, now).json.text;
        }
        else if (a === "message") {
            banner = runFarm(String(p.target), "message", { by: f.id, token: tok, text: p.text }, undefined, now).json.text;
        }
        else if (a === "water" && p.target) {
            banner = runFarm(String(p.target), "water", { by: f.id, token: tok }, undefined, now).json.text;
        }
        else if (a === "buy-potion-set" && p.target) {
            banner = runFarm(String(p.target), "buy-potion-set", { by: f.id, token: tok }, undefined, now).json.text;
        }
        else if (a === "buy-item" || a === "buy-potion-set" || a === "buy-recipe" || a === "buy-animal" || a === "buy-pet" || a === "buy-patrol-goose") {
            banner = runFarm(f.id, a, { token: tok, ...p }, undefined, now).json.text;
            return agentRedirect(playKey, { kind: "self", banner: pages.stripFooter(banner) }, now);
        }
        else if (a === "list") {
            banner = runFarm(f.id, a, { token: tok, ...p }, undefined, now).json.text;
            return agentRedirect(playKey, { kind: "shop", banner: pages.stripFooter(banner) }, now);
        }
        else if (a === "unlist") {
            banner = runFarm(f.id, a, { token: tok, ...p }, undefined, now).json.text;
            return agentRedirect(playKey, { kind: "market", banner: pages.stripFooter(banner) }, now);
        }
        else if (a === "kitchen") {
            banner = runFarm(f.id, a, { token: tok, ...p }, undefined, now).json.text;
            return agentRedirect(playKey, { kind: "kitchen", banner: pages.stripFooter(banner) }, now);
        }
        else if (a === "delete-message" || a === "guestbook") {
            const t = runFarm(f.id, a, { token: tok, ...p }, undefined, now).json.text;
            return agentRedirect(playKey, { kind: "mypage", banner: pages.stripFooter(t) }, now);
        }
        else {
            banner = runFarm(f.id, a, { token: tok, ...p }, undefined, now).json.text;
        }
        return agentRedirect(playKey, { kind: "self", banner: pages.stripFooter(banner) }, now);
    }

    function handleRoute({ res, url, parts, sp, now }) {
        if (parts[0] !== "agent" || parts.length < 2)
            return false;
        const playKey = parts[1];
        if (parts[2] === "do") {
            const out = agentDo(playKey, String(url.searchParams.get("n") ?? ""), now);
            if ("redirect" in out) {
                res.writeHead(303, { ...AGENT_HEADERS, Location: out.redirect });
                res.end();
                return true;
            }
            res.writeHead(200, AGENT_HEADERS);
            res.end(out.html);
            return true;
        }
        if (parts[2] === "compose") {
            res.writeHead(200, AGENT_HEADERS);
            res.end(pages.agentCompose(playKey, Object.fromEntries(sp), now));
            return true;
        }
        const f = resolveAgent(playKey);
        if (!f) {
            res.writeHead(404, AGENT_HEADERS);
            res.end(htmlAgentPage(playKey, "这个 Agent 链接无效或已被撤销。", []));
            return true;
        }
        if (parts[2] === "view") {
            const flash = takeFlash(playKey, url.searchParams.get("flash"), now);
            res.writeHead(200, AGENT_HEADERS);
            res.end(pages.renderAgentTarget(playKey, f, now, flash));
            return true;
        }
        res.writeHead(302, { ...AGENT_HEADERS, Location: `/agent/${playKey}/view?v=${randomUUID().slice(0, 8)}` });
        res.end();
        return true;
    }

    return {
        agentDo,
        agentRedirect,
        handleRoute,
        pages,
        putFlash,
        sweepFlashes,
        takeFlash,
    };
}
