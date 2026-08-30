import { getFarmAssetRuntimeUrl } from "./farm-asset-source-map";
import { COOKING_CATALOG_INGREDIENTS, COOKING_CATALOG_RECIPES } from "./farm-cooking-catalog";

export type FarmAssetDomain = "shell" | "field" | "ranch" | "kitchen" | "neighborhood" | "panel";

export type FarmAssetStatus = "production" | "fallback" | "missing";
export type FarmAssetUsage = "wired" | "demo" | "editor";

export interface FarmAssetAtlasFrame {
  column: number;
  columns: number;
  row: number;
  rows: number;
}

export interface FarmAssetAtlasViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FarmAssetManifestEntry {
  assetKey: string;
  domain: FarmAssetDomain;
  entityKind: string;
  entityId: string;
  visualState: string;
  url: string;
  pixelWidth: number;
  pixelHeight: number;
  aspectRatio: number;
  /** Whether the declared source is an accepted production, fallback, or missing asset. */
  status: FarmAssetStatus;
  usage: FarmAssetUsage;
  fallbackKey?: string;
  atlasFrame?: FarmAssetAtlasFrame;
  atlasViewport?: FarmAssetAtlasViewport;
}

function asset(
  entry: Omit<FarmAssetManifestEntry, "aspectRatio" | "assetKey">,
): Omit<FarmAssetManifestEntry, "assetKey"> {
  return {
    ...entry,
    aspectRatio: entry.pixelWidth / entry.pixelHeight,
  };
}

function atlasAnimal(
  entityId: string,
  column: number,
  row: number,
): Omit<FarmAssetManifestEntry, "assetKey"> {
  return asset({
    domain: "ranch",
    entityKind: "animal",
    entityId,
    visualState: "shop-icon",
    url: "/farm/animals/animal-codex-atlas.png",
    pixelWidth: 1000,
    pixelHeight: 800,
    status: "production",
    usage: "wired",
    atlasFrame: { column, columns: 5, row, rows: 4 },
  });
}

function standaloneAnimal(entityId: string, url: string): Omit<FarmAssetManifestEntry, "assetKey"> {
  return asset({
    domain: "ranch",
    entityKind: "animal",
    entityId,
    visualState: "shop-icon",
    url,
    pixelWidth: 200,
    pixelHeight: 200,
    status: "production",
    usage: "wired",
  });
}

function standaloneRanchSkin(
  entityId: string,
  url: string,
): Omit<FarmAssetManifestEntry, "assetKey"> {
  return asset({
    domain: "ranch",
    entityKind: "skin",
    entityId,
    visualState: "front",
    url,
    pixelWidth: 256,
    pixelHeight: 256,
    status: "production",
    usage: "wired",
  });
}

export const FARM_ASSET_MANIFEST = {
  "shell.scene.field": asset({
    domain: "shell",
    entityKind: "scene-tab",
    entityId: "field",
    visualState: "icon",
    url: "/farm/ui-icons/field.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "shell.scene.ranch": asset({
    domain: "shell",
    entityKind: "scene-tab",
    entityId: "ranch",
    visualState: "icon",
    url: "/farm/ui-icons/ranch.png",
    pixelWidth: 192,
    pixelHeight: 175,
    status: "production",
    usage: "wired",
  }),
  "shell.scene.cooking": asset({
    domain: "shell",
    entityKind: "scene-tab",
    entityId: "cooking",
    visualState: "icon",
    url: "/farm/cooking-tools/stew-pot.png",
    pixelWidth: 1536,
    pixelHeight: 1024,
    status: "production",
    usage: "wired",
  }),
  "shell.scene.neighborhood": asset({
    domain: "shell",
    entityKind: "scene-tab",
    entityId: "neighborhood",
    visualState: "icon",
    url: "/farm/ui-icons/neighborhood.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "shell.bulletin": asset({
    domain: "shell",
    entityKind: "shortcut",
    entityId: "bulletin",
    visualState: "icon",
    url: "/farm/ui-icons/dingdong-bulletin.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "field.identity-plaque": asset({
    domain: "field",
    entityKind: "identity-plaque",
    entityId: "farm-identity",
    visualState: "wood",
    url: "/farm/ui/field-plaque.png",
    pixelWidth: 768,
    pixelHeight: 384,
    status: "production",
    usage: "wired",
  }),
  "field.environment.spring": asset({
    domain: "field",
    entityKind: "environment",
    entityId: "field",
    visualState: "spring",
    url: "/farm/scenes/field-spring.png",
    pixelWidth: 864,
    pixelHeight: 1821,
    status: "production",
    usage: "wired",
  }),
  "field.environment.summer": asset({
    domain: "field",
    entityKind: "environment",
    entityId: "field",
    visualState: "summer",
    url: "/farm/scenes/field-summer.png",
    pixelWidth: 864,
    pixelHeight: 1821,
    status: "production",
    usage: "wired",
  }),
  "field.environment.autumn": asset({
    domain: "field",
    entityKind: "environment",
    entityId: "field",
    visualState: "autumn",
    url: "/farm/scenes/field-autumn.png",
    pixelWidth: 864,
    pixelHeight: 1821,
    status: "production",
    usage: "wired",
  }),
  "field.environment.winter": asset({
    domain: "field",
    entityKind: "environment",
    entityId: "field",
    visualState: "winter",
    url: "/farm/scenes/field-winter.png",
    pixelWidth: 864,
    pixelHeight: 1821,
    status: "production",
    usage: "wired",
  }),
  "field.environment.rain": asset({
    domain: "field",
    entityKind: "environment",
    entityId: "field",
    visualState: "rain",
    url: "/farm/scenes/field-rain.png",
    pixelWidth: 864,
    pixelHeight: 1821,
    status: "production",
    usage: "wired",
  }),
  "field.environment.snow": asset({
    domain: "field",
    entityKind: "environment",
    entityId: "field",
    visualState: "snow",
    url: "/farm/scenes/field-snow.png",
    pixelWidth: 864,
    pixelHeight: 1821,
    status: "production",
    usage: "wired",
  }),
  "ranch.environment.spring": asset({
    domain: "ranch",
    entityKind: "environment",
    entityId: "ranch",
    visualState: "spring",
    url: "/farm/scenes/ranch-spring.png",
    pixelWidth: 863,
    pixelHeight: 1823,
    status: "production",
    usage: "wired",
  }),
  "ranch.environment.summer": asset({
    domain: "ranch",
    entityKind: "environment",
    entityId: "ranch",
    visualState: "summer",
    url: "/farm/scenes/ranch-summer.png",
    pixelWidth: 863,
    pixelHeight: 1823,
    status: "production",
    usage: "wired",
  }),
  "ranch.environment.autumn": asset({
    domain: "ranch",
    entityKind: "environment",
    entityId: "ranch",
    visualState: "autumn",
    url: "/farm/scenes/ranch-autumn.png",
    pixelWidth: 863,
    pixelHeight: 1823,
    status: "production",
    usage: "wired",
  }),
  "ranch.environment.winter": asset({
    domain: "ranch",
    entityKind: "environment",
    entityId: "ranch",
    visualState: "winter",
    url: "/farm/scenes/ranch-winter.png",
    pixelWidth: 863,
    pixelHeight: 1823,
    status: "production",
    usage: "wired",
  }),
  "ranch.environment.rain": asset({
    domain: "ranch",
    entityKind: "environment",
    entityId: "ranch",
    visualState: "rain",
    url: "/farm/scenes/ranch-rain.png",
    pixelWidth: 863,
    pixelHeight: 1823,
    status: "production",
    usage: "wired",
  }),
  "ranch.environment.snow": asset({
    domain: "ranch",
    entityKind: "environment",
    entityId: "ranch",
    visualState: "snow",
    url: "/farm/scenes/ranch-snow.png",
    pixelWidth: 863,
    pixelHeight: 1823,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.shop": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "shop",
    visualState: "icon",
    url: "/farm/ui-icons/shop.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.backpack": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "backpack",
    visualState: "icon",
    url: "/farm/ui-icons/backpack.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.crop-codex": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "crop-codex",
    visualState: "icon",
    url: "/farm/ui-icons/codex.png",
    pixelWidth: 192,
    pixelHeight: 175,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.create": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "create",
    visualState: "icon",
    url: "/farm/ui-icons/create-plant.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.market": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "market",
    visualState: "icon",
    url: "/farm/ui-icons/market.png",
    pixelWidth: 192,
    pixelHeight: 175,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.adventure": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "adventure",
    visualState: "icon",
    url: "/farm/ui-icons/adventure.png",
    pixelWidth: 192,
    pixelHeight: 175,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.smelting": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "smelting",
    visualState: "icon",
    url: "/farm/ui-icons/smelting.png",
    pixelWidth: 192,
    pixelHeight: 173,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.settings": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "settings",
    visualState: "icon",
    url: "/farm/ui-icons/settings.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.dispatch": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "dispatch",
    visualState: "icon",
    url: "/farm/ui-icons/dispatch.png",
    pixelWidth: 256,
    pixelHeight: 256,
    status: "production",
    usage: "wired",
  }),
  "panel.trail.watered": asset({
    domain: "panel",
    entityKind: "trail-event",
    entityId: "watered",
    visualState: "icon",
    url: "/farm/ui-icons/trail-watered.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "panel.trail.stolen": asset({
    domain: "panel",
    entityKind: "trail-event",
    entityId: "stolen",
    visualState: "icon",
    url: "/farm/ui-icons/trail-stolen.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "panel.trail.foiled": asset({
    domain: "panel",
    entityKind: "trail-event",
    entityId: "foiled",
    visualState: "icon",
    url: "/farm/ui-icons/trail-foiled.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "panel.tool.recipes": asset({
    domain: "panel",
    entityKind: "tool",
    entityId: "recipes",
    visualState: "icon",
    url: "/farm/ui-icons/recipes.png",
    pixelWidth: 192,
    pixelHeight: 178,
    status: "production",
    usage: "wired",
  }),
  "neighborhood.ranking": asset({
    domain: "neighborhood",
    entityKind: "section",
    entityId: "ranking",
    visualState: "icon",
    url: "/farm/ui-icons/ranking.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "editor",
  }),
  "neighborhood.message-board": asset({
    domain: "neighborhood",
    entityKind: "section",
    entityId: "message-board",
    visualState: "icon",
    url: "/farm/ui-icons/message-board.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "editor",
  }),
  "neighborhood.original-crops": asset({
    domain: "neighborhood",
    entityKind: "section",
    entityId: "original-crops",
    visualState: "icon",
    url: "/farm/ui-icons/codex.png",
    pixelWidth: 192,
    pixelHeight: 175,
    status: "production",
    usage: "editor",
  }),
  "neighborhood.shell": asset({
    domain: "neighborhood",
    entityKind: "frame",
    entityId: "neighborhood-shell",
    visualState: "default",
    url: "/farm/ui/neighborhood-shell.png",
    pixelWidth: 879,
    pixelHeight: 1545,
    status: "production",
    usage: "wired",
  }),
  "field.crop.ordinary-growing": asset({
    domain: "field",
    entityKind: "crop",
    entityId: "ordinary",
    visualState: "growing",
    url: "/farm/crops/ordinary-growing.png",
    pixelWidth: 512,
    pixelHeight: 512,
    status: "fallback",
    usage: "wired",
    fallbackKey: "field.crop.ordinary-growing",
  }),
  "field.crop.ordinary-ripe": asset({
    domain: "field",
    entityKind: "crop",
    entityId: "ordinary",
    visualState: "ripe",
    url: "/farm/crops/ordinary-ripe.png",
    pixelWidth: 512,
    pixelHeight: 512,
    status: "fallback",
    usage: "wired",
    fallbackKey: "field.crop.ordinary-ripe",
  }),
  "field.crop.fantasy-growing": asset({
    domain: "field",
    entityKind: "crop",
    entityId: "fantasy",
    visualState: "growing",
    url: "/farm/crops/fantasy-growing.png",
    pixelWidth: 512,
    pixelHeight: 512,
    status: "fallback",
    usage: "wired",
    fallbackKey: "field.crop.fantasy-growing",
  }),
  "field.crop.fantasy-ripe": asset({
    domain: "field",
    entityKind: "crop",
    entityId: "fantasy",
    visualState: "ripe",
    url: "/farm/crops/fantasy-ripe.png",
    pixelWidth: 512,
    pixelHeight: 512,
    status: "fallback",
    usage: "wired",
    fallbackKey: "field.crop.fantasy-ripe",
  }),
  "field.crop.limited-growing": asset({
    domain: "field",
    entityKind: "crop",
    entityId: "limited",
    visualState: "growing",
    url: "/farm/crops/limited-growing.png",
    pixelWidth: 512,
    pixelHeight: 512,
    status: "fallback",
    usage: "wired",
    fallbackKey: "field.crop.limited-growing",
  }),
  "field.crop.limited-ripe": asset({
    domain: "field",
    entityKind: "crop",
    entityId: "limited",
    visualState: "ripe",
    url: "/farm/crops/limited-ripe.png",
    pixelWidth: 512,
    pixelHeight: 512,
    status: "fallback",
    usage: "wired",
    fallbackKey: "field.crop.limited-ripe",
  }),
  "field.shop.speed-potion": asset({
    domain: "field",
    entityKind: "shop-item",
    entityId: "speed-potion",
    visualState: "icon",
    url: "/farm/ui-icons/speed-potion.png",
    pixelWidth: 179,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "field.shop.potion-set": asset({
    domain: "field",
    entityKind: "shop-item",
    entityId: "potion-set",
    visualState: "icon",
    url: "/farm/ui-icons/potion-set.png",
    pixelWidth: 192,
    pixelHeight: 170,
    status: "production",
    usage: "wired",
  }),
  "field.shop.seed-recipe": asset({
    domain: "field",
    entityKind: "shop-item",
    entityId: "seed-recipe",
    visualState: "icon",
    url: "/farm/ui-icons/seed-recipe.png",
    pixelWidth: 192,
    pixelHeight: 192,
    status: "production",
    usage: "wired",
  }),
  "field.material.atlas": asset({
    domain: "field",
    entityKind: "material-atlas",
    entityId: "smelting-materials",
    visualState: "catalog-icon",
    url: "/farm/smelting/materials-atlas.png",
    pixelWidth: 1254,
    pixelHeight: 1254,
    status: "production",
    usage: "wired",
  }),
  "kitchen.method.roast": asset({
    domain: "kitchen",
    entityKind: "cooking-method",
    entityId: "roast",
    visualState: "tool",
    url: "/farm/cooking-tools/roast-oven.png",
    pixelWidth: 1536,
    pixelHeight: 1024,
    status: "production",
    usage: "wired",
  }),
  "kitchen.method.stew": asset({
    domain: "kitchen",
    entityKind: "cooking-method",
    entityId: "stew",
    visualState: "tool",
    url: "/farm/cooking-tools/stew-pot.png",
    pixelWidth: 1536,
    pixelHeight: 1024,
    status: "production",
    usage: "wired",
  }),
  "kitchen.method.wok": asset({
    domain: "kitchen",
    entityKind: "cooking-method",
    entityId: "wok",
    visualState: "tool",
    url: "/farm/cooking-tools/wok.png",
    pixelWidth: 1536,
    pixelHeight: 1024,
    status: "production",
    usage: "wired",
  }),
  "kitchen.method.deep-fry": asset({
    domain: "kitchen",
    entityKind: "cooking-method",
    entityId: "deep-fry",
    visualState: "tool",
    url: "/farm/cooking-tools/deep-fryer.png",
    pixelWidth: 1536,
    pixelHeight: 1024,
    status: "production",
    usage: "wired",
  }),
  "kitchen.method.steam": asset({
    domain: "kitchen",
    entityKind: "cooking-method",
    entityId: "steam",
    visualState: "tool",
    url: "/farm/cooking-tools/steamer.png",
    pixelWidth: 1536,
    pixelHeight: 1024,
    status: "production",
    usage: "wired",
  }),
  "kitchen.method.dessert": asset({
    domain: "kitchen",
    entityKind: "cooking-method",
    entityId: "dessert",
    visualState: "tool",
    url: "/farm/cooking-tools/dessert-mixing.png",
    pixelWidth: 1536,
    pixelHeight: 1024,
    status: "production",
    usage: "wired",
  }),
  "kitchen.method.drink": asset({
    domain: "kitchen",
    entityKind: "cooking-method",
    entityId: "drink",
    visualState: "tool",
    url: "/farm/cooking-tools/drink-mixer.png",
    pixelWidth: 1536,
    pixelHeight: 1024,
    status: "production",
    usage: "wired",
  }),
  "kitchen.catalog.ingredient.main-atlas": asset({
    domain: "kitchen",
    entityKind: "ingredient-atlas",
    entityId: "main",
    visualState: "shop-icon",
    url: "/farm/cooking-catalog/ingredient-atlas.webp",
    pixelWidth: 1120,
    pixelHeight: 960,
    status: "production",
    usage: "wired",
  }),
  "kitchen.catalog.ingredient.secondary-atlas": asset({
    domain: "kitchen",
    entityKind: "ingredient-atlas",
    entityId: "secondary",
    visualState: "shop-icon",
    url: "/farm/cooking-catalog/ingredient-atlas-2.webp",
    pixelWidth: 640,
    pixelHeight: 320,
    status: "production",
    usage: "wired",
  }),
  "kitchen.catalog.dish.main-atlas": asset({
    domain: "kitchen",
    entityKind: "dish-atlas",
    entityId: "main",
    visualState: "recipe-icon",
    url: "/farm/cooking-catalog/dish-atlas.webp",
    pixelWidth: 960,
    pixelHeight: 1600,
    status: "production",
    usage: "wired",
  }),
  "kitchen.catalog.dish.secondary-atlas": asset({
    domain: "kitchen",
    entityKind: "dish-atlas",
    entityId: "secondary",
    visualState: "recipe-icon",
    url: "/farm/cooking-catalog/dish-atlas-2.webp",
    pixelWidth: 800,
    pixelHeight: 960,
    status: "production",
    usage: "wired",
  }),
  "kitchen.catalog.dish.fishing-atlas": asset({
    domain: "kitchen",
    entityKind: "dish-atlas",
    entityId: "fishing",
    visualState: "recipe-icon",
    url: "/farm/cooking-catalog/fishing-cooking-atlas.png",
    pixelWidth: 960,
    pixelHeight: 960,
    status: "production",
    usage: "wired",
  }),
  "ranch.animal.chicken": atlasAnimal("chicken", 0, 0),
  "ranch.animal.duck": atlasAnimal("duck", 1, 0),
  "ranch.animal.quail": atlasAnimal("quail", 2, 0),
  "ranch.animal.rabbit": atlasAnimal("rabbit", 3, 0),
  "ranch.animal.goose": atlasAnimal("goose", 4, 0),
  "ranch.animal.sheep": atlasAnimal("sheep", 0, 1),
  "ranch.animal.goat": standaloneAnimal("goat", "/farm/animals/goat-codex.png"),
  "ranch.animal.cow": atlasAnimal("cow", 2, 1),
  "ranch.animal.bee": atlasAnimal("bee", 3, 1),
  "ranch.animal.turkey": atlasAnimal("turkey", 4, 1),
  "ranch.animal.pig": atlasAnimal("pig", 0, 2),
  "ranch.animal.alpaca": standaloneAnimal("alpaca", "/farm/animals/alpaca-codex.png"),
  "ranch.animal.silk_moth": atlasAnimal("silk_moth", 2, 2),
  "ranch.animal.ember_hen": atlasAnimal("ember_hen", 3, 2),
  "ranch.animal.cloud_sheep": atlasAnimal("cloud_sheep", 4, 2),
  "ranch.animal.dream_cat": atlasAnimal("dream_cat", 0, 3),
  "ranch.animal.cat": atlasAnimal("cat", 1, 3),
  "ranch.animal.dog": atlasAnimal("dog", 2, 3),
  "ranch.skin.pompompurin": standaloneRanchSkin(
    "pompompurin",
    "/farm/animals/limited-skins/pompompurin.png",
  ),
  "ranch.skin.hachiware": standaloneRanchSkin(
    "hachiware",
    "/farm/animals/limited-skins/hachiware.png",
  ),
  "ranch.skin.usagi": standaloneRanchSkin("usagi", "/farm/animals/limited-skins/usagi.png"),
  "ranch.skin.mysweetpiano": standaloneRanchSkin(
    "mysweetpiano",
    "/farm/animals/limited-skins/mysweetpiano.png",
  ),
} as const satisfies Record<string, Omit<FarmAssetManifestEntry, "assetKey">>;

export type FarmAssetKey = keyof typeof FARM_ASSET_MANIFEST;

export const RANCH_ANIMAL_ASSET_KEYS = {
  chicken: "ranch.animal.chicken",
  duck: "ranch.animal.duck",
  quail: "ranch.animal.quail",
  rabbit: "ranch.animal.rabbit",
  goose: "ranch.animal.goose",
  sheep: "ranch.animal.sheep",
  goat: "ranch.animal.goat",
  cow: "ranch.animal.cow",
  bee: "ranch.animal.bee",
  turkey: "ranch.animal.turkey",
  pig: "ranch.animal.pig",
  alpaca: "ranch.animal.alpaca",
  silk_moth: "ranch.animal.silk_moth",
  ember_hen: "ranch.animal.ember_hen",
  cloud_sheep: "ranch.animal.cloud_sheep",
  dream_cat: "ranch.animal.dream_cat",
  cat: "ranch.animal.cat",
  dog: "ranch.animal.dog",
} as const satisfies Record<string, FarmAssetKey>;

export const RANCH_SKIN_ASSET_KEYS = {
  pompompurin: "ranch.skin.pompompurin",
  hachiware: "ranch.skin.hachiware",
  usagi: "ranch.skin.usagi",
  mysweetpiano: "ranch.skin.mysweetpiano",
} as const satisfies Record<string, FarmAssetKey>;

export function getFarmAsset(assetKey: FarmAssetKey): FarmAssetManifestEntry {
  const entry = FARM_ASSET_MANIFEST[assetKey];
  return {
    ...entry,
    url: getFarmAssetRuntimeUrl(entry.url),
    assetKey,
  };
}

export function getFarmAssetUrl(assetKey: FarmAssetKey): string {
  return getFarmAsset(assetKey).url;
}

export type FarmEnvironmentScene = "field" | "ranch";
export type FarmEnvironmentSeasonId = "spring" | "summer" | "autumn" | "winter";
export type FarmWeatherCondition =
  | "sunny"
  | "cloudy"
  | "light_rain"
  | "heavy_rain"
  | "thunderstorm"
  | "fog"
  | "hot"
  | "dry_wind"
  | "light_snow"
  | "blizzard";

const FARM_ENVIRONMENT_ASSET_KEYS = {
  field: {
    spring: "field.environment.spring",
    summer: "field.environment.summer",
    autumn: "field.environment.autumn",
    winter: "field.environment.winter",
    rain: "field.environment.rain",
    snow: "field.environment.snow",
  },
  ranch: {
    spring: "ranch.environment.spring",
    summer: "ranch.environment.summer",
    autumn: "ranch.environment.autumn",
    winter: "ranch.environment.winter",
    rain: "ranch.environment.rain",
    snow: "ranch.environment.snow",
  },
} as const satisfies Record<
  FarmEnvironmentScene,
  Record<FarmEnvironmentSeasonId | "rain" | "snow", FarmAssetKey>
>;

export function getFarmEnvironmentAssetUrl(
  scene: FarmEnvironmentScene,
  seasonId: FarmEnvironmentSeasonId,
  weatherCondition: FarmWeatherCondition | null,
): string {
  const visualState =
    weatherCondition === "light_rain" ||
    weatherCondition === "heavy_rain" ||
    weatherCondition === "thunderstorm"
      ? "rain"
      : weatherCondition === "light_snow" || weatherCondition === "blizzard"
        ? "snow"
        : seasonId;
  return getFarmAssetUrl(FARM_ENVIRONMENT_ASSET_KEYS[scene][visualState]);
}

export function getRanchAnimalAsset(entityId: string): FarmAssetManifestEntry | undefined {
  const assetKey = RANCH_ANIMAL_ASSET_KEYS[entityId as keyof typeof RANCH_ANIMAL_ASSET_KEYS];
  return assetKey ? getFarmAsset(assetKey) : undefined;
}

export function getRanchSkinAsset(entityId: string): FarmAssetManifestEntry | undefined {
  const assetKey = RANCH_SKIN_ASSET_KEYS[entityId as keyof typeof RANCH_SKIN_ASSET_KEYS];
  return assetKey ? getFarmAsset(assetKey) : undefined;
}

const COOKABLE_PRODUCT_IDS = [
  "chicken_egg",
  "duck_egg",
  "goose_egg",
  "fresh_milk",
  "honey",
  "truffle",
  "warm_egg",
  "chicken_meat",
  "duck_meat",
  "goose_meat",
  "lamb",
  "beef",
  "pork",
  "quail_egg",
  "quail_meat",
  "goat_milk",
  "goat_meat",
  "turkey_egg",
  "turkey_meat",
] as const;

export const SMELTING_MATERIAL_IDS = [
  "ordinary_stone",
  "dry_branch",
  "clay_lump",
  "broken_tile",
  "fluorite",
  "beast_bone",
  "rusted_iron",
  "spider_silk",
  "thunderstruck_wood",
  "deepsea_nacre",
  "ancient_resin",
  "dragon_claw",
  "sea_god_scale",
  "phoenix_ember",
  "world_tree_seed",
  "crystal_shard",
  "old_vine",
  "rusted_gear",
  "sea_glass",
  "phoenix_feather",
  "shadow_thread",
  "echo_stone",
  "stardust_sand",
  "ever_frost",
  "dream_cocoon",
  "ambergris_fragment",
  "tarnished_lunar_bronze",
  "void_fabric",
  "time_amber",
  "creation_echo",
] as const;

export type SmeltingMaterialId = (typeof SMELTING_MATERIAL_IDS)[number];

const SMELTING_ATLAS_COLUMN_X = [27, 263, 499, 750, 974] as const;
const SMELTING_ATLAS_ROW_Y = [32, 231, 426, 616, 806, 1006] as const;
const SMELTING_ATLAS_VIEWPORT_WIDTH = 230;
const SMELTING_ATLAS_VIEWPORT_HEIGHT = 200;

const SECONDARY_INGREDIENT_ATLAS_IDS: readonly string[] = [
  "pork",
  "soy_sauce",
  "ginger",
  "scallion",
  "butter",
  "yellow_wine",
  "tofu",
];

const MAIN_INGREDIENT_ATLAS_IDS: readonly string[] = [
  ...COOKABLE_PRODUCT_IDS,
  ...COOKING_CATALOG_INGREDIENTS.map((ingredient) => ingredient.id),
].filter((entityId) => !SECONDARY_INGREDIENT_ATLAS_IDS.includes(entityId));

const FISHING_RECIPE_IDS: readonly string[] = [
  "pan_fried_fish",
  "fish_rice_ball",
  "tomato_fish_soup",
  "herb_grilled_fish",
  "honey_roast_fish",
  "starlight_fish_feast",
];

const SECONDARY_DISH_ATLAS_IDS: readonly string[] = [
  "scallion_omelet",
  "scallion_pancake",
  "butter_fried_egg",
  "home_style_tofu",
  "butter_corn",
  "soy_fried_rice",
  "plain_boiled_chicken",
  "red_braised_tofu",
  "tofu_egg_soup",
  "butter_cookie",
  "goat_milk_bun",
  "soy_quail_eggs",
  "scallion_oil_chicken",
  "ginger_duck",
  "tea_smoked_duck",
  "red_braised_goose",
  "scallion_lamb",
  "potato_beef",
  "yellow_wine_turkey",
  "yellow_wine_quail",
  "goat_meat_rice",
  "truffle_tofu",
  "red_braised_pork",
  "custard_bun",
  "dongpo_pork",
  "truffle_butter_steak",
];

function withCatalogFrame(
  assetKey: FarmAssetKey,
  entityKind: "ingredient" | "material" | "recipe",
  entityId: string,
  column: number,
  columns: number,
  row: number,
  rows: number,
): FarmAssetManifestEntry {
  return {
    ...getFarmAsset(assetKey),
    entityKind,
    entityId,
    atlasFrame: { column, columns, row, rows },
  };
}

export function getCookingIngredientAsset(entityId: string): FarmAssetManifestEntry | undefined {
  if (entityId === "fish:any" || entityId.startsWith("fish:")) {
    return withCatalogFrame(
      "kitchen.catalog.dish.fishing-atlas",
      "ingredient",
      entityId,
      0,
      3,
      2,
      3,
    );
  }

  const secondaryIndex = SECONDARY_INGREDIENT_ATLAS_IDS.indexOf(entityId);
  if (secondaryIndex >= 0) {
    return withCatalogFrame(
      "kitchen.catalog.ingredient.secondary-atlas",
      "ingredient",
      entityId,
      secondaryIndex % 4,
      4,
      Math.floor(secondaryIndex / 4),
      2,
    );
  }

  const mainIndex = MAIN_INGREDIENT_ATLAS_IDS.indexOf(entityId);
  return mainIndex >= 0
    ? withCatalogFrame(
        "kitchen.catalog.ingredient.main-atlas",
        "ingredient",
        entityId,
        mainIndex % 7,
        7,
        Math.floor(mainIndex / 7),
        6,
      )
    : undefined;
}

export function getCookingRecipeAsset(entityId: string): FarmAssetManifestEntry | undefined {
  const fishingIndex = FISHING_RECIPE_IDS.indexOf(entityId);
  if (fishingIndex >= 0) {
    return withCatalogFrame(
      "kitchen.catalog.dish.fishing-atlas",
      "recipe",
      entityId,
      fishingIndex % 3,
      3,
      Math.floor(fishingIndex / 3),
      3,
    );
  }

  const secondaryIndex = SECONDARY_DISH_ATLAS_IDS.indexOf(entityId);
  if (secondaryIndex >= 0) {
    return withCatalogFrame(
      "kitchen.catalog.dish.secondary-atlas",
      "recipe",
      entityId,
      secondaryIndex % 5,
      5,
      Math.floor(secondaryIndex / 5),
      6,
    );
  }

  const mainIndex = COOKING_CATALOG_RECIPES.findIndex((recipe) => recipe.id === entityId);
  return mainIndex >= 0 && mainIndex < 60
    ? withCatalogFrame(
        "kitchen.catalog.dish.main-atlas",
        "recipe",
        entityId,
        mainIndex % 6,
        6,
        Math.floor(mainIndex / 6),
        10,
      )
    : undefined;
}

export function getSmeltingMaterialAsset(entityId: string): FarmAssetManifestEntry | undefined {
  const materialIndex = (SMELTING_MATERIAL_IDS as readonly string[]).indexOf(entityId);
  const x = SMELTING_ATLAS_COLUMN_X[materialIndex % 5];
  const y = SMELTING_ATLAS_ROW_Y[Math.floor(materialIndex / 5)];

  if (materialIndex < 0 || x === undefined || y === undefined) {
    return undefined;
  }

  return {
    ...getFarmAsset("field.material.atlas"),
    entityKind: "material",
    entityId,
    atlasViewport: {
      x,
      y,
      width: SMELTING_ATLAS_VIEWPORT_WIDTH,
      height: SMELTING_ATLAS_VIEWPORT_HEIGHT,
    },
  };
}
