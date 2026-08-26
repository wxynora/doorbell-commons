import { advance, refreshRanchShop, animalUpgradeCost, ranchRaidCoins, ranchRaidForAnimal, ranchRaidDebtTotal, RANCH_RAID_DAILY_CAP, ranchAnimalCurrentProduceValue } from "../engine.js";
import { animals, animalById, pets, petById, accessoryById, decorationById, materialById, recipes, expMapById, expDecorById, cooking } from "../content.js";
import { BASE, TICK_MS, RANCH_ANIMAL_MAX_LEVEL, RANCH_LEVEL_INCOME_STEP, RANCH_RAID_COINS_PER_HOUR, RANCH_PATROL_GOOSE_ID, RANCH_PATROL_GOOSE_NAME, RANCH_PATROL_GOOSE_DAILY_CAP, RANCH_FEED_DAILY_CAP, RANCH_FEED_COST_RATE } from "../config.js";
import { currentDayIndex } from "../time.js";
import { playerFarms } from "../store.js";
import { glimmerVariantsFor } from "../glimmer.js";
import { esc, farmLabel, farmNames, fmtDur, num, page, ranchSprite } from "./shell.js";
import { codexGot } from "./stats.js";
// ——————————————————————————————————————————————————————————————
// 小工具
// ——————————————————————————————————————————————————————————————
const RANCH_ASYNC_SCRIPT = `<script>(()=>{
  if(window.__farmRanchAsync)return;window.__farmRanchAsync=true;
  const root=document.getElementById("ranchPage");if(!root)return;
  const showNotice=next=>{const source=next.getElementById("human-notice");if(!source)return;document.getElementById("human-notice")?.remove();const box=document.importNode(source,true);document.body.appendChild(box);const close=()=>box.classList.remove("show");box.addEventListener("click",e=>{if(e.target===box||e.target.closest("[data-close]"))close();});const key=e=>{if(e.key==="Escape"){close();document.removeEventListener("keydown",key);}};document.addEventListener("keydown",key);};
  document.addEventListener("submit",async event=>{
    const form=event.target.closest?.('form[method="post"]');
    if(!form||event.defaultPrevented||(!form.closest("#ranchPage")&&!form.closest("#ranchAnimalModal")))return;
    event.preventDefault();
    if(event.submitter)event.submitter.disabled=true;
    const body=new URLSearchParams();
    for(const [name,value] of new FormData(form))if(typeof value==="string")body.append(name,value);
    if(event.submitter?.name&&!body.has(event.submitter.name))body.append(event.submitter.name,event.submitter.value);
    try{
      const response=await fetch(form.action,{method:"POST",body,credentials:"same-origin"});
      if(!response.ok)throw new Error("request failed");
      const next=new DOMParser().parseFromString(await response.text(),"text/html");
      const source=next.getElementById("ranchPage");if(!source)throw new Error("invalid page");
      const clean=source.cloneNode(true),incomingModal=clean.querySelector("#ranchAnimalModal");
      if(incomingModal)incomingModal.remove();clean.querySelectorAll("script").forEach(script=>script.remove());
      const opened=[...root.querySelectorAll("details")].map(details=>details.open),x=scrollX,y=scrollY;
      root.innerHTML=clean.innerHTML;
      [...root.querySelectorAll("details")].forEach((details,index)=>details.open=opened[index]??details.open);
      window.__farmInitRanchScenes?.(root);window.__farmRanchModal?.refresh();showNotice(next);
      requestAnimationFrame(()=>scrollTo(x,y));
    }catch{location.reload();}
  });
})();</script>`;
// ——————————————————————————————————————————————————————————————
// 🐮 我的牧场（人机互动 2.0：人在这里养 AI 买给自己的动物、收产品换钱、决定回传多少）
//   这是 /ui 里唯一「能写」的页：收获 / 回传走 POST，做完 303 跳回本页（PRG）。
//   AI 那边看不到这页内容，只在文字接口的 ledger 看到金币往来 + 药水入库。
// ——————————————————————————————————————————————————————————————
export function uiRanch(f, now, key, flash) {
    advance(f, now);
    refreshRanchShop(f, now); // 让今日的牧场商店（随机刷新的配饰/装饰）保持最新
    const ranch = f.ranch;
    const list = ranch?.animals ?? [];
    const petList = ranch?.pets ?? [];
    const patrolGoose = ranch?.patrolGoose;
    const residentCount = list.length + petList.length + (patrolGoose ? 1 : 0);
    const base = `${BASE}/ui/${key}/ranch`;
    const flashHtml = flash ? `<div class="flash">${esc(flash)}</div>` : "";
    const pinnedSet = new Set(f.ranch?.pinned ?? []);
    // 📌 pin 开关：被 pin 的动物/宠物才会随机出现在小克农场的氛围句里（都没 pin=全部随机）
    const pinBtn = (kindId) => {
        const on = pinnedSet.has(kindId);
        return `<form method="post" action="${base}/pin" style="margin:0"><input type="hidden" name="kind" value="${esc(kindId)}">
      <button class="btn ghost" type="submit" title="${on ? "取消 pin" : "pin 到农场"}">${on ? "📌 已选" : "📍 pin"}</button></form>`;
    };
    const variantForm = (type, kindId, entity, baseName) => {
        const choices = glimmerVariantsFor(f, kindId, type);
        if (!choices.length)
            return "";
        const options = [`<option value="base"${entity?.variantId ? "" : " selected"}>原始外观</option>`, ...choices.map((item) => `<option value="${item.id}"${entity?.variantId === item.id ? " selected" : ""}>${esc(item.name)}</option>`)].join("");
        return `<form method="post" action="${base}/variant" style="display:flex;gap:6px;margin:0"><input type="hidden" name="type" value="${type}"><input type="hidden" name="kind" value="${kindId}"><select class="inp" name="variant" aria-label="${esc(baseName)}外观" style="width:auto">${options}</select><button class="btn ghost" type="submit">换外观</button></form>`;
    };
    let pendingGross = 0; // 与 engine.ranchCollect 的毛收入口径一致：逐只按等级系数算、逐只取整
    for (const a of list) {
        const k = animalById.get(a.kindId);
        if (k) {
            const value = ranchAnimalCurrentProduceValue(a, now);
            const pending = Math.max(0, Math.floor(Number(a.pending) || 0));
            pendingGross += pending * value + (pending > 0 && a.pendingBoost ? Math.round(value * 1.1) - value : 0);
            pendingGross += (a.pendingMeat ?? 0) * Math.round(value * cooking.meatValueMultiplier);
        }
    }
    const pendingValue = pendingGross;
    const coins = ranch?.coins ?? 0;
    const ai = esc(f.aiName || "小克"); // AI 昵称（注册时定，回落"小克"）
    const human = esc(f.humanName || "你"); // 人类昵称（注册时定，回落"你"）
    const fmtTime = (ms) => new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const numbered = playerFarms().map((farm, index) => ({ farm, number: index + 1 }));
    const numberById = new Map(numbered.map((entry) => [entry.farm.id, entry.number]));
    const labelById = new Map(numbered.map((entry) => [entry.farm.id, farmLabel(entry.farm)]));
    const today = currentDayIndex(now);
    const feedUsed = ranch?.feedDaily?.day === today ? ranch.feedDaily.n ?? 0 : 0;
    const todayRaidIncome = ranch?.raidIncome?.day === today ? ranch.raidIncome.n : 0;
    const raidCapReached = todayRaidIncome >= RANCH_RAID_DAILY_CAP;
    const targets = numbered.filter((entry) => entry.farm.id !== f.id);
    const targetOptions = targets.map((entry) => `<option value="${entry.number}">${entry.number}. ${esc(farmLabel(entry.farm))}</option>`).join("");
    const incoming = numbered.flatMap(({ farm: owner }) => (owner.ranch?.raids ?? [])
        .filter((raid) => raid.targetFarmId === f.id && raid.endsAt > now)
        .map((raid) => ({ owner, raid })));
    const dispatchedAnimalKinds = new Set((ranch?.raids ?? [])
        .filter((raid) => raid.endsAt > now)
        .map((raid) => raid.animalKindId));
    const sceneAnimals = list.filter((entry) => !dispatchedAnimalKinds.has(entry.kindId));
    const sceneResidentCount = sceneAnimals.length + petList.length + (patrolGoose ? 1 : 0);
    const plaque = `<div class="plaque">
    <h1>🐮 我的牧场</h1>
    <p class="welcome">“${ai}送来的动物，归你养。攒下的产出换成金币，要不要分 TA 一点，你说了算～”</p>
    <div class="tags"><span class="tag">💰 牧场金币 <b>${num(coins)}</b></span>
      <span class="tag">🐾 牧场居民 <b>${residentCount}</b> 位</span>
      <span class="tag">📦 可收产出值 <b>${num(pendingValue)}</b> 金</span>${ranchRaidDebtTotal(f) ? `<span class="tag">⚠️ 待还欠款 <b>${num(ranchRaidDebtTotal(f))}</b> 金</span>` : ""}</div></div>${flashHtml}`;
    const officialGot = codexGot(f);
    const ownedAnimalIds = new Set(list.map((entry) => entry.kindId));
    const ownedPetIds = new Set(petList.map((entry) => entry.kindId));
    const sprite = ranchSprite;
    const animalSpriteIndex = new Map(animals.map((kind, index) => [kind.id, index]));
    const petSpriteIndex = new Map(pets.map((kind, index) => [kind.id, animals.length + index]));
    const sceneScale = {
        chicken: .66, duck: .7, quail: .46, rabbit: .6, goose: .88,
        sheep: .94, goat: .86, cow: 1.16, bee: .48, turkey: .88, pig: .9, alpaca: .98,
        silk_moth: .52, ember_hen: .7, cloud_sheep: .96, dream_cat: .76,
        cat: .64, dog: .74,
    };
    const sceneResidents = [
        ...sceneAnimals.map((entry) => ({
            spriteIndex: animalSpriteIndex.get(entry.kindId),
            name: entry.name || animalById.get(entry.kindId)?.name || entry.kindId,
            scale: sceneScale[entry.kindId] ?? 1,
            variantId: entry.variantId,
        })),
        ...petList.map((entry) => ({
            spriteIndex: petSpriteIndex.get(entry.kindId),
            name: entry.name || petById.get(entry.kindId)?.name || entry.kindId,
            scale: sceneScale[entry.kindId] ?? 1,
            variantId: entry.variantId,
        })),
        ...(patrolGoose ? [{ spriteIndex: animals.length + pets.length, name: patrolGoose.name || RANCH_PATROL_GOOSE_NAME, scale: .88, variantId: patrolGoose.variantId }] : []),
        ...incoming.map(({ owner, raid }, incomingIndex) => {
            const animal = owner.ranch?.animals.find((entry) => entry.kindId === raid.animalKindId);
            const kind = animalById.get(raid.animalKindId);
            return {
                spriteIndex: animalSpriteIndex.get(raid.animalKindId),
                name: animal?.name || kind?.name || raid.animalKindId,
                scale: sceneScale[raid.animalKindId] ?? 1,
                visitor: true,
                panelId: `visitor-${incomingIndex}`,
                variantId: animal?.variantId,
            };
        }),
    ].filter((entry) => Number.isInteger(entry.spriteIndex));
    const sceneVisitorCount = sceneResidents.filter((entry) => entry.visitor).length;
    const sceneSpots = [];
    for (let index = 0; index < sceneResidents.length; index++) {
        let spot;
        for (let attempt = 0; attempt < 120; attempt++) {
            const candidate = [10 + Math.random() * 72, 42 + Math.random() * 42];
            const clear = sceneSpots.every(([x, y]) => Math.hypot((candidate[0] - x) * .8, (candidate[1] - y) * 1.25) >= 11);
            if (clear) {
                spot = candidate;
                break;
            }
        }
        sceneSpots.push(spot ?? [10 + (index * 23) % 68, 42 + (index * 17) % 40]);
    }
    const sceneResidentHtml = sceneResidents.map((entry, index) => {
        const [x, y] = sceneSpots[index % sceneSpots.length];
        const delay = -(index * .17);
        const tag = entry.visitor ? "button" : "span";
        const visitorAttrs = entry.visitor
            ? ` type="button" class="ranch-anchor ranch-visitor" data-visitor="true" data-ranch-animal="${entry.panelId}" aria-haspopup="dialog" aria-controls="ranchAnimalModal" aria-label="查看移动中的${esc(entry.name)}"`
            : ` class="ranch-anchor" title="${esc(entry.name)}"`;
        return `<${tag}${visitorAttrs} data-roamer data-x="${x.toFixed(2)}" data-y="${y.toFixed(2)}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;z-index:${Math.round(y)};--delay:${delay}s;--scale:${entry.scale}">
        <span class="ranch-resident"><span class="ranch-scale"><span class="ranch-face">${sprite(entry.spriteIndex, entry.name, "ranch-scene-sprite", entry.variantId)}</span></span></span>
      </${tag}>`;
    }).join("");
    const ranchSceneCard = `<section class="card ranch-scene-card" aria-label="牧场动态场景"><div class="ranch-scene">
      <div class="ranch-scene-title">🌿 牧场里 · ${sceneResidentCount} 位居民${sceneVisitorCount ? ` · ${sceneVisitorCount} 位来客` : ""}</div>
      ${sceneResidentHtml || (!residentCount ? `<div class="ranch-scene-empty">等 ${ai} 送来动物，这片草地就会热闹起来。</div>` : "")}
    </div></section><script>(()=>{
      if(!window.__farmInitRanchScenes)window.__farmInitRanchScenes=(root=document)=>{
        if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
        const random=(min,max)=>min+Math.random()*(max-min);
        for(const scene of root.querySelectorAll(".ranch-scene")){
          if(scene.dataset.roamReady)return;scene.dataset.roamReady="true";
          for(const anchor of scene.querySelectorAll("[data-roamer]")){
            let x=Number(anchor.dataset.x),y=Number(anchor.dataset.y);const homeX=x,homeY=y,face=anchor.querySelector(".ranch-face");
            const move=()=>{let nx,ny;do{nx=Math.max(10,Math.min(82,random(homeX-9,homeX+9)));ny=Math.max(42,Math.min(84,random(homeY-7,homeY+7)));}while(Math.hypot(nx-x,ny-y)<4);
              if(face)face.style.transform=nx>=x?"scaleX(-1)":"scaleX(1)";const px=Math.hypot((nx-x)*scene.clientWidth/100,(ny-y)*scene.clientHeight/100);
              const motion=anchor.animate([{left:String(x)+"%",top:String(y)+"%"},{left:String(nx)+"%",top:String(ny)+"%"}],{duration:Math.max(2800,px*random(48,70)),easing:"ease-in-out",fill:"forwards"});
              motion.onfinish=()=>{x=nx;y=ny;anchor.style.left=String(x)+"%";anchor.style.top=String(y)+"%";anchor.style.zIndex=String(Math.round(y));motion.cancel();window.setTimeout(move,random(350,1600));};};
            window.setTimeout(move,random(120,1300));
          }
        }
      };window.__farmInitRanchScenes(document);
    })();</script>`;
    const animalCodexRows = animals.map((kind, index) => {
        const owned = list.find((entry) => entry.kindId === kind.id);
        const unlocked = officialGot >= kind.unlockCodex;
        const level = owned?.level ?? 1;
        const currentPrice = owned ? ranchAnimalCurrentProduceValue(owned, now) : kind.producePrice;
        const state = owned
            ? `<span class="ranch-codex-state owned">已入住 · Lv.${level}</span>`
            : unlocked
                ? `<span class="ranch-codex-state open">已解锁</span>`
                : `<span class="ranch-codex-state">未解锁</span>`;
        return `<article class="ranch-codex-item${unlocked ? "" : " locked"}">
        ${sprite(index, kind.name, "", owned?.variantId)}
        <div class="ranch-codex-name"><span>${esc(kind.name)}</span>${state}</div>
        <div class="ranch-codex-meta"><b>${esc(kind.produce)}</b> · ${num(currentPrice)} 金/份<br>${fmtDur(kind.produceEveryTicks * TICK_MS)}一份 · 入手 ${num(kind.buyCost)} 金<br>${unlocked ? esc(kind.category) : `🔒 ${esc(kind.unlockCond)}`}</div>
      </article>`;
    }).join("");
    const petCodexRows = pets.map((kind, index) => {
        const owned = ownedPetIds.has(kind.id);
        const unlocked = officialGot >= kind.unlockCodex;
        const state = owned
            ? `<span class="ranch-codex-state owned">已入住</span>`
            : unlocked
                ? `<span class="ranch-codex-state open">已解锁</span>`
                : `<span class="ranch-codex-state">未解锁</span>`;
        return `<article class="ranch-codex-item${unlocked ? "" : " locked"}">
        ${sprite(animals.length + index, kind.name, "", petList.find((entry) => entry.kindId === kind.id)?.variantId)}
        <div class="ranch-codex-name"><span>${esc(kind.name)}</span>${state}</div>
        <div class="ranch-codex-meta"><b>${esc(kind.tag)}</b><br>入手 ${num(kind.buyCost)} 金 · ${unlocked ? "普通宠物" : `🔒 ${esc(kind.unlockCond)}`}</div>
        <div class="ranch-codex-effect">${esc(kind.buffText)}</div>
      </article>`;
    }).join("");
    const codexCard = `<details class="card ranch-codex"><summary><span>🐾 牧场动物图鉴</span>
      <span class="tag">已入住 <b>${ownedAnimalIds.size + ownedPetIds.size}/${animals.length + pets.length}</b></span></summary>
      <div class="ranch-codex-body"><p class="small muted" style="margin:8px 0 0">生产动物和普通宠物会随 ${ai} 的作物图鉴进度解锁；巡逻鹅是独立常驻守卫，不计入这里。</p>
      <div class="ranch-codex-section"><div class="ranch-codex-subtitle">🥚 生产动物 <span class="small muted">${ownedAnimalIds.size}/${animals.length}</span></div><div class="ranch-codex-grid">${animalCodexRows}</div></div>
      <div class="ranch-codex-section"><div class="ranch-codex-subtitle">🐾 普通宠物 <span class="small muted">${ownedPetIds.size}/${pets.length}</span></div><div class="ranch-codex-grid">${petCodexRows}</div></div></div>
    </details>`;
    // 动物清单（逐只列，显示穿戴与产出）+ 一键收获
    let animalsCard;
    if (!residentCount && !incoming.length) {
        animalsCard = `<div class="card"><h3>🐾 牧场空荡荡</h3>
      <p class="small muted" style="margin:0 0 6px">还没有动物——让 <b>${ai}</b>（AI）在它的商店里 <code>buy-animal</code> 买一只送进来，你就能开始养了。</p>
      <p class="small muted" style="margin:0">${ai}的图鉴集得越多，能解锁、能买给你的动物越多。</p></div>`;
    }
    else {
        const animalPanels = list.map((a, i) => {
            const k = animalById.get(a.kindId);
            const nm = a.name || k?.name || a.kindId;
            const lvl = a.level ?? 1;
            const effPrice = k ? ranchAnimalCurrentProduceValue(a, now) : 0;
            const wearing = (a.acc ?? []).map((id) => accessoryById.get(id)?.name).filter(Boolean);
            const worn = wearing.length
                ? `<div class="small" style="color:var(--leaf-deep);margin-top:2px">👒 穿戴：${wearing.map(esc).join("、")}</div>`
                : `<div class="small muted" style="margin-top:2px">还没打扮</div>`;
            const raid = ranchRaidForAnimal(f, a.kindId);
            const raidLine = raid
                ? `<div class="small" style="color:var(--gold);margin-top:4px">🥷 正在 ${numberById.get(raid.targetFarmId) ?? "?"} 号「${esc(labelById.get(raid.targetFarmId) ?? "未知农场")}」潜伏 · ${fmtDur(Math.max(0, raid.endsAt - now))}后回来 · 已冻结 ${raid.reservedCoins} 金</div>`
                : "";
            // 升级按钮：每级提高每份收入（不增份数），封顶后显示满级
            const upBtn = !k ? "" : (lvl >= RANCH_ANIMAL_MAX_LEVEL)
                ? `<span class="small muted">已满级 Lv.${lvl}</span>`
                : (() => {
                    const cost = animalUpgradeCost(k, lvl);
                    const can = coins >= cost;
                    return `<form method="post" action="${base}/upgrade" style="margin:0"><input type="hidden" name="animal" value="${i}">
              <button class="btn ghost" type="submit"${can ? "" : " disabled"}>⬆ 升 Lv.${lvl + 1}（${cost}金）</button></form>`;
                })();
            const feedCost = Math.max(1, Math.round(effPrice * RANCH_FEED_COST_RATE));
            const canFeed = !raid && (a.pending ?? 0) <= 0 && (a.pendingMeat ?? 0) <= 0 && !a.feedBoostPending && feedUsed < RANCH_FEED_DAILY_CAP && f.silver >= feedCost;
            const feedLabel = a.feedBoostPending ? "🥣 下份 +10% 已登记" : `🥣 投喂（🪙${feedCost}）`;
            const feedBtn = `<form method="post" action="${base}/feed" style="margin:0"><input type="hidden" name="animal" value="${i}"><button class="btn ghost" type="submit"${canFeed ? "" : " disabled"}>${feedLabel}</button></form>`;
            const nameForm = `<form method="post" action="${base}/name-animal" style="display:flex;gap:6px;margin:0">
        <input type="hidden" name="animal" value="${i}">
        <input class="inp" type="text" name="name" maxlength="12" value="${esc(a.name ?? "")}" placeholder="给它起个名字" style="width:auto">
        <button class="btn ghost" type="submit">🏷️ 改名</button></form>`;
            const dispatchForm = raid ? "" : raidCapReached
                ? `<div class="small muted" style="margin-top:6px">今天偷金币已达 ${RANCH_RAID_DAILY_CAP} 金上限，不能再派遣。</div>`
                : targets.length
                ? `<form class="raid-form" method="post" action="${base}/dispatch-raid">
            <input type="hidden" name="animal" value="${i}">
            <label class="small">去 <select class="inp" name="to" required>${targetOptions}</select></label>
            <label class="small">潜伏 <input class="inp raid-hours" type="number" name="hours" min="1" step="1" required> 小时</label>
            <button class="btn" type="submit">派遣</button>
            <span class="small muted">${RANCH_RAID_COINS_PER_HOUR} 金/小时，出发先冻结同额保证金</span>
          </form>`
                : `<div class="small muted" style="margin-top:6px">暂时没有其他玩家农场可以派遣。</div>`;
            const spriteIndex = animalSpriteIndex.get(a.kindId);
            const animalIcon = Number.isInteger(spriteIndex) ? sprite(spriteIndex, nm, "", a.variantId) : `<span role="img" aria-label="${esc(nm)}">${k?.emoji ?? "🐾"}</span>`;
            const intro = k
                ? `${esc(k.category)}动物 · 每${fmtDur(k.produceEveryTicks * TICK_MS)}产一份「${esc(k.produce)}」，当前每份折算 ${num(effPrice)} 金。`
                : "";
            const tile = `<button type="button" class="ranch-owned-tile" data-ranch-animal="animal-${i}" aria-haspopup="dialog" aria-controls="ranchAnimalModal">
        ${animalIcon}<span class="ranch-owned-name">${esc(nm)}</span><span class="ranch-owned-level">Lv.${lvl}</span></button>`;
            const detail = `<template id="ranch-animal-template-animal-${i}"><div class="ranch-animal-detail">
        <div class="ranch-animal-head">${animalIcon}<div><h2>${esc(nm)} · Lv.${lvl} · ${a.pending > 0 ? `1份可收${a.pendingMeat ? " + 额外肉" : ""}${a.pendingBoost ? " · +10%" : ""}` : "生产中"}</h2><p class="ranch-animal-intro">${intro}</p></div></div>
        <div class="ranch-animal-status">${worn}${raidLine}<div class="small muted" style="margin-top:3px">银币投喂每天 ${RANCH_FEED_DAILY_CAP} 次，今日已用 ${feedUsed}/${RANCH_FEED_DAILY_CAP}；只提高下一份正常产物，不影响派遣或巡逻鹅。</div></div>
        <div class="ranch-animal-actions">${pinBtn(a.kindId)}${upBtn}${feedBtn}${nameForm}${variantForm("animal", a.kindId, a, k?.name ?? nm)}</div>
        ${raid ? "" : `<div class="ranch-animal-dispatch">${dispatchForm}</div>`}
      </div></template>`;
            return { tile, detail };
        });
        const petPanels = petList.map((p, i) => {
            const k = petById.get(p.kindId);
            const nm = p.name || k?.name || p.kindId;
            const wearing = (p.acc ?? []).map((id) => accessoryById.get(id)?.name).filter(Boolean);
            const worn = wearing.length
                ? `<div class="small" style="color:var(--leaf-deep);margin-top:2px">👒 穿戴：${wearing.map(esc).join("、")}</div>`
                : `<div class="small muted" style="margin-top:2px">还没打扮</div>`;
            const nameForm = `<form method="post" action="${base}/name-pet" style="display:flex;gap:6px;margin:0">
        <input type="hidden" name="pet" value="${i}">
        <input class="inp" type="text" name="name" maxlength="12" value="${esc(p.name ?? "")}" placeholder="给它起个名字" style="width:auto">
        <button class="btn ghost" type="submit">🏷️ 改名</button></form>`;
            const spriteIndex = petSpriteIndex.get(p.kindId);
            const petIcon = Number.isInteger(spriteIndex) ? sprite(spriteIndex, nm, "", p.variantId) : `<span role="img" aria-label="${esc(nm)}">${k?.emoji ?? "🐾"}</span>`;
            const tile = `<button type="button" class="ranch-owned-tile" data-ranch-animal="pet-${i}" aria-haspopup="dialog" aria-controls="ranchAnimalModal">
        ${petIcon}<span class="ranch-owned-name">${esc(nm)}</span><span class="ranch-owned-level">宠物</span></button>`;
            const detail = `<template id="ranch-animal-template-pet-${i}"><div class="ranch-animal-detail">
        <div class="ranch-animal-head">${petIcon}<div><h2>${esc(nm)} · 宠物</h2><p class="ranch-animal-intro">${k ? esc(k.tag) : "普通宠物"}</p></div></div>
        <div class="ranch-animal-status">${k ? `<div class="small muted">✨ ${esc(k.buffText)}</div>` : ""}${worn}</div>
        <div class="ranch-animal-actions">${pinBtn(p.kindId)}${nameForm}${variantForm("pet", p.kindId, p, k?.name ?? nm)}</div>
      </div></template>`;
            return { tile, detail };
        });
        const goosePanels = patrolGoose ? (() => {
            const gooseName = patrolGoose.name || RANCH_PATROL_GOOSE_NAME;
            const wearing = (patrolGoose.acc ?? []).map((id) => accessoryById.get(id)?.name).filter(Boolean);
            const worn = wearing.length
                ? `<div class="small" style="color:var(--leaf-deep);margin-top:2px">👒 穿戴：${wearing.map(esc).join("、")}</div>`
                : `<div class="small muted" style="margin-top:2px">还没打扮</div>`;
            const catches = ranch?.patrolGooseCatches?.day === today ? ranch.patrolGooseCatches.n : 0;
            const nameForm = `<form method="post" action="${base}/name-goose" style="display:flex;gap:6px;margin:0">
        <input class="inp" type="text" name="name" maxlength="12" value="${esc(patrolGoose.name ?? "")}" placeholder="给它起个名字" style="width:auto">
        <button class="btn ghost" type="submit">🏷️ 改名</button></form>`;
            const gooseIcon = sprite(animals.length + pets.length, gooseName, "", patrolGoose.variantId);
            const tile = `<button type="button" class="ranch-owned-tile" data-ranch-animal="goose" aria-haspopup="dialog" aria-controls="ranchAnimalModal">
        ${gooseIcon}<span class="ranch-owned-name">${esc(gooseName)}</span><span class="ranch-owned-level">常驻守卫</span></button>`;
            const detail = `<template id="ranch-animal-template-goose"><div class="ranch-animal-detail">
        <div class="ranch-animal-head">${gooseIcon}<div><h2>${esc(gooseName)} · 巡逻鹅</h2><p class="ranch-animal-intro">独立常驻牧场守卫</p></div></div>
        <div class="ranch-animal-status"><div class="small muted">今日已成功赶走 ${num(catches)}/${RANCH_PATROL_GOOSE_DAILY_CAP} 次</div>
        <div class="small muted" style="margin-top:3px">未被你提前抓住的偷金币动物结束潜伏时，有 25% 概率被巡逻鹅赶走；每天最多成功 3 次。成功时对方保证金全额退回且不受罚，系统按该动物当前一次完整产出价值的 50% 额外奖励你。</div>${worn}</div>
        <div class="ranch-animal-actions">${pinBtn(RANCH_PATROL_GOOSE_ID)}${nameForm}${variantForm("goose", "patrol_goose", patrolGoose, RANCH_PATROL_GOOSE_NAME)}</div>
      </div></template>`;
            return [{ tile, detail }];
        })() : [];
        const ownPanels = [...animalPanels, ...petPanels, ...goosePanels];
        const ownTiles = ownPanels.map((entry) => entry.tile).join("");
        const incomingPanels = incoming.map(({ owner, raid }, incomingIndex) => {
            const animal = owner.ranch?.animals.find((a) => a.kindId === raid.animalKindId);
            const kind = animalById.get(raid.animalKindId);
            const nm = animal?.name || kind?.name || raid.animalKindId;
            const compensation = ranchRaidCoins(raid, now);
            const spriteIndex = animalSpriteIndex.get(raid.animalKindId);
            const visitorIcon = Number.isInteger(spriteIndex) ? sprite(spriteIndex, nm, "", animal?.variantId) : `<span role="img" aria-label="${esc(nm)}">${kind?.emoji ?? "🐾"}</span>`;
            return `<template id="ranch-animal-template-visitor-${incomingIndex}"><div class="ranch-animal-detail">
        <div class="ranch-animal-head">${visitorIcon}<div><h2>${esc(nm)} · 潜伏来客</h2><p class="ranch-animal-intro">来自「${esc(farmLabel(owner))}」的${esc(kind?.name || raid.animalKindId)}</p></div></div>
        <div class="ranch-animal-status"><div class="small" style="color:var(--gold)">🥷 正在你家潜伏 · 现在抓住可获赔 ${num(compensation)} 金 · ${fmtDur(Math.max(0, raid.endsAt - now))}后跑掉</div></div>
        <div class="ranch-animal-actions"><form method="post" action="${base}/catch-raid" style="margin:0"><input type="hidden" name="raid" value="${esc(raid.id)}">
          <button class="btn" type="submit">抓住</button></form></div>
      </div></template>`;
        });
        const allDetails = [...ownPanels.map((entry) => entry.detail), ...incomingPanels].join("");
        const canCollect = pendingGross > 0;
        const animalModal = ownPanels.length || incomingPanels.length ? `${allDetails}<div class="mback ranch-animal-back" id="ranchAnimalModal" role="dialog" aria-modal="true" aria-label="动物详情" aria-hidden="true">
      <div class="sheet ranch-animal-sheet"><button type="button" class="ranch-animal-x" data-ranch-animal-close aria-label="关闭">✕</button><div id="ranchAnimalBody"></div></div>
    </div><script>(function(){
      var modal=document.getElementById('ranchAnimalModal'),body=document.getElementById('ranchAnimalBody'),opener=null;if(!modal||!body)return;
      document.body.appendChild(modal);
      function openAnimal(index,trigger){var template=document.getElementById('ranch-animal-template-'+index);if(!template)return;opener=trigger;modal.dataset.panel=index;body.replaceChildren(template.content.cloneNode(true));modal.classList.add('show');modal.setAttribute('aria-hidden','false');var close=modal.querySelector('[data-ranch-animal-close]');if(close&&close.focus)close.focus();}
      function closeAnimal(){if(!modal.classList.contains('show'))return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true');delete modal.dataset.panel;body.replaceChildren();if(opener&&opener.focus)opener.focus();opener=null;}
      function refreshAnimal(){if(!modal.classList.contains('show'))return;var index=modal.dataset.panel,template=document.getElementById('ranch-animal-template-'+index);if(!template){closeAnimal();return;}body.replaceChildren(template.content.cloneNode(true));opener=[...document.querySelectorAll('[data-ranch-animal]')].find(function(node){return node.getAttribute('data-ranch-animal')===index;})||opener;var focus=body.querySelector('input:not([type="hidden"]),select,button');if(focus)focus.focus({preventScroll:true});}
      document.addEventListener('click',function(event){var trigger=event.target.closest('[data-ranch-animal]');if(trigger){event.preventDefault();openAnimal(trigger.getAttribute('data-ranch-animal'),trigger);return;}if(event.target===modal||event.target.closest('[data-ranch-animal-close]'))closeAnimal();});
      document.addEventListener('keydown',function(event){if(event.key==='Escape')closeAnimal();});
      window.__farmRanchModal={refresh:refreshAnimal,close:closeAnimal};
    })();</script>` : "";
        animalsCard = `<div class="card"><div class="line"><h3 style="margin:0">🐾 在养的动物</h3>
        <form method="post" action="${base}/collect" style="margin:0">
          <button class="btn" type="submit"${canCollect ? "" : " disabled"}>📦 一键收获${canCollect ? `（价值 ${num(pendingValue)}金）` : "（暂无可收）"}</button>
        </form></div>
      ${ownTiles ? `<div class="ranch-owned-grid">${ownTiles}</div>` : `<p class="small muted" style="margin:12px 0 0">还没有自家动物。</p>`}
      ${animalModal}
      <p class="small muted" style="margin:10px 0 0">收获后的动物产物会按当前等级和投喂效果锁定价值，放进顶部「🍳 料理台」的食材柜；欠款存在时会先按动物顺序整份回收还债。鸡、鸭、普通鹅、羊、牛每个完整生产周期另有 5% 概率多带回一份肉。</p>
      <p class="small muted" style="margin:6px 0 0">📌 <b>pin</b>：被你 pin 的动物/宠物，才会随机出现在 ${ai} 农场的氛围描述里；<b>只 pin 一只就固定只出现它</b>。都不 pin＝全部随机（默认）。</p></div>`;
    }
    const productGroups = [];
    for (const item of ranch?.kitchen?.products ?? []) {
        let group = productGroups.find((entry) => entry.itemId === item.itemId);
        if (!group) {
            group = { itemId: item.itemId, items: [] };
            productGroups.push(group);
        }
        group.items.push(item);
    }
    const productRows = productGroups.map((group) => {
        const item = group.items[0];
        const values = group.items.map((entry) => Number(entry.value) || 0);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const valueText = min === max ? `${num(min)} 金/份` : `${num(min)}–${num(max)} 金/份`;
        const qty = group.items.length > 1
            ? `<label class="small">数量 <input class="inp" type="number" name="qty" min="1" max="${group.items.length}" step="1" value="1" inputmode="numeric" style="width:72px" aria-label="回收${esc(item.name)}的数量，最多${group.items.length}份"></label>`
            : `<input type="hidden" name="qty" value="1">`;
        return `<div class="line small" style="flex-wrap:wrap"><span>${esc(item.emoji || "📦")} <b>${esc(item.name)} ×${group.items.length}</b>　<span class="muted">可下锅 · 锁价 ${valueText}</span></span>
      <form method="post" action="${base}/sell-product" style="display:flex;gap:7px;align-items:center;margin:0"><input type="hidden" name="itemIds" value="${esc(JSON.stringify(group.items.map((entry) => entry.id)))}">${qty}<button class="btn ghost" type="submit">系统回收</button></form></div>`;
    }).join("");
    const productsCard = `<div class="card"><h3>📦 已收牧场产物　<span class="muted small" style="font-weight:400">共 ${ranch?.kitchen?.products?.length ?? 0} 份</span></h3>
    <p class="small muted" style="margin:0 0 8px">可烹饪产物会留在同一份料理食材库存里；可以在这里按锁定价值换成牧场金币，也可以去料理台下锅。</p>
    ${productRows || `<div class="small muted">还没有待处理的牧场产物。</div>`}</div>`;
    const raidHistory = ranch?.raidHistory?.day === today ? ranch.raidHistory.entries : [];
    const raidHistoryRows = raidHistory.length
        ? raidHistory.map((entry) => {
            const result = entry.status === "active"
                ? `<span class="pill">派遣中</span>`
                : entry.status === "caught"
                    ? `<b style="color:var(--SP)">被人类抓住 -${num(entry.coins ?? 0)} 金</b>`
                    : entry.status === "goose-caught"
                        ? `<b style="color:var(--SP)">被巡逻鹅抓住 · 偷金币失败 · 保证金全退 · 对方巡逻鹅带走了部分「${esc(entry.produce ?? "未知产物")}」（已折算 ${num(entry.rewardCoins ?? 0)} 金）</b>`
                    : `<b style="color:var(--leaf-deep)">成功偷到 +${num(entry.coins ?? 0)} 金</b>`;
            return `<div class="line small" style="flex-wrap:wrap;padding:7px 0"><span><span class="muted">${esc(fmtTime(entry.startedAt))}</span>　${esc(entry.animalName)} → ${esc(entry.targetName)}</span>${result}</div>`;
        }).join("")
        : `<div class="small muted" style="padding:6px 0 2px">${todayRaidIncome > 0 ? "此前记录未留存" : "今天还没有派遣记录。派出动物后，进度和结果会留在这里。"}</div>`;
    const raidHistoryCard = `<details class="card raid-history"><summary><span>🥷 今日派遣 <b>${raidHistory.length}</b> 次 · 已偷 <b>${num(todayRaidIncome)}/${RANCH_RAID_DAILY_CAP}</b></span></summary>
    <div class="raid-history-body">${raidHistoryRows}</div></details>`;
    // 🛒 牧场商店：每天随机刷 2 件配饰 + 2 件装饰。这里只负责「买」，买到的进🧰仓库，穿戴/摆放去仓库做。
    const shop = ranch?.shop;
    const accOffers = (shop?.acc ?? []).map((id) => accessoryById.get(id)).filter(Boolean);
    const decoOffers = (shop?.decor ?? []).map((id) => decorationById.get(id)).filter(Boolean);
    const accRows = accOffers.length ? accOffers.map((ac) => {
        const can = coins >= ac.price;
        return `<div class="line small" style="flex-wrap:wrap"><span>👗 ${esc(ac.name)}　<span class="muted">${ac.price}金</span></span>
      <form method="post" action="${base}/dress" style="margin:0"><input type="hidden" name="acc" value="${ac.id}">
        <button class="btn ghost" type="submit"${can ? "" : " disabled"}>买入仓库</button></form></div>`;
    }).join("") : `<div class="small muted">今天没有配饰上架</div>`;
    const decoRows = decoOffers.length ? decoOffers.map((d) => {
        const can = coins >= d.price;
        return `<div class="line small"><span>🏡 ${esc(d.name)}　<span class="muted">${d.price}金</span></span>
      <form method="post" action="${base}/decorate" style="margin:0"><input type="hidden" name="decor" value="${d.id}">
        <button class="btn ghost" type="submit"${can ? "" : " disabled"}>买入仓库</button></form></div>`;
    }).join("") : `<div class="small muted">装饰都收齐啦 / 今天没有新装饰</div>`;
    const shopCard = `<div class="card"><h3>🛒 牧场商店　<span class="muted small" style="font-weight:400">每天随机刷新，明天换一批</span></h3>
    <p class="small muted" style="margin:0 0 6px">用牧场金币买<b>配饰</b>和<b>装饰物</b>，买到的都进 <b>🧰 牧场仓库</b>——再去仓库给动物/宠物戴上、把装饰摆出来。每天各上 2 件，看缘分。</p>
    <div class="small" style="color:var(--wood);font-weight:700;margin:8px 0 2px">今日配饰</div>
    ${accRows}
    <div class="small" style="color:var(--wood);font-weight:700;margin:10px 0 2px">今日装饰</div>
    ${decoRows}</div>`;
    // 回传金币给 AI
    const remitCard = `<div class="card"><h3>💰 回传金币给${ai}</h3>
    <p class="small muted" style="margin:0 0 10px">牧场赚的钱是你的。要不要分${ai}一点、分多少，<b>你自己定</b>。回传后 ${ai} 下次打开农场会收到一条消息。</p>
    <form method="post" action="${base}/remit" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input class="inp" type="number" name="amount" min="1" max="${coins}" placeholder="金额" ${coins > 0 ? "" : "disabled"}>
      <button class="btn" type="submit" ${coins > 0 ? "" : "disabled"}>↗ 回传给${ai}</button>
      <span class="small muted">（现有 ${num(coins)} 金）</span>
    </form></div>`;
    // 双向金币往来（人→AI remit / AI→人 send-ranch）
    const transfers = (f.ledger ?? []).filter((e) => e.type === "remit" || e.type === "send-ranch");
    const histRows = transfers.length
        ? transfers.slice(0, 12).map((e) => `<div class="line small"><span class="muted">${esc(fmtTime(e.at))}</span><span>${e.type === "remit" ? `↗ 给 ${ai}` : `↙ ${ai} 给你`} <b>${num(e.amount)}</b> 金</span></div>`).join("")
        : `<div class="small muted">还没有金币往来记录。</div>`;
    const historyCard = `<div class="card"><h3>🧾 金币往来</h3>
    <p class="small muted" style="margin:0 0 6px">你和 ${ai} 互相寄过的金币（最近 12 笔）。</p>
    ${histRows}</div>`;
    // 🧰 牧场仓库：买来的配饰/装饰先进这里，再从这儿给动物/宠物/巡逻鹅戴上、把装饰摆出来。
    const decorName = (id) => (decorationById.get(id) ?? expDecorById.get(id))?.name ?? id;
    const decorVisit = (id) => (decorationById.get(id) ?? expDecorById.get(id))?.visitLine;
    const decorSrc = (id) => {
        const exp = expDecorById.get(id);
        return exp ? `<span class="muted">🗺️ 秘境·${esc(expMapById.get(exp.from)?.name ?? exp.from)}</span>` : `<span class="muted">🛒 商店</span>`;
    };
    // 可穿戴对象（动物 + 宠物 + 独立巡逻鹅）。
    const wearTargets = [
        ...list.map((a, i) => ({ v: `animal:${i}`, label: a.name || animalById.get(a.kindId)?.name || a.kindId })),
        ...petList.map((p, i) => ({ v: `pet:${i}`, label: p.name || petById.get(p.kindId)?.name || p.kindId })),
        ...(patrolGoose ? [{ v: "goose:0", label: patrolGoose.name || RANCH_PATROL_GOOSE_NAME }] : []),
    ];
    const whoOpts = wearTargets.map((t) => `<option value="${t.v}">${esc(t.label)}</option>`).join("");
    // 配饰·仓库里（未穿，按 id 计数）
    const wdCount = new Map();
    for (const id of ranch?.wardrobe ?? [])
        wdCount.set(id, (wdCount.get(id) ?? 0) + 1);
    const wardrobeRows = [...wdCount.entries()].map(([id, n]) => {
        const ac = accessoryById.get(id);
        if (!ac)
            return "";
        const wear = wearTargets.length
            ? `<form method="post" action="${base}/wear" style="display:flex;gap:6px;margin:0"><input type="hidden" name="acc" value="${id}">
          <select class="inp" name="who" style="width:auto">${whoOpts}</select><button class="btn ghost" type="submit">戴上</button></form>`
            : `<span class="small muted">先有动物、宠物或巡逻鹅才能戴</span>`;
        return `<div class="line small" style="flex-wrap:wrap"><span>🎀 <b>${esc(ac.name)}</b>${n > 1 ? ` ×${n}` : ""}${ac.desc ? `　<span class="muted">${esc(ac.desc)}</span>` : ""}</span>${wear}</div>`;
    }).filter(Boolean).join("");
    // 配饰·穿戴中（动物/宠物/巡逻鹅身上，可脱下）
    const wornList = [
        ...list.flatMap((a, i) => (a.acc ?? []).map((id) => ({ id, target: "animal", idx: i, wearer: a.name || animalById.get(a.kindId)?.name || a.kindId }))),
        ...petList.flatMap((p, i) => (p.acc ?? []).map((id) => ({ id, target: "pet", idx: i, wearer: p.name || petById.get(p.kindId)?.name || p.kindId }))),
        ...(patrolGoose?.acc ?? []).map((id) => ({ id, target: "goose", idx: 0, wearer: patrolGoose.name || RANCH_PATROL_GOOSE_NAME })),
    ];
    const wornRows = wornList.map((w) => {
        const ac = accessoryById.get(w.id);
        if (!ac)
            return "";
        return `<div class="line small" style="flex-wrap:wrap"><span>🎀 <b>${esc(ac.name)}</b>　<span class="muted">穿在 ${esc(w.wearer)}</span></span>
      <form method="post" action="${base}/takeoff" style="margin:0"><input type="hidden" name="acc" value="${w.id}"><input type="hidden" name="target" value="${w.target}"><input type="hidden" name="idx" value="${w.idx}"><button class="btn ghost" type="submit">脱下</button></form></div>`;
    }).filter(Boolean).join("");
    // 装饰·仓库里（未摆，可摆上）
    const storeRows = (ranch?.decorStore ?? []).map((id) => `<div class="line small" style="flex-wrap:wrap"><span>🏡 <b>${esc(decorName(id))}</b>　${decorSrc(id)}</span>
      <form method="post" action="${base}/place" style="margin:0"><input type="hidden" name="decor" value="${id}"><button class="btn ghost" type="submit">摆上</button></form></div>`).join("");
    // 装饰·展示中（已摆，可收起）
    const placedRows = (ranch?.decor ?? []).map((id) => {
        const vl = decorVisit(id);
        return `<div class="line small" style="flex-wrap:wrap"><span>🏡 <b>${esc(decorName(id))}</b> <span class="ready">展示中</span>　${decorSrc(id)}${vl ? `　<span class="muted">${esc(vl)}</span>` : ""}</span>
      <form method="post" action="${base}/unplace" style="margin:0"><input type="hidden" name="decor" value="${id}"><button class="btn ghost" type="submit">收起</button></form></div>`;
    }).join("");
    const wdTotal = (ranch?.wardrobe ?? []).length;
    const warehouseCard = `<div class="card"><h3>🧰 牧场仓库　<span class="muted small" style="font-weight:400">买来/捡到的都在这；从这儿戴上、摆出来</span></h3>
    <div class="small" style="color:var(--wood);font-weight:700;margin:6px 0 2px">🎀 配饰 · 仓库里（${wdTotal}）</div>
    ${wardrobeRows || `<div class="small muted">仓库里没有未穿的配饰——去下面牧场商店买。</div>`}
    <div class="small" style="color:var(--wood);font-weight:700;margin:10px 0 2px">🎀 配饰 · 穿戴中（${wornList.length}）</div>
    ${wornRows || `<div class="small muted">还没给谁戴上配饰。</div>`}
    <div class="small" style="color:var(--wood);font-weight:700;margin:12px 0 2px">🏡 装饰 · 仓库里（${(ranch?.decorStore ?? []).length}）</div>
    ${storeRows || `<div class="small muted">仓库里没有未摆的装饰——牧场商店能买，出门探险也可能捡到。</div>`}
    <div class="small" style="color:var(--wood);font-weight:700;margin:10px 0 2px">🏡 装饰 · 展示中（${(ranch?.decor ?? []).length}）</div>
    ${placedRows || `<div class="small muted">还没摆出装饰（摆出来别人串门才看得到）。</div>`}</div>`;
    const body = `${plaque}
${ranchSceneCard}
${raidHistoryCard}
${codexCard}
${animalsCard}
${productsCard}
${warehouseCard}
${shopCard}
<div class="grid c2">${remitCard}${historyCard}</div>`;
    return page(`${f.name} · 我的牧场`, key, "ranch", `<div id="ranchPage">${body}</div>${RANCH_ASYNC_SCRIPT}`, farmNames(f));
}
