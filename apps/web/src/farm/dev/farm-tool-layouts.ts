import type { CSSProperties } from "react";
import type { FarmAssetKey } from "../farm-asset-manifest";

export type FarmSceneId = "field" | "ranch" | "cooking" | "neighborhood";

export interface FarmToolOption {
  id: string;
  label: string;
  iconKey: FarmAssetKey;
}

export interface FarmToolEditorLayout {
  iconX: number;
  iconY: number;
  iconSize: number;
  textX: number;
  textY: number;
  textSize: number;
}

export const FARM_TOOL_OPTIONS: Readonly<Record<FarmSceneId, readonly FarmToolOption[]>> = {
  field: [
    { id: "shop", label: "商店", iconKey: "panel.tool.shop" },
    { id: "backpack", label: "背包", iconKey: "panel.tool.backpack" },
    { id: "crop-codex", label: "作物图鉴", iconKey: "panel.tool.crop-codex" },
    { id: "create", label: "创造", iconKey: "panel.tool.create" },
    { id: "market", label: "集市", iconKey: "panel.tool.market" },
    { id: "adventure", label: "探险", iconKey: "panel.tool.adventure" },
    { id: "smelting", label: "熔炼", iconKey: "panel.tool.smelting" },
    { id: "settings", label: "设置", iconKey: "panel.tool.settings" },
  ],
  ranch: [
    { id: "shop", label: "商店", iconKey: "panel.tool.shop" },
    { id: "backpack", label: "背包", iconKey: "panel.tool.backpack" },
    { id: "dispatch", label: "派遣", iconKey: "panel.tool.dispatch" },
    { id: "market", label: "集市", iconKey: "panel.tool.market" },
    { id: "settings", label: "设置", iconKey: "panel.tool.settings" },
  ],
  cooking: [
    { id: "shop", label: "商店", iconKey: "panel.tool.shop" },
    { id: "backpack", label: "背包", iconKey: "panel.tool.backpack" },
    { id: "recipes", label: "食谱", iconKey: "panel.tool.recipes" },
    { id: "market", label: "集市", iconKey: "panel.tool.market" },
    { id: "settings", label: "设置", iconKey: "panel.tool.settings" },
  ],
  neighborhood: [],
};

export const NEIGHBORHOOD_OPTIONS = [
  { id: "ranking", label: "排行榜", iconKey: "neighborhood.ranking" },
  { id: "message-board", label: "留言板", iconKey: "neighborhood.message-board" },
  { id: "original-crops", label: "原创作物", iconKey: "neighborhood.original-crops" },
] as const satisfies readonly FarmToolOption[];

export type NeighborhoodSectionId = (typeof NEIGHBORHOOD_OPTIONS)[number]["id"];

export const FARM_TOOL_EDITOR_BULLETIN_OPTION: FarmToolOption = {
  id: "bulletin",
  label: "叮咚播报",
  iconKey: "shell.bulletin",
};

export const FARM_TOOL_EDITOR_OPTIONS: readonly FarmToolOption[] = [
  FARM_TOOL_EDITOR_BULLETIN_OPTION,
  ...Array.from(
    new Map(
      [...Object.values(FARM_TOOL_OPTIONS).flat(), ...NEIGHBORHOOD_OPTIONS]
        .flat()
        .map((tool) => [tool.id, tool]),
    ).values(),
  ),
];

export const FARM_TOOL_EDITOR_CANVAS_SIZE = 192;

export const DEFAULT_FARM_TOOL_EDITOR_LAYOUT: FarmToolEditorLayout = {
  iconX: 96,
  iconY: 82,
  iconSize: 138,
  textX: 96,
  textY: 154,
  textSize: 24,
};

export const FARM_TOOL_LAYOUTS: Readonly<Record<string, FarmToolEditorLayout>> = {
  bulletin: {
    iconX: 91.953125,
    iconY: 77.484375,
    iconSize: 211.2,
    textX: 97.7265625,
    textY: 143.6640625,
    textSize: 35.52,
  },
  shop: {
    iconX: 97.625,
    iconY: 85.6328125,
    iconSize: 218.88,
    textX: 99.46875,
    textY: 143.6171875,
    textSize: 35.52,
  },
  backpack: {
    iconX: 90.84375,
    iconY: 88.6953125,
    iconSize: 163.2,
    textX: 94.33984375,
    textY: 151.046875,
    textSize: 35.52,
  },
  "crop-codex": {
    iconX: 96,
    iconY: 82,
    iconSize: 182.4,
    textX: 94.69140625,
    textY: 132.9140625,
    textSize: 35.52,
  },
  create: {
    iconX: 96,
    iconY: 82,
    iconSize: 182.4,
    textX: 94.69140625,
    textY: 132.9140625,
    textSize: 35.52,
  },
  market: {
    iconX: 96,
    iconY: 82,
    iconSize: 218.88,
    textX: 96.75,
    textY: 143.3203125,
    textSize: 35.52,
  },
  adventure: {
    iconX: 94.01953125,
    iconY: 81.8203125,
    iconSize: 201.6,
    textX: 95.35546875,
    textY: 144.15625,
    textSize: 35.52,
  },
  ranking: {
    iconX: 95.74609375,
    iconY: 86.55078125,
    iconSize: 168.96,
    textX: 96.609375,
    textY: 134.96875,
    textSize: 35.52,
  },
  "message-board": {
    iconX: 95.1796875,
    iconY: 83.44921875,
    iconSize: 186.24,
    textX: 95.6875,
    textY: 145.46875,
    textSize: 35.52,
  },
  settings: {
    iconX: 97.1796875,
    iconY: 90.6953125,
    iconSize: 168,
    textX: 98.6171875,
    textY: 139.16015625,
    textSize: 35.52,
  },
  dispatch: {
    iconX: 96,
    iconY: 82,
    iconSize: 183.36,
    textX: 94.25,
    textY: 133.71484375,
    textSize: 35.52,
  },
  recipes: {
    iconX: 96.47265625,
    iconY: 86.0546875,
    iconSize: 147.84,
    textX: 92.6171875,
    textY: 138.58984375,
    textSize: 35.52,
  },
  smelting: {
    iconX: 95.8203125,
    iconY: 91.18359375,
    iconSize: 173.76,
    textX: 93.3203125,
    textY: 141.98828125,
    textSize: 35.52,
  },
};

export function getFarmToolIconStyle(layout: FarmToolEditorLayout): CSSProperties {
  return {
    height: `${(layout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
    left: `${(layout.iconX / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
    top: `${(layout.iconY / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
    width: `${(layout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
  };
}

export function getFarmToolTextStyle(layout: FarmToolEditorLayout): CSSProperties {
  return {
    fontSize: `${(layout.textSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 13.7}cqw`,
    left: `${(layout.textX / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
    top: `${(layout.textY / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
  };
}
