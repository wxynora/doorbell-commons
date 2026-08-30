/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import type { BoundFarmField } from "../auth/auth-client";
import {
  FARM_ASSET_MANIFEST,
  getCookingIngredientAsset,
  getCookingRecipeAsset,
  getFarmAsset,
  getFarmEnvironmentAssetUrl,
  getRanchAnimalAsset,
  getSmeltingMaterialAsset,
  RANCH_ANIMAL_ASSET_KEYS,
} from "./farm-asset-manifest";
import {
  COOKING_CATALOG_INGREDIENTS,
  COOKING_CATALOG_RECIPES,
  COOKING_INGREDIENT_CATEGORIES,
  COOKING_RECIPE_CATEGORIES,
} from "./farm-cooking-catalog";
import {
  FARM_CROP_CATALOG,
  FARM_CROP_CATEGORIES,
  FARM_CROP_RARITY_ORDER,
} from "./farm-crop-catalog";
import {
  farmFieldIssueMessage,
  farmHarvestAssistIssueMessage,
  summarizeFarmPlots,
} from "./farm-overview";

const FIELD: BoundFarmField = {
  data: {
    farm: {
      farm_doorplate: "3ET3FE",
      farm_name: "渡的小农场",
      welcome_message: "今天也慢慢来。",
      equipped_title: { title_id: "title-sprout", name: "新芽守望者" },
    },
    balance: { farm_coins: 0 },
    season: { id: "summer", name: "夏" },
    weather: { condition: "light_rain" },
    land: { tier: 2, name: "沃土" },
    plots: [
      {
        plot_id: 1,
        seed_type: null,
        state: "empty",
        watered: 0,
        progress: null,
        matures_at: null,
        identity_state: "empty",
        crop_identity: null,
      },
      {
        plot_id: 2,
        seed_type: "common",
        state: "growing",
        watered: 2,
        progress: { current: 3, total: 8 },
        matures_at: "2026-08-23T08:30:00.000Z",
        identity_state: "hidden",
        crop_identity: null,
      },
      {
        plot_id: 3,
        seed_type: "fantasy",
        state: "ripe",
        watered: 3,
        progress: { current: 8, total: 8 },
        matures_at: null,
        identity_state: "hidden",
        crop_identity: null,
      },
      {
        plot_id: 4,
        seed_type: "limited",
        state: "growing",
        watered: 1,
        progress: { current: 2, total: 10 },
        matures_at: "2026-08-23T09:00:00.000Z",
        identity_state: "known",
        crop_identity: { crop_id: "moon-bloom", name: "月光花", category: "limited" },
      },
      {
        plot_id: 5,
        seed_type: "limited",
        state: "growing",
        watered: 1,
        progress: { current: 1, total: 10 },
        matures_at: "2026-08-23T09:30:00.000Z",
        identity_state: "unavailable",
        crop_identity: null,
      },
    ],
    harvest_assist: {
      daily_limit: 3,
      remaining: 2,
      mature_plot_count: 9,
      can_assist: true,
      reset_at: "2026-08-24T16:00:00.000Z",
    },
  },
  revision: "field-v1:test",
  server_time: "2026-08-23T08:00:00.000Z",
};

function readFarmStyles() {
  return [
    "./farm-page.css",
    "./panels/bulletin-panel.css",
    "./panels/tool-panel.css",
    "./panels/shop-panel.css",
  ]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");
}

const FARM_PANEL_SOURCE_PATHS = {
  bulletin: ["./panels/bulletin-panel.tsx"],
  shop: [
    "./panels/shop-panel.tsx",
    "./panels/shop/model.ts",
    "./panels/shop/shared.tsx",
    "./panels/shop/cooking-shop.tsx",
    "./panels/shop/ranch-shop.tsx",
  ],
  tool: [
    "./panels/tool-panel.tsx",
    "./panels/tools/types.ts",
    "./panels/tools/common.tsx",
    "./panels/tools/backpack-panel.tsx",
    "./panels/tools/cooking-recipe-catalog.tsx",
    "./panels/tools/original-plant-creator.tsx",
    "./panels/tools/remote-panels.tsx",
    "./panels/tools/settings-panel.tsx",
    "./panels/tools/smelting-panel.tsx",
  ],
} as const;

function readFarmSourceFiles(paths: readonly string[]) {
  return paths.map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
}

function readFarmPanelSource(panel: keyof typeof FARM_PANEL_SOURCE_PATHS) {
  return readFarmSourceFiles(FARM_PANEL_SOURCE_PATHS[panel]);
}

function readFarmSources() {
  return [
    readFileSync(new URL("./farm-page.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("./page/farm-field-content.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("./page/live-farm-page.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("./dev/farm-tool-layouts.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./dev/farm-tool-editor.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("./page/model.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./page/chrome.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("./page/action-feedback.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("./page/ranch-resident-detail.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("./page/cooking/model.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./page/cooking/prep-overlay.tsx", import.meta.url), "utf8"),
    readFarmPanelSource("bulletin"),
    readFarmPanelSource("tool"),
    readFarmPanelSource("shop"),
    readFileSync(new URL("./panels/ranch-animal-data.ts", import.meta.url), "utf8"),
  ].join("\n");
}

test("farm page facade keeps its stylesheet and FarmFieldContent compatibility export", () => {
  const source = readFileSync(new URL("./farm-page.tsx", import.meta.url), "utf8");

  assert.match(source, /import "\.\/farm-page\.css";/);
  assert.match(source, /export \{ FarmFieldContent \} from "\.\/page\/farm-field-content";/);
  assert.match(source, /<FarmLazyBoundary[\s\S]*<FarmLazyFailure/);
});

test("farm field summarizes only the plots returned by the server", () => {
  assert.deepEqual(summarizeFarmPlots(FIELD.data.plots), {
    empty: 1,
    growing: 3,
    ripe: 1,
  });
  assert.equal(FIELD.data.balance.farm_coins, 0);
  assert.notEqual(
    FIELD.data.harvest_assist.mature_plot_count,
    FIELD.data.plots.filter((plot) => plot.state === "ripe").length,
  );
});

test("live farm reads only the strict field endpoint while preview keeps its isolated fixture", () => {
  const authClientSource = readFileSync(new URL("../auth/auth-client.ts", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("./page/live-farm-page.tsx", import.meta.url), "utf8");
  const migratedSource = `${authClientSource}\n${appSource}\n${pageSource}`;

  assert.match(authClientSource, /fetcher\("\/api\/farm\/field"/);
  assert.doesNotMatch(
    migratedSource,
    /\/api\/farm\/overview|BoundFarmOverview|getBoundFarmOverview/,
  );
  assert.match(
    pageSource,
    /const result = await getBoundFarmField\(\{ signal: controller\.signal \}\)/,
  );
  assert.match(
    pageSource,
    /if \(previewData\) \{[\s\S]*setState\(\{ stage: "ready", data: previewData \}\)[\s\S]*return/,
  );
  assert.match(appSource, /const candidateTwoFarmPreview: BoundFarmField =/);
  assert.match(appSource, /plots: candidateTwoFarmPreviewPlots/);
  assert.match(
    appSource,
    /identity_state:[\s\S]*seedType === "limited" \? "unavailable" : "hidden"/,
  );
});

test("live resource failures stay visible and cooking instance identities stay authoritative", () => {
  const source = readFarmSourceFiles([
    "./page/farm-field-content.tsx",
    "./page/live-farm-page.tsx",
    "./page/cooking/model.ts",
  ]);

  assert.match(source, /activeResourceState\?\.stage === "error"/);
  assert.match(source, /className="farm-tool-notice" role="alert"/);
  assert.match(source, /requestedResourcesRef\.current\.delete\(resource\)/);
  assert.match(source, /const selectionId = `product:\$\{product\.product_instance_id\}`/);
  assert.match(source, /const selectionId = `fish:\$\{catchItem\.catch_instance_id\}`/);
  assert.match(source, /categoryId: "ranch-products"/);
  assert.match(source, /categoryId: "fish"/);
  assert.match(source, /entityId: `fish:\$\{catchItem\.fish_id\}`/);
  assert.doesNotMatch(source, /selectionIds: \[product\.product_id\]/);
  assert.doesNotMatch(source, /selectionIds: \[catchItem\.fish_id\]/);
});

test("field scene maps only seed class and authority identity without revealing hidden crops", () => {
  const fieldSceneSource = readFileSync(
    new URL("./scenes/field/field-scene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    fieldSceneSource,
    /common:[\s\S]*field\.crop\.ordinary-growing[\s\S]*field\.crop\.ordinary-ripe/,
  );
  assert.match(
    fieldSceneSource,
    /fantasy:[\s\S]*field\.crop\.fantasy-growing[\s\S]*field\.crop\.fantasy-ripe/,
  );
  assert.match(
    fieldSceneSource,
    /limited:[\s\S]*field\.crop\.limited-growing[\s\S]*field\.crop\.limited-ripe/,
  );
  assert.match(
    fieldSceneSource,
    /plot\.identity_state === "known" && plot\.crop_identity[\s\S]*return plot\.crop_identity\.name/,
  );
  assert.match(fieldSceneSource, /plot\.identity_state === "unavailable"[\s\S]*作物资料暂时不可用/);
  assert.match(fieldSceneSource, /return FARM_SEED_TYPE_LABELS\[plot\.seed_type\]/);
  assert.doesNotMatch(fieldSceneSource, /crop_identity\.crop_id|Date\.now|setInterval/);
  assert.match(
    fieldSceneSource,
    /selectedPlot\.progress\.current[\s\S]*selectedPlot\.progress\.total/,
  );
  assert.match(fieldSceneSource, /selectedPlot\.matures_at[\s\S]*formatMaturesAt/);
});

test("farm asset manifest resolves stable identities without keeping layout indexes in content", () => {
  const source = readFarmSources();
  const registeredAssets = Object.entries(FARM_ASSET_MANIFEST);

  assert.ok(registeredAssets.length > 0);
  for (const [assetKey, entry] of registeredAssets) {
    assert.equal(getFarmAsset(assetKey as keyof typeof FARM_ASSET_MANIFEST).assetKey, assetKey);
    assert.ok(entry.entityId.length > 0);
    assert.ok(entry.visualState.length > 0);
    assert.ok(entry.pixelWidth > 0);
    assert.ok(entry.pixelHeight > 0);
    assert.ok(entry.aspectRatio > 0);
    assert.ok(["production", "fallback", "missing"].includes(entry.status));
    assert.ok(["wired", "demo", "editor"].includes(entry.usage));
  }

  assert.equal(Object.keys(RANCH_ANIMAL_ASSET_KEYS).length, 18);
  assert.equal(getRanchAnimalAsset("chicken")?.atlasFrame?.column, 0);
  assert.equal(getRanchAnimalAsset("dog")?.atlasFrame?.row, 3);
  assert.equal(getRanchAnimalAsset("goat")?.url, "/farm/animals/goat-codex.png");
  assert.equal(getRanchAnimalAsset("alpaca")?.url, "/farm/animals/alpaca-codex.png");
  assert.equal(getRanchAnimalAsset("unknown"), undefined);
  assert.equal(getCookingIngredientAsset("fish:carp")?.entityId, "fish:carp");
  assert.doesNotMatch(source, /spriteIndex/);
  assert.doesNotMatch(source, /src="\/farm\//);
});

test("crop codex mirrors the authoritative built-in crop names as a text-only catalog", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();
  const catalogSource = readFileSync(new URL("./farm-crop-catalog.ts", import.meta.url), "utf8");
  const actionPanelSource = readFileSync(
    new URL("./panels/farm-action-panels.tsx", import.meta.url),
    "utf8",
  );
  const authoritativeCrops = JSON.parse(
    readFileSync(new URL("../../../../old-vps/farm/content/crops.json", import.meta.url), "utf8"),
  ) as Array<{ id: string; name: string; category: string; rarity: string }>;
  const codexSource =
    actionPanelSource.match(
      /export function FarmCropCodex[\s\S]*?(?=export function FarmExpeditionPanelContent)/,
    )?.[0] ?? "";

  assert.equal(FARM_CROP_CATALOG.length, 171);
  assert.deepEqual(
    FARM_CROP_CATALOG,
    authoritativeCrops.map(({ category, id, name, rarity }) => ({ id, name, category, rarity })),
  );
  assert.deepEqual(
    FARM_CROP_CATEGORIES.map(({ id, label }) => [
      label,
      FARM_CROP_CATALOG.filter((crop) => crop.category === id).length,
    ]),
    [
      ["普通", 60],
      ["奇幻", 70],
      ["限定", 41],
    ],
  );
  assert.match(source, /activeScene === "field" && tool\.id === "crop-codex"/);
  assert.match(codexSource, /FARM_CROP_CATEGORIES\.map/);
  assert.match(codexSource, /categoryCrops\.map/);
  assert.match(
    codexSource,
    /FARM_CROP_RARITY_ORDER\[left\.rarity\] - FARM_CROP_RARITY_ORDER\[right\.rarity\]/,
  );
  for (const category of FARM_CROP_CATEGORIES) {
    const sortedRarities: number[] = FARM_CROP_CATALOG.filter(
      (crop) => crop.category === category.id,
    )
      .sort(
        (left, right) => FARM_CROP_RARITY_ORDER[left.rarity] - FARM_CROP_RARITY_ORDER[right.rarity],
      )
      .map((crop) => FARM_CROP_RARITY_ORDER[crop.rarity]);
    assert.deepEqual(
      sortedRarities,
      [...sortedRarities].sort((left, right) => left - right),
    );
  }
  assert.doesNotMatch(codexSource, /<img|Pagination|pageIndex|pageCount/);
  assert.doesNotMatch(catalogSource, /asset|sprite|url/i);
  assert.match(
    styles,
    /\.farm-crop-codex__list\s*\{[^}]*grid-template-columns:\s*repeat\(2[^}]*overflow-y:\s*auto/,
  );
  assert.match(styles, /\.farm-crop-codex__list li\s*\{[^}]*background:\s*transparent/);
});

test("cooking catalogs keep complete authoritative categories in fixed scrolling ranges", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();
  const cookingShopModuleSource = readFarmSourceFiles(["./panels/shop/cooking-shop.tsx"]);
  const cookingSharedModuleSource = readFarmSourceFiles(["./panels/shop/shared.tsx"]);
  const cookingShopSource = `${cookingShopModuleSource.slice(
    0,
    cookingShopModuleSource.indexOf("function cookingRecipeIngredientText"),
  )}\n${cookingSharedModuleSource.slice(
    cookingSharedModuleSource.indexOf("export function CookingSilverPrice"),
  )}`;
  const ingredientCatalogSource =
    cookingShopSource.match(
      /function CookingIngredientCatalog[\s\S]*?(?=function CookingSilverPrice)/,
    )?.[0] ?? "";
  const recipeCatalogSource =
    source.match(/function CookingRecipeCatalog[\s\S]*?(?=function CookingRecipeShop)/)?.[0] ?? "";
  const categoryCounts = Object.fromEntries(
    COOKING_RECIPE_CATEGORIES.map((category) => [
      category,
      COOKING_CATALOG_RECIPES.filter((recipe) => recipe.category === category).length,
    ]),
  );

  assert.equal(COOKING_CATALOG_INGREDIENTS.length, 25);
  assert.equal(COOKING_CATALOG_RECIPES.length, 90);
  assert.deepEqual(categoryCounts, {
    主食小吃: 12,
    汤羹: 9,
    热菜: 41,
    甜品点心: 17,
    饮品: 11,
  });
  assert.deepEqual(
    COOKING_INGREDIENT_CATEGORIES.map(({ label, ingredientIds }) => [label, ingredientIds.length]),
    [
      ["谷薯", 5],
      ["蔬果", 9],
      ["调味", 5],
      ["豆乳", 2],
      ["甜饮", 4],
    ],
  );
  const categorizedIngredientIds = COOKING_INGREDIENT_CATEGORIES.flatMap(
    ({ ingredientIds }) => ingredientIds,
  );
  assert.equal(new Set(categorizedIngredientIds).size, COOKING_CATALOG_INGREDIENTS.length);
  assert.deepEqual(
    [...categorizedIngredientIds].sort(),
    COOKING_CATALOG_INGREDIENTS.map(({ id }) => id).sort(),
  );

  for (const ingredient of COOKING_CATALOG_INGREDIENTS) {
    assert.ok(getCookingIngredientAsset(ingredient.id), `${ingredient.id} should have an asset`);
  }
  for (const recipe of COOKING_CATALOG_RECIPES) {
    assert.ok(getCookingRecipeAsset(recipe.id), `${recipe.id} should have an asset`);
  }

  assert.deepEqual(getCookingIngredientAsset("salt")?.atlasFrame, {
    column: 4,
    columns: 7,
    row: 2,
    rows: 6,
  });
  assert.deepEqual(getCookingIngredientAsset("soy_sauce")?.atlasFrame, {
    column: 1,
    columns: 4,
    row: 0,
    rows: 2,
  });
  assert.deepEqual(getCookingIngredientAsset("flour")?.atlasFrame, {
    column: 5,
    columns: 7,
    row: 2,
    rows: 6,
  });
  assert.deepEqual(getCookingIngredientAsset("rice")?.atlasFrame, {
    column: 0,
    columns: 7,
    row: 3,
    rows: 6,
  });
  assert.deepEqual(getCookingIngredientAsset("rainbow_corn")?.atlasFrame, {
    column: 0,
    columns: 7,
    row: 5,
    rows: 6,
  });
  assert.deepEqual(getCookingIngredientAsset("ginger")?.atlasFrame, {
    column: 2,
    columns: 4,
    row: 0,
    rows: 2,
  });
  assert.deepEqual(getCookingIngredientAsset("tofu")?.atlasFrame, {
    column: 2,
    columns: 4,
    row: 1,
    rows: 2,
  });
  assert.equal(
    getCookingRecipeAsset("pan_fried_fish")?.url,
    "/farm/cooking-catalog/fishing-cooking-atlas.png",
  );
  assert.equal(
    getCookingRecipeAsset("scallion_omelet")?.url,
    "/farm/cooking-catalog/dish-atlas-2.webp",
  );

  for (const assetName of [
    "ingredient-atlas.webp",
    "ingredient-atlas-2.webp",
    "dish-atlas.webp",
    "dish-atlas-2.webp",
    "fishing-cooking-atlas.png",
  ]) {
    assert.ok(
      statSync(new URL(`../../public/farm/cooking-catalog/${assetName}`, import.meta.url)).size > 0,
    );
  }

  assert.doesNotMatch(source, /COOKING_INGREDIENT_PAGE_SIZE/);
  assert.doesNotMatch(source, /COOKING_RECIPE_PAGE_SIZE/);
  assert.match(source, /const COOKING_SHOP_DAILY_RECIPE_COUNT = 2/);
  assert.match(
    source,
    /\["ingredients", "食材"\][\s\S]*\["recipes", "食谱"\][\s\S]*\["tools", "工具"\]/,
  );
  assert.match(source, /aria-label="食材分类"/);
  assert.match(source, /COOKING_INGREDIENT_CATEGORIES\.map/);
  assert.match(ingredientCatalogSource, /categoryIngredients\.map/);
  assert.doesNotMatch(
    ingredientCatalogSource,
    /CookingCatalogPagination|pageIndex|pageCount|pageIngredients|食材分页/,
  );
  assert.doesNotMatch(source, /ingredient\.staple \? "常备" : "轮换"/);
  assert.match(source, /COOKING_RECIPE_CATEGORIES\.map/);
  assert.match(recipeCatalogSource, /categoryRecipes\.map/);
  assert.doesNotMatch(
    recipeCatalogSource,
    /CookingCatalogPagination|pageIndex|pageCount|pageRecipes|食谱分页/,
  );
  assert.match(
    source,
    /<CookingRecipeShop cart=\{cart\} onChangeCartQuantity=\{onChangeCartQuantity\} \/>/,
  );
  assert.match(source, /function hasSelectedCookingRecipeIngredients/);
  assert.match(
    source,
    /canQuickMake=\{hasSelectedCookingRecipeIngredients\(recipe, selectedIngredientIds\)\}/,
  );
  assert.match(source, /className="cooking-recipe-catalog__quick-make"[\s\S]*一键制作/);
  assert.match(
    source,
    /<CookingRecipeCatalog[\s\S]*kitchen=\{kitchen \?\? null\}[\s\S]*preview=\{preview\}[\s\S]*selectedIngredientIds=\{selectedCookingIngredientIds\}/,
  );
  assert.match(source, /每日 2 道 · 北京时间 00:00 刷新/);
  assert.match(source, /<legend className="farm-visually-hidden">食材商店刷新状态<\/legend>/);
  assert.match(source, /liveRefresh\?\.refresh_used_count \?\? "—"/);
  assert.match(source, /liveRefresh\?\.refresh_limit \?\? 10/);
  assert.match(source, /farm-visually-hidden">下次刷新金币/);
  assert.match(source, /liveRefresh\?\.next_cost_coins \?\? "—"/);
  assert.match(
    source,
    /disabled=\{!onRefreshCookingShop \|\| !liveRefresh\?\.can_refresh \|\| refreshSubmitting\}/,
  );
  assert.match(source, /onClick=\{onRefreshCookingShop\}/);
  assert.match(source, /farm-visually-hidden">银币价格/);
  assert.match(source, /activeScene === "cooking" && tool\.id === "recipes"/);
  assert.match(
    source,
    /<CookingShopPanelContent[\s\S]*cart=\{cart\}[\s\S]*kitchen=\{kitchen\}[\s\S]*live[\s\S]*onChangeCartQuantity=\{onChangeCartQuantity\}/,
  );
  assert.match(source, /daily_shop\.is_current_day !== true/);
  assert.doesNotMatch(source, /购买成功|已加入购物车|料理完成/);
  assert.match(
    styles,
    /\.cooking-ingredient-catalog__grid\s*\{[^}]*grid-template-columns:\s*repeat\(4[^}]*grid-auto-rows:\s*auto[^}]*overflow-y:\s*auto/,
  );
  assert.doesNotMatch(
    styles,
    /\.cooking-ingredient-catalog__grid\s*\{[^}]*(?:width:\s*90%|justify-self:\s*center)/,
  );
  assert.match(
    styles,
    /\.cooking-ingredient-catalog__portrait \.cooking-catalog__sprite\s*\{[^}]*inset:\s*2%[^}]*width:\s*96%[^}]*height:\s*96%/,
  );
  assert.match(
    ingredientCatalogSource,
    /const cartKey = getShopCartKey\("ingredient", ingredient\.id\);[\s\S]*aria-label=\{`将\$\{ingredient\.name\}加入购物车`\}[\s\S]*className="cooking-ingredient-catalog__portrait"[\s\S]*onClick=\{\(\) => onChangeCartQuantity\(cartKey, 1, ingredient\.maxQuantity\)\}/,
  );
  assert.doesNotMatch(ingredientCatalogSource, /ShopCartAddButton/);
  assert.doesNotMatch(styles, /\.cooking-ingredient-catalog__portrait \.shop-cart__add/);
  assert.match(
    styles,
    /\.cooking-recipe-catalog__list\s*\{[^}]*grid-auto-rows:\s*14cqw[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/,
  );
  assert.match(styles, /\.cooking-recipe-catalog__list--shop\s*\{[^}]*repeat\(2, 18cqw\)/);
  assert.match(styles, /\.cooking-recipe-catalog__quick-make\s*\{[^}]*min-width:\s*14cqw/);
  assert.match(
    styles,
    /\.cooking-ingredient-catalog\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)[^}]*overflow:\s*hidden/,
  );
  assert.match(
    styles,
    /\.cooking-ingredient-catalog__refresh\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto/,
  );
  assert.match(
    styles,
    /\.cooking-ingredient-catalog__refresh-button\s*\{[^}]*width:\s*12cqw[^}]*height:\s*6cqw[^}]*border-radius:\s*1\.1cqw/,
  );
  assert.doesNotMatch(
    styles,
    /\.cooking-ingredient-catalog__refresh-button\s*\{[^}]*(?:min-height:\s*34px|border-radius:\s*999px)/,
  );
  assert.match(
    styles,
    /\.cooking-catalog__silver-coin\s*\{[^}]*border:\s*0\.35cqw solid #7f898b[^}]*#c7cdcc/,
  );
  assert.match(
    styles,
    /\.cooking-recipe-catalog\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)[^}]*overflow:\s*hidden/,
  );
});

test("expedition Human UI keeps the old journey sections while stable action ids stay hidden", () => {
  const source = readFileSync(new URL("./panels/farm-action-panels.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./panels/farm-action-panels.css", import.meta.url), "utf8");
  const expeditionSource =
    source.match(/const FARM_EXPEDITION_TABS[\s\S]*?(?=type RanchDispatchAvailable)/)?.[0] ?? "";

  assert.match(
    expeditionSource,
    /"当前旅程"[\s\S]*"行囊"[\s\S]*"本趟故事"[\s\S]*"秘境图鉴"[\s\S]*"旅程簿"/,
  );
  assert.match(
    expeditionSource,
    /expedition\.map_name[\s\S]*expedition\.step[\s\S]*expedition\.hp/,
  );
  assert.match(expeditionSource, /summarizeExpeditionBag\(expedition\.bag\)/);
  assert.match(expeditionSource, /bagRows\.map/);
  assert.match(expeditionSource, /expedition\.log\.map/);
  assert.match(expeditionSource, /expedition\.journeys\.map/);
  assert.match(expeditionSource, /expedition\.seen_event_ids\.length/);
  assert.match(
    expeditionSource,
    /currentAction\("choose", \{ option: option\.key \}, option\.label\)/,
  );
  assert.match(expeditionSource, />\s*\{option\.label\}\s*<\/button>/);
  assert.doesNotMatch(expeditionSource, />\s*\{option\.key\}\s*<\/button>/);
  assert.match(styles, /\.farm-expedition__content\s*\{[^}]*overflow-y:\s*auto/s);
});

test("farm page does not invent economy values or successful operations", () => {
  const source = readFarmSources();
  assert.doesNotMatch(source, /购买成功|收获成功|料理完成|动物数量/);
  assert.doesNotMatch(source, /真实概览/);
  assert.match(source, /executeBoundSmeltingAction\(input\)/);
  assert.doesNotMatch(source, /farm-game__identity/);
});

test("farm scenes use the approved backgrounds and replaceable cooking tool layers", () => {
  const source = readFarmSources();
  const assetManifest = readFileSync(new URL("./farm-asset-manifest.ts", import.meta.url), "utf8");
  const styles = readFarmStyles();
  const fieldStyles = readFileSync(
    new URL("./scenes/field/field-scene.css", import.meta.url),
    "utf8",
  );
  const ranchStyles = readFileSync(
    new URL("./scenes/ranch/ranch-scene.css", import.meta.url),
    "utf8",
  );
  const cookingStyles = readFileSync(
    new URL("./scenes/cooking/cooking-scene.css", import.meta.url),
    "utf8",
  );

  assert.match(fieldStyles, /url\("\.\.\/\.\.\/assets\/scenes\/field-background\.png"\)/);
  assert.match(ranchStyles, /url\("\.\.\/\.\.\/assets\/scenes\/ranch-background\.png"\)/);
  assert.match(cookingStyles, /url\("\.\.\/\.\.\/assets\/scenes\/cooking-background\.png"\)/);
  assert.doesNotMatch(
    `${styles}\n${fieldStyles}\n${ranchStyles}\n${cookingStyles}`,
    /\/farm\/scenes\//,
  );
  assert.doesNotMatch(styles, /ranch-background|cooking-background|neighborhood-background/);
  assert.doesNotMatch(styles, /\.farm-scene--field\s*\{[^}]*field-background/);
  assert.match(source, /stir-fry[^\n]+kitchen\.method\.wok/);
  assert.match(source, /pan-fry[^\n]+kitchen\.method\.wok/);
  assert.match(assetManifest, /dessert-mixing\.png/);
  assert.match(assetManifest, /drink-mixer\.png/);
  assert.match(assetManifest, /ordinary-growing\.png/);
  assert.match(assetManifest, /ordinary-ripe\.png/);
  assert.match(assetManifest, /fantasy-growing\.png/);
  assert.match(assetManifest, /fantasy-ripe\.png/);
  assert.match(assetManifest, /limited-growing\.png/);
  assert.match(assetManifest, /limited-ripe\.png/);
  assert.doesNotMatch(source, /farm-plot__stem|farm-plot__leaf|farm-plot__crop/);
  assert.doesNotMatch(
    styles,
    /\.farm-plot__empty-mark|\.farm-plot__stem|\.farm-plot__leaf|\.farm-plot__crop/,
  );
});

test("ranch demo renders only catalog-owned animals on the shared scene canvas", () => {
  const source = readFarmSources();
  const ranchSource = readFileSync(
    new URL("./scenes/ranch/ranch-scene.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFarmStyles();
  const ranchSceneLayouts =
    source.match(/const RANCH_SCENE_DEMO_LAYOUTS:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? "";

  assert.equal((source.match(/demoOwned: true/g) ?? []).length, 2);
  assert.match(ranchSceneLayouts, /chicken:/);
  assert.match(ranchSceneLayouts, /cat:/);
  assert.doesNotMatch(ranchSceneLayouts, /duck:|dog:|dream_cat:/);
  assert.match(ranchSceneLayouts, /chicken:[^\n]*minX: 13, maxX: 58, minY: 33, maxY: 69/);
  assert.match(ranchSceneLayouts, /cat:[^\n]*minX: 35, maxX: 78, minY: 39, maxY: 77/);
  assert.match(source, /RANCH_SHOP_ANIMALS\.filter\(\(animal\) => animal\.demoOwned\)\.flatMap/);
  assert.match(source, /RANCH_SCENE_DEMO_LAYOUTS\[animal\.id\]/);
  assert.match(ranchSource, /data-animal-id=\{animal\.id\}/);
  assert.match(ranchSource, /className="farm-ranch-resident__roamer"/);
  assert.match(ranchSource, /className="farm-ranch-resident__portrait"/);
  assert.match(ranchSource, /className="farm-ranch-resident__step"/);
  assert.match(ranchSource, /style=\{animal\.spriteStyle\}/);
  assert.match(
    source,
    /<RanchScene[\s\S]*active=\{activeScene === "ranch"\}[\s\S]*animals=\{ranchSceneAnimals\}[\s\S]*onSelectAnimal=\{setSelectedRanchAnimalId\}/,
  );
  assert.match(ranchSource, /Math\.random/);
  assert.match(ranchSource, /targetX = randomBetween\(layout\.roam\.minX, layout\.roam\.maxX\)/);
  assert.match(ranchSource, /targetY = randomBetween\(layout\.roam\.minY, layout\.roam\.maxY\)/);
  assert.match(ranchSource, /scene\.getBoundingClientRect\(\)/);
  assert.match(ranchSource, /moveAnimation = roamer\.animate/);
  assert.match(ranchSource, /translate3d\(/);
  assert.match(ranchSource, /portrait\.style\.transform = targetX >= currentX/);
  assert.match(ranchSource, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.doesNotMatch(ranchSource, /\.style\.left|\.style\.top|fetch\(/);
  assert.match(
    styles,
    /\.farm-ranch-resident\s*\{[^}]*position:\s*absolute[^}]*aspect-ratio:\s*1[^}]*transform:\s*translate\(-50%, -100%\)/,
  );
  assert.match(styles, /@keyframes farm-ranch-step/);
  assert.match(styles, /\.farm-ranch-resident__step\s*\{[^}]*animation:\s*farm-ranch-step/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.farm-ranch-resident__roamer[\s\S]*\.farm-ranch-resident__portrait[\s\S]*\.farm-ranch-resident \.ranch-shop__animal-sprite[\s\S]*animation:\s*none/,
  );
});

test("field identity plaque and environment status keep authority-backed facts separate", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();
  const plaqueAsset = getFarmAsset("field.identity-plaque");
  const plaqueComponentSource =
    source.match(/function FarmIdentityPlaque[\s\S]*?(?=function FarmEnvironmentStatus)/)?.[0] ??
    "";
  const plaqueSource =
    plaqueComponentSource.match(/<aside[^>]*className="farm-field-plaque"[\s\S]*?<\/aside>/)?.[0] ??
    "";
  const environmentComponentSource =
    source.match(/function FarmEnvironmentStatus[\s\S]*?(?=function RanchResidentDetail)/)?.[0] ??
    "";

  assert.match(plaqueComponentSource, /farmDoorplate: string/);
  assert.match(plaqueComponentSource, /farmName: string/);
  assert.doesNotMatch(plaqueComponentSource, /equippedTitle|welcomeMessage/);
  assert.match(plaqueSource, /<strong>\{farmName\}<\/strong>/);
  assert.match(plaqueSource, /门牌[\s\S]*\{farmDoorplate\}/);
  assert.doesNotMatch(
    plaqueSource,
    /equippedTitle|welcomeMessage|主人|等级|天气|时节|土地|金币|银币/,
  );
  assert.match(environmentComponentSource, /aria-label="农场环境"/);
  assert.match(environmentComponentSource, /seasonName: string/);
  assert.match(environmentComponentSource, /landTier: number/);
  assert.match(environmentComponentSource, /landName: string/);
  assert.match(environmentComponentSource, /时节 \{seasonName\}/);
  assert.match(environmentComponentSource, /土地 \{landTier\} · \{landName\}/);
  assert.doesNotMatch(environmentComponentSource, /天气|weather/);
  assert.match(
    source,
    /activeScene === "field"[\s\S]*<FarmIdentityPlaque[\s\S]*farmDoorplate=\{field\.farm\.farm_doorplate\}[\s\S]*farmName=\{field\.farm\.farm_name\}[\s\S]*<FarmEnvironmentStatus[\s\S]*landName=\{field\.land\.name\}[\s\S]*landTier=\{field\.land\.tier\}[\s\S]*seasonName=\{field\.season\.name\}/,
  );
  assert.equal(plaqueAsset?.url, "/farm/ui/field-plaque.png");
  assert.equal(plaqueAsset?.status, "production");
  assert.match(plaqueSource, /className="farm-field-plaque__art"/);
  assert.match(plaqueSource, /getFarmAssetUrl\("field\.identity-plaque"\)/);
  assert.match(styles, /\.farm-field-plaque__art\s*\{[^}]*object-fit:\s*contain/);
  assert.match(
    styles,
    /\.farm-field-plaque\s*\{[^}]*padding:\s*calc\(var\(--farm-control-size\) \/ 5\) calc\(var\(--farm-control-size\) \/ 3\)/,
  );
  assert.doesNotMatch(styles, /\.farm-field-plaque\s*\{[^}]*padding:\s*\d+%/);
  assert.match(
    styles,
    /\.farm-field-plaque strong,[\s\S]*\.farm-field-plaque__copy > span\s*\{[^}]*color:\s*#fff8dc[^}]*text-shadow:[^}]*#603719/,
  );
  assert.doesNotMatch(styles, /\.farm-field-plaque__copy > span\s*\{[^}]*color:\s*#674123/);
  assert.doesNotMatch(styles, /\.farm-field-plaque\s*\{[^}]*repeating-linear-gradient/);
  assert.doesNotMatch(styles, /\.farm-field-plaque::before|\.farm-field-plaque::after/);
  assert.match(
    styles,
    /\.farm-field-environment\s*\{[^}]*position:\s*absolute[^}]*height:\s*calc\(var\(--farm-control-size\) \/ 2\)[^}]*pointer-events:\s*none/,
  );
});

test("field and ranch scenes use the same authority-backed season and weather selection", () => {
  const source = readFarmSources();

  assert.equal(
    getFarmEnvironmentAssetUrl("field", "summer", null),
    "/farm/scenes/field-summer.png",
  );
  assert.equal(
    getFarmEnvironmentAssetUrl("ranch", "autumn", "cloudy"),
    "/farm/scenes/ranch-autumn.png",
  );
  assert.equal(
    getFarmEnvironmentAssetUrl("field", "spring", "thunderstorm"),
    "/farm/scenes/field-rain.png",
  );
  assert.equal(
    getFarmEnvironmentAssetUrl("ranch", "winter", "heavy_rain"),
    "/farm/scenes/ranch-rain.png",
  );
  assert.equal(
    getFarmEnvironmentAssetUrl("field", "winter", "blizzard"),
    "/farm/scenes/field-snow.png",
  );
  assert.equal(
    getFarmEnvironmentAssetUrl("ranch", "winter", "light_snow"),
    "/farm/scenes/ranch-snow.png",
  );
  assert.equal((source.match(/field\.weather\?\.condition \?\? null/g) ?? []).length, 2);
  assert.equal((source.match(/field\.season\.id/g) ?? []).length, 2);

  for (const scene of ["field", "ranch"] as const) {
    for (const state of ["spring", "summer", "autumn", "winter", "rain", "snow"] as const) {
      const assetPath = new URL(`./assets/scenes/${scene}-${state}.png`, import.meta.url);
      const size = statSync(assetPath).size;
      assert.ok(size > 0);
      assert.ok(size < 1_100_000);
    }
  }
});

test("moving ranch residents keep preview read-only and use authority-backed live actions", () => {
  const source = readFarmSources();
  const pageSource = readFileSync(new URL("./page/live-farm-page.tsx", import.meta.url), "utf8");
  const ranchSource = readFileSync(
    new URL("./scenes/ranch/ranch-scene.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFarmStyles();
  const residentDetailSource = readFileSync(
    new URL("./page/ranch-resident-detail.tsx", import.meta.url),
    "utf8",
  );

  assert.match(ranchSource, /className="farm-ranch-resident"/);
  assert.match(ranchSource, /onClick=\{\(\) => onSelectAnimal\(animal\.id\)\}/);
  assert.match(ranchSource, /type="button"/);
  assert.match(source, /selectedRanchAnimalId/);
  assert.match(
    source,
    /<RanchResidentDetail[\s\S]*view=\{[\s\S]*selectedRanchAnimal[\s\S]*kind: "preview"[\s\S]*animal: selectedRanchAnimal/,
  );
  assert.match(residentDetailSource, /animal\.produce/);
  assert.match(residentDetailSource, /animal\.effectLabel/);
  assert.match(
    residentDetailSource,
    /view\.kind === "live" && allowedActions && onAction && ranch/,
  );
  assert.match(residentDetailSource, /renderActionButton\("feed", "投喂"\)/);
  assert.match(residentDetailSource, /renderActionButton\("upgrade", "升级"\)/);
  assert.match(residentDetailSource, /allowedActions\.rename\.enabled/);
  assert.match(residentDetailSource, /allowedActions\.wear_accessory\.enabled/);
  assert.match(residentDetailSource, /allowedActions\.takeoff_accessory\.enabled/);
  assert.match(residentDetailSource, /allowedActions\.set_variant\.enabled/);
  assert.match(residentDetailSource, /action\.cost\.currency === "silver" \? "银币" : "牧场金币"/);
  assert.match(residentDetailSource, /title=\{action\.reason \?\? undefined\}/);
  assert.match(residentDetailSource, /expectedRevision: ranch\.revision/);
  assert.match(residentDetailSource, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(residentDetailSource, /residentType: liveResident\.residentType/);
  assert.match(residentDetailSource, /maxLength=\{12\}/);
  assert.match(residentDetailSource, /itemId === "base" \? "原始外观"/);
  assert.match(residentDetailSource, /result\.data\.data\.result\.outcome/);
  assert.match(source, /function ranchResidentOutcomeMessage/);
  assert.match(source, /outcome\.remaining_today/);
  assert.match(source, /outcome\.cost_ranch_coins/);
  assert.match(
    residentDetailSource,
    /shouldRetryRanchResidentAction\(result\.issue\) \? attempt : null/,
  );
  assert.match(pageSource, /executeBoundRanchResidentAction\(input\)/);
  assert.match(
    pageSource,
    /ranch:\s*\{[\s\S]*stage: "ready"[\s\S]*data: result\.data\.data\.resource[\s\S]*revision: result\.data\.revision/,
  );
  assert.match(
    pageSource,
    /onRanchResidentAction=\{previewData \? undefined : submitRanchResidentAction\}/,
  );
  assert.match(
    pageSource,
    /const invalidateAfterFarmMutation = useCallback\(async \(\) => \{[\s\S]*await refreshField\(\);[\s\S]*refreshRequestedResources\(\);/,
  );
  assert.match(
    pageSource,
    /executeBoundRanchResidentAction\(input\)[\s\S]*await invalidateAfterFarmMutation\(\)/,
  );
  assert.doesNotMatch(residentDetailSource, /购买|金币回传|抓捕|一键收取/);
  assert.match(
    styles,
    /\.ranch-resident-detail\s*\{[^}]*position:\s*absolute[^}]*z-index:\s*90[^}]*place-items:\s*center/,
  );
  assert.match(styles, /\.ranch-resident-detail__action-grid\s*\{[^}]*repeat\(3,/);
  assert.match(
    styles,
    /\.ranch-resident-detail__action-row\s*\{[^}]*grid-template-columns:\s*11cqw minmax\(0, 1fr\) 15cqw/,
  );
});

test("ranch collection stays a compact scene action and renders authority receipts", () => {
  const source = readFarmSources();
  const contentSource = readFileSync(
    new URL("./page/farm-field-content.tsx", import.meta.url),
    "utf8",
  );
  const liveSource = readFileSync(new URL("./page/live-farm-page.tsx", import.meta.url), "utf8");
  const styles = readFarmStyles();
  const collectionSource =
    source.match(
      /function RanchCollectionControl[\s\S]*?(?=function getLiveCookingIngredientOptions)/,
    )?.[0] ?? "";

  assert.match(collectionSource, /className="farm-ranch-collect"/);
  assert.match(collectionSource, /`一键收取 ×\$\{count\}`/);
  assert.match(collectionSource, /result\.items\.map/);
  assert.match(collectionSource, /destinationLabel\[item\.destination\]/);
  assert.match(collectionSource, /重试同一次收取/);
  assert.match(contentSource, /expectedRevision: ranch\.revision/);
  assert.match(contentSource, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(contentSource, /shouldRetryRanchCollection\(result\.issue\) \? attempt : null/);
  assert.match(contentSource, /submitRanchCollection\(ranchCollectionAction\.attempt\)/);
  assert.match(
    contentSource,
    /try\s*\{[\s\S]*await onRanchCollection\(attempt\)[\s\S]*code: "unexpected_response"/,
  );
  assert.match(liveSource, /collectBoundRanch\(input\)/);
  assert.match(
    liveSource,
    /ranch:[\s\S]*data: result\.data\.data\.resource[\s\S]*revision: result\.data\.revision/,
  );
  assert.match(
    liveSource,
    /onRanchCollection=\{previewData \? undefined : submitRanchCollectionAction\}/,
  );
  assert.match(
    styles,
    /\.farm-ranch-collect\s*\{[^}]*top:[^}]*width:\s*calc\(var\(--farm-control-size\)[^}]*min-width:\s*calc\(var\(--farm-control-size\)[^}]*height:\s*calc\(var\(--farm-control-size\)/,
  );
  assert.doesNotMatch(styles, /\.farm-ranch-collect\s*\{[^}]*bottom:/);
});

test("paid cooking tools stay out of the scene until owned and live in the shop", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();
  const cookingSceneSource =
    source.match(/function CookingScene[\s\S]*?(?=function getCookingToolStyle)/)?.[0] ?? "";
  const cookingPrepSource =
    source.match(/function CookingPrepOverlay[\s\S]*?(?=function CookingIngredientPicker)/)?.[0] ??
    "";
  const cookingToolShopSource =
    source.match(/function CookingToolShop[\s\S]*?(?=function CookingShopPanelContent)/)?.[0] ?? "";

  assert.match(source, /COOKING_PREVIEW_OWNED_PAID_TOOL_IDS[\s\S]*"roast"/);
  assert.match(
    source,
    /COOKING_PAID_TOOL_PRICES[\s\S]*roast:\s*800[\s\S]*steam:\s*1_200[\s\S]*"deep-fry":\s*1_600/,
  );
  assert.match(source, /function getVisibleCookingMethods/);
  assert.match(cookingPrepSource, /visibleMethods/);
  assert.doesNotMatch(cookingSceneSource, /data-access|farm-cooking__access|已解锁|未解锁/);
  assert.doesNotMatch(styles, /\.farm-cooking__access|\[data-access="locked"\]/);
  assert.match(source, /type CookingShopSectionId = "ingredients" \| "recipes" \| "tools"/);
  assert.match(cookingToolShopSource, /已拥有/);
  assert.match(cookingToolShopSource, /COOKING_PAID_TOOL_PRICES\[methodId\]/);
  assert.match(cookingToolShopSource, /price\.toLocaleString\("zh-CN"\)/);
  assert.doesNotMatch(cookingToolShopSource, /银币价格待接入|<\/span>—/);
  assert.match(styles, /\.cooking-tool-shop__grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/);
});

test("four farm pages retain mounted panels categories and scroll positions while switching", () => {
  const source = readFarmSources();
  const contentSource = readFileSync(
    new URL("./page/farm-field-content.tsx", import.meta.url),
    "utf8",
  );
  const changeSceneSource = contentSource.match(/const changeScene[\s\S]*?\n {2}};/)?.[0] ?? "";

  assert.match(source, /function createInitialSceneUiStates/);
  assert.match(contentSource, /sceneUiStates/);
  assert.match(contentSource, /SCENE_OPTIONS\.map\(\(scene\) =>/);
  assert.match(contentSource, /new Set<FarmSceneId>\(\["field"\]\)/);
  assert.match(contentSource, /visitedScenes\.has\(scene\.id\)/);
  assert.match(changeSceneSource, /setVisitedScenes/);
  assert.match(contentSource, /hidden=\{scene\.id !== activeScene\}/);
  assert.match(contentSource, /key=\{`\$\{scene\.id\}-\$\{sceneState\.selectedTool\.id\}`\}/);
  assert.doesNotMatch(
    changeSceneSource,
    /setSelectedTool|setBulletinOpen|setCookingIngredientPickerOpen/,
  );
});

test("farm scenes cross four lazy JS and CSS boundaries before their first visit", () => {
  const source = readFileSync(new URL("./page/farm-field-content.tsx", import.meta.url), "utf8");
  const commonStyles = readFileSync(new URL("./farm-page.css", import.meta.url), "utf8");
  const sceneIds = ["field", "ranch", "cooking", "neighborhood"] as const;

  for (const sceneId of sceneIds) {
    const sceneSource = readFileSync(
      new URL(`./scenes/${sceneId}/${sceneId}-scene.tsx`, import.meta.url),
      "utf8",
    );
    const sceneStyles = readFileSync(
      new URL(`./scenes/${sceneId}/${sceneId}-scene.css`, import.meta.url),
      "utf8",
    );

    assert.match(source, new RegExp(`import\\("\\.\\./scenes/${sceneId}/${sceneId}-scene"\\)`));
    assert.match(sceneSource, new RegExp(`import "\\./${sceneId}-scene\\.css"`));
    assert.match(sceneStyles, new RegExp(`${sceneId}-background\\.png`));
  }

  assert.doesNotMatch(commonStyles, /ranch-background|cooking-background|neighborhood-background/);
  assert.doesNotMatch(commonStyles, /\.farm-scene--field\s*\{[^}]*field-background/);
  assert.match(source, /visitedScenes\.has\(scene\.id\)/);
  assert.match(source, /FarmLazyLoading[\s\S]*正在打开/);
  assert.doesNotMatch(source, /<Suspense fallback=\{null\}>/);
});

test("farm panels load only after their entry opens across real JS and CSS boundaries", () => {
  const source = readFileSync(new URL("./page/farm-field-content.tsx", import.meta.url), "utf8");
  const commonStyles = readFileSync(new URL("./farm-page.css", import.meta.url), "utf8");
  const bulletinSource = readFarmPanelSource("bulletin");
  const bulletinStyles = readFileSync(
    new URL("./panels/bulletin-panel.css", import.meta.url),
    "utf8",
  );
  const toolSource = readFarmPanelSource("tool");
  const toolStyles = readFileSync(new URL("./panels/tool-panel.css", import.meta.url), "utf8");
  const shopSource = readFarmPanelSource("shop");
  const shopStyles = readFileSync(new URL("./panels/shop-panel.css", import.meta.url), "utf8");

  assert.match(source, /import\("\.\.\/panels\/bulletin-panel"\)/);
  assert.match(source, /import\("\.\.\/panels\/tool-panel"\)/);
  assert.match(toolSource, /import\("\.\/shop-panel"\)/);
  assert.match(source, /FarmLazyLoading[\s\S]*正在打开叮咚播报[\s\S]*<DingdongBulletin/);
  assert.match(source, /FarmLazyLoading[\s\S]*正在打开[\s\S]*<FarmToolPanel/);
  assert.match(toolSource, /FarmLazyLoading[\s\S]*正在打开商店[\s\S]*<FarmShopPanelContent/);
  assert.doesNotMatch(`${source}\n${toolSource}`, /<Suspense fallback=\{null\}>/);
  assert.doesNotMatch(source, /function DingdongBulletin|function FarmToolPanel/);
  assert.doesNotMatch(toolSource, /function FarmShopPanelContent/);
  assert.match(bulletinSource, /export function DingdongBulletin/);
  assert.match(toolSource, /export function FarmToolPanel/);
  assert.match(shopSource, /export function FarmShopPanelContent/);
  assert.doesNotMatch(commonStyles, /\.farm-bulletin\s*\{|\.farm-tool-panel\s*\{/);
  assert.match(bulletinStyles, /\.farm-bulletin\s*\{/);
  assert.match(toolStyles, /\.farm-tool-panel\s*\{/);
  assert.match(shopStyles, /\.farm-shop,\s*\.ranch-shop\s*\{/);
});

test("farm scene labels and plot surface stay concise", () => {
  const source = readFarmSources();

  assert.match(source, /id: "field", label: "农场"/);
  assert.match(source, /id: "ranch", label: "牧场"/);
  assert.match(source, /id: "cooking", label: "料理台"/);
  assert.match(source, /id: "neighborhood", label: "邻里"/);
  assert.doesNotMatch(source, /className="farm-plot__label"/);
  assert.doesNotMatch(source, /className="farm-plot__number"/);
  assert.doesNotMatch(source, /className="farm-summary"/);
  assert.doesNotMatch(source, /铃野公共农场/);
});

test("three scene bodies expose complete honest management scaffolds without local settlement", () => {
  const source = readFarmSources();
  const cookingSceneSource = readFileSync(
    new URL("./scenes/cooking/cooking-scene.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFarmStyles();
  const fieldOverlaySource = readFileSync(
    new URL("./page/action-feedback.tsx", import.meta.url),
    "utf8",
  );
  const cookingOverlaySource = readFileSync(
    new URL("./page/cooking/prep-overlay.tsx", import.meta.url),
    "utf8",
  );
  const cookingResultSource = cookingOverlaySource;
  const cookingIngredientPickerSource = cookingOverlaySource;

  assert.doesNotMatch(fieldOverlaySource, /farmName|farmDoorplate|农场资料|门牌/);
  assert.doesNotMatch(fieldOverlaySource, /filter\(|plot\.state === "ripe"|ripeCount/);
  assert.match(
    fieldOverlaySource,
    /<dt>成熟<\/dt>[\s\S]*<dd>\{harvestAssist\.mature_plot_count\}<\/dd>/,
  );
  assert.match(
    fieldOverlaySource,
    /<dt>今日帮收<\/dt>[\s\S]*\{harvestAssist\.remaining\}\/\{harvestAssist\.daily_limit\}/,
  );
  assert.match(
    fieldOverlaySource,
    /const enabled = harvestAssist\.can_assist[\s\S]*disabled=\{!enabled\}[\s\S]*onClick=\{onHarvestAssist\}/,
  );
  assert.match(fieldOverlaySource, /submitting \? "正在帮收…" : "一键帮 TA 收"/);
  assert.doesNotMatch(source, /function RanchSceneOverlay|aria-label="牧场管理"/);
  assert.doesNotMatch(source, /牧场数据尚未接入|居民、产出与欠款等待权威数据/);
  assert.doesNotMatch(source, /<dt>欠款<\/dt>|金币回传/);
  assert.match(source, /const COOKING_PREP_SLOT_IDS = \[[\s\S]*"ingredient-slot-5"/);
  assert.match(cookingOverlaySource, /COOKING_PREP_SLOT_IDS\.map/);
  assert.doesNotMatch(cookingOverlaySource, /当前方式|开始料理/);
  assert.match(cookingOverlaySource, /上一种料理方式/);
  assert.match(cookingOverlaySource, /下一种料理方式/);
  assert.match(cookingOverlaySource, /className="farm-cooking__method-label"/);
  assert.match(
    cookingOverlaySource,
    /farm-cooking__actions[\s\S]*料理操作[\s\S]*放入食材[\s\S]*烹饪/,
  );
  assert.match(
    cookingOverlaySource,
    /<button onClick=\{onOpenIngredientPicker\} type="button">\s*放入食材/,
  );
  assert.match(
    cookingOverlaySource,
    /const liveCookEnabled =[\s\S]*kitchen !== null[\s\S]*selectedIngredientIds\.length >= 2[\s\S]*selectedIngredientIds\.length <= 5[\s\S]*cookAction\.stage === "idle"/,
  );
  assert.match(
    cookingOverlaySource,
    /disabled=\{preview \? selectedIngredientIds\.length === 0 : !liveCookEnabled\}[\s\S]*if \(preview\) \{[\s\S]*setResultPreviewOpen\(true\)[\s\S]*onCook\(\)/,
  );
  assert.match(cookingOverlaySource, /preview && resultPreviewOpen/);
  assert.match(cookingResultSource, /aria-label="料理结果样式预览"/);
  assert.match(cookingResultSource, /kind="recipe" name=\{result\.name\}/);
  assert.match(source, /recipe\.id === "tomato_beef_stew"/);
  assert.match(cookingResultSource, /data-rarity=\{result\.rarity\}/);
  assert.match(cookingResultSource, /<small data-rarity=\{result\.rarity\}>\{result\.rarity\}/);
  assert.match(cookingResultSource, /<strong>\{result\.name\}<\/strong>/);
  assert.match(cookingResultSource, /新食谱已解锁/);
  assert.match(cookingResultSource, /锁定系统回收价/);
  assert.match(cookingResultSource, /data-currency="gold"/);
  assert.match(cookingResultSource, /data-currency="silver"/);
  assert.match(cookingResultSource, /收进料理柜/);
  assert.doesNotMatch(cookingResultSource, /×1/);
  assert.doesNotMatch(cookingResultSource, /methodLabel|ingredientIds=|等待农场返回料理结果/);
  assert.match(source, /items: selectedCookingIngredientIds\.map\(toRawKitchenCookItemRef\)/);
  assert.doesNotMatch(source, /method_id/);
  assert.match(cookingIngredientPickerSource, /aria-label="备料食材分类"/);
  assert.match(cookingIngredientPickerSource, /COOKING_PREP_CATEGORIES\.map/);
  assert.match(cookingIngredientPickerSource, /categoryIngredients\.map/);
  assert.match(cookingOverlaySource, /preview\s*\?\s*COOKING_CATALOG_INGREDIENTS\.map/);
  assert.match(cookingIngredientPickerSource, /onSelect\(nextSelectionId\)/);
  assert.match(
    cookingIngredientPickerSource,
    /className="farm-cooking-picker__quantity"[\s\S]*×\{ingredient\.quantity \?\? "—"\}/,
  );
  assert.match(cookingOverlaySource, /onRemoveIngredient\(index\)/);
  assert.doesNotMatch(cookingSceneSource, /farm-cooking__cycle|farm-cooking__method-label/);
  assert.doesNotMatch(source, /farm-cooking__methods|选择烹饪方式/);
  assert.doesNotMatch(source, /className="farm-scene__status">工具预览/);
  assert.doesNotMatch(fieldOverlaySource, /fetch\(|收获成功/);
  assert.doesNotMatch(cookingOverlaySource, /fetch\(|料理完成|制作成功|扣除|获得料理/);
  assert.match(
    styles,
    /\.farm-plot-detail\s*\{[^}]*top:\s*50%[^}]*right:\s*auto[^}]*bottom:\s*auto[^}]*left:\s*50%[^}]*z-index:\s*19[^}]*width:\s*82cqw[^}]*transform:\s*translate\(-50%, -50%\)/,
  );
  assert.match(
    styles,
    /:where\(\.farm-game\) button\s*\{[^}]*min-height:\s*0[^}]*font-family:\s*inherit/,
  );
  assert.doesNotMatch(styles, /:where\(\.farm-game\) button\s*\{[^}]*font:\s*inherit/);
  assert.match(
    styles,
    /\.farm-scene-action-dock\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*17\.6cqw[^}]*left:\s*50%[^}]*width:\s*82cqw[^}]*transform:\s*translateX\(-50%\)/,
  );
  assert.match(
    styles,
    /\.farm-cooking-prep\s*\{[^}]*position:\s*absolute[^}]*top:\s*41%[^}]*left:\s*50%[^}]*width:\s*66cqw[^}]*transform:\s*translateX\(-50%\)/,
  );
  assert.match(
    styles,
    /\.farm-cooking__cycle\s*\{[^}]*--farm-cooking-cycle-size:\s*clamp\(38px, 10vmin, 56px\)[^}]*top:\s*61\.5%[^}]*width:\s*var\(--farm-cooking-cycle-size\)[^}]*min-width:\s*var\(--farm-cooking-cycle-size\)[^}]*max-width:\s*var\(--farm-cooking-cycle-size\)[^}]*height:\s*var\(--farm-cooking-cycle-size\)[^}]*min-height:\s*var\(--farm-cooking-cycle-size\)[^}]*max-height:\s*var\(--farm-cooking-cycle-size\)[^}]*aspect-ratio:\s*1/,
  );
  assert.match(styles, /\.farm-cooking-selector\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
  assert.match(
    styles,
    /\.farm-cooking__method-label\s*\{[^}]*top:\s*calc\(41% - 7cqw\)[^}]*left:\s*50%[^}]*width:\s*22cqw/,
  );
  assert.match(
    styles,
    /\.farm-cooking__actions\s*\{[^}]*position:\s*absolute[^}]*top:\s*69\.8%[^}]*left:\s*50%[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    styles,
    /\.farm-cooking-picker\s*\{[^}]*position:\s*absolute[^}]*right:\s*0[^}]*bottom:\s*0[^}]*left:\s*0[^}]*z-index:\s*45[^}]*height:\s*80cqw[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)[^}]*padding:\s*2\.4cqw 4cqw 2\.8cqw[^}]*border-radius:\s*4cqw 4cqw 0 0/,
  );
  assert.match(
    styles,
    /@keyframes farm-cooking-picker-in\s*\{\s*from\s*\{[^}]*opacity:\s*0[^}]*transform:\s*translateY\(100%\)/,
  );
  assert.match(
    styles,
    /\.farm-cooking-picker ul\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)[^}]*overflow-y:\s*auto/,
  );
  assert.match(
    styles,
    /\.farm-cooking-picker__category\s*\{[^}]*min-height:\s*5\.4cqw[^}]*padding:\s*0\.1cqw 0\.15cqw/,
  );
  assert.match(
    styles,
    /\.farm-cooking-picker header button\s*\{[^}]*--farm-cooking-picker-close-size:\s*clamp\(32px, 8vmin, 44px\)[^}]*width:\s*var\(--farm-cooking-picker-close-size\)[^}]*min-width:\s*var\(--farm-cooking-picker-close-size\)[^}]*max-width:\s*var\(--farm-cooking-picker-close-size\)[^}]*height:\s*var\(--farm-cooking-picker-close-size\)[^}]*min-height:\s*var\(--farm-cooking-picker-close-size\)[^}]*max-height:\s*var\(--farm-cooking-picker-close-size\)/,
  );
  assert.match(
    styles,
    /\.farm-cooking-picker \.cooking-catalog__sprite\s*\{[^}]*inset:\s*18%[^}]*width:\s*64%[^}]*height:\s*64%/,
  );
  assert.match(
    styles,
    /\.farm-cooking-picker__quantity\s*\{[^}]*position:\s*absolute[^}]*top:\s*4%[^}]*left:\s*6%/,
  );
  assert.match(
    styles,
    /\.farm-cooking-result-preview\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*z-index:\s*90[^}]*place-items:\s*center/,
  );
  assert.match(
    styles,
    /\.farm-cooking-result-preview__paper\s*\{[^}]*width:\s*66cqw[^}]*panel-parchment\.png/,
  );
  assert.doesNotMatch(styles, /\.farm-cooking-result-preview__paper\s*\{[^}]*width:\s*7[0-9]cqw/);
  assert.match(styles, /\.farm-cooking-result-preview__visual\s*\{[^}]*width:\s*18cqw/);
  assert.match(styles, /\.farm-cooking-result-preview__paper\[data-rarity="SR"\]/);
  assert.match(source, /className="farm-cooking-result-preview__close"/);
  assert.match(
    styles,
    /\.farm-cooking-result-preview__close\s*\{[^}]*border:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/,
  );
  assert.doesNotMatch(styles, /\.farm-cooking__methods/);
  assert.doesNotMatch(source, /className="farm-scene-meta/);
  assert.match(
    styles,
    /\.farm-scene-action-dock--field\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto[^}]*width:\s*74cqw[^}]*min-height:\s*0[^}]*padding:\s*0\.45cqw 1\.2cqw/,
  );
  assert.match(
    styles,
    /\.farm-scene-action-dock--field > button\s*\{[^}]*min-height:\s*clamp\(28px, 8cqw, 34px\)[^}]*padding:\s*0\.2cqw 1cqw/,
  );
  assert.doesNotMatch(styles, /\.farm-scene-action-dock--ranch|\.farm-scene-action-dock__buttons/);
});

test("live harvest assist submits one idempotent action and replaces the field from the receipt", () => {
  const liveSource = readFileSync(new URL("./page/live-farm-page.tsx", import.meta.url), "utf8");
  const styles = readFarmStyles();
  const receiptSource = readFileSync(
    new URL("./page/action-feedback.tsx", import.meta.url),
    "utf8",
  );

  assert.match(liveSource, /harvestBoundFarmField/);
  assert.match(liveSource, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(liveSource, /expectedRevision: state\.data\.revision/);
  assert.match(liveSource, /const result = await harvestBoundFarmField\(attempt\)/);
  assert.match(
    liveSource,
    /data: result\.data\.data\.resource,[\s\S]*revision: result\.data\.revision,[\s\S]*server_time: result\.data\.server_time/,
  );
  assert.match(
    liveSource,
    /submitHarvestAssist\(harvestAction\.attempt\)/,
    "an unknown network result must retry the same attempt",
  );
  assert.match(liveSource, /onHarvestAssist=\{previewData \? undefined/);
  assert.doesNotMatch(liveSource, /plots\.(filter|map)|farm_coins_gained\s*\+/);

  assert.match(receiptSource, /aria-label="帮收结果"/);
  assert.match(receiptSource, /result\.harvests\.map/);
  assert.match(receiptSource, /harvest\.crop\.name/);
  assert.match(receiptSource, /harvest\.currency === "silver" \? "银币" : "金币"/);
  assert.match(receiptSource, /harvest\.material_drop/);
  assert.match(receiptSource, /harvest\.potion_drop/);
  assert.match(receiptSource, /result\.season_event/);
  assert.match(receiptSource, /result\.new_titles\.map/);
  assert.doesNotMatch(receiptSource, /等待农场|当前不会|假结果|模拟/);

  assert.match(
    styles,
    /\.farm-harvest-receipt,[\s\S]*\.farm-harvest-notice\s*\{[^}]*top:\s*50%[^}]*bottom:\s*auto[^}]*width:\s*70cqw[^}]*transform:\s*translate\(-50%, -50%\)/,
  );
  assert.match(
    styles,
    /\.farm-harvest-receipt__list\s*\{[^}]*max-height:\s*30cqw[^}]*overflow-y:\s*auto/,
  );
});

test("harvest assist issues distinguish a retryable unknown result from a stale field", () => {
  assert.equal(
    farmHarvestAssistIssueMessage({
      code: "network_unavailable",
      currentRevision: null,
      serverMessage: null,
    }),
    "连接中断，暂时无法确认这次帮收结果。",
  );
  assert.equal(
    farmHarvestAssistIssueMessage({
      code: "state_conflict",
      currentRevision: "field-v1:newer",
      serverMessage: "changed",
    }),
    "农场状态已经变化，请重新读取后再试。",
  );
});

test("farm tools stay visible while neighborhood and dingdong bulletin remain separate", () => {
  const source = readFarmSources();
  const assetManifest = readFileSync(new URL("./farm-asset-manifest.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /aria-expanded=\{open\}/);
  assert.doesNotMatch(source, /onToggle|toolsOpen|setToolsOpen/);
  assert.match(source, /aria-label="打开叮咚播报"/);
  assert.match(source, />叮咚播报<\/span>/);
  assert.match(source, /iconKey: "shell\.bulletin"/);
  assert.match(assetManifest, /dingdong-bulletin\.png/);
  assert.match(source, /field:\s*\[[\s\S]*label: "作物图鉴"/);
  assert.match(source, /id: "create", label: "创造", iconKey: "panel\.tool\.create"/);
  assert.match(assetManifest, /"panel\.tool\.create"[\s\S]*create-plant\.png[\s\S]*usage: "wired"/);
  assert.match(source, /id: "smelting", label: "熔炼", iconKey: "panel\.tool\.smelting"/);
  assert.match(
    source,
    /ranch:\s*\[[\s\S]*label: "商店"[\s\S]*label: "背包"[\s\S]*label: "派遣"[\s\S]*label: "集市"/,
  );
  assert.match(source, /id: "dispatch", label: "派遣", iconKey: "panel\.tool\.dispatch"/);
  assert.doesNotMatch(source, /id: "animal-codex"|label: "动物图鉴"/);
  assert.match(
    source,
    /cooking:\s*\[[\s\S]*label: "商店"[\s\S]*label: "背包"[\s\S]*label: "食谱"[\s\S]*label: "集市"/,
  );
  assert.match(source, /id: "recipes", label: "食谱", iconKey: "panel\.tool\.recipes"/);
  assert.match(
    source,
    /NEIGHBORHOOD_OPTIONS[\s\S]*label: "排行榜"[\s\S]*label: "留言板"[\s\S]*label: "原创作物"/,
  );
  assert.doesNotMatch(source, /field:\s*\[[^\]]*label: "排行"/);
  assert.doesNotMatch(source, /ranch:\s*\[[^\]]*label: "排行"/);
  assert.doesNotMatch(source, /id: "recipes"[^\n]+panel\.tool\.crop-codex/);
  assert.doesNotMatch(source, /饲料[／/]产物|我的料理/);
});

test("neighborhood uses the approved scene and switches one honest section at a time", () => {
  const source = readFarmSources();
  const neighborhoodSource = readFileSync(
    new URL("./scenes/neighborhood/neighborhood-scene.tsx", import.meta.url),
    "utf8",
  );
  const neighborhoodStyles = readFileSync(
    new URL("./scenes/neighborhood/neighborhood-scene.css", import.meta.url),
    "utf8",
  );
  const styles = readFarmStyles();
  const background = new URL(
    "./scenes/neighborhood/assets/neighborhood-background.png",
    import.meta.url,
  );

  assert.ok(statSync(background).size > 0);
  assert.match(
    neighborhoodStyles,
    /farm-scene--neighborhood[\s\S]*url\("\.\/assets\/neighborhood-background\.png"\)/,
  );
  assert.match(source, /id: "ranking", label: "排行榜"/);
  assert.match(source, /id: "message-board", label: "留言板"/);
  assert.match(source, /id: "original-crops", label: "原创作物"/);
  assert.match(neighborhoodSource, /useState\(options\[0\]\?\.id \?\? ""\)/);
  assert.match(neighborhoodSource, /role="tablist"/);
  assert.match(source, /shellUrl=\{getFarmAssetUrl\("neighborhood\.shell"\)\}/);
  assert.match(neighborhoodSource, /role="tabpanel"/);
  assert.doesNotMatch(neighborhoodSource, /neighborhood-tabs-frame|neighborhood-content-frame-v2/);
  assert.match(neighborhoodSource, /className="farm-neighborhood__section-head"/);
  assert.match(neighborhoodSource, /<h3>\{activeSection\.label\}<\/h3>/);
  assert.match(neighborhoodSource, /emptyLabels\[activeSection\.id\]/);
  assert.doesNotMatch(neighborhoodSource, /farm-neighborhood__pagination/);
  assert.match(source, /暂无可显示的排行榜数据。/);
  assert.match(source, /暂无可显示的留言。/);
  assert.match(source, /暂无可显示的原创作物。/);
  assert.match(
    styles,
    /\.farm-neighborhood\s*\{[\s\S]*top:\s*24\.5cqh;[\s\S]*bottom:\s*16\.47cqw;/,
  );
  assert.match(styles, /\.farm-neighborhood\s*\{[\s\S]*right:\s*3\.1cqw;[\s\S]*left:\s*3\.1cqw;/);
  assert.match(
    styles,
    /\.farm-neighborhood__panel\s*\{[\s\S]*grid-template-rows:[\s\S]*border:\s*0;[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(styles, /\.farm-neighborhood__body\s*\{[\s\S]*overflow-y:\s*auto;/);
  assert.match(styles, /\.farm-neighborhood__tabs\s*\{[\s\S]*margin:\s*0;/);
  assert.match(
    styles,
    /\.farm-neighborhood__shell-frame\s*\{[\s\S]*bottom:\s*-3\.8cqw;[\s\S]*height:\s*calc\(100% \+ 3\.8cqw\);[\s\S]*object-fit:\s*fill;[\s\S]*pointer-events:\s*none;/,
  );
  assert.match(styles, /\.farm-neighborhood__section-head h3\s*\{/);
  assert.doesNotMatch(styles, /\.farm-neighborhood__pagination/);
  assert.doesNotMatch(styles, /\.farm-neighborhood\s*\{[\s\S]*top:\s*27%;/);
  assert.doesNotMatch(
    source,
    /className="farm-neighborhood__panel"[\s\S]*src=\{activeSection\.icon\}/,
  );
  assert.doesNotMatch(source, /暂无可显示的邻里动态/);
  assert.doesNotMatch(source, /id: "footprints"|最近足迹/);
  assert.doesNotMatch(source, /铃兰的小屋|向日葵农场|薄荷糖の田/);
});

test("bulletin reads authority-backed entries in one scrolling list and keeps demo empty states isolated", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();
  const bulletinSource = readFarmPanelSource("bulletin");

  assert.match(source, /const DINGDONG_BULLETIN_OPTIONS/);
  assert.match(source, /id: "tasks",[\s\S]*label: "进行中任务"/);
  assert.match(source, /id: "maturity",[\s\S]*label: "成熟提醒"/);
  assert.match(source, /id: "messages",[\s\S]*label: "最近留言"/);
  assert.match(bulletinSource, /aria-label="叮咚播报列表"/);
  assert.match(bulletinSource, /className="farm-bulletin__list"/);
  assert.match(bulletinSource, /DINGDONG_BULLETIN_OPTIONS\.map[\s\S]*<BulletinEmptyRow/);
  assert.match(source, /type BoundBulletinRead/);
  assert.match(source, /getBoundBulletin\(/);
  assert.match(source, /activeSceneUiState\.bulletinOpen[\s\S]*\? "bulletin"/);
  assert.match(bulletinSource, /available\.tasks\?\.map/);
  assert.match(bulletinSource, /available\.mature_plots\?\.map/);
  assert.match(bulletinSource, /available\.messages\?\.map/);
  assert.match(bulletinSource, /available\.ranch_notifications\?\.map/);
  assert.doesNotMatch(bulletinSource, /useState|播报分类|tablist|aria-selected|role="tab"/);
  assert.match(source, /进行中任务尚未接入/);
  assert.match(source, /成熟提醒尚未接入/);
  assert.match(source, /最近留言尚未接入/);
  assert.doesNotMatch(
    bulletinSource,
    /分页|<span>1 \/ 1<\/span>|aria-label="上一页"|aria-label="下一页"/,
  );
  assert.doesNotMatch(bulletinSource, /<dl>|<dt>|<dd>|<button[^>]*>进行中任务/);
  assert.match(
    styles,
    /\.farm-bulletin\s*\{[\s\S]*right:\s*10\.7%;[\s\S]*z-index:\s*80[\s\S]*width:\s*78cqw[\s\S]*height:\s*118cqw/,
  );
  assert.doesNotMatch(styles, /\.farm-bulletin__tabs\s*\{/);
  assert.match(styles, /\.farm-bulletin__list\s*\{[^}]*display:\s*grid;[^}]*list-style:\s*none/);
  assert.match(
    styles,
    /\.farm-bulletin__empty\s*\{[\s\S]*background:\s*rgba\(255, 253, 241, 0\.62\)/,
  );
  assert.match(styles, /\.farm-bulletin__content\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.farm-bulletin__panel\s*\{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(styles, /\.farm-bulletin__pagination\s*\{/);
  assert.doesNotMatch(source, /小明家|成熟了|刚刚留言|访问了/);
  assert.doesNotMatch(source, /足迹/);
});

test("right-side farm tools open a shared honest content panel", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();

  assert.match(source, /function FarmToolPanel/);
  assert.match(source, /className="farm-tool-panel" role="dialog"/);
  assert.match(source, /onClick=\{\(\) => onSelect\(tool\)\}/);
  assert.match(source, /暂无可显示内容/);
  assert.match(source, /真实数据接入后会显示在这里/);
  assert.match(
    styles,
    /\.farm-tool-panel[\s\S]*right:\s*10\.7%[\s\S]*z-index:\s*80[\s\S]*width:\s*78cqw[\s\S]*height:\s*118cqw/,
  );
  assert.doesNotMatch(styles, /\.farm-tool-panel\s*\{[^}]*bottom:/);
  assert.match(styles, /\.farm-tool-panel\s*\{[\s\S]*inset 0 0 0 0\.65cqw #dfc18c/);
  assert.match(styles, /\.farm-tool-panel__tab[\s\S]*linear-gradient\(180deg, #839c4b, #6e873a\)/);
  assert.match(
    styles,
    /\.farm-tool-panel__close\s*\{[\s\S]*width:\s*11\.3cqw[\s\S]*background:\s*transparent/,
  );
  assert.match(styles, /\.farm-tool-panel__close::before[\s\S]*width:\s*7\.4cqw/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.farm-tool-panel/);
});

test("farm shop follows the active scene and mirrors the existing store groups", () => {
  const source = readFarmSources();
  const assetManifest = readFileSync(new URL("./farm-asset-manifest.ts", import.meta.url), "utf8");
  const styles = readFarmStyles();

  assert.match(source, /function FarmShopPanelContent/);
  assert.match(source, /id: "seeds-and-potions", label: "种子与药水"/);
  assert.match(source, /id: "today", label: "今日商店"/);
  assert.match(source, /普通种子[\s\S]*note: "常备"[\s\S]*price: 8/);
  assert.match(source, /奇幻种子[\s\S]*note: "常备"[\s\S]*price: 40/);
  assert.match(source, /加速药水[\s\S]*note: "每日最多 6 瓶"[\s\S]*price: 50/);
  assert.match(source, /speed-potion-preview[\s\S]*field\.shop\.speed-potion/);
  assert.match(assetManifest, /field\.shop\.speed-potion[\s\S]*speed-potion\.png/);
  assert.match(source, /限定种子[\s\S]*药水套装[\s\S]*隐藏配方/);
  assert.match(source, /potion-set-preview[\s\S]*field\.shop\.potion-set/);
  assert.match(assetManifest, /field\.shop\.potion-set[\s\S]*potion-set\.png/);
  assert.doesNotMatch(source, /speed-potion-preview[\s\S]{0,160}panel\.tool\.shop/);
  assert.doesNotMatch(source, /potion-set-preview[\s\S]{0,160}panel\.tool\.shop/);
  assert.match(source, /hidden-recipe-preview[\s\S]*field\.shop\.seed-recipe/);
  assert.match(assetManifest, /field\.shop\.seed-recipe[\s\S]*seed-recipe\.png/);
  assert.doesNotMatch(source, /hidden-recipe-preview[\s\S]{0,160}panel\.tool\.recipes/);
  assert.doesNotMatch(source, /界面演示|演示价格|每 4 小时轮换|只读预览|不会发起请求/);
  assert.match(source, /商店数据尚未接入/);
  assert.match(source, /当前页面不会显示示例商品/);
  assert.match(source, /activeScene === "cooking"/);
  assert.match(
    source,
    /return preview \? \([\s\S]*<CookingShopPanelContent[\s\S]*cart=\{cart\}[\s\S]*cookingCheckoutFeedback=\{cookingCheckoutFeedback\}[\s\S]*onChangeCartQuantity=\{onChangeCartQuantity\}/,
  );
  assert.match(
    source,
    /<CookingShopPanelContent[\s\S]*cart=\{cart\}[\s\S]*kitchen=\{kitchen\}[\s\S]*live[\s\S]*onChangeCartQuantity=\{onChangeCartQuantity\}/,
  );
  assert.match(source, /daily_shop\.is_current_day !== true/);
  assert.match(source, /activeScene === "ranch"/);
  assert.match(source, /<RanchShopPanelContent[\s\S]*cart=\{cart\}[\s\S]*preview=\{preview\}/);
  assert.match(
    source,
    /<FarmShopPanelContent[\s\S]*activeScene=\{activeScene\}[\s\S]*cart=\{cart\}[\s\S]*preview=\{preview\}/,
  );
  assert.match(source, /<FarmToolPanel[\s\S]*activeScene=\{activeScene\}/);
  assert.match(source, /preview=\{Boolean\(previewData\)\}/);
  assert.match(source, /tool\.id === "shop"/);
  assert.match(source, /sceneId === "cooking" \? "确认购买" : "喊 TA 来买"/);
  assert.doesNotMatch(source, /购买成功|已全部买到|部分商品已买到/);
  assert.match(styles, /\.farm-shop[\s\S]*grid-template-rows:/);
  assert.doesNotMatch(styles, /farm-shop__preview-label|farm-shop__boundary/);
  assert.match(styles, /\.farm-shop__categories[\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(
    styles,
    /\.farm-shop__categories button[\s\S]*font-size:\s*clamp\(0\.72rem,\s*3\.1cqw,\s*0\.88rem\)/,
  );
  const fieldShopSource = readFarmPanelSource("shop");
  assert.doesNotMatch(source, /FARM_PANEL_PAGE_SIZE/);
  assert.match(fieldShopSource, /previewItems\.map/);
  assert.doesNotMatch(fieldShopSource, /pageIndex|pageCount|pageItems|商店分页/);
  assert.match(fieldShopSource, /onClick=\{\(\) => setSectionId\(section\.id\)\}/);
  assert.match(
    styles,
    /\.farm-shop__items\s*\{[\s\S]*grid-auto-rows:\s*15\.5cqw[\s\S]*height:\s*100%[\s\S]*align-content:\s*start[\s\S]*overflow-y:\s*auto[\s\S]*border:\s*0[\s\S]*background:\s*transparent/,
  );
  assert.match(styles, /\.farm-shop__items li[\s\S]*grid-template-columns:/);
  assert.match(
    styles,
    /\.farm-shop__items li\s*\{[\s\S]*min-height:\s*0[\s\S]*border:\s*0[\s\S]*background:\s*rgba\(255, 253, 241, 0\.62\)[\s\S]*box-shadow:\s*none/,
  );
  assert.match(styles, /url\("\/farm\/ui\/panel-parchment\.png"\)/);
  assert.match(styles, /\.farm-shop,\s*\.ranch-shop\s*\{[^}]*overflow:\s*hidden/);
  assert.doesNotMatch(styles, /\.farm-shop__items li \+ li/);
});

test("three shop carts keep separate session drafts and expose only honest checkout paths", () => {
  const source = readFarmSources();
  const fieldContentSource = readFileSync(
    new URL("./page/farm-field-content.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFarmStyles();
  const shopCartSources = readFarmSourceFiles([
    "./panels/shop/shared.tsx",
    "./panels/shop/cooking-shop.tsx",
  ]);
  const cartSource =
    shopCartSources.match(
      /function ShopCartPanelContent[\s\S]*?(?=function CookingIngredientCatalog)/,
    )?.[0] ?? "";

  assert.match(source, /type ShopCartSceneId = Exclude<FarmSceneId, "neighborhood">/);
  assert.match(
    source,
    /function createEmptyShopCarts[\s\S]*field: \{\},[\s\S]*ranch: \{\},[\s\S]*cooking: \{\}/,
  );
  assert.match(
    fieldContentSource,
    /export function FarmFieldContent[\s\S]*useState<ShopCartState>\(\(\) => createEmptyShopCarts\(\)\)/,
  );
  assert.match(source, /setShopCarts\(\(current\) =>[\s\S]*\[sceneId\]: nextSceneCart/);
  assert.match(source, /function ShopCartSelectionBadge/);
  assert.match(source, /aria-label=\{`从购物车减少一份\$\{itemName\}`\}/);
  assert.doesNotMatch(source, /ShopCartAddButton/);
  assert.match(source, /function ShopCartShortcut/);
  assert.match(source, /onChangeQuantity\(item\.cartKey, -1, item\.maxQuantity\)/);
  assert.match(source, /onChangeQuantity\(item\.cartKey, 1, item\.maxQuantity\)/);
  assert.match(source, /item\.price \* line\.quantity/);
  assert.match(source, /sceneId === "cooking" \? "silver" : "gold"/);
  assert.match(source, /sceneId === "cooking" \? "确认购买" : "喊 TA 来买"/);
  assert.match(
    cartSource,
    /disabled=\{sceneId === "cooking" \? !checkoutEnabled : !farmCheckoutEnabled\}[\s\S]*onCheckoutCookingCart\?\.\(checkoutLines\)[\s\S]*onCheckoutFarmCart\?\.\(farmCheckoutLines\)[\s\S]*\{actionLabel\}/,
  );
  assert.match(source, /purchaseBoundKitchenItem/);
  assert.match(cartSource, /正在确认购买…/);
  assert.match(cartSource, /已购 \{cookingCheckoutFeedback\.itemCount\} 件/);
  assert.doesNotMatch(source, /料理台直接购买合同尚未接入|购买请求合同尚未接入/);
  assert.doesNotMatch(cartSource, /aria-describedby|<small/);
  assert.match(cartSource, /\{items\.map\(\(\{ item, quantity \}\) => \(/);
  assert.doesNotMatch(cartSource, /CookingCatalogPagination|pageIndex|pageItems|pageCount/);
  assert.doesNotMatch(source, /SHOP_CART_PAGE_SIZE/);
  assert.doesNotMatch(cartSource, /fetch\(|localStorage|sessionStorage|已唤醒/);
  assert.match(cartSource, /已通知 TA/);
  assert.doesNotMatch(source, /className="farm-shop__toolbar"/);
  assert.doesNotMatch(source, /<span>购物车<\/span>/);
  assert.doesNotMatch(styles, /\.farm-shop__toolbar/);
  assert.match(
    source,
    /className="shop-cart__shortcut"[\s\S]*<svg aria-hidden="true" viewBox="0 0 24 24">/,
  );
  assert.match(
    styles,
    /\.shop-cart__shortcut\s*\{[\s\S]*right:\s*4\.8cqw[\s\S]*bottom:\s*4\.6cqw[\s\S]*width:\s*8\.8cqw[\s\S]*height:\s*8\.8cqw[\s\S]*color:\s*#6e873a[\s\S]*border:\s*0[\s\S]*background:\s*transparent[\s\S]*box-shadow:\s*none/,
  );
  assert.match(
    styles,
    /\.shop-cart__shortcut svg\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%[\s\S]*stroke:\s*currentColor/,
  );
  assert.match(styles, /\.shop-cart__shortcut strong\s*\{[\s\S]*position:\s*absolute/);
  assert.doesNotMatch(styles, /\.farm-shop > \.farm-panel-pagination/);
  assert.match(
    styles,
    /\.shop-cart__selection-count\s*\{[\s\S]*color:\s*#fff[\s\S]*border-radius:\s*50%[\s\S]*background:\s*#78933f/,
  );
  assert.match(styles, /\.shop-cart__selection-count\s*\{[^}]*top:\s*0[^}]*right:\s*0/);
  assert.doesNotMatch(
    styles,
    /(?:\.farm-shop__items|\.cooking-recipe-catalog__list--shop) \.shop-cart__selection-count/,
  );
  assert.match(
    styles,
    /\.shop-cart\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto[\s\S]*height:\s*100%[\s\S]*overflow:\s*hidden/,
  );
  assert.match(
    styles,
    /\.shop-cart__items\s*\{[\s\S]*grid-auto-rows:\s*13\.2cqw[\s\S]*overflow-y:\s*auto/,
  );
  assert.match(styles, /\.shop-cart__items\s*\{[\s\S]*overscroll-behavior:\s*contain/);
  assert.match(
    styles,
    /\.shop-cart__header\s*\{[\s\S]*grid-template-columns:\s*8\.8cqw minmax\(0, 1fr\) auto/,
  );
  assert.match(
    styles,
    /\.shop-cart__back\s*\{[\s\S]*width:\s*8\.8cqw[\s\S]*height:\s*8\.8cqw[\s\S]*min-height:\s*8\.8cqw[\s\S]*border:\s*0\.45cqw solid #4e612f[\s\S]*0 0\.5cqw 0 rgba\(78, 96, 45, 0\.78\)/,
  );
  assert.match(
    styles,
    /\.shop-cart__footer\s*\{[\s\S]*padding:\s*0[\s\S]*border-radius:\s*0[\s\S]*background:\s*transparent/,
  );
  assert.match(
    styles,
    /\.shop-cart__footer > button\s*\{[\s\S]*width:\s*20cqw[\s\S]*min-height:\s*34px[\s\S]*border-radius:\s*999px/,
  );
  assert.doesNotMatch(styles, /\.shop-cart__footer small/);
});

test("ranch shop separates animals and pets, scrolls its fixed grid and opens details in place", () => {
  const source = readFarmSources();
  const assetManifest = readFileSync(new URL("./farm-asset-manifest.ts", import.meta.url), "utf8");
  const styles = readFarmStyles();
  const atlas = new URL("../../public/farm/animals/animal-codex-atlas.png", import.meta.url);
  const alpaca = new URL("../../public/farm/animals/alpaca-codex.png", import.meta.url);
  const goat = new URL("../../public/farm/animals/goat-codex.png", import.meta.url);
  const dispatch = new URL("../../public/farm/ui-icons/dispatch.png", import.meta.url);

  assert.ok(statSync(atlas).size > 0);
  assert.ok(statSync(alpaca).size > 0);
  assert.ok(statSync(goat).size > 0);
  assert.ok(statSync(dispatch).size > 0);
  assert.doesNotMatch(source, /RANCH_SHOP_PAGE_SIZE/);
  assert.match(
    source,
    /const RANCH_SHOP_ANIMALS:[\s\S]*id: "chicken"[\s\S]*id: "dream_cat"[\s\S]*id: "cat"[\s\S]*id: "dog"/,
  );
  assert.doesNotMatch(source, /spriteIndex/);
  assert.equal((assetManifest.match(/"ranch\.animal\.[^"]+":/g) ?? []).length, 18);
  assert.match(source, /getRanchAnimalAsset\(animal\.id\)/);
  const ranchLayoutBlock =
    source.match(/const RANCH_ANIMAL_LAYOUTS:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? "";
  assert.equal((ranchLayoutBlock.match(/size:/g) ?? []).length, 18);
  for (const animalId of [
    "chicken",
    "duck",
    "quail",
    "rabbit",
    "goose",
    "sheep",
    "goat",
    "cow",
    "bee",
    "turkey",
    "pig",
    "alpaca",
    "silk_moth",
    "ember_hen",
    "cloud_sheep",
    "dream_cat",
    "cat",
    "dog",
  ]) {
    assert.match(ranchLayoutBlock, new RegExp(`\\b${animalId}:`));
  }
  assert.match(ranchLayoutBlock, /chicken: \{ x: 95\.7734375, y: 74\.64453125, size: 192 \}/);
  assert.match(ranchLayoutBlock, /quail: \{ x: 84\.72265625, y: 76\.7734375, size: 243\.84 \}/);
  assert.match(ranchLayoutBlock, /turkey: \{ x: 91\.2421875, y: 117\.625, size: 192 \}/);
  assert.match(ranchLayoutBlock, /dog: \{ x: 95\.109375, y: 110\.65234375, size: 192 \}/);
  assert.match(source, /animal\.shopSection === shopSection/);
  assert.match(source, /\["animals", "动物"\][\s\S]*\["pets", "宠物"\]/);
  const ranchShopSources = readFarmSourceFiles([
    "./panels/shop/ranch-shop.tsx",
    "./panels/shop-panel.tsx",
  ]);
  const ranchShopSource =
    ranchShopSources.match(
      /function RanchShopPanelContent[\s\S]*?(?=function FarmShopPanelContent)/,
    )?.[0] ?? "";
  assert.match(ranchShopSource, /sectionAnimals\.map/);
  assert.doesNotMatch(ranchShopSource, /pageIndex|pageCount|pageAnimals|牧场商店分页/);
  assert.match(source, /setSelectedAnimalId\(animal\.id\)/);
  assert.match(source, /className="ranch-shop__back"/);
  assert.match(source, /aria-label="返回牧场商店"/);
  assert.match(source, /className="ranch-shop__back"[\s\S]*?>\s*‹\s*<\/button>/);
  assert.doesNotMatch(source, /‹ 返回/);
  assert.match(source, /onClick=\{\(\) => setSelectedAnimalId\(null\)\}/);
  assert.match(
    source,
    /selectedAnimal\.description \? <p>\{selectedAnimal\.description\}<\/p> : null/,
  );
  assert.doesNotMatch(source, /暂无介绍/);
  assert.match(source, /animal\.demoOwned \? \([\s\S]*"已拥有"[\s\S]*animal\.buyCost/);
  assert.match(source, /产出周期[\s\S]*回收价[\s\S]*入手成本[\s\S]*解锁条件/);
  assert.match(source, /牧场商店数据尚未接入/);
  assert.match(source, /当前页面不会显示示例动物/);
  assert.doesNotMatch(source, /持有数量|亲密度|健康|购买成功/);
  assert.match(styles, /\.ranch-shop__grid[\s\S]*grid-template-columns:\s*repeat\(3/);
  assert.match(
    styles,
    /\.ranch-shop__grid[\s\S]*grid-auto-rows:\s*26\.8cqw[\s\S]*overflow-y:\s*auto/,
  );
  assert.match(
    styles,
    /\.ranch-shop__grid > li[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\) 3\.4cqw[\s\S]*overflow:\s*hidden/,
  );
  assert.match(
    source,
    /className="ranch-shop__portrait"[\s\S]*className="ranch-shop__portrait-sprite"[\s\S]*<RanchShopAnimalSprite animal=\{animal\} \/>[\s\S]*<strong>\{animal\.name\}<\/strong>[\s\S]*<\/span>[\s\S]*className="ranch-shop__price"/,
  );
  assert.match(styles, /\.ranch-shop__portrait[\s\S]*aspect-ratio:\s*1/);
  assert.match(
    styles,
    /\.ranch-shop__portrait-sprite[\s\S]*position:\s*absolute[\s\S]*transform:\s*translate\(-50%, -50%\) scale\(0\.82\)/,
  );
  assert.match(styles, /\.ranch-shop__portrait > strong[\s\S]*position:\s*absolute/);
  assert.match(
    styles,
    /\.ranch-shop__product-button[\s\S]*border:\s*0[\s\S]*background:\s*transparent[\s\S]*box-shadow:\s*none/,
  );
  assert.match(
    ranchShopSource,
    /animal\.demoOwned \? `查看\$\{animal\.name\}详情` : `将\$\{animal\.name\}加入购物车`/,
  );
  assert.match(
    ranchShopSource,
    /const cartKey = getShopCartKey\("ranch", animal\.id\)[\s\S]*if \(animal\.demoOwned\)[\s\S]*setSelectedAnimalId\(animal\.id\)[\s\S]*onChangeCartQuantity\(cartKey, 1, 1\)/,
  );
  assert.doesNotMatch(ranchShopSource, /<ShopCartAddButton/);
  assert.doesNotMatch(styles, /\.ranch-shop__grid \.shop-cart__add/);
  assert.match(assetManifest, /animal-codex-atlas\.png/);
  assert.match(assetManifest, /alpaca-codex\.png/);
  assert.match(assetManifest, /goat-codex\.png/);
  assert.doesNotMatch(source, /animal\.id === "turkey"/);
  assert.doesNotMatch(styles, /\.ranch-shop__animal-sprite--turkey/);
  assert.doesNotMatch(source, /ranch-animals|ranchAnimals|RanchAnimalEditor/);
  assert.doesNotMatch(styles, /\.ranch-animal-editor__/);
  assert.match(styles, /\.ranch-shop__category/);
  assert.doesNotMatch(styles, /\.ranch-shop__detail-head span\s*\{/);
  assert.match(
    styles,
    /\.ranch-shop__facts\s*\{[\s\S]*gap:\s*0\.8cqw[\s\S]*\.ranch-shop__fact\s*\{[\s\S]*border:\s*0[\s\S]*background:\s*rgba\(255, 249, 226, 0\.52\)/,
  );
  assert.doesNotMatch(styles, /\.ranch-shop__fact\s*\{[^}]*border-bottom/);
  assert.match(
    styles,
    /\.farm-shop__categories\s*\{[\s\S]*border-bottom:\s*0[\s\S]*\.farm-feature__tabs\s*\{[\s\S]*border-bottom:\s*0|\.farm-feature__tabs\s*\{[\s\S]*border-bottom:\s*0[\s\S]*\.farm-shop__categories\s*\{[\s\S]*border-bottom:\s*0/,
  );
});

test("all field, ranch and cooking tools use confirmed sections while settings stay in one editable form", () => {
  const source = `${readFileSync(new URL("./page/model.ts", import.meta.url), "utf8")}\n${readFarmSources()}`;
  const styles = readFarmStyles();
  const featurePanelSources = readFarmSourceFiles([
    "./panels/tools/common.tsx",
    "./dev/farm-tool-layouts.ts",
    "./farm-page.tsx",
  ]);
  const featurePanelsSource =
    featurePanelSources.match(
      /const FARM_FEATURE_PANELS:[\s\S]*?(?=const FARM_TOOL_LAYOUTS)/,
    )?.[0] ?? "";
  const settingsPanelSources = readFarmSourceFiles([
    "./panels/tools/settings-panel.tsx",
    "./panels/tools/original-plant-creator.tsx",
    "./panels/tool-panel.tsx",
  ]);
  const settingsPanelSource =
    settingsPanelSources.match(
      /function FarmSettingsPanelContent[\s\S]*?(?=function FarmToolPanel)/,
    )?.[0] ?? "";
  const settingsFormSources = readFarmSourceFiles(["./panels/tools/settings-panel.tsx"]);
  const settingsFormSource =
    settingsFormSources.match(
      /function FarmSettingsPanelContent[\s\S]*?(?=function FarmSettingsSwitch)/,
    )?.[0] ?? "";

  assert.match(source, /const FARM_FEATURE_PANELS/);
  assert.match(source, /backpack:[\s\S]*tabs: \["种子与药水", "素材", "其他"\]/);
  assert.doesNotMatch(featurePanelsSource, /tabs: \["种子", "素材", "药水", "其他"\]/);
  assert.doesNotMatch(featurePanelsSource, /"crop-codex":/);
  assert.match(source, /market:[\s\S]*emptyLabel: "集市数据尚未接入"/);
  assert.match(
    source,
    /adventure:[\s\S]*tabs: \["当前旅程", "行囊", "本趟故事", "秘境图鉴", "旅程簿"\]/,
  );
  assert.doesNotMatch(featurePanelsSource, /smelting:/);
  assert.match(
    source,
    /ranch:[\s\S]*backpack:[\s\S]*tabs: \["配饰", "装饰", "其他"\][\s\S]*dispatch:[\s\S]*emptyLabel: "派遣数据尚未接入"/,
  );
  assert.match(
    source,
    /cooking:[\s\S]*backpack:[\s\S]*tabs: \["食材", "牧场产物", "鱼篓", "料理"\][\s\S]*recipes:[\s\S]*emptyLabel: "食谱数据尚未接入"/,
  );
  assert.doesNotMatch(featurePanelsSource, /农场资料|牧场资料|料理台资料|暂无可用设置/);
  assert.match(source, /function FarmFeaturePanelContent/);
  assert.match(
    settingsPanelSource,
    /<legend>农场名和称呼<\/legend>[\s\S]*<label htmlFor="farm-name">农场名<\/label>[\s\S]*name="farm-name"[\s\S]*<label htmlFor="ai-nickname">小机昵称<\/label>[\s\S]*name="ai-nickname"[\s\S]*<label htmlFor="human-nickname">你的昵称<\/label>[\s\S]*name="human-nickname"[\s\S]*<label htmlFor="welcome-message">欢迎语<\/label>[\s\S]*name="welcome-message"[\s\S]*<label htmlFor="active-title">佩戴称号<\/label>[\s\S]*name="active-title"[\s\S]*<legend>社交开关<\/legend>/,
  );
  assert.match(settingsPanelSource, /name="farm-name"[\s\S]*type="text"/);
  assert.match(settingsPanelSource, /maxLength=\{12\}[\s\S]*name="farm-name"/);
  assert.match(settingsPanelSource, /name="welcome-message"[\s\S]*rows=\{2\}/);
  assert.match(settingsPanelSource, /maxLength=\{60\}[\s\S]*name="welcome-message"/);
  assert.match(settingsPanelSource, /name="active-title"[\s\S]*<option value="" \/>/);
  assert.match(settingsPanelSource, /<option key=\{title\.id\} value=\{title\.id\}>/);
  assert.doesNotMatch(settingsFormSource, /placeholder="—"|<option value="">—<\/option>/);
  assert.match(settingsPanelSource, /name="ai-nickname"[\s\S]*type="text"/);
  assert.match(settingsPanelSource, /name="human-nickname"[\s\S]*type="text"/);
  assert.match(settingsPanelSource, /label="来访"[\s\S]*offLabel="谢绝来访"[\s\S]*onLabel="访问"/);
  assert.match(settingsPanelSource, /label="偷菜"[\s\S]*value=\{draft\.theftAllowed\}/);
  assert.match(settingsPanelSource, /label="帮浇水"[\s\S]*value=\{draft\.wateringHelpAllowed\}/);
  assert.match(settingsPanelSource, /label="留言"[\s\S]*value=\{draft\.messagesAllowed\}/);
  assert.match(settingsPanelSource, /const visualState = value === true \? "on" : "off"/);
  assert.match(
    settingsPanelSource,
    /data-state=\{visualState\}[\s\S]*role="switch"[\s\S]*farm-settings__switch-track[\s\S]*farm-settings__switch-thumb/,
  );
  assert.doesNotMatch(settingsPanelSource, /farm-settings__switch-state/);
  assert.doesNotMatch(styles, /farm-settings__switch\[data-state="unset"\]/);
  assert.match(
    styles,
    /\.farm-settings__switch-track\s*\{[\s\S]*width:\s*12cqw;[\s\S]*height:\s*6\.4cqw;[\s\S]*border-radius:\s*999px/,
  );
  assert.match(
    styles,
    /\.farm-settings__switch-thumb\s*\{[\s\S]*width:\s*4\.9cqw;[\s\S]*aspect-ratio:\s*1;[\s\S]*border-radius:\s*50%/,
  );
  assert.match(
    styles,
    /\.farm-settings__switch\[data-state="on"\] \.farm-settings__switch-thumb\s*\{[\s\S]*translate\(5\.6cqw, -50%\)/,
  );
  assert.match(styles, /\.farm-settings__switch:focus-visible \.farm-settings__switch-track\s*\{/);
  assert.doesNotMatch(settingsPanelSource, /addressing|socialEnabled/);
  assert.match(settingsPanelSource, /submitSetting\("ai_name", draft\.aiNickname, "小机昵称"\)/);
  assert.match(
    settingsPanelSource,
    /submitSetting\("human_name", draft\.humanNickname, "你的昵称"\)/,
  );
  assert.match(settingsPanelSource, /submitSetting\("social\.visit", visitsAllowed, "来访开关"\)/);
  assert.match(settingsPanelSource, /保存/);
  assert.doesNotMatch(settingsPanelSource, /fetch\(|localStorage|sessionStorage/);
  assert.match(source, /FARM_FEATURE_PANELS\[activeScene\]\[tool\.id\]/);
  assert.match(
    source,
    /tool\.id === "settings" \? \([\s\S]*<FarmSettingsPanelContent[\s\S]*catalogRevision=\{farmCatalog\?\.revision\}[\s\S]*draft=\{settingsDraft\}[\s\S]*editable=\{preview \|\| Boolean\(onFarmSettingsAction\)\}[\s\S]*onSave=\{onFarmSettingsAction\}/,
  );
  assert.match(
    source,
    /useState<FarmSettingsDraft>\(\(\) => \(\{[\s\S]*activeTitle: field\.farm\.equipped_title\?\.title_id \?\? "",[\s\S]*aiNickname: "",[\s\S]*farmName: field\.farm\.farm_name,[\s\S]*humanNickname: "",[\s\S]*messagesAllowed: null,[\s\S]*theftAllowed: null,[\s\S]*visitsAllowed: null,[\s\S]*wateringHelpAllowed: null,[\s\S]*welcomeMessage: field\.farm\.welcome_message \?\? ""/,
  );
  assert.match(source, /onChangeSettingsDraft=\{setSettingsDraft\}/);
  assert.match(source, /onFarmSettingsAction=\{onFarmSettingsAction\}/);
  assert.match(source, /settingsDraft=\{settingsDraft\}/);
  assert.match(settingsPanelSource, /expectedCatalogRevision: catalogRevision/);
  assert.match(settingsPanelSource, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(
    settingsPanelSource,
    /shouldRetryFarmSettingsAction\(result\.issue\) \? attempt : null/,
  );
  assert.match(source, /executeBoundFarmSettingsAction\(input\)/);
  assert.match(
    source,
    /farmCatalog:\s*\{[\s\S]*data: result\.data\.data\.resource,[\s\S]*revision: result\.data\.revision,[\s\S]*server_time: result\.data\.server_time/,
  );
  assert.match(source, /featureDefinition \? \(/);
  assert.match(source, /activeTab \? `\$\{activeTab\}暂无内容` : definition\.emptyLabel/);
  assert.match(source, /activeTab \? <span>\{definition\.emptyLabel\}<\/span> : null/);
  assert.doesNotMatch(source, /模拟库存|模拟摊位|模拟旅程|模拟设置/);
  assert.match(styles, /\.farm-feature[\s\S]*grid-template-rows:\s*auto auto/);
  assert.match(styles, /\.farm-feature__tabs button\[aria-pressed="true"\]/);
  assert.match(
    styles,
    /\.farm-feature__empty\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*justify-items:\s*center[^}]*text-align:\s*center[^}]*background:\s*rgba\(255, 253, 241, 0\.62\)/,
  );
  assert.match(
    styles,
    /\.farm-tool-panel__empty\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*justify-items:\s*center[^}]*text-align:\s*center/,
  );
  assert.match(
    styles,
    /\.farm-shop__unavailable\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*justify-items:\s*center[^}]*text-align:\s*center/,
  );
  assert.match(
    styles,
    /\.farm-neighborhood__section-head\s*\{[^}]*justify-content:\s*center[^}]*text-align:\s*center/,
  );
  assert.match(
    styles,
    /\.farm-neighborhood__empty\s*\{[^}]*justify-items:\s*center[^}]*[\s\S]*\.farm-neighborhood__empty p\s*\{[^}]*text-align:\s*center/,
  );
  assert.match(
    styles,
    /\.farm-settings__item\s*\{[^}]*grid-template-columns:\s*16cqw minmax\(0, 1fr\)[^}]*min-height:\s*12cqw[^}]*border:\s*0[^}]*background:\s*rgba\(255, 253, 241, 0\.62\)[^}]*box-shadow:\s*none/,
  );
  assert.match(
    styles,
    /\.farm-settings__item input,[\s\S]*\.farm-settings__item textarea\s*\{[^}]*min-height:\s*44px/,
  );
  assert.match(styles, /\.farm-settings__switch\[data-state="on"\]/);
});

test("live market exposes cross-farm buy and barter actions without local settlement", () => {
  const panelSource = readFileSync(
    new URL("./panels/farm-action-panels.tsx", import.meta.url),
    "utf8",
  );
  const source =
    panelSource.match(
      /export function FarmMarketPanelContent[\s\S]*?(?=type FarmCatalogCodexAvailable)/,
    )?.[0] ?? "";
  const styles = readFarmStyles();

  assert.match(source, /market\.listings\.filter/);
  assert.match(source, /market\.barter_listings/);
  assert.match(source, /action: "buy"/);
  assert.match(source, /action: "barter-accept"/);
  assert.match(source, /action: "unlist"/);
  assert.match(source, /action: "barter-unlist"/);
  assert.match(source, /quantity: Math\.min\(1, listing\.quantity\)/);
  assert.doesNotMatch(source, /跨农场购买与接受换物需要原子结算合同/);
  assert.doesNotMatch(source, /farm_coins|silver_balance|localStorage|sessionStorage/);
  assert.match(styles, /\.farm-crop-codex__list\s*\{[\s\S]*overflow-y:\s*auto/);
});

test("farm create tool submits the five-field draft to the authority action", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();
  const creatorSources = readFarmSourceFiles([
    "./panels/tools/original-plant-creator.tsx",
    "./panels/tool-panel.tsx",
  ]);
  const creatorSource =
    creatorSources.match(/function OriginalPlantCreator[\s\S]*?(?=function FarmToolPanel)/)?.[0] ??
    "";

  assert.match(source, /interface OriginalPlantDraft/);
  assert.match(creatorSource, /aria-label="原创植物设计"/);
  assert.match(creatorSource, /name="original-plant-name"/);
  assert.match(creatorSource, /name="original-plant-latin-name"/);
  assert.match(creatorSource, /name="original-plant-description"/);
  assert.match(creatorSource, /name="original-plant-sowing-text"/);
  assert.match(creatorSource, /name="original-plant-harvest-text"/);
  assert.match(creatorSource, /完成设计/);
  assert.match(creatorSource, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(creatorSource, /expectedRevision: catalogRevision as string/);
  assert.match(creatorSource, /result\.data\.data\.result/);
  assert.match(creatorSource, /retryableAttempt/);
  assert.doesNotMatch(creatorSource, /fetch\(|localStorage|sessionStorage/);
  assert.match(
    source,
    /activeScene === "field" && tool\.id === "create"[\s\S]*<OriginalPlantCreator[\s\S]*catalogRevision=\{farmCatalog\?\.original_plant_revision\}[\s\S]*draft=\{originalPlantDraft\}[\s\S]*onCreate=\{onOriginalPlantAction\}/,
  );
  assert.match(source, /executeBoundOriginalPlantAction\(input\)/);
  assert.match(source, /requireResource\("farmCatalog", true\)/);
  assert.match(source, /useState<OriginalPlantDraft>\(\(\) => \(\{/);
  assert.match(source, /onChangeOriginalPlantDraft=\{setOriginalPlantDraft\}/);
  assert.match(source, /originalPlantDraft=\{originalPlantDraft\}/);
  assert.match(
    styles,
    /\.original-plant-creator\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/,
  );
  assert.match(styles, /\.original-plant-creator__fields\s*\{[\s\S]*overflow-y:\s*auto/);
});

test("smelting preview uses the authoritative 30-material atlas in a fixed four-column selector", () => {
  const source = readFarmSources();
  const assetManifest = readFileSync(new URL("./farm-asset-manifest.ts", import.meta.url), "utf8");
  const styles = readFarmStyles();
  const smeltingSources = readFarmSourceFiles([
    "./panels/tools/smelting-panel.tsx",
    "./panels/tools/settings-panel.tsx",
  ]);
  const smeltingSource =
    smeltingSources.match(
      /function SmeltingMaterialSprite[\s\S]*?(?=function FarmSettingsPanelContent)/,
    )?.[0] ?? "";
  const materialCatalogSource =
    source.match(
      /const SMELTING_MATERIALS = \[[\s\S]*?satisfies readonly SmeltingMaterial\[\];/,
    )?.[0] ?? "";

  assert.equal((materialCatalogSource.match(/\{ id:/g) ?? []).length, 30);
  assert.match(materialCatalogSource, /ordinary_stone[\s\S]*name: "普通石头"[\s\S]*rarity: "N"/);
  assert.match(materialCatalogSource, /thunderstruck_wood[\s\S]*name: "雷击木"[\s\S]*rarity: "SR"/);
  assert.match(materialCatalogSource, /creation_echo[\s\S]*name: "创世余音"[\s\S]*rarity: "SP"/);
  assert.match(
    source,
    /const SMELTING_RARITY_ORDER = \{[\s\S]*N: 0,[\s\S]*R: 1,[\s\S]*SR: 2,[\s\S]*SSR: 3,[\s\S]*SP: 4,/,
  );
  assert.match(
    source,
    /const SORTED_SMELTING_MATERIALS = \[\.\.\.SMELTING_MATERIALS\]\.sort\([\s\S]*SMELTING_RARITY_ORDER\[left\.rarity\] - SMELTING_RARITY_ORDER\[right\.rarity\]/,
  );
  assert.match(assetManifest, /"field\.material\.atlas"[\s\S]*materials-atlas\.png/);
  assert.match(assetManifest, /pixelWidth: 1254,[\s\S]*pixelHeight: 1254/);
  assert.match(assetManifest, /export const SMELTING_MATERIAL_IDS = \[[\s\S]*"creation_echo"/);
  assert.deepEqual(getSmeltingMaterialAsset("ordinary_stone")?.atlasViewport, {
    x: 27,
    y: 32,
    width: 230,
    height: 200,
  });
  assert.deepEqual(getSmeltingMaterialAsset("thunderstruck_wood")?.atlasViewport, {
    x: 750,
    y: 231,
    width: 230,
    height: 200,
  });
  assert.deepEqual(getSmeltingMaterialAsset("creation_echo")?.atlasViewport, {
    x: 974,
    y: 1006,
    width: 230,
    height: 200,
  });
  assert.equal(getSmeltingMaterialAsset("ordinary_stone")?.atlasFrame, undefined);
  assert.match(
    source,
    /function getSmeltingMaterialSpriteStyle[\s\S]*backgroundPosition:[\s\S]*backgroundSize:/,
  );
  assert.match(
    smeltingSource,
    /<span[\s\S]*className="smelting-catalog__sprite"[\s\S]*style=\{getSmeltingMaterialSpriteStyle\(asset\)\}/,
  );
  assert.doesNotMatch(smeltingSource, /<svg[\s\S]*<image/);
  assert.match(smeltingSource, /useState<string\[]>\(\[\]\)/);
  assert.match(
    smeltingSource,
    /const selectedCount = current\.filter\(\(selectedId\) => selectedId === materialId\)\.length;[\s\S]*current\.length >= 3[\s\S]*selectedCount >= availableQuantity[\s\S]*return \[\.\.\.current, materialId\]/,
  );
  assert.match(smeltingSource, /const \[actionState, setActionState\] = useState/);
  assert.match(smeltingSource, /aria-pressed=\{selected\}/);
  assert.match(
    smeltingSource,
    /className="smelting-catalog__selected-count"[\s\S]*\{selectedCount\}/,
  );
  assert.match(smeltingSource, /onClick=\{\(\) => removeMaterial\(material\.id\)\}/);
  assert.match(smeltingSource, /SORTED_SMELTING_MATERIALS\.map\(\(material\) =>/);
  assert.match(
    smeltingSource,
    /className="smelting-catalog__quantity">\s*×\{material\.quantity === null \? "—" : material\.quantity\}\s*<\/span>/,
  );
  assert.match(smeltingSource, /<strong>\{material\.name \?\? "身份不可用"\}<\/strong>/);
  assert.match(
    smeltingSource,
    /<small data-rarity=\{material\.rarity\}>\{material\.rarity\}<\/small>/,
  );
  assert.match(
    smeltingSource,
    /aria-label="开始熔炼"[\s\S]*disabled=\{selectedMaterialIds\.length !== 3 \|\| actionState\.stage === "submitting"\}[\s\S]*onClick=\{\(\) => void submit\(\)\}/,
  );
  assert.match(
    smeltingSource,
    /aria-label="熔炼结果"[\s\S]*role="status"[\s\S]*actionState\.cropName[\s\S]*actionState\.rarity[\s\S]*actionState\.byRecipe/,
  );
  assert.match(smeltingSource, /liveSmelting\.write_status !== "available"/);
  assert.match(smeltingSource, /expectedSmeltingRevision: liveSmelting\.revision/);
  assert.match(smeltingSource, /await onSmeltingAction\(input\)/);
  assert.match(smeltingSource, /熔炼暂时不可用/);
  assert.doesNotMatch(smeltingSource, /fetch\(|购买成功|扣除|获得种子/);
  assert.match(source, /activeScene === "field" && tool\.id === "smelting"/);
  assert.match(styles, /\.smelting-catalog\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto/);
  assert.match(
    styles,
    /\.smelting-catalog__grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)[^}]*overflow-y:\s*auto/,
  );
  assert.match(styles, /\.smelting-catalog__material\[aria-pressed="true"\]/);
  assert.match(
    styles,
    /\.smelting-catalog__selected-count\s*\{[^}]*top:\s*0[^}]*right:\s*0[^}]*color:\s*#fff8dc[^}]*border-radius:\s*50%[^}]*background:\s*#78933f/,
  );
  assert.match(
    styles,
    /\.smelting-catalog__sprite\s*\{[^}]*top:\s*15\.83%;[^}]*left:\s*13%;[^}]*width:\s*74%;[^}]*height:\s*auto;[^}]*background-repeat:\s*no-repeat/,
  );
  assert.match(styles, /\.smelting-catalog__sprite\s*\{[^}]*overflow:\s*hidden/);
  assert.match(
    styles,
    /\.smelting-catalog__quantity\s*\{[^}]*top:\s*5%;[^}]*left:\s*5%;[^}]*font-size:\s*clamp\(0\.38rem, 1\.5cqw, 0\.46rem\)/,
  );
  assert.doesNotMatch(
    styles,
    /\.smelting-catalog__quantity\s*\{[^}]*(background|border-radius|box-shadow|padding):/,
  );
  assert.match(
    styles,
    /\.smelting-catalog__grid strong\s*\{[^}]*font-size:\s*clamp\(0\.48rem, 2\.05cqw, 0\.61rem\)/,
  );
  assert.match(
    styles,
    /\.smelting-catalog__grid small\s*\{[^}]*top:\s*5%;[^}]*right:\s*5%;[^}]*font-size:\s*clamp\(0\.38rem, 1\.5cqw, 0\.46rem\)/,
  );
  assert.match(styles, /\.smelting-catalog__footer\s*\{[^}]*justify-content:\s*center/);
  assert.match(styles, /\.smelting-catalog__footer button\s*\{[^}]*border-radius:\s*999px/);
  assert.match(
    styles,
    /\.smelting-catalog--notice\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center/,
  );
  assert.match(styles, /\.smelting-catalog__notice\s*\{[^}]*justify-items:\s*center/);
});

test("farm scene covers the viewport while controls stay on the viewport UI layer", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();
  const controlsStyle = styles.match(/\.farm-game__controls\s*\{[^}]*\}/)?.[0] ?? "";
  const roundButtonStyle = styles.match(/\.farm-game__round-button\s*\{[^}]*\}/)?.[0] ?? "";
  const activeRoundButtonStyle =
    styles.match(/\.farm-game__round-button:active:not\(:disabled\)\s*\{[^}]*\}/)?.[0] ?? "";

  assert.match(styles, /aspect-ratio:\s*862\s*\/\s*1825/);
  assert.match(styles, /container-name:\s*farm-canvas/);
  assert.doesNotMatch(source, /FarmGameCanvas|FARM_CANVAS_WIDTH|FARM_CANVAS_HEIGHT/);
  assert.doesNotMatch(styles, /\.farm-game__canvas|--farm-canvas-scale/);
  assert.match(source, /className="farm-game__shell">[\s\S]*className="farm-game__controls"/);
  assert.match(
    source,
    /const FARM_SCENE_BALANCES:[\s\S]*field: \{ currency: "gold", label: "农场金币" \}[\s\S]*ranch: \{ currency: "gold", label: "牧场金币" \}[\s\S]*cooking: \{ currency: "silver", label: "银币" \}/,
  );
  const balanceSource =
    source.match(/function SceneBalance[\s\S]*?(?=function FarmToolBar)/)?.[0] ?? "";
  assert.match(
    balanceSource,
    /const value = sceneId === "field" \? farmCoins : sceneId === "ranch" \? ranchCoins : silver/,
  );
  assert.match(balanceSource, /<strong>\{value \?\? "—"\}<\/strong>/);
  assert.match(
    balanceSource,
    /aria-label=\{value === null \? `\$\{balance\.label\}余额暂未接入` : `\$\{balance\.label\}余额 \$\{value\}`\}/,
  );
  assert.doesNotMatch(balanceSource, /<span>\{balance\.label\}<\/span>/);
  assert.match(
    source,
    /activeScene !== "neighborhood"[\s\S]*<SceneBalance[\s\S]*farmCoins=\{field\.balance\.farm_coins\}[\s\S]*ranchCoins=[\s\S]*sceneId=\{activeScene\}[\s\S]*silver=/,
  );
  assert.match(
    styles,
    /\.farm-scene-balance\s*\{[\s\S]*position:\s*absolute[\s\S]*top:\s*clamp\(18px, 2\.6vmin, 24px\)[\s\S]*left:\s*50%[\s\S]*z-index:\s*35[\s\S]*display:\s*inline-grid[\s\S]*grid-template-columns:\s*auto minmax\(2ch, 1fr\)[\s\S]*transform:\s*translateX\(-50%\)/,
  );
  assert.match(styles, /\.farm-scene-balance--gold i[\s\S]*background:\s*#f3c452/);
  assert.match(
    styles,
    /\.farm-scene-balance--silver i[\s\S]*linear-gradient\(145deg, #f2f1e9 12%, #c7cdcc 54%, #aab2b4 100%\)/,
  );
  const balanceStyle = styles.match(/\.farm-scene-balance\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(balanceStyle, /min-width:\s*clamp\(62px, 18vmin, 86px\)/);
  assert.match(balanceStyle, /padding:/);
  assert.match(balanceStyle, /border:\s*1px solid rgba\(70, 42, 20, 0\.82\)/);
  assert.match(
    balanceStyle,
    /linear-gradient\(180deg, rgba\(145, 97, 52, 0\.97\), rgba\(92, 55, 29, 0\.98\)\)/,
  );
  assert.match(balanceStyle, /box-shadow:/);
  assert.doesNotMatch(balanceStyle, /panel-parchment\.png/);
  assert.doesNotMatch(styles, /\.farm-scene-balance span\s*\{/);
  assert.doesNotMatch(styles, /\.farm-scene-balance\s*\{[^}]*cqw/);
  assert.match(
    styles,
    /\.farm-scene\s*\{[\s\S]*width:\s*max\(100%,\s*47\.233cqh\)[\s\S]*height:\s*max\(100%,\s*211\.717cqw\)[\s\S]*transform:\s*translate\(-50%,\s*-50%\)/,
  );
  assert.match(
    styles,
    /\.farm-game__shell\s*\{[^}]*--farm-control-size:\s*min\(13cqw,\s*6\.15cqh\)/,
  );
  assert.match(
    controlsStyle,
    /top:\s*calc\(var\(--farm-control-size\)\s*\/\s*3\)[^}]*right:\s*calc\(var\(--farm-control-size\)\s*\/\s*3\)[^}]*left:\s*calc\(var\(--farm-control-size\)\s*\/\s*3\)/,
  );
  assert.doesNotMatch(controlsStyle, /clamp\(|vmin|--farm-canvas-scale/);
  assert.match(styles, /\.farm-tool-menu\s*\{[\s\S]*right:\s*1\.2%/);
  assert.match(styles, /\.farm-tool-panel\s*\{[\s\S]*right:\s*10\.7%/);
  assert.match(
    styles,
    /\.farm-game__bottom\s*\{[\s\S]*right:\s*0[\s\S]*bottom:\s*0[\s\S]*left:\s*0/,
  );
  assert.match(
    roundButtonStyle,
    /flex:\s*0 0 var\(--farm-control-size\)[^}]*width:\s*var\(--farm-control-size\)[^}]*min-width:\s*var\(--farm-control-size\)[^}]*max-width:\s*var\(--farm-control-size\)[^}]*height:\s*var\(--farm-control-size\)[^}]*min-height:\s*var\(--farm-control-size\)[^}]*max-height:\s*var\(--farm-control-size\)[^}]*aspect-ratio:\s*1/,
  );
  assert.match(
    roundButtonStyle,
    /border:\s*calc\(var\(--farm-control-size\)\s*\/\s*18\)[^}]*box-shadow:[^}]*calc\(var\(--farm-control-size\)\s*\/\s*3\)/,
  );
  assert.match(
    activeRoundButtonStyle,
    /translateY\(calc\(var\(--farm-control-size\)\s*\/\s*22\)\)[^}]*box-shadow:/,
  );
  assert.doesNotMatch(roundButtonStyle, /clamp\(|vmin|cqw|cqh|--farm-canvas-scale/);
  assert.doesNotMatch(activeRoundButtonStyle, /clamp\(|vmin|cqw|cqh|--farm-canvas-scale/);
  assert.match(styles, /background-size:\s*100% 100%/);
  assert.match(styles, /scene-tabs-frame-v2\.png/);
  assert.match(styles, /plot-tile\.png/);
  assert.match(styles, /--farm-plot-size:\s*12\.16cqw/);
  assert.match(styles, /--farm-plot-gap:\s*0\.4cqw/);
  assert.match(styles, /\.farm-plots[\s\S]*top:\s*45%/);
  assert.match(styles, /\.farm-plots[\s\S]*left:\s*46%/);
  assert.match(styles, /grid-template-columns:\s*repeat\(6,\s*var\(--farm-plot-size\)\)/);
  assert.match(styles, /grid-auto-rows:\s*var\(--farm-plot-size\)/);
  assert.match(styles, /\.farm-plots[\s\S]*width:\s*74\.96cqw/);
  assert.match(styles, /\.farm-plots[\s\S]*max-height:\s*74\.96cqw[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /plot-tile\.png[^;]+112% 112% no-repeat/);
  assert.match(
    styles,
    /\.farm-plot\[aria-pressed="true"\][\s\S]*outline:\s*0[\s\S]*inset 0 0 0 3px #fff0a9/,
  );
  assert.match(styles, /\.farm-game__bottom[\s\S]*right:\s*0[\s\S]*bottom:\s*0[\s\S]*left:\s*0/);
  assert.doesNotMatch(styles, /button\[aria-current="page"\][\s\S]*tool-cell-light\.png/);
  assert.match(
    styles,
    /\.farm-neighborhood\s*\{[\s\S]*grid-template-rows:\s*11\.7cqw minmax\(0, 1fr\)/,
  );
  assert.match(styles, /\.farm-neighborhood__tabs\s*\{[\s\S]*padding-inline:\s*3\.9%/);
  assert.match(
    styles,
    /\.farm-neighborhood__tabs\s*\{[^}]*align-self:\s*start;[^}]*height:\s*9\.8cqw;/s,
  );
  assert.match(
    styles,
    /\.farm-neighborhood__link\s*\{[\s\S]*display:\s*grid[\s\S]*min-height:\s*0[\s\S]*place-items:\s*center[\s\S]*line-height:\s*1/,
  );
  assert.match(
    styles,
    /\.farm-neighborhood__link\[aria-selected="true"\]\s*\{[\s\S]*color:\s*#fff5ce/,
  );
  assert.match(
    styles,
    /\.farm-neighborhood__link\[aria-selected="true"\]::before[\s\S]*inset:\s*0\.65cqw 0\.45cqw 0\.55cqw[\s\S]*linear-gradient\(180deg, #839c4b, #6e873a\)/,
  );
  assert.match(styles, /tool-cell-textured\.png/);
  assert.match(source, /iconKey: "shell\.bulletin"/);
  assert.match(styles, /\.farm-tools img[\s\S]*position:\s*absolute/);
  assert.match(source, /getFarmToolIconStyle\(layout\)/);
  assert.match(source, /getFarmToolTextStyle\(layout\)/);
  assert.match(source, /layout\.iconSize \/ FARM_TOOL_EDITOR_CANVAS_SIZE/);
  assert.match(source, /layout\.textSize \/ FARM_TOOL_EDITOR_CANVAS_SIZE/);
  assert.match(styles, /\.farm-tools img[\s\S]*drop-shadow\(1px 0 0 #fff8dc\)/);
  assert.match(styles, /\.farm-tools span[\s\S]*position:\s*absolute/);
  assert.match(styles, /\.farm-tools span[\s\S]*font-weight:\s*800/);
  assert.match(styles, /\.farm-tools span[\s\S]*drop-shadow\(1px 0 0 #fff8dc\)/);
  assert.doesNotMatch(styles, /0\.7px 0 currentColor/);
  assert.doesNotMatch(styles, /top:\s*clamp\(330px,\s*43svh,\s*390px\)/);
  assert.match(styles, /\.farm-scene-tabs button:focus-visible[\s\S]*outline:\s*2px solid #fff0b5/);
  assert.doesNotMatch(styles, /\.farm-scene-tabs button:focus-visible img/);
  assert.match(styles, /\.farm-plots[\s\S]*border:\s*0[\s\S]*background:\s*transparent/);
});

test("full demo shows 20 local-only plots in the fixed six-column layout", () => {
  const appSource = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");

  assert.match(appSource, /candidateTwoFarmPreviewPlots[\s\S]*length:\s*20/);
  assert.match(appSource, /plots:\s*candidateTwoFarmPreviewPlots/);
});

test("farm toolbar icons are mobile-sized transparent assets instead of full scene images", () => {
  const iconNames = [
    "shop",
    "backpack",
    "codex",
    "recipes",
    "seed-recipe",
    "speed-potion",
    "potion-set",
    "market",
    "adventure",
    "smelting",
    "ranking",
    "message-board",
    "settings",
    "field",
    "ranch",
    "neighborhood",
    "dingdong-bulletin",
  ];

  for (const iconName of iconNames) {
    const icon = new URL(`../../public/farm/ui-icons/${iconName}.png`, import.meta.url);
    assert.ok(statSync(icon).size < 60 * 1024, `${iconName} should stay below 60 KiB`);
  }
});

test("three crop families keep separate growing and ripe transparent assets", () => {
  const cropAssets = [
    "ordinary-growing",
    "ordinary-ripe",
    "fantasy-growing",
    "fantasy-ripe",
    "limited-growing",
    "limited-ripe",
  ];

  for (const assetName of cropAssets) {
    const asset = new URL(`../../public/farm/crops/${assetName}.png`, import.meta.url);
    assert.ok(statSync(asset).size < 240 * 1024, `${assetName} should stay below 240 KiB`);
  }
});

test("normal farm toolbar uses all finalized editor layouts including smelting", () => {
  const source = readFarmSources();

  assert.match(source, /const FARM_TOOL_LAYOUTS/);
  assert.match(
    source,
    /bulletin:[\s\S]*iconX: 91\.953125[\s\S]*iconY: 77\.484375[\s\S]*iconSize: 211\.2[\s\S]*textX: 97\.7265625[\s\S]*textY: 143\.6640625/,
  );
  assert.match(source, /backpack:[\s\S]*iconSize: 163\.2[\s\S]*textY: 151\.046875/);
  assert.match(source, /"message-board":[\s\S]*iconSize: 186\.24/);
  assert.match(source, /settings:[\s\S]*textX: 98\.6171875[\s\S]*textY: 139\.16015625/);
  assert.match(source, /recipes:[\s\S]*iconSize: 147\.84[\s\S]*textY: 138\.58984375/);
  assert.match(source, /smelting:[\s\S]*iconSize: 173\.76[\s\S]*textY: 141\.98828125/);
  assert.match(source, /FARM_TOOL_LAYOUTS\[tool\.id\]/);
});

test("temporary farm tool editor keeps icon and text as separately adjustable layers", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();

  assert.match(
    source,
    /<FarmLazyBoundary[\s\S]*import\.meta\.env\.DEV && isFarmToolEditorEnabled\(\) \? \([\s\S]*<FarmToolEditor/,
  );
  assert.match(source, /get\("editor"\) === "farm-tools"/);
  assert.match(source, /FARM_TOOL_EDITOR_CANVAS_SIZE = 192/);
  assert.match(source, /FARM_TOOL_EDITOR_HASH_PREFIX = "#farmTools="/);
  assert.match(source, /id: "bulletin"[\s\S]*label: "叮咚播报"/);
  assert.match(source, /FARM_TOOL_LAYOUTS\[tool\.id\] \?\? DEFAULT_FARM_TOOL_EDITOR_LAYOUT/);
  assert.match(source, /startLayerDrag\("icon"/);
  assert.match(source, /startLayerDrag\("text"/);
  assert.match(source, />图标大小</);
  assert.match(source, />文字大小</);
  assert.match(source, /farm-tool-editor__actual-preview/);
  assert.match(source, /selectedLayout\.textSize \/ FARM_TOOL_EDITOR_CANVAS_SIZE/);
  assert.match(source, /重置当前工具/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(styles, /\.farm-tool-editor__canvas[\s\S]*width:\s*192px/);
  assert.match(styles, /\.farm-tool-editor__actual-cell[\s\S]*width:\s*13\.7cqw/);
  assert.match(
    styles,
    /\.farm-tool-menu__toggle::before,[\s\S]*\.farm-tools button::before[\s\S]*tool-cell-textured\.png[\s\S]*opacity:\s*1/,
  );
});

test("cooking scene keeps the approved layouts after the temporary editor is removed", () => {
  const source = readFarmSources();
  const styles = readFarmStyles();

  assert.match(source, /type CookingToolLayouts = Record<CookingMethodId, CookingToolLayout>/);
  assert.match(source, /getCookingToolLayoutId\(selectedCookingMethod\.id\)/);
  assert.match(source, /roast: \{ x: 49\.39713550883651, y: 66\.69322842368047, width: 64\.5 \}/);
  assert.match(
    source,
    /"stir-fry": \{ x: 48\.85234164420485, y: 68\.54087925203899, width: 46\.5 \}/,
  );
  assert.match(
    source,
    /"pan-fry": \{ x: 48\.85234164420485, y: 68\.54087925203899, width: 46\.5 \}/,
  );
  assert.doesNotMatch(
    source,
    /get\("editor"\) === "cooking-tools"|#cookingTools=|CookingToolEditor|farm-cooking-editor/,
  );
  assert.doesNotMatch(styles, /farm-cooking-editor/);
});

test("farm field error copy distinguishes qualification, credential, contract and service outage", () => {
  assert.equal(
    farmFieldIssueMessage({ code: "qq_not_group_member", serverMessage: null }),
    "当前 QQ 已不具备社区访问资格。",
  );
  assert.equal(
    farmFieldIssueMessage({ code: "farm_credential_invalid", serverMessage: null }),
    "当前账号保存的农场凭据已经失效，请重新确认农场绑定。",
  );
  assert.equal(
    farmFieldIssueMessage({ code: "upstream_contract_unavailable", serverMessage: null }),
    "农场返回的数据暂时无法由当前页面读取。",
  );
  assert.equal(
    farmFieldIssueMessage({ code: "farm_unavailable", serverMessage: null }),
    "农场服务暂时不可用，农场数据没有完成读取。",
  );
});
