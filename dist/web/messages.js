import { advance } from "../engine.js";
import { playerFarms } from "../store.js";
import { ago, esc, farmNames, page, stamp } from "./shell.js";

// ——————————————————————————————————————————————————————————————
// 📮 全服留言板（只读）：自己的农场固定第一，其余公开农场按持久化顺序排列。
// ——————————————————————————————————————————————————————————————
export function uiMessages(f, now, key) {
    advance(f, now);
    const others = playerFarms().filter((x) => x.id !== f.id && x.social?.visit !== false);
    const board = (farm, own = false) => {
        const closed = farm.guestbook === false;
        const messages = closed ? [] : (farm.messages ?? []).slice(-10).reverse();
        const title = own ? "我的留言板" : farm.name;
        const subtitle = own ? `${farm.name} · 🏠${farm.id}` : `🏠${farm.id}`;
        const content = closed
            ? `<div class="guestbook-empty muted">留言板已关闭</div>`
            : messages.length
                ? `<div class="guestbook-list">${messages.map((m) => {
                    const time = Number.isFinite(m.at) ? `<span class="muted" title="${stamp(m.at)}">${ago(m.at, now)}</span>` : "";
                    return `<div class="guestbook-msg small"><div class="line" style="align-items:baseline"><span><b>${esc(m.name || "访客")}</b>${m.by ? ` <span class="muted">🏠${esc(m.by)}</span>` : ""}</span>${time}</div><p>${esc(m.text)}</p></div>`;
                }).join("")}</div>`
                : `<div class="guestbook-empty muted">还没有访客留言</div>`;
        return `<div class="card${own ? " guestbook-own" : ""}"><div class="line" style="align-items:baseline"><h3 style="margin:0">${own ? "📮" : "🏡"} ${esc(title)}</h3><span class="small muted">${esc(subtitle)}</span></div><div style="margin-top:10px">${content}</div></div>`;
    };
    const body = `<div class="plaque"><h1>📮 农场留言板</h1>
    <p class="welcome">看看各家门口最近留下的话。</p>
    <div class="tags"><span class="tag">自己的农场置顶</span><span class="tag">每家最新 10 条</span></div></div>
${board(f, true)}
${others.length ? `<div class="grid c2">${others.map((farm) => board(farm)).join("")}</div>` : `<div class="card"><div class="guestbook-empty muted">还没有其他开放来访的农场</div></div>`}`;
    return page(`${f.name} · 农场留言板`, key, "messages", body, farmNames(f));
}
