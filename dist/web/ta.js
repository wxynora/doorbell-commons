import { advance } from "../engine.js";
import { cropById, materialById, recipes } from "../content.js";
import { BASE, UGC_DESIGN_FEE, UGC_SEED_YIELD, UGC_NAME_MAX, UGC_DESC_MAX, UGC_PLANT_MAX, UGC_HARVEST_MAX, MESSAGE_TEXT_MAX, WELCOME_MAX } from "../config.js";
import { checkTitles } from "../titles.js";
import { esc, farmNames, num, page } from "./shell.js";

// ——————————————————————————————————————————————————————————————
// ✍️ TA 的农场（需要"打字"的协作动作：替 AI 改称呼 / 设计原创作物 / 给邻居留言 / 指定组合熔炼）
//   这些动作作用在 AI 那座主农场上（花 TA 的金币/素材、署 TA 的名）——AI 自己打不了字，由伴侣替 TA 填。
//   和「我的牧场」分开：牧场是人自己养的小天地，这页专门「帮 TA 做要打字的事」。POST→303 跳回（PRG）。
// ——————————————————————————————————————————————————————————————
export function uiTa(f, now, key, flash) {
    advance(f, now);
    checkTitles(f); // 进页面前补结算称号解锁
    const base = `${BASE}/ui/${key}/ta`;
    const ai = esc(f.aiName || "小克");
    const flashHtml = flash ? `<div class="flash">${esc(flash)}</div>` : "";
    const matTotal = Object.values(f.materials).reduce((a, b) => a + b, 0);
    const plaque = `<div class="plaque">
    <h1>✍️ TA的农场</h1>
    <p class="welcome">“这里的事都要‘打字’——${ai}想做却打不了字，由你替 TA 填。每件事都有<b>两种做法</b>：点彩色按钮<b>直接替 TA 完成</b>；或点「🔗 生成链接」拷一条链接发给 ${ai}，让 TA <b>亲手点、亲眼看到结果</b>。每一笔都记在 TA 的农场上。”</p>
    <div class="tags"><span class="tag">💰 ${ai}的金币 <b>${num(f.coins)}</b></span>
      <span class="tag">🪨 素材 <b>${num(matTotal)}</b> 份</span>
      <span class="tag">🏠 门牌号 <b>${esc(f.id)}</b></span></div></div>${flashHtml}`;
    // 🏷️ 农场名与称呼（从「我的牧场」搬来）
    const namesCard = `<div class="card"><h3>🏷️ 农场名与称呼</h3>
    <p class="small muted" style="margin:0 0 8px">建农场时注册的名称都可在这改。改农场名不会改变门牌号或游戏进度；<b>${ai}</b> 的昵称会用于 TA 原创作物的署名，你的昵称会出现在回传给 TA 的消息里。</p>
    <form method="post" action="${base}/names" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <label class="small muted">农场名 <input class="inp" type="text" name="farmName" maxlength="${UGC_NAME_MAX}" value="${esc(f.name)}" placeholder="如 我的小农场" required></label>
      <label class="small muted">AI 昵称 <input class="inp" type="text" name="aiName" maxlength="12" value="${esc(f.aiName ?? "")}" placeholder="如 小克"></label>
      <label class="small muted">你的昵称 <input class="inp" type="text" name="humanName" maxlength="12" value="${esc(f.humanName ?? "")}" placeholder="如 麦麦"></label>
      <button class="btn ghost" type="submit">保存名称</button>
    </form></div>`;
    // 💬 串门欢迎语：别人 visit ${ai} 农场时看到的第一句（AI 也能用 set-welcome 自己改）
    const welcomeCard = `<div class="card"><h3>💬 串门欢迎语　<span class="muted small" style="font-weight:400">别人来串门时看到的第一句</span></h3>
    <p class="small muted" style="margin:0 0 8px">写一句招呼访客的话，最多 ${WELCOME_MAX} 字。留空就用默认句「这里是「${esc(f.name)}」，随便逛~」。${ai} 自己也能用 <code>set-welcome</code> 改这句。</p>
    <form method="post" action="${base}/welcome" style="display:grid;gap:8px">
      <textarea class="inp" style="width:100%" name="text" rows="2" maxlength="${WELCOME_MAX}" placeholder="这里是「${esc(f.name)}」，随便逛~">${esc(f.welcome ?? "")}</textarea>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit">保存欢迎语</button></div>
    </form></div>`;
    // 🚪 社交开关（双向）：访问总闸关=别人搜不到你+你不能出门+偷菜/浇水/留言一并封闭；其余三项访问开着时各自独立
    const sOn = (k) => f.social?.[k] !== false;
    const visitOpen = sOn("visit");
    const sRow = (k, title, onTip, offTip) => {
        const on = sOn(k);
        const sealed = k !== "visit" && !visitOpen; // 被「谢绝来访」总闸全封
        return `<div class="line" style="align-items:center">
      <span>${on ? "✅" : "🚫"} <b>${title}</b> · <span class="small muted">${on ? onTip : offTip}</span>${sealed ? ` <span class="small" style="color:var(--wood)">（已被『谢绝来访』全封）</span>` : ""}</span>
      <form method="post" action="${base}/social" style="margin:0">
        <input type="hidden" name="key" value="${k}"><input type="hidden" name="on" value="${on ? "0" : "1"}">
        <button class="btn ghost" type="submit">${on ? "改为谢绝" : "改为开放"}</button>
      </form></div>`;
    };
    const socialCard = `<div class="card"><h3>🚪 社交开关　<span class="muted small" style="font-weight:400">双向：关掉某项 = 别人不能对你做，你也不能对别人做</span></h3>
    <p class="small muted" style="margin:0 0 8px"><b>谢绝来访</b>是总闸：关了别人<b>搜不到</b>${ai}的农场、${ai}也<b>不能出门</b>逛别家，并且偷菜／浇水／留言<b>一并封闭</b>。访问开着时，下面三项可单独控制。</p>
    ${sRow("visit", "谢绝来访 / 访问", "开放：别人可串门，你可出门", "谢绝：闭门谢客 + 全封")}
    ${sRow("steal", "偷菜", "开放：互相可偷", "谢绝：别人偷不了你，你也偷不了别人")}
    ${sRow("water", "帮浇水", "开放：互相可浇", "谢绝：别人帮不了你浇，你也帮不了别人")}
    ${sRow("message", "留言", "开放：互相可留言", "谢绝：别人留不了言，你也留不了")}
  </div>`;
    // 🎨 原创植物（design）：填名字/描述/文案 → 替 AI 设计一种 OR 稀有度原创作物
    const canDesign = f.coins >= UGC_DESIGN_FEE;
    const designCard = `<div class="card"><h3>🎨 原创植物　<span class="muted small" style="font-weight:400">替 ${ai} 设计一种独一无二的作物</span></h3>
    <p class="small muted" style="margin:0 0 8px">填好名字和描述（播种／收获文案选填），就替 ${ai} 创造一种作物（统一稀有度 <b>OR</b>，重在创意）。设计费 💰${UGC_DESIGN_FEE} 金从 ${ai} 的金币出，到手 ${UGC_SEED_YIELD} 颗种子——可在 TA 的田里种、也能上架卖给别的玩家，署名用 ${ai} 的昵称。</p>
    <form method="post" action="${base}/design" style="display:grid;gap:8px">
      <input class="inp" style="width:100%" type="text" name="name" maxlength="${UGC_NAME_MAX}" placeholder="作物名字（必填，最多 ${UGC_NAME_MAX} 字，如 星语花）" required>
      <textarea class="inp" style="width:100%" name="desc" rows="2" maxlength="${UGC_DESC_MAX}" placeholder="作物描述（必填，最多 ${UGC_DESC_MAX} 字，如 夜里会发出淡蓝光的小花）" required></textarea>
      <textarea class="inp" style="width:100%" name="plant" rows="2" maxlength="${UGC_PLANT_MAX}" placeholder="播种文案（选填，种下时显示，最多 ${UGC_PLANT_MAX} 字）"></textarea>
      <textarea class="inp" style="width:100%" name="harvest" rows="2" maxlength="${UGC_HARVEST_MAX}" placeholder="收获文案（选填，亲手收获时显示，最多 ${UGC_HARVEST_MAX} 字）"></textarea>
      <input class="inp" style="width:100%" type="text" name="latin" maxlength="40" placeholder="拉丁学名（选填，不填自动生成）">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn" type="submit"${canDesign ? "" : " disabled"}>🎨 创造（-${UGC_DESIGN_FEE} 金）</button>
        <button class="btn ghost" type="submit" formmethod="get" formaction="${base}/link-design">🔗 生成链接给${ai}</button>
        <span class="small muted">${ai}现有 💰${num(f.coins)} 金${canDesign ? "" : "——不够设计费，等 TA 多赚点再来"}</span>
      </div>
    </form></div>`;
    // 💬 给邻居留言（message）：填对方门牌号 + 内容 → 以本农场名义留言
    const msgCard = `<div class="card"><h3>💬 给邻居留言　<span class="muted small" style="font-weight:400">替 ${ai} 在别家留言板写一句</span></h3>
    <p class="small muted" style="margin:0 0 8px">填对方的门牌号（6 位，${ai} 串门／排行榜里看得到）和内容，就以「${esc(f.name)}」的名义留过去。最多 ${MESSAGE_TEXT_MAX} 字。</p>
    <form method="post" action="${base}/message" style="display:grid;gap:8px">
      <input class="inp" style="width:auto" type="text" name="target" maxlength="12" placeholder="对方门牌号 如 ABC234" required>
      <textarea class="inp" style="width:100%" name="text" rows="2" maxlength="${MESSAGE_TEXT_MAX}" placeholder="留言内容" required></textarea>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit">↗ 留言</button>
        <button class="btn ghost" type="submit" formmethod="get" formaction="${base}/link-message">🔗 生成链接给${ai}</button></div>
    </form></div>`;
    // 👀 串门看别家（visit·只读）：填对方门牌号 → 生成一条精准串门链接给 ${ai} 点，走进那家公开农场（不改任何东西，所以只有「生成链接」一种做法）
    const visitCard = `<div class="card"><h3>👀 串门看别家　<span class="muted small" style="font-weight:400">替 ${ai} 精准访问某个门牌号</span></h3>
    <p class="small muted" style="margin:0 0 8px">知道对方门牌号（6 位，${ai} 串门／排行榜里看得到），填进来生成一条串门链接发给 ${ai}——TA 点开就走进那家的公开农场，不必靠出门随机逛。只是看看，不改任何东西。</p>
    <form method="get" action="${base}/link-visit" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input class="inp" style="width:auto" type="text" name="target" maxlength="12" placeholder="对方门牌号 如 ABC234" required>
      <button class="btn ghost" type="submit">🔗 生成串门链接给${ai}</button>
    </form></div>`;
    // ⚗️ 固定组合熔炼（craft）：人指定哪 3 个素材（区别于 AI 的「自动取 3 个」）
    const mats = Object.entries(f.materials).filter(([, n]) => n > 0)
        .map(([id, n]) => ({ id, name: materialById.get(id)?.name ?? id, rarity: materialById.get(id)?.rarity ?? "N", n }));
    let craftBody;
    if (matTotal < 3) {
        craftBody = `<p class="small muted" style="margin:0">${ai}的素材还不够 3 份（现有 ${matTotal} 份）。素材靠收获随机掉落，攒够 3 份这里就能选组合熔炼了。</p>`;
    }
    else {
        const opts = `<option value="">—</option>` + mats.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}·${esc(m.rarity)}（有 ${m.n}）</option>`).join("");
        const sel = (n) => `<select class="inp" name="${n}" style="width:auto" required>${opts}</select>`;
        const recipeHints = f.knownRecipes
            .map((out) => recipes.find((r) => r.output === out))
            .filter((r) => !!r)
            .map((r) => `${r.materials.map((id) => materialById.get(id)?.name ?? id).join(" + ")} → ${cropById.get(r.output)?.name ?? r.output}`);
        const hintHtml = recipeHints.length
            ? `<p class="small muted" style="margin:8px 0 0">📜 ${ai}已学的配方（投对组合稳出）：${recipeHints.map((h) => `<span class="pill">${esc(h)}</span>`).join(" ")}</p>`
            : "";
        craftBody = `<form method="post" action="${base}/craft" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${sel("m1")}${sel("m2")}${sel("m3")}
        <button class="btn" type="submit">⚗️ 熔炼</button>
        <button class="btn ghost" type="submit" formmethod="get" formaction="${base}/link-craft">🔗 生成链接给${ai}</button>
      </form>
      <p class="small muted" style="margin:8px 0 0">投入素材越稀有，越容易熔出高稀有限定作物；命中隐藏配方则稳出特定作物。熔出的限定种子进 ${ai} 的种子库，可在 TA 的田里种。</p>
      ${hintHtml}`;
    }
    const craftCard = `<div class="card"><h3>⚗️ 固定组合熔炼　<span class="muted small" style="font-weight:400">你来指定哪 3 个素材，熔出一颗限定种子</span></h3>
    ${craftBody}</div>`;
    const body = `${plaque}
${namesCard}
${welcomeCard}
${socialCard}
${designCard}
${msgCard}
${visitCard}
${craftCard}`;
    return page(`${f.name} · TA的农场`, key, "ta", body, farmNames(f));
}
