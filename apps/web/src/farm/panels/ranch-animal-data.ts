import type { CSSProperties } from "react";
import { getRanchAnimalAsset, getRanchSkinAsset } from "../farm-asset-manifest";
import type { RanchSceneAnimalLayout } from "../scenes/ranch/ranch-scene";

export interface RanchShopAnimal {
  id: string;
  name: string;
  shopSection: "animals" | "pets";
  category: string;
  description: string;
  produce?: string;
  produceEveryTicks?: number;
  producePrice?: number;
  effectLabel?: string;
  effectText?: string;
  buyCost: number;
  unlockCondition: string;
  demoOwned?: boolean;
}

export interface RanchAnimalLayout {
  x: number;
  y: number;
  size: number;
}

export interface RanchSkinDefinition {
  id: string;
  name: string;
  targetType: "animal" | "pet";
  targetKindId: "dog" | "cat" | "rabbit" | "cloud_sheep";
  bonusText: string;
}

export interface RanchVariantVisualOption {
  atlas: "glimmer.variants" | null;
  set: 1 | 2 | 3 | null;
  sprite_index: number | null;
  variant_id: string;
}

export interface RanchVariantSelection {
  available_variant_ids: readonly string[];
  available_variants: readonly RanchVariantVisualOption[];
  current_variant_id: string | null;
}

export interface RanchOrdinaryVariantTarget {
  kindId: string;
  set: 1 | 2 | 3;
  spriteIndex: number;
}

export interface RanchResidentSpriteVisual {
  kind: "base" | "skin" | "variant";
  placementStyle: CSSProperties;
  spriteStyle: CSSProperties;
  staticSprite: boolean;
}

export const RANCH_LIMITED_SKINS: readonly RanchSkinDefinition[] = [
  {
    id: "pompompurin",
    name: "布丁狗",
    targetType: "pet",
    targetKindId: "dog",
    bonusText: "小狗防偷概率 35% → 40%",
  },
  {
    id: "hachiware",
    name: "小八",
    targetType: "pet",
    targetKindId: "cat",
    bonusText: "小猫幸运 12% → 17%，掉落加成 25% → 30%",
  },
  {
    id: "usagi",
    name: "乌萨奇",
    targetType: "animal",
    targetKindId: "rabbit",
    bonusText: "兔子当前单位产值 +30%",
  },
  {
    id: "mysweetpiano",
    name: "甜心皮亚诺",
    targetType: "animal",
    targetKindId: "cloud_sheep",
    bonusText: "云绵羊当前单位产值 +30%",
  },
];

export const RANCH_SHOP_ANIMALS: readonly RanchShopAnimal[] = [
  {
    id: "chicken",
    name: "鸡",
    shopSection: "animals",
    category: "普通",
    description: "",
    produce: "鸡蛋",
    produceEveryTicks: 1,
    producePrice: 25,
    buyCost: 100,
    unlockCondition: "开局即可养",
    demoOwned: true,
  },
  {
    id: "duck",
    name: "鸭子",
    shopSection: "animals",
    category: "普通",
    description: "",
    produce: "鸭蛋",
    produceEveryTicks: 2,
    producePrice: 45,
    buyCost: 300,
    unlockCondition: "图鉴集齐 4 种解锁",
  },
  {
    id: "quail",
    name: "鹌鹑",
    shopSection: "animals",
    category: "普通",
    description: "小小一只，最喜欢贴着草边快步巡游。",
    produce: "鹌鹑蛋",
    produceEveryTicks: 2,
    producePrice: 55,
    buyCost: 450,
    unlockCondition: "图鉴集齐 6 种解锁",
  },
  {
    id: "rabbit",
    name: "兔子",
    shopSection: "animals",
    category: "普通",
    description: "",
    produce: "兔毛",
    produceEveryTicks: 3,
    producePrice: 90,
    buyCost: 700,
    unlockCondition: "图鉴集齐 8 种解锁",
  },
  {
    id: "goose",
    name: "鹅",
    shopSection: "animals",
    category: "普通",
    description: "",
    produce: "鹅蛋",
    produceEveryTicks: 6,
    producePrice: 180,
    buyCost: 1_500,
    unlockCondition: "图鉴集齐 12 种解锁",
  },
  {
    id: "sheep",
    name: "绵羊",
    shopSection: "animals",
    category: "普通",
    description: "",
    produce: "羊毛",
    produceEveryTicks: 8,
    producePrice: 320,
    buyCost: 3_000,
    unlockCondition: "图鉴集齐 16 种解锁",
  },
  {
    id: "goat",
    name: "山羊",
    shopSection: "animals",
    category: "普通",
    description: "稳稳站在高处，总能找到回家的那条小路。",
    produce: "山羊奶",
    produceEveryTicks: 9,
    producePrice: 420,
    buyCost: 4_200,
    unlockCondition: "图鉴集齐 18 种解锁",
  },
  {
    id: "cow",
    name: "奶牛",
    shopSection: "animals",
    category: "普通",
    description: "",
    produce: "鲜奶",
    produceEveryTicks: 10,
    producePrice: 520,
    buyCost: 5_500,
    unlockCondition: "图鉴集齐 20 种解锁",
  },
  {
    id: "bee",
    name: "蜜蜂",
    shopSection: "animals",
    category: "普通",
    description: "",
    produce: "蜂蜜",
    produceEveryTicks: 14,
    producePrice: 850,
    buyCost: 9_000,
    unlockCondition: "图鉴集齐 26 种解锁",
  },
  {
    id: "turkey",
    name: "火鸡",
    shopSection: "animals",
    category: "普通",
    description: "尾羽一开像把小扇子，走起路来很有阵仗。",
    produce: "火鸡蛋",
    produceEveryTicks: 15,
    producePrice: 1_050,
    buyCost: 11_000,
    unlockCondition: "图鉴集齐 28 种解锁",
  },
  {
    id: "pig",
    name: "猪",
    shopSection: "animals",
    category: "普通",
    description: "",
    produce: "松露",
    produceEveryTicks: 16,
    producePrice: 1_300,
    buyCost: 14_000,
    unlockCondition: "图鉴集齐 32 种解锁",
  },
  {
    id: "alpaca",
    name: "羊驼",
    shopSection: "animals",
    category: "普通",
    description: "蓬松长毛像一团会散步的云，脾气倒很从容。",
    produce: "羊驼毛",
    produceEveryTicks: 18,
    producePrice: 1_600,
    buyCost: 17_500,
    unlockCondition: "图鉴集齐 36 种解锁",
  },
  {
    id: "silk_moth",
    name: "月光蚕",
    shopSection: "animals",
    category: "奇幻",
    description: "",
    produce: "月光丝",
    produceEveryTicks: 20,
    producePrice: 1_900,
    buyCost: 21_000,
    unlockCondition: "图鉴集齐 40 种解锁",
  },
  {
    id: "ember_hen",
    name: "余烬母鸡",
    shopSection: "animals",
    category: "奇幻",
    description: "",
    produce: "暖火蛋",
    produceEveryTicks: 22,
    producePrice: 2_700,
    buyCost: 30_000,
    unlockCondition: "图鉴集齐 46 种解锁",
  },
  {
    id: "cloud_sheep",
    name: "云绵羊",
    shopSection: "animals",
    category: "奇幻",
    description: "",
    produce: "浮云毛",
    produceEveryTicks: 26,
    producePrice: 4_200,
    buyCost: 45_000,
    unlockCondition: "图鉴集齐 54 种解锁",
  },
  {
    id: "dream_cat",
    name: "梦貘猫",
    shopSection: "animals",
    category: "奇幻",
    description: "",
    produce: "梦之残片",
    produceEveryTicks: 30,
    producePrice: 6_500,
    buyCost: 65_000,
    unlockCondition: "图鉴集齐 64 种解锁",
  },
  {
    id: "cat",
    name: "小猫",
    shopSection: "pets",
    category: "宠物",
    description: "",
    effectLabel: "招财·稀有／掉落微涨",
    effectText: "在田里转悠时，收成的手气悄悄变好；稀有作物更常见，素材、药水也更易拾到。",
    buyCost: 9_000,
    unlockCondition: "图鉴集齐 5 种解锁",
    demoOwned: true,
  },
  {
    id: "dog",
    name: "小狗",
    shopSection: "pets",
    category: "宠物",
    description: "",
    effectLabel: "看家·防偷",
    effectText: "别人来偷菜时，有 35% 的概率被它狂吠吓退、空手而归。",
    buyCost: 9_000,
    unlockCondition: "图鉴集齐 5 种解锁",
  },
];

const RANCH_ORDINARY_VARIANT_IDS = {
  chicken: ["chicken_strawberry", "chicken_cream", "chicken_cloud"],
  duck: ["duck_mint", "duck_peach", "duck_starry"],
  quail: ["quail_chestnut", "quail_milkcandy", "quail_blueberry"],
  rabbit: ["rabbit_lop", "rabbit_strawberry", "rabbit_moon"],
  goose: ["goose_lake", "goose_peach", "goose_brownsugar"],
  sheep: ["sheep_strawberry", "sheep_mint", "sheep_cloud"],
  goat: ["goat_latte", "goat_apple", "goat_sesame"],
  cow: ["cow_strawberry", "cow_blueberry", "cow_caramel"],
  bee: ["bee_cherry", "bee_mint", "bee_moon"],
  turkey: ["turkey_maple", "turkey_blueberry", "turkey_snow"],
  pig: ["pig_peach", "pig_latte", "pig_blackbean"],
  alpaca: ["alpaca_strawberry", "alpaca_matcha", "alpaca_cocoa"],
  silk_moth: ["silk_moth_mist", "silk_moth_peach", "silk_moth_aurora"],
  ember_hen: ["ember_hen_blue", "ember_hen_cherry", "ember_hen_white"],
  cloud_sheep: ["cloud_sheep_sunset", "cloud_sheep_storm", "cloud_sheep_aurora"],
  dream_cat: ["dream_cat_strawberry", "dream_cat_mint", "dream_cat_starry"],
  cat: ["cat_tuxedo", "cat_british_blue", "cat_calico"],
  dog: ["dog_corgi", "dog_golden", "dog_samoyed"],
  patrol_goose: ["patrol_goose_sheriff", "patrol_goose_raincoat", "patrol_goose_detective"],
} as const;

export const RANCH_ORDINARY_VARIANT_TARGETS: ReadonlyMap<string, RanchOrdinaryVariantTarget> =
  new Map(
    Object.entries(RANCH_ORDINARY_VARIANT_IDS).flatMap(([kindId, variantIds], spriteIndex) =>
      variantIds.map((variantId, setIndex) => [
        variantId,
        { kindId, set: (setIndex + 1) as 1 | 2 | 3, spriteIndex },
      ]),
    ),
  );

export const RANCH_ANIMAL_CANVAS_SIZE = 192;
export const DEFAULT_RANCH_ANIMAL_LAYOUT: RanchAnimalLayout = {
  x: 96,
  y: 96,
  size: 192,
};
export const RANCH_ANIMAL_LAYOUTS: Readonly<Record<string, RanchAnimalLayout>> = {
  chicken: { x: 95.7734375, y: 74.64453125, size: 192 },
  duck: { x: 98.66796875, y: 75.16796875, size: 192 },
  quail: { x: 84.72265625, y: 76.7734375, size: 243.84 },
  rabbit: { x: 108.90234375, y: 79.46875, size: 192 },
  goose: { x: 107, y: 81.03125, size: 192 },
  sheep: { x: 90.69140625, y: 88.71875, size: 192 },
  goat: { x: 112.9140625, y: 100.78125, size: 192 },
  cow: { x: 96, y: 96, size: 188.16 },
  bee: { x: 111.6171875, y: 91.94140625, size: 192 },
  turkey: { x: 91.2421875, y: 117.625, size: 192 },
  pig: { x: 114.7265625, y: 89.4609375, size: 192 },
  alpaca: { x: 110.1640625, y: 79.4375, size: 192 },
  silk_moth: { x: 96, y: 96, size: 192 },
  ember_hen: { x: 106.2265625, y: 94.5859375, size: 192 },
  cloud_sheep: { x: 112.41015625, y: 98.9921875, size: 192 },
  dream_cat: { x: 114.30859375, y: 99.79296875, size: 192 },
  cat: { x: 86.59375, y: 108.96875, size: 192 },
  dog: { x: 95.109375, y: 110.65234375, size: 192 },
};

export const RANCH_SCENE_DEMO_LAYOUTS: Readonly<Record<string, RanchSceneAnimalLayout>> = {
  chicken: { x: 31, y: 45, size: 18, roam: { minX: 13, maxX: 58, minY: 33, maxY: 69 } },
  cat: { x: 63, y: 59, size: 18, roam: { minX: 35, maxX: 78, minY: 39, maxY: 77 } },
};

export function getRanchAnimalSpriteStyle(animal: RanchShopAnimal): CSSProperties {
  const asset = getRanchAnimalAsset(animal.id);

  if (!asset) {
    return {};
  }

  if (!asset.atlasFrame) {
    return {
      backgroundImage: `url("${asset.url}")`,
      backgroundPosition: "center",
      backgroundSize: "100% 100%",
    };
  }

  const { column, columns, row, rows } = asset.atlasFrame;

  return {
    backgroundImage: `url("${asset.url}")`,
    backgroundPosition: `${(column * 100) / (columns - 1)}% ${(row * 100) / (rows - 1)}%`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
  };
}

export function getRanchAnimalPlacementStyle(animal: RanchShopAnimal): CSSProperties {
  const layout = RANCH_ANIMAL_LAYOUTS[animal.id] ?? DEFAULT_RANCH_ANIMAL_LAYOUT;

  return {
    height: `${(layout.size / RANCH_ANIMAL_CANVAS_SIZE) * 100}%`,
    left: `${(layout.x / RANCH_ANIMAL_CANVAS_SIZE) * 100}%`,
    top: `${(layout.y / RANCH_ANIMAL_CANVAS_SIZE) * 100}%`,
    width: `${(layout.size / RANCH_ANIMAL_CANVAS_SIZE) * 100}%`,
  };
}

export function getRanchSkinSpriteStyle(skinId: string): CSSProperties {
  const asset = getRanchSkinAsset(skinId);
  return asset
    ? {
        backgroundImage: `url("${asset.url}")`,
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
      }
    : {};
}

export function getRanchSkinPlacementStyle(): CSSProperties {
  return { height: "100%", left: "50%", top: "50%", width: "100%" };
}

const GLIMMER_VARIANT_SHEET_URLS = {
  1: "/lingye/glimmer/variants/variant-1.webp?v=20260809b",
  2: "/lingye/glimmer/variants/variant-2.webp?v=20260809b",
  3: "/lingye/glimmer/variants/variant-3.webp?v=20260810a",
} as const;

export function getRanchVariantSpriteStyle(variant: RanchVariantVisualOption): CSSProperties {
  if (
    variant.atlas !== "glimmer.variants" ||
    variant.set === null ||
    variant.sprite_index === null
  ) {
    return {};
  }
  const sheet = GLIMMER_VARIANT_SHEET_URLS[variant.set];
  const column = variant.sprite_index % 5;
  const row = Math.floor(variant.sprite_index / 5);
  return {
    backgroundImage: `url("${sheet}")`,
    backgroundPosition: `${column * 25}% ${(row * 100) / 3}%`,
    backgroundSize: "500% 400%",
  };
}

export function getRanchResidentSpriteVisual(
  animal: RanchShopAnimal,
  variants?: RanchVariantSelection | null,
  residentKindId = animal.id,
): RanchResidentSpriteVisual {
  const base = {
    kind: "base" as const,
    placementStyle: getRanchAnimalPlacementStyle(animal),
    spriteStyle: getRanchAnimalSpriteStyle(animal),
    staticSprite: false,
  };
  const currentVariantId = variants?.current_variant_id;
  if (!currentVariantId || currentVariantId === "base") {
    return base;
  }

  if (!variants.available_variant_ids.includes(currentVariantId)) {
    return base;
  }
  const variant = variants.available_variants.find(
    (candidate) => candidate.variant_id === currentVariantId,
  );
  if (!variant) {
    return base;
  }

  const skin = RANCH_LIMITED_SKINS.find((candidate) => candidate.id === currentVariantId);
  if (
    skin &&
    skin.targetKindId === residentKindId &&
    variant.atlas === null &&
    variant.set === null &&
    variant.sprite_index === null &&
    getRanchSkinAsset(currentVariantId)
  ) {
    return {
      kind: "skin",
      placementStyle: getRanchSkinPlacementStyle(),
      spriteStyle: getRanchSkinSpriteStyle(currentVariantId),
      staticSprite: false,
    };
  }

  const expectedTarget = RANCH_ORDINARY_VARIANT_TARGETS.get(currentVariantId);
  if (
    !expectedTarget ||
    expectedTarget.kindId !== residentKindId ||
    variant.atlas !== "glimmer.variants" ||
    variant.set !== expectedTarget.set ||
    variant.sprite_index !== expectedTarget.spriteIndex
  ) {
    return base;
  }
  return {
    kind: "variant",
    placementStyle: getRanchAnimalPlacementStyle(animal),
    spriteStyle: getRanchVariantSpriteStyle(variant),
    staticSprite: false,
  };
}
