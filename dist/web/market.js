import { advance, humanBarterInventory, humanBarterInventoryCount, humanBarterItemName, humanBarterListings } from "../engine.js";
import { getCrop, cropsByCategory, materialById, cooking, cookingIngredientById } from "../content.js";
import { BASE } from "../config.js";
import { allUgc } from "../ugc.js";
import { esc, farmLabel, farmNames, num, page } from "./shell.js";

// ——————————————————————————————————————————————————————————————
// 🧺 人类集市：浏览现有银币摊位，并用自己小机的库存挂单／接受整单换物。
// ——————————————————————————————————————————————————————————————
export function uiMarket(f, farms, now, key, flash) {
    advance(f, now);
    const kindLabel = { seed: "种子", material: "素材", ingredient: "食材", dish: "料理" };
    const kindOrder = ["seed", "material", "ingredient", "dish"];
    const recipeCategories = ["主食小吃", "热菜", "汤羹", "甜品点心", "饮品"];
    const inventory = humanBarterInventory(f);
    const seedWants = [...cropsByCategory("limited"), ...allUgc().filter((crop) => !crop.banned)];
    const giveRows = Object.fromEntries(kindOrder.map((kind) => [kind, inventory.filter((item) => item.kind === kind)]));
    const wantRows = { seed: seedWants, material: [...materialById.values()], ingredient: cooking.ingredients, dish: cooking.recipes };
    const giveKinds = kindOrder.filter((kind) => giveRows[kind].length);
    const typeOptions = (kinds) => kinds.map((kind) => `<option value="${kind}">${kindLabel[kind]}</option>`).join("");
    const itemOptions = (kind, rows, showStock = false) => {
        const option = (item) => `<option value="${kind}:${esc(item.id)}"${showStock ? ` data-stock="${item.qty}"` : ""}>${esc(item.name)}${showStock ? `（有 ${item.qty}）` : ""}</option>`;
        if (kind !== "dish")
            return rows.map(option).join("");
        return recipeCategories.map((category) => {
            const categoryRows = rows.filter((item) => cooking.recipes.find((recipe) => recipe.id === item.id)?.category === category);
            return categoryRows.length ? `<optgroup label="${category}">${categoryRows.map(option).join("")}</optgroup>` : "";
        }).join("");
    };
    const optionTemplates = (prefix, rowsByKind, kinds, showStock = false) => kinds.map((kind) => `<template data-barter-options="${prefix}:${kind}">${itemOptions(kind, rowsByKind[kind], showStock)}</template>`).join("");
    const listCard = `<section class="card"><h3>🔁 挂一张换物单</h3>
      <p class="small muted">物品会先从${esc(f.aiName || f.name || "小机")}的库存移进摊位；别人接受后整单互换，不使用银币。</p>
      ${inventory.length ? `<form method="post" action="${BASE}/ui/${key}/market/list" data-market-async class="market-list-grid">
        <div class="market-choice"><span class="market-choice-title">我拿出</span>
          <label><span class="small muted">类型</span><select class="inp" data-barter-kind="give" aria-label="拿出物品类型">${typeOptions(giveKinds)}</select></label>
          <label><span class="small muted">物品</span><select class="inp" name="give" aria-label="拿出的物品" required></select></label>
          <label><span class="small muted">数量</span><input class="inp" type="number" name="giveQty" min="1" step="1" value="1" required></label>
        </div>
        <div class="market-choice"><span class="market-choice-title">想换</span>
          <label><span class="small muted">类型</span><select class="inp" data-barter-kind="want" aria-label="想换物品类型">${typeOptions(kindOrder)}</select></label>
          <label><span class="small muted">物品</span><select class="inp" name="want" aria-label="想换的物品" required></select></label>
          <label><span class="small muted">数量</span><input class="inp" type="number" name="wantQty" min="1" step="1" value="1" required></label>
        </div>
        ${optionTemplates("give", giveRows, giveKinds, true)}${optionTemplates("want", wantRows, kindOrder)}
        <button class="btn" type="submit">摆上换物摊</button>
      </form>` : `<p class="muted">当前没有可换的种子、素材、商店食材或正常料理。</p>`}</section>`;
    const cashName = (entry) => entry.kind === "material"
        ? materialById.get(entry.id)?.name ?? entry.id
        : entry.kind === "ingredient"
            ? cookingIngredientById.get(entry.id)?.name ?? entry.id
            : entry.kind === "dish"
                ? entry.dish?.name ?? "料理"
                : getCrop(entry.id)?.name ?? entry.id;
    const cashRow = (seller, entry) => {
        const own = seller.id === f.id;
        const oneOnly = entry.kind === "dish" || (entry.kind === "seed" && getCrop(entry.id)?.category === "limited");
        const qty = oneOnly
            ? `<input type="hidden" name="qty" value="1">`
            : `<input class="inp" type="number" name="qty" min="1" max="${entry.qty}" step="1" value="1" aria-label="购买数量">`;
        return `<div class="market-row"><div class="market-row-main"><b>${esc(cashName(entry))}</b> <span class="muted">×${entry.qty}</span><div class="small">🪙${entry.price} 银／份</div></div>
          ${own ? `<span class="small muted">自己的摊位</span>` : `<form method="post" action="${BASE}/ui/${key}/market/buy" data-market-async><input type="hidden" name="seller" value="${esc(seller.id)}"><input type="hidden" name="kind" value="${esc(entry.kind)}"><input type="hidden" name="id" value="${esc(entry.id)}">${qty}<button class="btn ghost" type="submit"${f.silver < entry.price ? " disabled" : ""}>购买</button></form>`}</div>`;
    };
    const barterRow = (seller, listing) => {
        const own = seller.id === f.id;
        const giveName = listing.give?.name || humanBarterItemName(listing.give?.kind, listing.give?.id);
        const wantName = listing.want?.name || humanBarterItemName(listing.want?.kind, listing.want?.id);
        const have = humanBarterInventoryCount(f, listing.want?.kind, listing.want?.id);
        const enough = have >= Number(listing.want?.qty ?? 0);
        return `<div class="market-row"><div class="market-row-main"><b>${esc(giveName)}</b> ×${num(listing.give?.qty)} <span class="barter-arrow">⇄</span> <b>${esc(wantName)}</b> ×${num(listing.want?.qty)}<div class="small muted">${own ? "我的换物单" : `你有 ${have} 份`}</div></div>
          ${own ? `<form method="post" action="${BASE}/ui/${key}/market/unlist" data-market-async><input type="hidden" name="listing" value="${esc(listing.id)}"><button class="btn ghost" type="submit">下架</button></form>` : `<form method="post" action="${BASE}/ui/${key}/market/trade" data-market-async><input type="hidden" name="seller" value="${esc(seller.id)}"><input type="hidden" name="listing" value="${esc(listing.id)}"><button class="btn" type="submit"${enough ? "" : " disabled"}>${enough ? "交换" : "库存不足"}</button></form>`}</div>`;
    };
    const ordered = [...farms].sort((a, b) => Number(b.id === f.id) - Number(a.id === f.id));
    const stalls = ordered.map((seller) => {
        const cash = (seller.market ?? []).filter((entry) => !(entry.kind === "seed" && getCrop(entry.id)?.banned));
        const barters = humanBarterListings(seller);
        if (!cash.length && !barters.length)
            return "";
        return `<section class="market-farm"><div class="line" style="align-items:baseline"><h3 style="margin:0">🏡 ${esc(farmLabel(seller))}</h3><span class="small muted">${seller.id === f.id ? "我的摊位" : `🏠${esc(seller.id)}`}</span></div>${cash.map((entry) => cashRow(seller, entry)).join("")}${barters.map((listing) => barterRow(seller, listing)).join("")}</section>`;
    }).filter(Boolean);
    const marketScript = `<script>(()=>{if(window.__farmHumanMarket)return;window.__farmHumanMarket=true;const root=document.getElementById("marketPage");if(!root)return;
      const sync=scope=>{for(const form of scope.querySelectorAll('form[action$="/market/list"]')){const give=form.elements.give,giveQty=form.elements.giveQty;const syncStock=()=>{giveQty.max=give.selectedOptions[0]?.dataset.stock||"1";if(Number(giveQty.value)>Number(giveQty.max))giveQty.value=giveQty.max;};for(const prefix of ["give","want"]){const kind=form.querySelector('[data-barter-kind="'+prefix+'"]'),item=form.elements[prefix];if(!kind||!item)continue;const fill=()=>{const source=[...form.querySelectorAll("template[data-barter-options]")].find(node=>node.dataset.barterOptions===prefix+":"+kind.value);item.replaceChildren(source?source.content.cloneNode(true):document.createTextNode(""));if(prefix==="give")syncStock();};kind.addEventListener("change",fill);item.addEventListener("change",()=>{if(prefix==="give")syncStock();});fill();}}};sync(root);
      document.addEventListener("submit",async event=>{const form=event.target.closest?.("form[data-market-async]");if(!form||event.defaultPrevented)return;event.preventDefault();if(event.submitter)event.submitter.disabled=true;const x=scrollX,y=scrollY;try{const response=await fetch(form.action,{method:"POST",body:new URLSearchParams(new FormData(form)),credentials:"same-origin"});if(!response.ok)throw new Error("request failed");const next=new DOMParser().parseFromString(await response.text(),"text/html"),fresh=next.getElementById("marketPage");if(!fresh)throw new Error("invalid page");root.innerHTML=fresh.innerHTML;sync(root);requestAnimationFrame(()=>scrollTo(x,y));}catch{location.reload();}});})();</script>`;
    const body = `<div id="marketPage"><div class="plaque"><h1>🧺 铃野集市</h1><p class="welcome">看看各家摊位，也可以替自己的小机谈一笔换物。</p><div class="tags"><span class="tag">🪙 银币 <b>${num(f.silver)}</b></span><span class="tag">银币购买直接入库</span><span class="tag">换物整单成交</span></div></div>
      ${flash ? `<div class="flash">${esc(flash)}</div>` : ""}${listCard}<section class="card"><h2 class="mt">全服摊位</h2>${stalls.length ? stalls.join("") : `<p class="muted">现在还没有人摆摊。</p>`}</section></div>${marketScript}`;
    return page(`${f.name} · 铃野集市`, key, "market", body, farmNames(f));
}
