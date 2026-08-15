import { BASE } from "../config.js";
import { publicExpeditionHumanData, publicExpeditionRewardText } from "../public-expedition.js";
import { esc, farmNames, page } from "./shell.js";

function togetherHistoryHtml(history) {
    return history.map((entry) => {
        if (entry.kind === "choice") {
            const names = entry.voters?.length ? entry.voters.map((item) => item.farmName).join("、") : entry.farmName;
            return `<div style="padding:8px 0;border-top:1px dashed var(--line)"><b>共同选择 ${entry.step} · ${esc(entry.option)}</b><br><span class="small muted">${esc(entry.label)}${names ? `<br>由 ${esc(names)} 共同决定` : ""}</span></div>`;
        }
        if (entry.kind === "task")
            return `<div style="padding:10px 0;border-top:1px dashed var(--line)"><b>公共任务【${esc(entry.title)}】${entry.contributions?.length ?? 0}/3</b><div class="small" style="white-space:pre-wrap;margin-top:4px;line-height:1.75">${esc(entry.text)}</div>${entry.contributions?.length ? `<div class="small muted" style="margin-top:8px">${entry.contributions.map((item) => `· ${esc(item.farmName)}：${esc(item.fact)}`).join("<br>")}</div>` : ""}</div>`;
        if (entry.kind === "clue")
            return `<div style="padding:10px 0;border-top:1px dashed var(--line)"><b>🔎 公共线索【${esc(entry.title)}】</b><div class="small" style="white-space:pre-wrap;margin-top:4px">${esc(entry.text)}</div></div>`;
        return `<div style="padding:10px 0;border-top:1px dashed var(--line)"><b>${esc(entry.title)}</b><div class="small" style="white-space:pre-wrap;margin-top:4px;line-height:1.75">${esc(entry.text)}</div></div>`;
    }).join("");
}
export function uiTogether(f, publicWorld, now, key) {
    const shared = publicExpeditionHumanData(publicWorld, f, now);
    const ownReward = shared.rewards.find((reward) => reward.farmId === f.id);
    const progressArt = shared.artFile ? `<figure style="margin:12px 0 14px;border-radius:16px;overflow:hidden;border:1px solid #d5dfc3;background:#e8eee0;box-shadow:0 8px 20px rgba(63,83,45,.10)"><img src="${BASE}/assets/lingye-together/${esc(shared.artFile)}?v=20260810a" alt="" aria-hidden="true" width="1448" height="1086" decoding="async" fetchpriority="high" style="display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover"></figure>` : "";
    let currentStoryIndex = shared.history.length - 1;
    while (currentStoryIndex > 0 && shared.history[currentStoryIndex]?.kind === "choice")
        currentStoryIndex--;
    const currentStoryHistory = togetherHistoryHtml(shared.history.slice(Math.max(0, currentStoryIndex)));
    const currentStory = shared.currentTask ? `<div style="margin-top:12px;padding:12px;border-radius:14px;background:#f4f7ea;border:1px solid #d9e3c6">
      <div class="small muted" style="margin-bottom:5px">当前剧情</div>
      <b>公共任务【${esc(shared.currentTask.name)}】${shared.currentTask.progress}/3</b>
      <div class="small" style="white-space:pre-wrap;margin-top:6px;line-height:1.7">${esc(shared.currentTask.opening)}</div>
      ${shared.currentTask.contributors.length ? `<div class="small muted" style="margin-top:8px">${shared.currentTask.contributors.map((item) => `· ${esc(item.farmName)}：${esc(item.fact)}`).join("<br>")}</div>` : ""}
    </div>` : `<div style="margin-top:12px;padding:12px;border-radius:14px;background:#f4f7ea;border:1px solid #d9e3c6"><div class="small muted" style="margin-bottom:5px">当前剧情</div>${currentStoryHistory}</div>`;
    const cooldown = shared.cooldown ? `<div style="margin-top:12px;padding:12px;border-radius:14px;background:#eef5f7;border:1px solid #c8dde2">
      <div class="small muted" style="margin-bottom:5px">阶段等待中</div>
      <div class="small" style="white-space:pre-wrap;line-height:1.75">${esc(shared.cooldown.text)}</div>
      <div class="small muted" style="margin-top:7px">下一段剧情将在北京时间 ${esc(shared.cooldown.readyText)} 开放。</div>
    </div>` : "";
    const choice = shared.currentChoice ? `<div style="margin-top:12px;padding:12px;border-radius:14px;background:#fff9e9;border:1px solid #ead9ad">
      <b>${shared.currentChoice.index ? `${shared.currentChoice.index}/6 · ` : ""}${esc(shared.currentChoice.title)}</b>
      <div class="small" style="margin-top:7px;line-height:1.75">${Object.entries(shared.currentChoice.options ?? {}).map(([option, label]) => `${esc(option)}．${esc(label)}${shared.currentChoice.counts ? `（${shared.currentChoice.counts[option] ?? 0}/3）` : ""}`).join("<br>")}</div>
    </div>` : "";
    const clueBook = shared.clues.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">🔎 铃野共行·线索册 ${shared.clues.length}/3</summary>
      <div style="margin-top:6px">${shared.clues.map((clue) => `<p class="small" style="white-space:pre-wrap"><b>【${esc(clue.title)}】</b><br>${esc(clue.text)}</p>`).join("")}</div></details>` : "";
    const archives = shared.archives.length ? `<section class="card"><h2 style="margin-top:0;color:var(--leaf-deep)">📚 往期故事</h2>${shared.archives.slice().reverse().map((round) => {
        const ending = [...(round.history ?? [])].reverse().find((entry) => entry.kind === "ending")?.title ?? "未完结";
        return `<details style="padding:9px 0;border-top:1px dashed var(--line)"><summary style="cursor:pointer;font-weight:700">《${esc(round.storyTitle ?? "往期故事")}》 · 第 ${round.round} 轮 · ${esc(ending)}</summary><div style="margin-top:8px">${togetherHistoryHtml(round.history ?? [])}</div></details>`;
    }).join("")}</section>` : "";
    const body = `<div class="plaque"><h1>🧭 铃野共行</h1><p class="welcome">全服共同推进的公共故事；这里不会混入个人探险进度。</p>
      <div class="tags"><span class="tag">本期《${esc(shared.title)}》</span><span class="tag">${esc(shared.status)}</span></div></div>
      <section class="card" style="border:2px solid #a9bd83;background:linear-gradient(180deg,#fbfff5,#f7f3e7)">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><h2 style="margin:0;color:var(--leaf-deep)">《${esc(shared.title)}》</h2><p class="small muted" style="margin:4px 0 0">第 ${shared.round} 期${shared.routeName ? ` · ${esc(shared.routeName)}` : ""}</p></div><span class="tag">${esc(shared.status)}</span></div>
        ${progressArt}${currentStory}${cooldown}${choice}${ownReward ? `<div class="flash" style="white-space:pre-wrap;margin-top:12px">${esc(publicExpeditionRewardText(ownReward))}</div>` : ""}
        <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">📖 前情提要</summary><div style="margin-top:6px">${togetherHistoryHtml(shared.history)}</div></details>
        ${clueBook}
      </section>${archives}`;
    return page(`${f.name} · 铃野共行`, key, "together", body, farmNames(f));
}
