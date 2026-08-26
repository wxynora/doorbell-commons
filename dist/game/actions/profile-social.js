import { UGC_NAME_MAX, WELCOME_MAX } from "../../config.js";
import { hasDamagedPublicName } from "../factory.js";
import { withFooter } from "../presentation/farm.js";

export function handleProfileSocialAction(action, f, b, now) {
    switch (action) {
        case "wander":
        case "steal":
        case "visit":
            return { ok: false, text: "联网社交功能（串门/偷菜/随机逛），单机 CLI 无其他农场——请走 HTTP 服务的 /wander、/farms/:id/steal 等。" };
        case "leaderboard":
        case "ranking":
            // 排行榜是全服功能：HTTP 在 runFarm/路由层用 allFarms() 处理（不进 dispatch）；单机 CLI 只有自己一座，给个明确说明而不是报"没有这个动作"。
            return { ok: false, text: "🏆 排行榜是全服功能，单机 CLI 只有你这一座农场——联网 HTTP 服务看 GET /leaderboard（或 /c?a=leaderboard，公开免 token）。" };
        case "set-welcome": {
            const text = String(b.text ?? "").trim();
            if (!text)
                return { ok: false, text: "欢迎语不能为空（{\"action\":\"set-welcome\",\"text\":\"...\"}）" };
            if (text.length > WELCOME_MAX)
                return { ok: false, text: `欢迎语最多 ${WELCOME_MAX} 字` };
            f.welcome = text;
            return { ok: true, text: withFooter(f, now, `已设置串门欢迎语：${text}`) };
        }
        case "rename": {
            const name = String(b.text ?? b.name ?? "").trim();
            if (!name)
                return { ok: false, text: "要给个新名字（{\"action\":\"rename\",\"text\":\"...\"}）" };
            if (hasDamagedPublicName(name))
                return { ok: false, text: "名称看起来已经发生编码损坏（只剩问号或包含 �），请用 UTF-8 重新发送原名称。" };
            if (name.length > UGC_NAME_MAX)
                return { ok: false, text: `名字最多 ${UGC_NAME_MAX} 字` };
            f.name = name;
            return { ok: true, text: withFooter(f, now, `农场已改名为「${name}」`) };
        }
        case "guestbook": {
            const on = !(b.on === false || b.on === "off" || b.on === "false");
            f.guestbook = on;
            return { ok: true, text: withFooter(f, now, `留言板已${on ? "开启" : "关闭"}`) };
        }
        case "block": {
            const target = String(b.id ?? "").trim();
            if (!target)
                return { ok: false, text: "拉黑谁？{\"action\":\"block\",\"id\":\"farm_xxx\"}" };
            f.blocked ??= [];
            if (!f.blocked.includes(target))
                f.blocked.push(target);
            return { ok: true, text: withFooter(f, now, `已拉黑 ${target}，它不能再在你板上留言。`) };
        }
        case "unblock": {
            const target = String(b.id ?? "").trim();
            f.blocked = (f.blocked ?? []).filter((x) => x !== target);
            return { ok: true, text: withFooter(f, now, `已解除拉黑 ${target}。`) };
        }
        default: return { ok: false, text: `没有这个动作：${action ?? "(空)"}` };
    }
}
