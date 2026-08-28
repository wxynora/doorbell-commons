import { advance, kitchenView } from "../engine.js";
import { cooking, cookingProductById, cookingIngredientById } from "../content.js";
import { BASE } from "../config.js";
import { fishingTreasureInventory } from "../fishing.js";
import { RARITY_VAR, esc, farmNames, fmtDur, num, page, rarityDot } from "./shell.js";

const cookingRecipeIndex = new Map(cooking.recipes.map((recipe, index) => [recipe.id, index]));
const fishingRecipeIndex = new Map([
    "pan_fried_fish", "fish_rice_ball", "tomato_fish_soup",
    "herb_grilled_fish", "honey_roast_fish", "starlight_fish_feast",
].map((id, index) => [id, index]));
const cookingDishAtlas2Index = new Map([
    "scallion_omelet", "scallion_pancake", "butter_fried_egg", "home_style_tofu", "butter_corn",
    "soy_fried_rice", "plain_boiled_chicken", "red_braised_tofu", "tofu_egg_soup", "butter_cookie",
    "goat_milk_bun", "soy_quail_eggs", "scallion_oil_chicken", "ginger_duck", "tea_smoked_duck",
    "red_braised_goose", "scallion_lamb", "potato_beef", "yellow_wine_turkey", "yellow_wine_quail",
    "goat_meat_rice", "truffle_tofu", "red_braised_pork", "custard_bun", "dongpo_pork",
    "truffle_butter_steak",
].map((id, index) => [id, index]));
const cookingItemAtlas2Index = new Map([
    "pork", "soy_sauce", "ginger", "scallion", "butter", "yellow_wine", "tofu",
].map((id, index) => [id, index]));
const cookingItemIndex = new Map([...cooking.products.filter((item) => item.cookable), ...cooking.ingredients]
    .filter((item) => !cookingItemAtlas2Index.has(item.id))
    .map((item, index) => [item.id, index]));
function cookingItemLayout(itemId) {
    const atlas2Index = cookingItemAtlas2Index.get(itemId);
    if (atlas2Index !== undefined)
        return { asset: "second", x: atlas2Index % 4, y: Math.floor(atlas2Index / 4) };
    const index = cookingItemIndex.get(itemId);
    return index === undefined ? null : { asset: "main", x: index % 7, y: Math.floor(index / 7) };
}
function dishSprite(recipeId, name, className = "") {
    const fishingIndex = fishingRecipeIndex.get(recipeId);
    if (fishingIndex !== undefined)
        return `<span class="dish-sprite fish-dish-sprite ${className}" role="img" aria-label="${esc(name)}料理小图" style="--fish-dish-x:${fishingIndex % 3};--fish-dish-y:${Math.floor(fishingIndex / 3)}"></span>`;
    const atlas2Index = cookingDishAtlas2Index.get(recipeId);
    if (atlas2Index !== undefined)
        return `<span class="dish-sprite second-dish-sprite ${className}" role="img" aria-label="${esc(name)}料理小图" style="--dish2-x:${atlas2Index % 5};--dish2-y:${Math.floor(atlas2Index / 5)}"></span>`;
    const index = cookingRecipeIndex.get(recipeId);
    if (index === undefined)
        return `<img class="dish-thumb ${className}" src="${BASE}/assets/cooking/odd-dish.webp?v=20260804b" alt="${esc(name)}料理小图">`;
    return `<span class="dish-sprite ${className}" role="img" aria-label="${esc(name)}料理小图" style="--dish-x:${index % 6};--dish-y:${Math.floor(index / 6)}"></span>`;
}
function cookingItemSprite(itemId, name) {
    if (itemId === "fish:any")
        return `<span class="cook-pick-icon fish-item-icon" role="img" aria-label="${esc(name)}图标"></span>`;
    const layout = cookingItemLayout(itemId);
    if (!layout)
        return "";
    return `<span class="cook-pick-icon${layout.asset === "second" ? " second-item-icon" : ""}" role="img" aria-label="${esc(name)}图标" style="--item-x:${layout.x};--item-y:${layout.y}"></span>`;
}
// ——————————————————————————————————————————————————————————————
// 🍳 料理台：三层像素场景 + 点料入锅；食材/料理实例都使用收取或出锅时锁定的价值。
// ——————————————————————————————————————————————————————————————
export function uiCooking(f, now, key, flash, resultRaw, options = {}) {
    advance(f, now);
    const base = `${BASE}/ui/${key}/cooking`;
    const view = kitchenView(f, now, options);
    const stapleDailyBuyLimit = view.ingredients.find((item) => item.id === "salt")?.dailyBuyLimit
        ?? cooking.dailyBuyLimit;
    const rotatingDailyBuyLimit = view.ingredients.find((item) => !item.staple)?.dailyBuyLimit
        ?? cooking.dailyBuyLimit;
    const ranchCoins = f.ranch?.coins ?? 0;
    const silverIcon = `<span class="silver-coin" role="img" aria-label="银币"></span>`;
    const flashHtml = flash ? `<div class="flash">${esc(flash)}</div>` : "";
    const productGroups = [];
    for (const item of view.products) {
        let group = productGroups.find((entry) => entry.itemId === item.itemId);
        if (!group) {
            group = { itemId: item.itemId, items: [] };
            productGroups.push(group);
        }
        group.items.push(item);
    }
    const pantryGroups = [];
    for (const item of view.products) {
        const key = item.source === "fish" ? `fish:${item.fishId}` : item.itemId;
        let group = pantryGroups.find((entry) => entry.key === key);
        if (!group) {
            group = { key, itemId: item.itemId, items: [] };
            pantryGroups.push(group);
        }
        group.items.push(item);
    }
    const productValueText = (items) => {
        const values = items.map((item) => Number(item.value) || 0);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return min === max ? `锁价 ${num(min)} 金/份` : `锁价 ${num(min)}–${num(max)} 金/份`;
    };
    const sellIds = (items) => esc(JSON.stringify(items.map((item) => item.id)));
    const fishSaleValueText = (items) => {
        const values = items.map((item) => Number(item.sellSilver) || 0);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return min === max ? `可卖 ${num(min)} 银/条` : `可卖 ${num(min)}–${num(max)} 银/条`;
    };
    const sellQty = (count, name) => count > 1
        ? `<label class="cook-sell-qty">数量 <input class="inp" type="number" name="qty" min="1" max="${count}" step="1" value="1" inputmode="numeric" aria-label="售卖${esc(name)}的数量，最多${count}份"></label>`
        : `<input type="hidden" name="qty" value="1">`;
    const productButtons = productGroups.map((group) => {
        const item = group.items[0];
        const def = cookingProductById.get(group.itemId);
        const isFish = group.itemId === "fish:any";
        if (!isFish && !def?.cookable)
            return "";
        const refs = esc(JSON.stringify(group.items.map((entry) => entry.id)));
        const icon = cookingItemLayout(group.itemId) ?? { asset: "main", x: 0, y: 0 };
        const name = isFish ? "鲜鱼" : item.name;
        return `<button type="button" class="cook-pick" data-cook-key="${esc(group.itemId)}" data-cook-refs="${refs}" data-cook-stock="${group.items.length}" data-cook-name="${esc(name)}" data-cook-x="${icon.x}" data-cook-y="${icon.y}" data-cook-asset="${isFish ? "fish" : icon.asset}" aria-pressed="false">
      <span class="cook-pick-qty" aria-hidden="true">×${group.items.length}</span>${cookingItemSprite(group.itemId, name)}<span class="cook-pick-name">${esc(name)}</span><span class="cook-pick-stock">库存 ${group.items.length} · ${productValueText(group.items)}</span></button>`;
    }).join("");
    const ingredientButtons = view.ownedIngredients.map((item) => {
        const icon = cookingItemLayout(item.id) ?? { asset: "main", x: 0, y: 0 };
        return `<button type="button" class="cook-pick" data-cook-key="${esc(item.id)}" data-cook-ref="${esc(item.id)}" data-cook-stock="${item.qty}" data-cook-name="${esc(item.name)}" data-cook-x="${icon.x}" data-cook-y="${icon.y}" data-cook-asset="${icon.asset}" aria-pressed="false">
      ${cookingItemSprite(item.id, item.name)}<span class="cook-pick-name">${esc(item.name)}</span><span class="cook-pick-stock">库存 ${item.qty}</span></button>`;
    }).join("");
    const selection = productButtons || ingredientButtons
        ? `${productButtons}${ingredientButtons}`
        : `<div class="small muted" style="grid-column:1/-1;padding:12px;text-align:center">食材柜还是空的。先去牧场收动物产物，或在右边食材铺买一点。</div>`;
    const cookingItemName = (id) => id === "fish:any" ? "任意鱼" : cookingProductById.get(id)?.name ?? cookingIngredientById.get(id)?.name ?? id;
    const recipeAvailability = (recipe) => {
        const products = [...view.products];
        const counts = Object.fromEntries(view.ownedIngredients.map((item) => [item.id, item.qty]));
        const items = [];
        const missing = new Map();
        for (const id of recipe.ingredients) {
            const productIndex = products.findIndex((item) => item.itemId === id);
            const itemName = cookingItemName(id);
            const icon = id === "fish:any" ? { asset: "fish", x: 0, y: 0 } : cookingItemLayout(id) ?? { asset: "main", x: 0, y: 0 };
            if (productIndex >= 0) {
                const product = products.splice(productIndex, 1)[0];
                items.push({ ref: product.id, key: id, name: product.name || itemName, x: icon.x, y: icon.y, asset: icon.asset });
            }
            else if ((counts[id] ?? 0) > 0) {
                counts[id] -= 1;
                items.push({ ref: id, key: id, name: itemName, x: icon.x, y: icon.y, asset: icon.asset });
            }
            else {
                missing.set(id, (missing.get(id) ?? 0) + 1);
            }
        }
        return { items, missing: [...missing].map(([id, qty]) => `${cookingItemName(id)}×${qty}`) };
    };
    const recipeCategories = ["主食小吃", "热菜", "汤羹", "甜品点心", "饮品"];
    const shownRecipeCategories = recipeCategories.filter((category) => view.knownRecipes.some((recipe) => recipe.category === category));
    const recipeEntry = (recipe) => {
        const availability = recipeAvailability(recipe);
        const ingredientCounts = new Map();
        for (const id of recipe.ingredients)
            ingredientCounts.set(id, (ingredientCounts.get(id) ?? 0) + 1);
        const ingredients = [...ingredientCounts].map(([id, qty]) => `${cookingItemName(id)}×${qty}`).join("、");
        const action = availability.missing.length
            ? `<div class="cook-recipe-missing">缺少：${esc(availability.missing.join("、"))}</div>`
            : `<button class="btn cook-recipe-make" type="button" data-recipe-items="${esc(JSON.stringify(availability.items))}">一键制作</button>`;
        return `<div class="cook-recipe-entry">${dishSprite(recipe.id, recipe.name)}<div><div class="cook-recipe-head"><b>${esc(recipe.name)}</b>${rarityDot(recipe.rarity)}</div><div class="cook-recipe-needs"><b>配方：</b>${esc(ingredients)}</div>${action}</div></div>`;
    };
    const recipeTabs = shownRecipeCategories.map((category, index) => `<button class="cook-recipe-cat" type="button" data-recipe-category-tab="${esc(category)}" aria-selected="${index === 0 ? "true" : "false"}">${esc(category)}</button>`).join("");
    const recipeRows = shownRecipeCategories.length
        ? shownRecipeCategories.map((category, index) => `<div class="cook-recipe-section" data-recipe-category="${esc(category)}"${index === 0 ? "" : " hidden"}><div class="cook-recipe-grid">${view.knownRecipes.filter((recipe) => recipe.category === category).map(recipeEntry).join("")}</div></div>`).join("")
        : `<p class="small muted">还没有解锁食谱；购买食谱或试出正确组合后会显示在这里。</p>`;
    const recipeModal = `<div class="mback cook-recipe-back" id="cookRecipeBack" role="dialog" aria-modal="true" aria-labelledby="cookRecipeTitle"><div class="sheet cook-recipe-sheet"><button type="button" class="x" data-close-recipes aria-label="关闭" style="border:0;background:none;padding:0">✕</button><h2 class="mt" id="cookRecipeTitle">📖 已解锁食谱 ${view.knownRecipes.length}/${cooking.recipes.length}</h2>${recipeTabs ? `<div class="cook-recipe-cats" role="tablist" aria-label="食谱分类">${recipeTabs}</div>` : ""}<div class="cook-recipe-list" id="cookRecipeList">${recipeRows}</div></div></div>`;
    const stage = `<section class="card cook-stage-card"><div class="cook-stage" id="cookStage" aria-label="俯视料理灶台">
      <img class="cook-pot" src="${BASE}/assets/cooking/cooking-pot.webp?v=20260804a" alt="像素铁锅">
      <div class="cook-fire" aria-hidden="true"></div><div class="cook-sparks" aria-hidden="true"></div>
      <img class="cook-lid" src="${BASE}/assets/cooking/pot-lid.webp?v=20260804a" alt="" aria-hidden="true">
      <div class="cook-pot-items" id="cookPotItems" aria-live="polite"></div>
      <div class="cook-counter"><span id="cookCount">0</span>/5 · 点下方槽位可取出</div>
    </div></section>`;
    const cookPanel = `<div class="card"><h3>🧺 食材柜　<span class="muted small" style="font-weight:400">点一下放进锅，最多 5 份</span></h3>
      <div class="cook-pick-grid" id="cookPicker">${selection}</div>
      <form method="post" action="${base}/cook" id="cookForm"><input type="hidden" name="items" id="cookItems" value="[]">
        <div class="cook-actions"><button class="btn" id="cookStart" type="submit" disabled>🔥 开火</button><button class="btn ghost" id="cookClear" type="button">清空锅</button><span class="small muted">正确组合必定成功并解锁；错误组合会消耗全部食材，得到微妙的料理。</span></div>
      </form></div>`;
    const cookScript = `<script>(()=>{
      const picker=document.getElementById("cookPicker"),pot=document.getElementById("cookPotItems"),hidden=document.getElementById("cookItems"),count=document.getElementById("cookCount"),start=document.getElementById("cookStart"),clear=document.getElementById("cookClear"),form=document.getElementById("cookForm"),stage=document.getElementById("cookStage"),recipeBack=document.getElementById("cookRecipeBack"),recipeList=document.getElementById("cookRecipeList"),openRecipes=document.querySelector("[data-open-recipes]"),recipeTabs=recipeBack?[...recipeBack.querySelectorAll("[data-recipe-category-tab]")]:[];
      if(!picker||!pot||!form)return;let chosen=[];
      const buttons=()=>[...picker.querySelectorAll("[data-cook-key]")];
      const recipeButtons=()=>recipeList?[...recipeList.querySelectorAll("[data-recipe-items]")]:[];
      const closeRecipes=()=>{recipeBack?.classList.remove("show");openRecipes?.focus();};
      const showRecipeCategory=category=>{for(const tab of recipeTabs)tab.setAttribute("aria-selected",tab.dataset.recipeCategoryTab===category?"true":"false");for(const section of recipeList?.querySelectorAll("[data-recipe-category]")||[])section.hidden=section.dataset.recipeCategory!==category;};
      function removeChoice(index){if(!Number.isInteger(index)||index<0||index>=chosen.length)return;chosen.splice(index,1);render();}
      function render(){hidden.value=JSON.stringify(chosen.map(x=>x.ref));count.textContent=String(chosen.length);start.disabled=chosen.length<2;
        pot.innerHTML=Array.from({length:5},(_,i)=>{const item=chosen[i];const iconClass=item?(item.asset==='fish'?' fish-item-icon':item.asset==='second'?' second-item-icon':''):'';return item?'<button type="button" class="cook-pot-slot" data-remove="'+i+'" title="取出'+item.name+'" aria-label="从第'+(i+1)+'个槽位取出'+item.name+'"><span class="cook-slot-icon'+iconClass+'" style="--item-x:'+item.x+';--item-y:'+item.y+'" aria-hidden="true"></span></button>':'<span class="cook-pot-slot empty" aria-hidden="true"></span>';}).join("");
        for(const slot of pot.querySelectorAll("[data-remove]"))slot.addEventListener("click",()=>removeChoice(Number(slot.dataset.remove)));
        for(const b of buttons()){const used=chosen.filter(x=>x.key===b.dataset.cookKey).length;b.setAttribute("aria-pressed",used>0?"true":"false");b.disabled=used>=Number(b.dataset.cookStock||1)||chosen.length>=5;}
      }
      picker.addEventListener("click",e=>{const b=e.target.closest("[data-cook-key]");if(!b||b.disabled||chosen.length>=5)return;const key=b.dataset.cookKey,used=chosen.filter(x=>x.key===key).length,refs=b.dataset.cookRefs?JSON.parse(b.dataset.cookRefs):null,ref=refs?refs[used]:b.dataset.cookRef;if(!ref)return;chosen.push({ref,key,name:b.dataset.cookName,x:b.dataset.cookX,y:b.dataset.cookY,asset:b.dataset.cookAsset||'main'});render();});
      recipeList?.addEventListener("click",e=>{const b=e.target.closest("[data-recipe-items]");if(!b||b.disabled)return;try{const items=JSON.parse(b.dataset.recipeItems);if(!Array.isArray(items)||items.length<2)return;chosen=items;render();closeRecipes();form.requestSubmit();}catch{}});
      for(const tab of recipeTabs)tab.addEventListener("click",()=>showRecipeCategory(tab.dataset.recipeCategoryTab));
      openRecipes?.addEventListener("click",()=>{recipeBack?.classList.add("show");recipeBack?.querySelector("[data-close-recipes]")?.focus();});
      recipeBack?.addEventListener("click",e=>{if(e.target===recipeBack||e.target.closest("[data-close-recipes]"))closeRecipes();});
      document.addEventListener("keydown",e=>{if(e.key==="Escape"&&recipeBack?.classList.contains("show"))closeRecipes();});
      clear.addEventListener("click",()=>{chosen=[];render();});
      document.addEventListener("farm:cooking-updated",()=>{chosen=[];render();});
      form.addEventListener("submit",e=>{if(chosen.length<2){e.preventDefault();return;}e.preventDefault();start.disabled=true;start.textContent="🍳 烹饪中…";clear.disabled=true;for(const b of [...buttons(),...recipeButtons()])b.disabled=true;stage.classList.remove("is-cooking");void stage.offsetWidth;stage.classList.add("is-cooking");const wait=matchMedia("(prefers-reduced-motion: reduce)").matches?320:1650;setTimeout(()=>form.submit(),wait);});
      render();
    })();</script>`;
    const ingredientShop = view.ingredients.map((item) => {
        const left = item.dailyBuyLimit - item.bought;
        const can = left > 0 && f.silver >= item.price;
        return `<div class="cook-stock-row line small"><span>${esc(item.emoji)} <b>${esc(item.name)}</b>　<span class="muted">${silverIcon}${num(item.price)} · 有 ${item.owned} · 今日 ${item.bought}/${item.dailyBuyLimit}</span></span>
      <form method="post" action="${base}/buy-ingredient" data-cooking-async style="margin:0"><input type="hidden" name="id" value="${esc(item.id)}"><input type="hidden" name="qty" value="1"><button class="btn ghost" type="submit"${can ? "" : " disabled"}>买 1 份</button></form></div>`;
    }).join("");
    const recipeShop = view.recipeOffers.length ? view.recipeOffers.map((recipe) => {
        const can = !recipe.known && f.silver >= recipe.price;
        return `<div class="cook-stock-row line small"><span>${rarityDot(recipe.rarity)} <b>${esc(recipe.name)}</b>　<span class="muted">${silverIcon}${num(recipe.price)}</span></span>
      <form method="post" action="${base}/buy-recipe" data-cooking-async style="margin:0"><input type="hidden" name="id" value="${esc(recipe.id)}"><button class="btn ghost" type="submit"${can ? "" : " disabled"}>${recipe.known ? "已解锁" : "买食谱"}</button></form></div>`;
    }).join("") : `<p class="small muted">今天没有未知食谱可卖；正确试做仍能直接解锁。</p>`;
    const shopCard = `<div class="card" id="cookingShop"><h3>🛒 今日料理铺　<span class="muted small" style="font-weight:400">UTC+8 零点换货</span></h3>
      <div class="tags" style="margin:0 0 8px"><span class="tag">${silverIcon} 银币 <b>${num(f.silver)}</b></span><span class="tag">盐／面粉／砂糖 <b>${stapleDailyBuyLimit}</b> · 其他食材 <b>${rotatingDailyBuyLimit}</b></span><span class="tag">每日未知食谱 <b>2</b></span></div>
      <details open><summary><b>食材铺 · 基础常驻 + 每日 6 种</b></summary><div class="cook-stock-list">${ingredientShop}</div></details>
      <details style="margin-top:10px"><summary><b>食谱铺</b></summary>${recipeShop}</details></div>`;
    const productRows = pantryGroups.length ? pantryGroups.map((group) => {
        const item = group.items[0];
        const def = cookingProductById.get(group.itemId);
        const isFish = group.itemId === "fish:any";
        const name = item.name;
        const sellAction = isFish ? `${base}/sell-fish` : `${base}/sell`;
        const valueText = isFish ? fishSaleValueText(group.items) : productValueText(group.items);
        return `<div class="cook-stock-row line small"><span>${esc(item.emoji || def?.emoji || "📦")} <b>${esc(name)} ×${group.items.length}</b>　<span class="muted">${isFish || def?.cookable ? "可下锅 · " : "不可下锅 · "}${valueText}</span></span>
      <form class="cook-sell-form" method="post" action="${sellAction}" data-cooking-async><input type="hidden" name="itemIds" value="${sellIds(group.items)}">${isFish ? "" : `<input type="hidden" name="to" value="system">`}${sellQty(group.items.length, name)}<button class="btn ghost" type="submit">${isFish ? "卖鱼" : "系统回收"}</button></form></div>`;
    }).join("") : view.ownedIngredients.length ? "" : `<p class="small muted">还没有鱼获或牧场产物。</p>`;
    const allFish = view.products.filter((item) => item.source === "fish");
    const sellAllFish = allFish.length
        ? `<form class="cook-sell-form" method="post" action="${base}/sell-fish" data-cooking-async style="margin:0"><input type="hidden" name="itemIds" value="${sellIds(allFish)}"><input type="hidden" name="qty" value="${allFish.length}"><button class="btn ghost" type="submit">全部卖鱼</button></form>`
        : "";
    const treasures = fishingTreasureInventory(f);
    const treasureRows = treasures.length ? treasures.map((item) => `<div class="cook-stock-row line small"><span>🎁 <b>${esc(item.name)} ×${item.qty}</b>　<span class="muted">可卖 ${num(item.sellSilver)} 银/份</span></span>
      <form class="cook-sell-form" method="post" action="${base}/sell-treasure" data-cooking-async><input type="hidden" name="itemId" value="${esc(item.id)}">${sellQty(item.qty, item.name)}<button class="btn ghost" type="submit">卖财宝</button></form></div>`).join("") : `<p class="small muted">鱼篓里暂时没有可出售的财宝。</p>`;
    const ingredientRows = view.ownedIngredients.map((item) => `<div class="cook-stock-row line small"><span style="display:flex;align-items:center;gap:8px">${cookingItemSprite(item.id, item.name)}<b>${esc(item.name)} ×${item.qty}</b></span>
      <form class="cook-sell-form" method="post" action="${base}/sell" data-cooking-async><input type="hidden" name="itemId" value="${esc(item.id)}"><input type="hidden" name="to" value="market">${sellQty(item.qty, item.name)}<input class="inp cook-price" type="number" name="price" min="1" step="1" placeholder="每份银币价" aria-label="每份银币价" required><button class="btn ghost" type="submit">摆摊</button></form></div>`).join("");
    const dishGroups = [];
    for (const dish of view.dishes) {
        const key = dish.recipeId || dish.name;
        let group = dishGroups.find((entry) => entry.key === key);
        if (!group) {
            group = { key, dishes: [] };
            dishGroups.push(group);
        }
        group.dishes.push(dish);
    }
    const dishRows = dishGroups.length ? dishGroups.map((group) => {
        const dish = group.dishes[0];
        const odd = dish.recipeId === "odd_dish";
        const image = dishSprite(odd ? "odd_dish" : dish.recipeId, dish.name);
        const values = group.dishes.map((item) => Number(item.value) || 0);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const valueText = minValue === maxValue ? num(minValue) : `${num(minValue)}–${num(maxValue)}`;
        const silverValues = group.dishes.map((item) => Number(item.recycleSilver) || 0);
        const minSilver = Math.min(...silverValues);
        const maxSilver = Math.max(...silverValues);
        const silverText = minSilver === maxSilver ? num(minSilver) : `${num(minSilver)}–${num(maxSilver)}`;
        const use = odd
            ? `<form method="post" action="${base}/use" style="margin:0"><input type="hidden" name="dishId" value="${esc(dish.id)}"><input type="hidden" name="target" value="self"><button class="btn ghost" type="submit">立即让 AI 吃</button></form>`
            : `<form method="post" action="${base}/use" style="display:flex;gap:5px;margin:0"><input type="hidden" name="dishId" value="${esc(dish.id)}"><button class="btn ghost" name="target" value="cat" type="submit">喂猫</button><button class="btn ghost" name="target" value="dog" type="submit">喂狗</button></form>`;
        const itemIds = sellIds(group.dishes);
        const market = odd ? "" : `<form class="cook-sell-form" method="post" action="${base}/sell" data-cooking-async><input type="hidden" name="itemIds" value="${itemIds}"><input type="hidden" name="to" value="market">${sellQty(group.dishes.length, dish.name)}<input class="inp cook-price" type="number" name="price" min="1" step="1" placeholder="每份银币价" aria-label="每份银币价" required><button class="btn ghost" type="submit">摆摊</button></form>`;
        return `<div class="cook-stock-row"><div style="display:grid;grid-template-columns:54px minmax(0,1fr);gap:9px;align-items:center">${image}<div><b>${esc(dish.name)} ×${group.dishes.length}</b> ${rarityDot(dish.rarity)}<div class="small muted">锁定系统回收价 ${valueText} 牧场金币${odd ? " · 禁止摆摊/喂宠物/贿赂" : ` + ${silverIcon}${silverText} 银`}</div></div></div>
        <div class="cook-actions" style="margin-top:7px">${use}<form class="cook-sell-form" method="post" action="${base}/sell" data-cooking-async><input type="hidden" name="itemIds" value="${itemIds}"><input type="hidden" name="to" value="system">${sellQty(group.dishes.length, dish.name)}<button class="btn ghost" type="submit">系统回收</button></form>${market}</div></div>`;
    }).join("") : `<p class="small muted">锅还没开过，料理柜空着。</p>`;
    const pantryCard = `<div class="card" id="cookingPantry"><div class="line" style="flex-wrap:wrap"><h3 style="margin:0">📦 食材柜　<span class="muted small" style="font-weight:400">牧场金币 ${num(ranchCoins)}</span></h3>${sellAllFish}</div><div class="cook-stock-list">${productRows}${ingredientRows}</div><div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)"><b>🎁 鱼篓财宝</b><div class="cook-stock-list">${treasureRows}</div></div></div>`;
    const dishesCard = `<div class="card" id="cookingDishes"><h3>🍲 料理柜　<span class="muted small" style="font-weight:400">${view.dishes.length} 份</span></h3><div class="cook-stock-list">${dishRows}</div></div>`;
    const debuff = view.debuff ? `<div class="flash">🥴 AI 当前效果：${esc(view.debuff.name)}（剩 ${fmtDur(view.debuff.until - now)}）。只影响 AI 使用农场工具，人类操作不受影响。</div>` : "";
    let resultHtml = "";
    if (resultRaw) {
        try {
            const result = JSON.parse(resultRaw);
            const recipeId = result.odd ? "odd_dish" : (result.recipeId ?? String(result.image ?? "").replace(/\.webp$/, ""));
            const image = dishSprite(recipeId, result.name, "cook-result-image");
            const qixi = result.qixi;
            const completion = qixi?.completed ? `✅ 已解锁「${esc(qixi.cropName)}」，并获得种子 ×1。去商店购买更多七夕限定种子吧。` : "";
            resultHtml = `<div class="cook-result" id="cookResult" role="dialog" aria-modal="true" aria-labelledby="cookResultTitle"><div class="cook-result-card" style="--rarity:var(${RARITY_VAR[result.rarity] ?? "--N"})"><button class="cook-result-x" type="button" data-close-result aria-label="关闭">✕</button>${image}<div class="cook-rarity">${esc(result.rarity)}</div><h2 id="cookResultTitle">${qixi ? "已自动提交" : esc(result.name)}</h2><p class="small muted">${qixi ? `黄油曲奇 ×1 已提交至七夕任务。<br>任务进度：${num(qixi.progress)}/${num(qixi.target)}` : result.odd ? "没有命中固定配方 · 微妙的料理" : `锁定系统回收价 ${num(result.value)} 牧场金币 + ${silverIcon}${num(result.recycleSilver)} 银${result.discovered ? " · 新食谱已解锁" : ""}`}</p>${completion ? `<p class="small" style="color:var(--leaf-deep);white-space:pre-wrap">${completion}</p>` : ""}<button class="btn" type="button" data-close-result>${qixi ? "知道了" : "收进料理柜"}</button></div></div><script>(()=>{const box=document.getElementById("cookResult");if(!box)return;const u=new URL(location.href);u.searchParams.delete("result");history.replaceState(null,"",u);const close=()=>box.remove();box.addEventListener("click",e=>{if(e.target===box||e.target.closest("[data-close-result]"))close()});addEventListener("keydown",e=>{if(e.key==="Escape")close()},{once:true});})();</script>`;
        }
        catch { /* 忽略损坏的结果参数 */ }
    }
    const plaque = `<div class="plaque"><h1>🍳 料理台</h1><p class="welcome">“从食材柜点几样放进锅里，盖上木盖，听它噼里啪啦。”</p><div class="tags"><span class="tag">${silverIcon} 银币 <b id="cookingSilverBalance">${num(f.silver)}</b></span><span class="tag">💰 牧场金币 <b id="cookingRanchBalance">${num(ranchCoins)}</b></span><button class="tag cook-recipe-trigger" type="button" data-open-recipes aria-haspopup="dialog">📖 食谱 <b id="cookingRecipeCount">${view.knownRecipes.length}/${cooking.recipes.length}</b></button></div></div><div id="cookingFeedback">${flashHtml}${debuff}</div>`;
    const body = `${plaque}<div class="cook-layout"><div>${stage}${cookPanel}</div><div class="grid">${shopCard}</div></div><div class="grid c2">${pantryCard}${dishesCard}</div>${recipeModal}${cookScript}${resultHtml}`;
    return page(`${f.name} · 料理台`, key, "cooking", body, farmNames(f));
}
