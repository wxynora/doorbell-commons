import { advance } from "../engine.js";
import { expMaps, expEventById, expMapById, expDecorById } from "../content.js";
import { BASE, EXP_DC, EXP_DAILY_CAP, EXP_BLESSING_MAX } from "../config.js";
import { currentDayIndex } from "../time.js";
import { concordTierName } from "../titles.js";
import { esc, farmNames, fmtDate, page } from "./shell.js";

// ——————————————————————————————————————————————————————————————
// 🗺️ 探险页：当前探险/摇骰 · 出门前祈福 · 本趟故事书 · 秘境图鉴 · 旅程簿
// ——————————————————————————————————————————————————————————————
const EXP_TYPE_LABEL = { story: "剧情", drop: "掉落", choice: "分支", encounter: "奇遇", combat: "⚔️战斗" };
function expBagPreview(exp) {
    let coins = 0, silver = 0, potion = 0;
    const decor = [];
    for (const d of exp.bag) {
        if (d.t === "coins")
            coins += d.n ?? 0;
        else if (d.t === "silver")
            silver += d.n ?? 0;
        else if (d.t === "potion")
            potion += d.n ?? 0;
        else if (d.t === "decor")
            decor.push(expDecorById.get(d.id)?.name ?? "装饰");
    }
    const parts = [];
    if (coins)
        parts.push(`${coins}金`);
    if (silver)
        parts.push(`${silver}银`);
    if (potion)
        parts.push(`药水×${potion}`);
    if (decor.length)
        parts.push(`🏡${decor.join("、")}`);
    return parts.length ? parts.join("、") : "空";
}
export function uiExpedition(f, now, key, flash) {
    advance(f, now);
    const base = `${BASE}/ui/${key}/expedition`;
    const ai = esc(f.aiName || "TA");
    const human = esc(f.humanName || "你");
    const exp = f.expedition;
    const flashHtml = flash ? `<div class="flash" style="white-space:pre-wrap">${esc(flash)}</div>` : "";
    // —— plaque ——
    const concord = Math.min(100, Math.max(0, f.expConcord ?? 0));
    const concordTag = `<span class="tag">💞 默契 <b>${concord}/100</b></span>`;
    let tags;
    if (exp) {
        const map = expMapById.get(exp.mapId);
        tags = `<span class="tag">🗺️ <b>${esc(map?.name ?? "秘境")}</b></span><span class="tag">第 <b>${exp.step}</b> 格</span><span class="tag">❤ <b>${exp.hp}</b></span><span class="tag">🎒 ${esc(expBagPreview(exp))}</span>${concordTag}`;
    }
    else {
        const today = currentDayIndex(now);
        const used = f.expDaily && f.expDaily.day === today ? f.expDaily.n : 0;
        tags = `<span class="tag">今日剩 <b>${Math.max(0, EXP_DAILY_CAP - used)}/${EXP_DAILY_CAP}</b> 次数</span>${concordTag}`;
    }
    const plaque = `<div class="plaque"><h1>🗺️ 探险</h1>
    <p class="welcome"></p>
    <div class="tags">${tags}</div></div>${flashHtml}`;
    const cards = [];
    // —— 0. 默契度（并肩取胜攒下的羁绊；每赢一场 +1，封顶 100）——
    {
        const pct = concord; // 0..100
        const tier = concordTierName(concord); // 与「默契」类称号同源（titles.json）
        cards.push(`<div class="card"><h3>💞 默契度　<span class="muted small" style="font-weight:400">${ai} 与 ${human} 并肩取胜攒下的羁绊</span></h3>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin:0 0 6px">
        <span style="font-family:var(--serif);color:var(--leaf-deep);font-weight:600">${tier}</span>
        <span class="small muted"><b>${concord}</b> / 100</span></div>
      <div style="height:12px;border-radius:6px;background:#efe8d6;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--wood),var(--leaf-deep));transition:width .3s"></div></div>
      <p class="small muted" style="margin:8px 0 0">每当 ${ai} 在秘境里赢下一场战斗，默契度就 +1（封顶 100）。${concord >= 100 ? `🎉 你俩已心有灵犀，满默契达成！` : ""}</p></div>`);
    }
    // —— 1. 当前探险 / 摇骰 ——
    if (exp && exp.pending?.type === "combat") {
        const e = expEventById.get(exp.pending.eventId);
        const target = EXP_DC[e?.difficulty ?? "mid"];
        cards.push(`<div class="card" style="border:2px solid var(--wood)">
      <h3>⚔️ ${ai}遇到了【${esc(e?.foe ?? "强敌")}】！</h3>
      <p class="small muted" style="margin:0 0 8px">${esc(e?.story ?? "")}</p>
      <p style="margin:0 0 10px">掷两颗六面骰，<b>和 ≥ ${target}</b> 才能赢。你替 ${ai} 摇——和 TA 同心，骰子会偏心你（<b>+1</b>）。<br><span class="small muted">此刻 ❤ ${exp.hp} · 🎒 ${esc(expBagPreview(exp))}（赢了进库，输了只掉状态、行囊不丢）</span></p>
      <form method="post" action="${base}/roll"><button class="btn" style="font-size:18px;padding:10px 22px">🎲 替 ${ai} 摇骰子</button></form>
    </div>`);
    }
    else if (exp) {
        const map = expMapById.get(exp.mapId);
        const where = exp.pending?.type === "choice" ? `${ai}正面对一个选择，等 TA 自己拿主意。` : `等 ${ai} 继续往里走。`;
        cards.push(`<div class="card"><h3>🧭 探险进行中 · ${esc(map?.name ?? "")}</h3>
      <p class="small muted" style="margin:0">${ai}在第 ${exp.step} 格。❤ ${exp.hp} · 🎒 ${esc(expBagPreview(exp))}。${where}</p></div>`);
    }
    // —— 2. 出门前祈福 ——
    const blessing = esc(exp?.charm?.blessing ?? f.expCharm?.blessing ?? "");
    cards.push(`<div class="card"><h3>🧿 ${exp ? "为这趟祈福" : "出门前祈福"}　<span class="muted small" style="font-weight:400">给 ${ai} 添点底气</span></h3>
    <p class="small muted" style="margin:0 0 8px">挑一个护身符，再写一句祝福的话——它会随 ${ai} 一起带走，状态告急时在 TA 耳边回响，回来结算时再回放给你听。${exp ? "" : `${ai}下次 explore 出门时生效。`}</p>
    <form method="post" action="${base}/charm" style="display:grid;gap:8px">
      <label class="small"><input type="radio" name="kind" value="check" checked> 🍀 勇气符（下次检定 +1）</label>
      <label class="small"><input type="radio" name="kind" value="hp"> 💗 暖意符（回 1 点状态）</label>
      <textarea class="inp" style="width:100%" name="blessing" rows="2" maxlength="${EXP_BLESSING_MAX}" placeholder="写一句祝福的话（最多 ${EXP_BLESSING_MAX} 字，如：平平安安回来就好）">${blessing}</textarea>
      <div><button class="btn" type="submit">🧿 祈福</button></div>
    </form></div>`);
    // —— 3. 本趟故事书 ——
    if (exp && exp.log.length) {
        const pages = exp.log.map((l) => `<p style="margin:0 0 10px"><b>${esc(l.title)}</b><br><span class="small" style="white-space:pre-wrap">${esc(l.text)}</span></p>`).join("");
        cards.push(`<div class="card"><h3>📖 本趟故事书</h3>${pages}</div>`);
    }
    // —— 4. 秘境图鉴（折叠细列表；未解锁=纯问号，不透露任何内容）——
    const seen = new Set(f.expCodex ?? []);
    const rowStyle = "display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-bottom:1px solid #efe8d6;font-size:14px";
    const mapBlocks = expMaps.map((map) => {
        const evs = map.events.map((id) => expEventById.get(id)).filter((e) => !!e);
        const got = evs.filter((e) => seen.has(e.id)).length;
        const micon = "🗺️";
        const mcolor = "var(--leaf-deep)";
        // 未发现的秘境：连名字带内容整块盖住、不可展开；去过至少一格才解锁，露出真名与格子。
        if (got === 0)
            return `<div class="card" style="padding:10px 12px;font-family:var(--serif);color:#c2b89e;letter-spacing:3px;font-weight:600">${micon} ？？？　<span class="small" style="font-weight:400;letter-spacing:0;color:#c2b89e">未解锁</span></div>`;
        const rows = evs.map((e) => {
            if (!seen.has(e.id))
                return `<div style="${rowStyle};color:#c2b89e;letter-spacing:3px">？？？</div>`;
            const detail = [`<div style="white-space:pre-wrap">${esc(e.story)}</div>`];
            if (e.options?.length)
                detail.push(`<div class="small muted" style="margin-top:6px">岔路：<br>${e.options.map((o) => `▸ ${o.key}. ${esc(o.label)}`).join("<br>")}</div>`);
            if (e.type === "combat") {
                const bits = [`敌人：${esc(e.foe ?? "")}`];
                if (e.win?.text)
                    bits.push(`胜 → ${esc(e.win.text)}`);
                if (e.lose?.text)
                    bits.push(`负 → ${esc(e.lose.text)}`);
                detail.push(`<div class="small muted" style="margin-top:6px">⚔️ ${bits.join("<br>")}</div>`);
            }
            return `<details style="border-bottom:1px solid #efe8d6">
        <summary style="cursor:pointer;padding:5px 10px;font-size:14px">${EXP_TYPE_LABEL[e.type] ?? ""}・<b>${esc(e.title)}</b></summary>
        <div style="padding:0 14px 10px;font-size:13px;color:var(--ink-soft)">${detail.join("")}</div></details>`;
        }).join("");
        return `<details class="card" style="padding:0;overflow:hidden">
      <summary style="cursor:pointer;padding:10px 12px;font-family:var(--serif);color:${mcolor};font-weight:600">${micon} ${esc(map.name)}　<span class="small muted" style="font-weight:400">已遇 ${got}/${evs.length}</span></summary>
      <div>${rows}</div></details>`;
    }).join("");
    cards.push(`<div style="margin:6px 0"><h2 style="margin:6px 0">📔 秘境图鉴</h2>
    <p class="small muted" style="margin:0 0 8px">没去过的秘境整块是 ？？？；${ai}每去过一格就亮一格。点开已解锁的秘境，再点开某一格，能重读它的故事。</p></div>${mapBlocks}`);
    // —— 5. 旅程簿 ——
    if (f.expJourneys?.length) {
        const rows = f.expJourneys.slice(0, 12).map((j) => `<p style="margin:0 0 8px"><b>${esc(j.mapName)}</b> · <span class="small muted">${fmtDate(j.at)}</span><br><span class="small">${esc(j.summary)}</span>${j.blessing ? `<br><span class="small" style="color:var(--wood)">💗「${esc(j.blessing)}」</span>` : ""}</p>`).join("");
        cards.push(`<div class="card"><h3>📜 旅程簿　<span class="muted small" style="font-weight:400">${ai}的冒险史</span></h3>${rows}</div>`);
    }
    return page(`${f.name} · 探险`, key, "expedition", `${plaque}\n${cards.join("\n")}`, farmNames(f));
}
