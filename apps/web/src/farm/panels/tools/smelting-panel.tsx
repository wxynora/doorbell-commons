import { type CSSProperties, useState } from "react";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import {
  type SmeltingActionInput,
  smeltingActionIssueMessage,
} from "../../../auth/smelting-action-client";
import {
  type FarmAssetManifestEntry,
  getFarmAssetUrl,
  getSmeltingMaterialAsset,
  type SmeltingMaterialId,
} from "../../farm-asset-manifest";
import { FarmUnavailablePanel } from "./common";
import type { SmeltingActionExecutor } from "./types";

type SmeltingMaterialRarity = "N" | "R" | "SR" | "SSR" | "SP";

interface SmeltingMaterial {
  id: SmeltingMaterialId;
  name: string;
  rarity: SmeltingMaterialRarity;
}

const SMELTING_MATERIALS = [
  { id: "ordinary_stone", name: "普通石头", rarity: "N" },
  { id: "dry_branch", name: "枯树枝", rarity: "N" },
  { id: "clay_lump", name: "黏土块", rarity: "N" },
  { id: "broken_tile", name: "碎瓦片", rarity: "N" },
  { id: "fluorite", name: "萤石", rarity: "R" },
  { id: "beast_bone", name: "兽骨", rarity: "R" },
  { id: "rusted_iron", name: "锈铁片", rarity: "R" },
  { id: "spider_silk", name: "蛛丝团", rarity: "R" },
  { id: "thunderstruck_wood", name: "雷击木", rarity: "SR" },
  { id: "deepsea_nacre", name: "深海珍珠母", rarity: "SR" },
  { id: "ancient_resin", name: "古树脂", rarity: "SR" },
  { id: "dragon_claw", name: "龙的指甲", rarity: "SSR" },
  { id: "sea_god_scale", name: "海神的鳞片", rarity: "SSR" },
  { id: "phoenix_ember", name: "凤凰的余烬", rarity: "SSR" },
  { id: "world_tree_seed", name: "世界树的籽", rarity: "SP" },
  { id: "crystal_shard", name: "碎晶片", rarity: "N" },
  { id: "old_vine", name: "枯藤", rarity: "N" },
  { id: "rusted_gear", name: "锈齿轮", rarity: "N" },
  { id: "sea_glass", name: "海玻璃", rarity: "N" },
  { id: "phoenix_feather", name: "凤羽", rarity: "R" },
  { id: "shadow_thread", name: "影线", rarity: "R" },
  { id: "echo_stone", name: "回音石", rarity: "R" },
  { id: "stardust_sand", name: "星沙", rarity: "R" },
  { id: "ever_frost", name: "不融冰", rarity: "SR" },
  { id: "dream_cocoon", name: "梦茧", rarity: "SR" },
  { id: "ambergris_fragment", name: "龙涎香", rarity: "SR" },
  { id: "tarnished_lunar_bronze", name: "锈月铜", rarity: "SR" },
  { id: "void_fabric", name: "虚空布片", rarity: "SSR" },
  { id: "time_amber", name: "时光琥珀", rarity: "SSR" },
  { id: "creation_echo", name: "创世余音", rarity: "SP" },
] as const satisfies readonly SmeltingMaterial[];

const SMELTING_RARITY_ORDER = {
  N: 0,
  R: 1,
  SR: 2,
  SSR: 3,
  SP: 4,
} as const satisfies Record<SmeltingMaterialRarity, number>;

const SORTED_SMELTING_MATERIALS = [...SMELTING_MATERIALS].sort(
  (left, right) => SMELTING_RARITY_ORDER[left.rarity] - SMELTING_RARITY_ORDER[right.rarity],
);

function getSmeltingMaterialSpriteStyle(asset: FarmAssetManifestEntry): CSSProperties {
  const viewport = asset.atlasViewport;

  if (!viewport) {
    return {};
  }

  return {
    aspectRatio: `${viewport.width} / ${viewport.height}`,
    backgroundImage: `url("${asset.url}")`,
    backgroundPosition: `${(viewport.x * 100) / (asset.pixelWidth - viewport.width)}% ${(viewport.y * 100) / (asset.pixelHeight - viewport.height)}%`,
    backgroundSize: `${(asset.pixelWidth * 100) / viewport.width}% ${(asset.pixelHeight * 100) / viewport.height}%`,
  };
}

function SmeltingMaterialSprite({ material }: { material: { id: string; name: string } }) {
  const asset = getSmeltingMaterialAsset(material.id);

  return asset?.atlasViewport ? (
    <span
      aria-label={`${material.name}素材图标`}
      className="smelting-catalog__sprite"
      role="img"
      style={getSmeltingMaterialSpriteStyle(asset)}
    />
  ) : (
    <span aria-hidden="true" className="smelting-catalog__sprite" />
  );
}

export function SmeltingPanelContent({
  farmCatalog,
  onSmeltingAction,
  preview,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  onSmeltingAction?: SmeltingActionExecutor | undefined;
  preview: boolean;
}) {
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [actionState, setActionState] = useState<
    | { stage: "idle" }
    | { stage: "submitting"; input: SmeltingActionInput }
    | { stage: "success"; cropName: string; rarity: string; byRecipe: boolean }
    | { stage: "error"; message: string; retryInput: SmeltingActionInput | null }
  >({ stage: "idle" });
  const liveSmelting = farmCatalog?.data.smelting;

  if (
    !preview &&
    (!liveSmelting ||
      liveSmelting.status === "unavailable" ||
      liveSmelting.write_status !== "available" ||
      !onSmeltingAction)
  ) {
    return (
      <FarmUnavailablePanel
        iconKey="panel.tool.smelting"
        label={liveSmelting?.status === "unavailable" ? liveSmelting.message : "熔炼暂时不可用"}
      />
    );
  }

  if (actionState.stage === "success") {
    return (
      <section aria-label="熔炼结果" className="smelting-catalog smelting-catalog--notice">
        <div aria-live="polite" className="smelting-catalog__notice" role="status">
          <img alt="" aria-hidden="true" src={getFarmAssetUrl("panel.tool.smelting")} />
          <span>熔炼结果</span>
          <strong>{actionState.cropName}</strong>
          <small data-rarity={actionState.rarity}>{actionState.rarity}</small>
          <p>{actionState.byRecipe ? "命中已知配方" : "熔炼完成"}</p>
          <button
            onClick={() => {
              setSelectedMaterialIds([]);
              setActionState({ stage: "idle" });
            }}
            type="button"
          >
            继续熔炼
          </button>
        </div>
      </section>
    );
  }

  if (actionState.stage === "error") {
    return (
      <section aria-label="熔炼失败" className="smelting-catalog smelting-catalog--notice">
        <div aria-live="polite" className="smelting-catalog__notice" role="status">
          <img alt="" aria-hidden="true" src={getFarmAssetUrl("panel.tool.smelting")} />
          <strong>熔炼没有完成</strong>
          <p>{actionState.message}</p>
          {actionState.retryInput ? (
            <button
              onClick={() => void submit(actionState.retryInput as SmeltingActionInput)}
              type="button"
            >
              重试
            </button>
          ) : null}
          <button onClick={() => setActionState({ stage: "idle" })} type="button">
            返回选材
          </button>
        </div>
      </section>
    );
  }

  const toggleMaterial = (materialId: string) => {
    setSelectedMaterialIds((current) => {
      if (current.includes(materialId)) {
        return current.filter((selectedId) => selectedId !== materialId);
      }
      return current.length < 3 ? [...current, materialId] : [...current.slice(1), materialId];
    });
  };

  async function submit(retryInput?: SmeltingActionInput) {
    if (preview) {
      setActionState({
        stage: "success",
        cropName: "限定种子",
        rarity: "SR",
        byRecipe: false,
      });
      return;
    }
    if (
      !onSmeltingAction ||
      !farmCatalog ||
      !liveSmelting ||
      liveSmelting.status !== "available" ||
      liveSmelting.write_status !== "available"
    ) {
      return;
    }
    const input =
      retryInput ??
      ({
        expectedFarmDoorplate: farmCatalog.data.farm.farm_doorplate,
        expectedSmeltingRevision: liveSmelting.revision,
        idempotencyKey: globalThis.crypto.randomUUID(),
        materialIds: [...selectedMaterialIds],
      } satisfies SmeltingActionInput);
    setActionState({ stage: "submitting", input });
    const result = await onSmeltingAction(input);
    if (result.ok) {
      setActionState({
        stage: "success",
        cropName: result.data.data.result.crop_name,
        rarity: result.data.data.result.rarity,
        byRecipe: result.data.data.result.by_recipe,
      });
      return;
    }
    setActionState({
      stage: "error",
      message: smeltingActionIssueMessage(result.issue),
      retryInput: result.issue.code === "network_unavailable" ? input : null,
    });
  }

  return (
    <section aria-label="熔炼素材选择" className="smelting-catalog">
      <ul className="smelting-catalog__grid" aria-label="熔炼素材列表">
        {(preview
          ? SORTED_SMELTING_MATERIALS.map((material) => ({
              id: material.id,
              name: material.name,
              rarity: material.rarity,
              quantity: null as number | null,
              known: true,
            }))
          : liveSmelting?.status === "available"
            ? liveSmelting.materials.map((material) => ({
                id: material.material_id,
                name: material.identity_state === "known" ? material.name : null,
                rarity: material.rarity,
                quantity: material.quantity,
                known: material.identity_state === "known" && material.name !== null,
              }))
            : []
        ).map((material) => {
          const selected = selectedMaterialIds.includes(material.id);
          return (
            <li key={material.id}>
              <button
                aria-label={`${selected ? "取消选择" : "选择"}${material.name ?? "身份不可用素材"}`}
                aria-pressed={selected}
                onClick={() => toggleMaterial(material.id)}
                type="button"
              >
                <SmeltingMaterialSprite
                  material={{ id: material.id, name: material.name ?? "身份不可用素材" }}
                />
                <span className="smelting-catalog__quantity">
                  ×{material.quantity === null ? "—" : material.quantity}
                </span>
                <strong>{material.name ?? "身份不可用"}</strong>
                {material.rarity ? (
                  <small data-rarity={material.rarity}>{material.rarity}</small>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="smelting-catalog__footer">
        <button
          aria-label="开始熔炼"
          disabled={selectedMaterialIds.length !== 3 || actionState.stage === "submitting"}
          onClick={() => void submit()}
          type="button"
        >
          {actionState.stage === "submitting" ? "熔炼中…" : "开始熔炼"}
        </button>
      </footer>
    </section>
  );
}
