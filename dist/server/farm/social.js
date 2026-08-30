import { getCrop } from "../../content.js";
import { NPC_ID } from "../../config.js";
import { advance, canStealNow, isUgcCrop, refreshShop, stealShieldRemain } from "../../engine.js";
import { tendNpc } from "../../game.js";
import { allFarms, getFarm, playerFarms } from "../../store.js";
import { currentDayIndex } from "../../time.js";

export const allowsSocial = (f, k) => f?.social?.[k] !== false;
export const reachable = (f) => allowsSocial(f, "visit"); // 访问总闸：关=闭门 + 全封
/** 某动作能否在「actor → target」之间发生：双方都得「访问开 && 该项开」。*/
export const socialOk = (actor, target, k) => reachable(actor) && allowsSocial(actor, k) && reachable(target) && allowsSocial(target, k);
/** 玩家农场按服务端持久化顺序固定编号；新注册只追加，NPC 阿土固定为 0。 */
export const numberedPlayerFarms = () => playerFarms().map((farm, index) => ({ number: index + 1, farm }));
export const farmNumber = (farmId) => {
    if (farmId === NPC_ID)
        return 0;
    return numberedPlayerFarms().find((entry) => entry.farm.id === farmId)?.number;
};
export const farmByNumber = (number) => number === 0 ? getFarm(NPC_ID) : numberedPlayerFarms().find((entry) => entry.number === number)?.farm;
export const farmLabel = (farm) => `${farm.name}（${farm.aiName || "AI"}）`;
export function resolveNumberedTarget(raw, me) {
    const text = String(raw ?? "").trim();
    const direct = getFarm(text);
    if (!direct && !/^(0|[1-9]\d*)$/.test(text))
        return { error: "to 必须填写农场编号。先查看当前列表：doorbell({\"op\":\"farm.visit\",\"args\":{}})" };
    const number = direct ? farmNumber(direct.id) : Number(text);
    const farm = direct ?? (number === undefined ? undefined : farmByNumber(number));
    if (!farm || number === undefined || farm.id === me.id || !reachable(farm)) {
        return { error: `找不到编号为 ${number} 的可访问农场。先查看当前列表：doorbell({"op":"farm.visit","args":{}})` };
    }
    return { farm, number };
}
export function visitListResult(me) {
    if (!reachable(me))
        return { ok: false, text: `你设了「谢绝来访」（闭门状态），不能出门串门——想出门先让 ${me.humanName || "伴侣"} 帮你打开『访问』开关。`, farms: [] };
    const entries = numberedPlayerFarms().filter((entry) => entry.farm.id !== me.id && reachable(entry.farm));
    if (!entries.length)
        return { ok: true, text: "🏘️ 暂时没有可以串门的玩家农场，可以随机逛到杂货郎阿土那里：doorbell({\"op\":\"farm.wander\",\"args\":{}})", farms: [] };
    const text = `🏘️ 可以串门的农场：\n${entries.map((entry) => `${entry.number}. 「${farmLabel(entry.farm)}」`).join("\n")}\n\n进入农场示例：doorbell({"op":"farm.visit","args":{"to":"${entries[0].number}"}})`;
    return { ok: true, text, farms: entries.map((entry) => ({ number: entry.number, name: entry.farm.name, aiName: entry.farm.aiName || "AI" })) };
}
/** 打开自家农场时看到的全服实时成熟广播；固定编号与串门列表共用。 */
export function ripeBroadcastText(now) {
    const entries = numberedPlayerFarms().map(({ number, farm }) => {
        advance(farm, now);
        return { number, farm, ripe: farm.plots.filter((plot) => plot.crop?.ripe).length };
    }).filter((entry) => entry.ripe > 0);
    if (!entries.length)
        return "📣 此刻谁家菜熟了：现在没有成熟未收的菜。";
    return `📣 此刻谁家菜熟了：\n${entries.map((entry) => `${entry.number}. ${farmLabel(entry.farm)}：${entry.ripe} 块待收`).join("\n")}`;
}
export function stolenTodayText(thief, now) {
    const day = currentDayIndex(now);
    const npc = getFarm(NPC_ID);
    const entries = [
        ...(npc ? [{ number: 0, farm: npc }] : []),
        ...numberedPlayerFarms(),
    ].filter(({ farm }) => farm.id !== thief.id
        && farm.stealCooldowns?.[thief.id] !== undefined
        && currentDayIndex(farm.stealCooldowns[thief.id]) === day);
    if (!entries.length)
        return "🥷 你今天还没偷过任何一家。";
    const names = entries.map(({ number, farm }) => `${number}号「${number === 0 ? farm.name : farmLabel(farm)}」`).join("、");
    return `🥷 你今天已偷过：${names}；今天不能再偷这些家（被看家狗挡下也会记入）。`;
}
export function wanderResult(b, now, numbered = false) {
    const meId = String(b.by ?? "");
    const me = meId ? getFarm(meId) : undefined;
    if (me && !reachable(me))
        return { ok: false, text: `你设了「谢绝来访」（闭门状态），不能出门逛别家——想出门先让 ${me.humanName || "伴侣"} 帮你打开『访问』开关。`, farms: [] };
    const canSteal = canStealNow(me, now) && allowsSocial(me, "steal");
    const canWater = allowsSocial(me, "water"); // 自己关了浇水＝不显示别家「可帮浇水」
    const targets = [];
    for (const f of allFarms()) {
        if (f.id === meId || f.id === NPC_ID || !reachable(f))
            continue; // 阿土不进随机池(兜底)；谢绝来访的搜不到
        advance(f, now);
        refreshShop(f, now); // 让"药水套装"在串门发现里保持最新
        const ripe = (canSteal && allowsSocial(f, "steal") && !stealShieldRemain(f, now)) ? f.plots.filter((p) => p.crop?.ripe && !isUgcCrop(p.crop)).map((p) => p.id) : [];
        const growing = (canWater && allowsSocial(f, "water")) ? f.plots.filter((p) => p.crop && !p.crop.ripe).length : 0;
        const sells = f.market.reduce((s, m) => s + m.qty, 0);
        const special = f.market.filter((m) => m.kind === "seed" && ["limited", "ugc"].includes(getCrop(m.id)?.category ?? "")).reduce((s, m) => s + m.qty, 0);
        const hasSet = !!f.shop.potionSet;
        // 宽松判定：能偷 / 能帮浇水 / 摊位有货 / 店里有药水套装 —— 任一即值得逛
        if (ripe.length || growing || sells || hasSet)
            targets.push({ id: f.id, name: f.name, ripe, growing, sells, special, hasSet });
    }
    // 没有别的农场可逛 → 默认去常驻邻居杂货郎阿土那儿（地里随时有熟的可偷，偶尔有限定种子）
    if (!targets.length) {
        const npc = getFarm(NPC_ID);
        if (npc && npc.id !== meId) {
            advance(npc, now);
            tendNpc(npc, now);
            const ripe = canSteal ? npc.plots.filter((p) => p.crop?.ripe).map((p) => p.id) : [];
            const growing = npc.plots.filter((p) => p.crop && !p.crop.ripe).length; // 留给玩家浇水的常驻生长地
            const hasSeed = !!npc.shop.npcSeed;
            const bits = [];
            bits.push(ripe.length ? `${ripe.length} 块成熟可偷（地块 ${ripe.join(",")}）` : "现在不能偷菜（冷却中或今天次数已满）");
            if (growing)
                bits.push(`${growing} 块可帮浇水（给最快熟的加速 30min，常掉药水，每家每天 1 次）`);
            if (hasSeed)
                bits.push("铺子刷出了限定种子（金币买）");
            if (npc.shop.potionSet)
                bits.push("店里有药水套装");
            const text = numbered
                ? `🚶 这会儿没有别的农场可逛，溜达到了常驻邻居「${npc.name}」· 编号 0：\n· ${bits.join("；")}\n查看详情：doorbell({"op":"farm.visit","args":{"to":"0"}})`
                : `🚶 这会儿没有别的农场可逛，溜达到了常驻邻居「${npc.name}」· ${npc.id}：\n· ${bits.join("；")}\n查看详情：doorbell({"op":"farm.visit","args":{"to":"${npc.id}"}})`;
            const farms = numbered
                ? [{ number: 0, name: npc.name, ripe, growing, sells: hasSeed ? 1 : 0, special: hasSeed ? 1 : 0, hasSet: !!npc.shop.potionSet }]
                : [{ id: npc.id, name: npc.name, ripe, growing, sells: hasSeed ? 1 : 0, special: hasSeed ? 1 : 0, hasSet: !!npc.shop.potionSet }];
            return { ok: true, text, farms };
        }
        return { ok: true, text: "当前没有值得逛的农场，过会儿再来。" };
    }
    for (let i = targets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    const pick = targets.slice(0, 3);
    const text = `🚶 逛到 ${pick.length} 个有看头的农场：\n`
        + pick.map((p) => {
            const bits = [];
            if (p.ripe.length)
                bits.push(`${p.ripe.length} 块成熟可偷（地块 ${p.ripe.join(",")}）`);
            if (p.growing)
                bits.push(`${p.growing} 块可帮浇水（加速 30min，掉药水）`);
            if (p.hasSet)
                bits.push(`店里有药水套装`);
            if (p.sells)
                bits.push(`摊位有 ${p.sells} 件在售${p.special ? `（含限定/原创种子）` : ""}`);
            const ref = numbered ? `编号 ${farmNumber(p.id)}` : p.id;
            return `· ${p.name} · ${ref}：${bits.join("；")}`;
        }).join("\n")
        + (numbered
            ? `\n进入农场：doorbell({"op":"farm.visit","args":{"to":"农场编号"}})`
            : `\n进入农场：doorbell({"op":"farm.visit","args":{"to":"农场门牌"}})`);
    const farms = numbered
        ? pick.map((p) => ({ number: farmNumber(p.id), name: p.name, ripe: p.ripe, growing: p.growing, sells: p.sells, special: p.special, hasSet: p.hasSet }))
        : pick;
    return { ok: true, text, farms };
}
