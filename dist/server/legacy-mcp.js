import { mcpDispatch } from "../mcp.js";
import { NO_STORE, jsonOut, readBody } from "./http.js";

const MCP_STATUS_IDLE_MS = 10 * 60 * 1000;
const mcpLastToolAt = new Map();

export function createLegacyMcpHandler({ resolveAgent, executeAction }) {
    return async function handleLegacyMcp({ req, res, parts, method, now }) {
        if (method !== "POST")
            return jsonOut(res, 405, { ok: false, text: "MCP 端点只收 POST（JSON-RPC over HTTP）。" });
        const me = resolveAgent(parts[1] ?? "");
        if (!me)
            return jsonOut(res, 404, { ok: false, text: "这个 MCP 链接无效或已被撤销（key 不对？）。重开见 GET / 的「开张 & 接入」。" });
        const rpc = await readBody(req);
        const run = (action, params) => executeAction(me, action, params, now);
        const playerKey = me.id;
        const noteToolCall = () => {
            const previous = mcpLastToolAt.get(playerKey);
            mcpLastToolAt.set(playerKey, now);
            return previous === undefined || now - previous >= MCP_STATUS_IDLE_MS;
        };
        const resp = mcpDispatch(rpc, { serverName: "aifarm", run, noteToolCall });
        if (resp === undefined) {
            res.writeHead(202, NO_STORE);
            return res.end();
        } // 纯通知：202 空体
        return jsonOut(res, 200, resp);
    };
}
