import { useState } from "react";
import { type FarmAssetKey, getFarmAssetUrl } from "../../farm-asset-manifest";
import type { FarmSceneId, FarmToolOption } from "./types";

export interface FarmFeaturePanelDefinition {
  emptyLabel: string;
  tabs: readonly string[];
}

export const FARM_FEATURE_PANELS: Readonly<
  Record<FarmSceneId, Readonly<Record<string, FarmFeaturePanelDefinition>>>
> = {
  field: {
    backpack: {
      emptyLabel: "暂无物品",
      tabs: ["种子与药水", "素材", "其他"],
    },
    market: {
      emptyLabel: "集市数据尚未接入",
      tabs: [],
    },
    adventure: {
      emptyLabel: "暂无旅程",
      tabs: ["当前旅程", "行囊", "本趟故事", "秘境图鉴", "旅程簿"],
    },
  },
  ranch: {
    backpack: {
      emptyLabel: "暂无牧场持有物",
      tabs: ["配饰", "装饰", "其他"],
    },
    dispatch: {
      emptyLabel: "派遣数据尚未接入",
      tabs: [],
    },
    market: {
      emptyLabel: "集市数据尚未接入",
      tabs: [],
    },
  },
  cooking: {
    backpack: {
      emptyLabel: "暂无料理库存",
      tabs: ["食材", "牧场产物", "鱼篓", "料理"],
    },
    recipes: {
      emptyLabel: "食谱数据尚未接入",
      tabs: [],
    },
    market: {
      emptyLabel: "集市数据尚未接入",
      tabs: [],
    },
  },
  neighborhood: {},
};

export function getFeatureDefinition(
  scene: FarmSceneId,
  toolId: string,
): FarmFeaturePanelDefinition {
  return FARM_FEATURE_PANELS[scene][toolId] ?? { emptyLabel: "暂无内容", tabs: [] };
}

export function FarmFeaturePanelContent({
  definition,
  tool,
}: {
  definition: FarmFeaturePanelDefinition;
  tool: FarmToolOption;
}) {
  const [activeTab, setActiveTab] = useState<string | null>(definition.tabs[0] ?? null);

  return (
    <section aria-label={tool.label} className="farm-feature">
      {definition.tabs.length > 0 ? (
        <nav aria-label={`${tool.label}分类`} className="farm-feature__tabs">
          {definition.tabs.map((tab) => (
            <button
              aria-pressed={activeTab === tab}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </nav>
      ) : null}
      <div className="farm-feature__empty">
        <img alt="" aria-hidden="true" src={getFarmAssetUrl(tool.iconKey)} />
        <strong>{activeTab ? `${activeTab}暂无内容` : definition.emptyLabel}</strong>
        {activeTab ? <span>{definition.emptyLabel}</span> : null}
      </div>
    </section>
  );
}

export function FarmUnavailablePanel({
  iconKey,
  label,
}: {
  iconKey?: FarmAssetKey;
  label: string;
}) {
  return (
    <div className="farm-feature__empty" role="status">
      {iconKey ? <img alt="" aria-hidden="true" src={getFarmAssetUrl(iconKey)} /> : null}
      <strong>{label}</strong>
    </div>
  );
}
