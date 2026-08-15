import { MAX_BODY_BYTES } from "../config.js";
import { PublicSyncError } from "../public-sync.js";

// 机读默认紧凑 JSON；需要人工读时设环境变量 FARM_PRETTY=1 缩进输出。
const PRETTY = process.env.FARM_PRETTY === "1";

// 动态接口一律禁缓存：响应里常含 token / humanUrl / 实时农场状态，且建农场走 GET（?name=…）——
// 同名 URL 会被共享缓存按 URL 命中、把前一个注册者的密钥回放给别人（"误入别人农场" + token 泄露）。
export const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0" };
export const AGENT_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0", "X-Robots-Tag": "noindex" };

export function jsonOut(res, code, body) {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...NO_STORE });
    // 机读默认紧凑输出（省 25~45% 体积）；要人工调试可加 ?pretty=1（见 server 主路由）。
    res.end(PRETTY ? JSON.stringify(body, null, 2) : JSON.stringify(body));
}

export function textOut(res, code, t) {
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE });
    res.end(t);
}

/** 在原始字节层智能解码：玩家是 AI、HTTP 工具五花八门，不少客户端（如 Windows 下的工具）
 *  把中文按 GBK 而非 UTF-8 发出。必须在 utf8 解码「之前」判断——一旦 buf.toString('utf8') 把
 *  非法字节解成 U+FFFD 就不可逆了。优先 UTF-8；非法则按 gb18030(GBK 超集、ASCII 段与 UTF-8 一致、
 *  整段重解安全)回退；两者都非法才兜底 toString，绝不比现状差。纯 ASCII(token/id/数字)走快路不受影响。 */
function smartDecode(buf) {
    if (buf.length === 0)
        return "";
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    }
    catch {
        try {
            return new TextDecoder("gb18030", { fatal: true }).decode(buf);
        }
        catch {
            return buf.toString("utf8");
        }
    }
}

/** 把 query 里单个片段还原成原始字节：%XX→该字节、+→空格、其余按字符码取低 8 位。
 *  不像 decodeURIComponent 那样按 UTF-8 解码——保留原始字节交给 smartDecode 判编码，
 *  这样 GBK 客户端把中文 %-编码成 GBK 字节时也能救回来（query 的 %XX 是 ASCII、未丢失）。 */
function percentBytes(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === "%" && i + 2 < s.length) {
            const b = parseInt(s.slice(i + 1, i + 3), 16);
            if (!Number.isNaN(b)) {
                out.push(b);
                i += 2;
                continue;
            }
        }
        out.push(ch === "+" ? 0x20 : s.charCodeAt(i) & 0xff);
    }
    return Buffer.from(out);
}

/** 智能解析 query string：等价 URLSearchParams，但每个 key/value 走 percentBytes+smartDecode，
 *  纠正 GBK 客户端（URLSearchParams 默认按 UTF-8 解 %XX→中文会乱码）。正常 UTF-8 客户端结果不变。 */
export function smartParams(search) {
    const sp = new URLSearchParams();
    const q = search.startsWith("?") ? search.slice(1) : search;
    if (!q)
        return sp;
    for (const pair of q.split("&")) {
        if (!pair)
            continue;
        const eq = pair.indexOf("=");
        const k = eq < 0 ? pair : pair.slice(0, eq);
        const v = eq < 0 ? "" : pair.slice(eq + 1);
        sp.append(smartDecode(percentBytes(k)), smartDecode(percentBytes(v)));
    }
    return sp;
}

export class RequestBodyError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = "RequestBodyError";
        this.status = status;
        this.code = code;
    }
}

function readRequestBytes(req, maxBytes = MAX_BODY_BYTES) {
    return new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        let length = 0;
        let settled = false;
        const fail = (error) => {
            if (settled)
                return;
            settled = true;
            chunks.length = 0;
            rejectBody(error);
        };
        req.on("data", (chunk) => {
            if (settled)
                return;
            length += chunk.length;
            if (length > maxBytes) {
                fail(new RequestBodyError(413, "body_too_large", `请求体超过 ${maxBytes} 字节限制。`));
            }
            else {
                chunks.push(chunk);
            }
        });
        req.on("end", () => {
            if (settled)
                return;
            settled = true;
            resolveBody(Buffer.concat(chunks));
        });
        req.on("aborted", () => fail(new RequestBodyError(400, "request_body_aborted", "请求体传输未完成。")));
        req.on("error", () => fail(new RequestBodyError(400, "request_body_read_failed", "请求体读取失败。")));
        req.on("close", () => {
            if (!settled && !req.complete)
                fail(new RequestBodyError(400, "request_body_aborted", "请求体传输未完成。"));
        });
    });
}

export async function readBody(req) {
    const d = smartDecode(await readRequestBytes(req));
    try {
        return d ? JSON.parse(d) : {};
    }
    catch {
        throw new RequestBodyError(400, "invalid_json", "请求体不是有效 JSON。");
    }
}

export function readJsonBody(req, maxBytes) {
    return new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        let length = 0;
        let over = false;
        req.on("data", (chunk) => {
            length += chunk.length;
            if (length > maxBytes) {
                over = true;
                chunks.length = 0;
            }
            else if (!over) {
                chunks.push(chunk);
            }
        });
        req.on("end", () => {
            if (over)
                return rejectBody(new PublicSyncError(413, `同步存档超过 ${Math.trunc(maxBytes / 1024 / 1024)}MB。`));
            try {
                const text = smartDecode(Buffer.concat(chunks));
                resolveBody(text ? JSON.parse(text) : {});
            }
            catch {
                rejectBody(new PublicSyncError(400, "同步存档不是有效 JSON。"));
            }
        });
        req.on("error", () => rejectBody(new PublicSyncError(400, "同步存档读取失败。")));
    });
}

/** 读 application/x-www-form-urlencoded 表单体（人类牧场页的 POST 表单用）。 */
export async function readFormBody(req) {
    const d = (await readRequestBytes(req)).toString("utf8");
    const o = {};
    for (const [k, v] of new URLSearchParams(d))
        o[k] = v;
    return o;
}

/** 取客户端 IP（兼容反代场景下的 X-Forwarded-For）。 */
export function clientIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (xff)
        return String(xff).split(",")[0].trim();
    return req.socket.remoteAddress ?? "unknown";
}
