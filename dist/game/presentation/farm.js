import { circledNum, potionTargets, shopAnimals, shopPets } from "../../engine.js";
import { bonusEventText, dropText, harvestText, potionDropText, statusFooter } from "../../flavor.js";
import { landTierByLevel, totalCropCount } from "../../content.js";
import { currentSeason } from "../../time.js";
import { taskView } from "../../tasks.js";
import { allUgc } from "../../ugc.js";
import { qixi2026CompletionText } from "../../qixi-2026.js";
import { takeWelfareWeekNotice } from "../../welfare-week.js";

export function farmView(f, now) {
    return {
        id: f.id, name: f.name, coins: f.coins, silver: f.silver,
        season: currentSeason(now).name, landTier: landTierByLevel(f.landTier).name,
        codex: `${Object.keys(f.codex).length}/${totalCropCount}`,
        items: f.items,
        materials: f.materials,
        seeds: f.seeds,
        plots: f.plots.map((p) => ({
            id: p.id,
            state: !p.crop ? "empty" : p.crop.ripe ? "ripe" : "growing",
            seedType: p.crop?.seedType ?? null,
            watered: p.crop?.waterCount ?? 0,
        })),
        task: taskView(f, now),
    };
}

/** 首次解锁动物/宠物（图鉴够数→自动上架商店）时的一次性提示。
 *  老存档第一次遇到（announcedUnlocks 缺省）按当前已解锁静默播种、不补发，之后的解锁才提示。 */
function takeUnlockNotices(f) {
    const items = [
        ...shopAnimals(f).map((a) => ({ id: a.id, label: `🐾 ${a.name}` })),
        ...shopPets(f).map((p) => ({ id: p.id, label: `${p.emoji} ${p.name}` })),
    ];
    if (f.announcedUnlocks === undefined) {
        f.announcedUnlocks = items.map((i) => i.id);
        return "";
    }
    const fresh = items.filter((i) => !f.announcedUnlocks.includes(i.id));
    if (!fresh.length)
        return "";
    const partner = humanDisplay(f);
    for (const i of fresh)
        f.announcedUnlocks.push(i.id);
    return fresh.map((i) => `${i.label}已上架商店，购买后由${partner}饲养`).join("\n");
}

// —— 每轮随机小贴士（【当下可执行】：按农场当前状态过滤，只提示此刻用得上的事）——
const TIPS = [
    { t: "出门给邻居家浇水，能帮 TA 最快熟的那块加速 30 分钟，还能白赚一瓶加速药水（每天上限 10 瓶）——串门时顺手浇一浇。" },
    { t: "你设计的原创作物可以上架，供串门的邻居购买——让更多人收集到你的作品。",
        when: (f) => allUgc().some((c) => c.designerId === f.id && !c.banned) },
    { t: "宠物小猫🐱/小狗🐶能给农场带来独特加成，还能给它改名字——养一只陪你种田吧。",
        when: (f) => (f.ranch?.pets?.length ?? 0) === 0 },
    { t: "偷邻居家成熟的菜，有概率开出你还没收录的新图鉴哦。" },
    { t: "{human}可以给你的小动物换装打扮，再把它放回你的农田里转悠。",
        when: (f) => (f.ranch?.animals?.length ?? 0) > 0 },
    { t: "每个农场的商店都有概率刷新「加速药水套装」，去邻居家碰碰运气吧。" },
    { t: "{human}可以给你回寄金币——缺钱的时候，大方地向 TA「请求援助」吧。",
        when: (f) => f.coins < 100 },
];

/** 随机抽一条当前可执行的小贴士（已按状态过滤，{human} 替换成伴侣昵称）。无可用则返回 ""。 */
export function randomTip(f) {
    const pool = TIPS.filter((x) => !x.when || x.when(f));
    if (!pool.length)
        return "";
    const t = pool[Math.floor(Math.random() * pool.length)].t;
    return "🎈 小贴士：" + t.replaceAll("{human}", humanDisplay(f));
}

export const withFooter = (f, now, t) => {
    const welfare = takeWelfareWeekNotice(f);
    const notices = takeUnlockNotices(f);
    const tip = randomTip(f);
    return `${t}${welfare ? "\n" + welfare : ""}${notices ? "\n" + notices : ""}\n${statusFooter(f, now)}${tip ? "\n" + tip : ""}`;
};

export function fmtHarvest(r, harvesterId) {
    const byDesigner = !!harvesterId && r.crop?.designerId === harvesterId; // 收的人是否就是设计者
    let t = harvestText(r.crop, r.quality, r.value, r.isNew, r.codexReward, byDesigner, r.currency); // 收录奖励已并入标题
    const bt = bonusEventText(r.bonus);
    if (bt)
        t += "\n" + bt;
    const dt = dropText(r.drop);
    if (dt)
        t += "\n" + dt;
    if (r.potionDrop)
        t += "\n" + potionDropText();
    const qt = qixi2026CompletionText(r.qixi);
    if (qt)
        t += "\n" + qt;
    return t;
}

export const replantReminder = (count) => `🌱 已空出 ${count} 块地，记得及时补种。`;

function fmtCodexReveal(r, harvesterId) {
    const byDesigner = !!harvesterId && r.crop?.designerId === harvesterId;
    return harvestText(r.crop, r.quality, r.value, true, r.codexReward, byDesigner, r.currency);
}

/** 本轮收获若掉了素材，结尾给一句汇总（教学语只此一次，不再每株重复）。 */
function materialSummary(rs) {
    const n = rs.filter((r) => r.drop).length;
    return n ? `⚗️ 本轮 +${n} 份素材，bag 看库存与熔炼组合。` : "";
}

/** 批量收获文字：compact 时用「收下」汇总本轮全部作物；新图鉴由独立演出播报。 */
export function composeHarvests(rs, compact, harvesterId) {
    if (!compact) {
        const ms = materialSummary(rs);
        return rs.map((r) => fmtHarvest(r, harvesterId)).join("\n") + (ms ? "\n" + ms : "");
    }
    const events = [];
    for (const r of rs) {
        const bt = bonusEventText(r.bonus);
        if (bt)
            events.push(bt);
        const dt = dropText(r.drop);
        if (dt)
            events.push(dt);
        if (r.potionDrop)
            events.push(potionDropText());
    }
    const out = [];
    for (const r of rs)
        if (r.isNew)
            out.push(fmtCodexReveal(r, harvesterId));
    if (rs.length) {
        const names = {};
        let gold = 0, silver = 0;
        for (const r of rs) {
            names[r.crop.name] = (names[r.crop.name] ?? 0) + 1;
            if (r.currency === "silver")
                silver += r.value;
            else
                gold += r.value;
        }
        const gains = [gold ? `+${gold} 金` : "", silver ? `+${silver} 银` : ""].filter(Boolean).join(" · ");
        out.push(`【收下】${Object.entries(names).map(([n, c]) => n + (c > 1 ? `×${c}` : "")).join("、")}（${gains}）`);
    }
    for (const e of events)
        out.push(e);
    const ms = materialSummary(rs);
    if (ms)
        out.push(ms);
    for (const text of [...new Set(rs.map((r) => qixi2026CompletionText(r.qixi)).filter(Boolean))])
        out.push(text);
    return out.join("\n");
}

export function summarizePlanted(p) {
    const seg = [];
    if (p.common)
        seg.push(`${p.common} 普通`);
    if (p.fantasy)
        seg.push(`${p.fantasy} 奇幻`);
    if (p.limited)
        seg.push(`${p.limited} 限定`);
    return seg.join(" + ") || "0";
}

export const humanDisplay = (f) => f.humanName || "伴侣";

/** 催熟候选一行（药水有每日上限→催哪块是策略）：限定/稀有在前，标作物+剩余时间。
 *  POST/REST AI 看这行可选 ripen {plots:[N]} 精确催熟或 ripen {auto:true} 自动补药；手头没药水或没生长中作物则空串。 */
export function potionTargetLine(f, now) {
    if ((f.items.speed_potion ?? 0) <= 0)
        return "";
    const ts = potionTargets(f, now);
    if (!ts.length)
        return "";
    const seg = ts.slice(0, 6).map((t) => `${circledNum(t.plotId)}${t.label}（剩${t.remain}）`).join("｜");
    return `🎯 催熟候选：${seg}　精确催熟→ ripen {"plots":[N]}；自动补药并尽量全催→ ripen {"auto":true}`;
}
