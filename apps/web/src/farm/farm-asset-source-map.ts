/**
 * The manifest keeps stable public source IDs. Vite rewrites each literal
 * `new URL(..., import.meta.url)` into a content-hashed URL at build time.
 * Keeping this table explicit prevents display names, atlas coordinates, or
 * directory scans from becoming an implicit asset lookup protocol.
 */
export const FARM_ASSET_SOURCE_URLS = {
  "/farm/animals/animal-codex-atlas.png": new URL(
    "./assets/animals/animal-codex-atlas.png",
    import.meta.url,
  ).href,
  "/farm/animals/goat-codex.png": new URL("./assets/animals/goat-codex.png", import.meta.url).href,
  "/farm/animals/alpaca-codex.png": new URL("./assets/animals/alpaca-codex.png", import.meta.url)
    .href,
  "/farm/animals/limited-skins/pompompurin.png": new URL(
    "./assets/animals/limited-skins/pompompurin.png",
    import.meta.url,
  ).href,
  "/farm/animals/limited-skins/hachiware.png": new URL(
    "./assets/animals/limited-skins/hachiware.png",
    import.meta.url,
  ).href,
  "/farm/animals/limited-skins/usagi.png": new URL(
    "./assets/animals/limited-skins/usagi.png",
    import.meta.url,
  ).href,
  "/farm/animals/limited-skins/mysweetpiano.png": new URL(
    "./assets/animals/limited-skins/mysweetpiano.png",
    import.meta.url,
  ).href,
  "/farm/ui-icons/field.png": new URL("./assets/ui-icons/field.png", import.meta.url).href,
  "/farm/ui-icons/ranch.png": new URL("./assets/ui-icons/ranch.png", import.meta.url).href,
  "/farm/ui-icons/neighborhood.png": new URL("./assets/ui-icons/neighborhood.png", import.meta.url)
    .href,
  "/farm/ui-icons/dingdong-bulletin.png": new URL(
    "./assets/ui-icons/dingdong-bulletin.png",
    import.meta.url,
  ).href,
  "/farm/ui/field-plaque.png": new URL("./assets/ui/field-plaque.png", import.meta.url).href,
  "/farm/ui-icons/shop.png": new URL("./assets/ui-icons/shop.png", import.meta.url).href,
  "/farm/ui-icons/backpack.png": new URL("./assets/ui-icons/backpack.png", import.meta.url).href,
  "/farm/ui-icons/codex.png": new URL("./assets/ui-icons/codex.png", import.meta.url).href,
  "/farm/ui-icons/create-plant.png": new URL("./assets/ui-icons/create-plant.png", import.meta.url)
    .href,
  "/farm/ui-icons/market.png": new URL("./assets/ui-icons/market.png", import.meta.url).href,
  "/farm/ui-icons/adventure.png": new URL("./assets/ui-icons/adventure.png", import.meta.url).href,
  "/farm/ui-icons/smelting.png": new URL("./assets/ui-icons/smelting.png", import.meta.url).href,
  "/farm/ui-icons/settings.png": new URL("./assets/ui-icons/settings.png", import.meta.url).href,
  "/farm/ui-icons/dispatch.png": new URL("./assets/ui-icons/dispatch.png", import.meta.url).href,
  "/farm/ui-icons/trail-watered.png": new URL(
    "./assets/ui-icons/trail-watered.png",
    import.meta.url,
  ).href,
  "/farm/ui-icons/trail-stolen.png": new URL("./assets/ui-icons/trail-stolen.png", import.meta.url)
    .href,
  "/farm/ui-icons/trail-foiled.png": new URL("./assets/ui-icons/trail-foiled.png", import.meta.url)
    .href,
  "/farm/ui-icons/recipes.png": new URL("./assets/ui-icons/recipes.png", import.meta.url).href,
  "/farm/ui-icons/ranking.png": new URL("./assets/ui-icons/ranking.png", import.meta.url).href,
  "/farm/ui-icons/message-board.png": new URL(
    "./assets/ui-icons/message-board.png",
    import.meta.url,
  ).href,
  "/farm/crops/ordinary-growing.png": new URL(
    "./assets/crops/ordinary-growing.png",
    import.meta.url,
  ).href,
  "/farm/crops/ordinary-ripe.png": new URL("./assets/crops/ordinary-ripe.png", import.meta.url)
    .href,
  "/farm/crops/fantasy-growing.png": new URL("./assets/crops/fantasy-growing.png", import.meta.url)
    .href,
  "/farm/crops/fantasy-ripe.png": new URL("./assets/crops/fantasy-ripe.png", import.meta.url).href,
  "/farm/crops/limited-growing.png": new URL("./assets/crops/limited-growing.png", import.meta.url)
    .href,
  "/farm/crops/limited-ripe.png": new URL("./assets/crops/limited-ripe.png", import.meta.url).href,
  "/farm/ui-icons/speed-potion.png": new URL("./assets/ui-icons/speed-potion.png", import.meta.url)
    .href,
  "/farm/ui-icons/potion-set.png": new URL("./assets/ui-icons/potion-set.png", import.meta.url)
    .href,
  "/farm/ui-icons/seed-recipe.png": new URL("./assets/ui-icons/seed-recipe.png", import.meta.url)
    .href,
  "/farm/smelting/materials-atlas.png": new URL(
    "./assets/smelting/materials-atlas.png",
    import.meta.url,
  ).href,
  "/farm/smelting/limited-batch-20260904/rain-marked-glass.png": new URL(
    "./assets/smelting/limited-batch-20260904/rain-marked-glass.png",
    import.meta.url,
  ).href,
  "/farm/smelting/limited-batch-20260904/morning-mist-gauze.png": new URL(
    "./assets/smelting/limited-batch-20260904/morning-mist-gauze.png",
    import.meta.url,
  ).href,
  "/farm/smelting/limited-batch-20260904/moon-honey-wax.png": new URL(
    "./assets/smelting/limited-batch-20260904/moon-honey-wax.png",
    import.meta.url,
  ).href,
  "/farm/smelting/limited-batch-20260904/cloud-whale-bone.png": new URL(
    "./assets/smelting/limited-batch-20260904/cloud-whale-bone.png",
    import.meta.url,
  ).href,
  "/farm/smelting/limited-batch-20260904/starwatch-feather.png": new URL(
    "./assets/smelting/limited-batch-20260904/starwatch-feather.png",
    import.meta.url,
  ).href,
  "/farm/smelting/limited-batch-20260904/sky-clock-core.png": new URL(
    "./assets/smelting/limited-batch-20260904/sky-clock-core.png",
    import.meta.url,
  ).href,
  "/farm/cooking-tools/roast-oven.png": new URL(
    "./assets/cooking-tools/roast-oven.png",
    import.meta.url,
  ).href,
  "/farm/cooking-tools/stew-pot.png": new URL(
    "./assets/cooking-tools/stew-pot.png",
    import.meta.url,
  ).href,
  "/farm/cooking-tools/wok.png": new URL("./assets/cooking-tools/wok.png", import.meta.url).href,
  "/farm/cooking-tools/deep-fryer.png": new URL(
    "./assets/cooking-tools/deep-fryer.png",
    import.meta.url,
  ).href,
  "/farm/cooking-tools/steamer.png": new URL("./assets/cooking-tools/steamer.png", import.meta.url)
    .href,
  "/farm/cooking-tools/dessert-mixing.png": new URL(
    "./assets/cooking-tools/dessert-mixing.png",
    import.meta.url,
  ).href,
  "/farm/cooking-tools/drink-mixer.png": new URL(
    "./assets/cooking-tools/drink-mixer.png",
    import.meta.url,
  ).href,
  "/farm/cooking-catalog/ingredient-atlas.webp": new URL(
    "./assets/cooking-catalog/ingredient-atlas.webp",
    import.meta.url,
  ).href,
  "/farm/cooking-catalog/ingredient-atlas-2.webp": new URL(
    "./assets/cooking-catalog/ingredient-atlas-2.webp",
    import.meta.url,
  ).href,
  "/farm/cooking-catalog/dish-atlas.webp": new URL(
    "./assets/cooking-catalog/dish-atlas.webp",
    import.meta.url,
  ).href,
  "/farm/cooking-catalog/dish-atlas-2.webp": new URL(
    "./assets/cooking-catalog/dish-atlas-2.webp",
    import.meta.url,
  ).href,
  "/farm/cooking-catalog/fishing-cooking-atlas.png": new URL(
    "./assets/cooking-catalog/fishing-cooking-atlas.png",
    import.meta.url,
  ).href,
  "/farm/ui/neighborhood-shell.png": new URL("./assets/ui/neighborhood-shell.png", import.meta.url)
    .href,
  "/farm/scenes/field-spring.png": new URL(
    "./assets/scenes/field-spring.png",
    import.meta.url,
  ).href,
  "/farm/scenes/field-summer.png": new URL(
    "./assets/scenes/field-summer.png",
    import.meta.url,
  ).href,
  "/farm/scenes/field-autumn.png": new URL(
    "./assets/scenes/field-autumn.png",
    import.meta.url,
  ).href,
  "/farm/scenes/field-winter.png": new URL(
    "./assets/scenes/field-winter.png",
    import.meta.url,
  ).href,
  "/farm/scenes/field-rain.png": new URL("./assets/scenes/field-rain.png", import.meta.url)
    .href,
  "/farm/scenes/field-snow.png": new URL("./assets/scenes/field-snow.png", import.meta.url)
    .href,
  "/farm/scenes/ranch-spring.png": new URL(
    "./assets/scenes/ranch-spring.png",
    import.meta.url,
  ).href,
  "/farm/scenes/ranch-summer.png": new URL(
    "./assets/scenes/ranch-summer.png",
    import.meta.url,
  ).href,
  "/farm/scenes/ranch-autumn.png": new URL(
    "./assets/scenes/ranch-autumn.png",
    import.meta.url,
  ).href,
  "/farm/scenes/ranch-winter.png": new URL(
    "./assets/scenes/ranch-winter.png",
    import.meta.url,
  ).href,
  "/farm/scenes/ranch-rain.png": new URL("./assets/scenes/ranch-rain.png", import.meta.url)
    .href,
  "/farm/scenes/ranch-snow.png": new URL("./assets/scenes/ranch-snow.png", import.meta.url)
    .href,
} as const;

export type FarmAssetSourcePath = keyof typeof FARM_ASSET_SOURCE_URLS;

/**
 * Node-based source tests intentionally retain the old public URL as a
 * compatibility value. In Vite dev/build, the mapped URL is a served or
 * hashed same-origin asset URL and becomes the actual browser source.
 */
export function getFarmAssetRuntimeUrl(sourceUrl: string): string {
  const runtimeUrl = FARM_ASSET_SOURCE_URLS[sourceUrl as FarmAssetSourcePath];
  return runtimeUrl && !runtimeUrl.startsWith("file:") ? runtimeUrl : sourceUrl;
}
