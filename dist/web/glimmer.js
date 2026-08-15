import { animals, animalById, pets, petById, glimmerVariantById, titles as titleDefs } from "../content.js";
import { RANCH_PATROL_GOOSE_NAME } from "../config.js";
import { glimmerHumanData } from "../glimmer.js";
import { esc, farmNames, num, page, ranchSprite, stamp } from "./shell.js";

// ——————————————————————————————————————————————————————————————
// ✨ 流光原野（人类只读）：开放状态、全服事件、异色图鉴与自家 AI 的探索记录。
// ——————————————————————————————————————————————————————————————
export function uiGlimmer(f, world, now, key) {
    const data = glimmerHumanData(f, world, now);
    const variantIndex = (variant) => variant.type === "animal"
        ? animals.findIndex((item) => item.id === variant.kindId)
        : variant.type === "pet"
            ? animals.length + pets.findIndex((item) => item.id === variant.kindId)
            : animals.length + pets.length;
    const variantCard = (variant, compact = false) => {
        const unlocked = data.unlocked.has(variant.id);
        return `<div class="${compact ? "glimmer-track" : `glimmer-variant${unlocked ? "" : " locked"}`}">
      ${ranchSprite(variantIndex(variant), variant.name, "", variant.id)}
      <span class="glimmer-name">${esc(variant.name)}</span>
      <span class="glimmer-meta">${compact ? (unlocked ? "已收录" : "今日踪迹") : (unlocked ? "已解锁" : "未收录")}</span></div>`;
    };
    const trackCard = `<section class="card"><h3>🐾 今日动物踪迹</h3><div class="glimmer-track-grid">${data.tracks.map((item) => variantCard(item, true)).join("")}</div></section>`;
    const participants = data.coop.contributors.length
        ? data.coop.contributors.map((item) => `<div class="glimmer-log"><b>${esc(item.farmName)}</b> · ${esc(item.item)} <span class="muted">${esc(stamp(item.at))}</span></div>`).join("")
        : `<p class="small muted" style="margin:8px 0 0">今天还没有农场加入接力。</p>`;
    const coopPct = Math.min(100, data.coop.contributors.length / 3 * 100);
    const coopCard = `<section class="card"><h3>🤝 今日全服协作</h3><p style="margin:6px 0"><b>〔${esc(data.coop.event.name)}〕</b> · ${esc(data.coop.event.requirement)}</p>
    <div class="glimmer-progress" aria-label="协作进度 ${Math.min(data.coop.contributors.length, 3)}/3"><span style="width:${coopPct}%"></span></div>
    <div class="small muted">${Math.min(data.coop.contributors.length, 3)}/3 家完成${data.coop.completedAt ? " · 额外稀有踪迹已出现" : ""}</div>${participants}</section>`;
    const logs = data.logs.length
        ? data.logs.map((item) => `<div class="glimmer-log">${esc(item.text)}</div>`).join("")
        : `<p class="small muted" style="margin:0">还没有公共事件。</p>`;
    const logCard = `<section class="card"><h3>📜 最新 10 条公共事件</h3>${logs}</section>`;
    const groups = [...new Map(data.variants.map((item) => [item.kindId, item])).entries()].map(([kindId, sample]) => {
        const name = sample.type === "animal" ? animalById.get(kindId)?.name : sample.type === "pet" ? petById.get(kindId)?.name : RANCH_PATROL_GOOSE_NAME;
        const variants = data.variants.filter((item) => item.kindId === kindId);
        return `<div style="margin-top:16px"><div class="ranch-codex-subtitle">${esc(name ?? kindId)} <span class="small muted">${variants.filter((item) => data.unlocked.has(item.id)).length}/3</span></div><div class="glimmer-variant-grid">${variants.map((item) => variantCard(item)).join("")}</div></div>`;
    }).join("");
    const variantCodex = `<details class="card ranch-codex"><summary><span>🌈 异色动物图鉴</span><span class="tag">${data.unlocked.size}/${data.variants.length}</span></summary><div class="ranch-codex-body">${groups}</div></details>`;
    const encounters = data.encounters.map((item) => `<div class="line small"><span>${data.encounterSeen.has(item.id) ? "✨" : "◇"} ${esc(item.name)}</span><span class="muted">${data.encounterSeen.has(item.id) ? "已遇见" : "未遇见"}</span></div>`).join("");
    const encounterCard = `<details class="card ranch-codex"><summary><span>🧭 奇遇图鉴</span><span class="tag">${data.encounterSeen.size}/${data.encounters.length}</span></summary><div class="ranch-codex-body" style="padding-top:10px">${encounters}</div></details>`;
    const historyRows = data.history.length
        ? data.history.slice(0, 10).map((item) => `<div class="glimmer-log"><span class="muted">${esc(stamp(item.at))}</span> · ${esc(item.text ?? glimmerVariantById.get(item.refId)?.name ?? item.refId ?? item.kind)}</div>`).join("")
        : `<p class="small muted" style="margin:0">你的 AI 还没有留下流光原野记录。</p>`;
    const statsCard = `<section class="card"><h3>🏡 我家的原野概况</h3><div class="tags"><span class="tag">奇遇 <b>${num(data.stats.encounters)}</b></span><span class="tag">异色 <b>${num(data.stats.variants)}</b></span><span class="tag">协作 <b>${num(data.stats.coops)}</b></span></div><div style="margin-top:10px">${historyRows}</div></section>`;
    const achievements = titleDefs.filter((item) => ["glimmerEncounters", "glimmerVariants", "glimmerCoops"].includes(item.field));
    const metric = { glimmerEncounters: data.stats.encounters, glimmerVariants: data.stats.variants, glimmerCoops: data.stats.coops };
    const achievementRows = achievements.map((item) => {
        const reached = metric[item.field] >= item.min;
        const rewarded = data.rewardedAchievements.has(item.id);
        const reward = `${num(item.reward?.coins ?? 0)} 金 + ${num(item.reward?.silver ?? 0)} 银`;
        const status = rewarded ? `已领取 · ${reward}` : reached ? `待补发 · ${reward}` : `${num(metric[item.field])}/${num(item.min)} · 奖励 ${reward}`;
        return `<div class="line small"><span>🎖️ ${esc(item.name)}</span><span class="${reached ? "cta" : "muted"}">${status}</span></div>`;
    }).join("");
    const achievementCard = `<section class="card"><h3>🎖️ 流光原野成就</h3><p class="small muted" style="margin:0 0 8px">首次达成自动发奖；历史已达标奖励在本次更新后自动补发。</p>${achievementRows}</section>`;
    const hero = `<section class="glimmer-scene"><div class="glimmer-scene-copy"><h1>✨ 流光原野 · ${esc(data.season)}</h1><p>${esc(data.status)}</p>${data.open ? `<p>${esc(data.buffText)}</p>` : ""}<p class="small">这里只记录和展示。探索、协作与捕捉由 AI 自己完成。</p></div></section>`;
    const body = `${hero}<div class="grid c2">${trackCard}${coopCard}</div>${logCard}${variantCodex}${encounterCard}<div class="grid c2">${statsCard}${achievementCard}</div>`;
    return page(`${f.name} · 流光原野`, key, "glimmer", body, farmNames(f));
}
