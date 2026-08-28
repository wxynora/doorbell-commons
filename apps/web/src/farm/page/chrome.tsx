import {
  DEFAULT_FARM_TOOL_EDITOR_LAYOUT,
  FARM_TOOL_EDITOR_BULLETIN_OPTION,
  FARM_TOOL_LAYOUTS,
  FARM_TOOL_OPTIONS,
  type FarmSceneId,
  type FarmToolOption,
  getFarmToolIconStyle,
  getFarmToolTextStyle,
  type NeighborhoodSectionId,
} from "../dev/farm-tool-layouts";
import type { FarmAssetKey } from "../farm-asset-manifest";
import { getFarmAssetUrl } from "../farm-asset-manifest";
import type { ShopCartSceneId } from "./model";

interface SceneOption {
  id: FarmSceneId;
  label: string;
  iconKey: FarmAssetKey;
}

const FARM_SCENE_BALANCES: Readonly<
  Record<ShopCartSceneId, { currency: "gold" | "silver"; label: string }>
> = {
  field: { currency: "gold", label: "农场金币" },
  ranch: { currency: "gold", label: "牧场金币" },
  cooking: { currency: "silver", label: "银币" },
};

export const SCENE_OPTIONS: readonly SceneOption[] = [
  { id: "field", label: "农场", iconKey: "shell.scene.field" },
  { id: "ranch", label: "牧场", iconKey: "shell.scene.ranch" },
  { id: "cooking", label: "料理台", iconKey: "shell.scene.cooking" },
  { id: "neighborhood", label: "邻里", iconKey: "shell.scene.neighborhood" },
];

export const NEIGHBORHOOD_EMPTY_LABELS: Readonly<Record<NeighborhoodSectionId, string>> = {
  ranking: "暂无可显示的排行榜数据。",
  "message-board": "暂无可显示的留言。",
  "original-crops": "暂无可显示的原创作物。",
};

export function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

export function FarmIdentityPlaque({
  farmDoorplate,
  farmName,
}: {
  farmDoorplate: string;
  farmName: string;
}) {
  return (
    <aside aria-label="农场资料" className="farm-field-plaque">
      <img
        alt=""
        aria-hidden="true"
        className="farm-field-plaque__art"
        src={getFarmAssetUrl("field.identity-plaque")}
      />
      <span className="farm-field-plaque__copy">
        <strong>{farmName}</strong>
        <span>
          门牌 <b>{farmDoorplate}</b>
        </span>
      </span>
    </aside>
  );
}

export function FarmEnvironmentStatus({
  landName,
  landTier,
  seasonName,
}: {
  landName: string;
  landTier: number;
  seasonName: string;
}) {
  return (
    <aside aria-label="农场环境" className="farm-field-environment">
      <span>时节 {seasonName}</span>
      <span aria-hidden="true" className="farm-field-environment__divider" />
      <span>
        土地 {landTier} · {landName}
      </span>
    </aside>
  );
}

export function SceneTabs({
  activeScene,
  onChange,
}: {
  activeScene: FarmSceneId;
  onChange: (sceneId: FarmSceneId) => void;
}) {
  return (
    <nav aria-label="农场场景" className="farm-scene-tabs">
      {SCENE_OPTIONS.map((scene) => (
        <button
          aria-current={activeScene === scene.id ? "page" : undefined}
          key={scene.id}
          onClick={() => onChange(scene.id)}
          type="button"
        >
          <img alt="" aria-hidden="true" src={getFarmAssetUrl(scene.iconKey)} />
          <span>{scene.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function SceneBalance({
  farmCoins,
  ranchCoins,
  sceneId,
  silver,
}: {
  farmCoins: number;
  ranchCoins: number | null;
  sceneId: ShopCartSceneId;
  silver: number | null;
}) {
  const balance = FARM_SCENE_BALANCES[sceneId];
  const value = sceneId === "field" ? farmCoins : sceneId === "ranch" ? ranchCoins : silver;

  return (
    <div
      aria-label={value === null ? `${balance.label}余额暂未接入` : `${balance.label}余额 ${value}`}
      className={`farm-scene-balance farm-scene-balance--${balance.currency}`}
      role="status"
    >
      <i aria-hidden="true" />
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

export function FarmToolBar({
  activeScene,
  onOpenBulletin,
  onSelect,
}: {
  activeScene: FarmSceneId;
  onOpenBulletin: () => void;
  onSelect: (tool: FarmToolOption) => void;
}) {
  const tools = FARM_TOOL_OPTIONS[activeScene];
  const bulletinLayout = FARM_TOOL_LAYOUTS.bulletin ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT;

  return (
    <aside className="farm-tool-menu">
      <button
        aria-label="打开叮咚播报"
        className="farm-tool-menu__toggle"
        onClick={onOpenBulletin}
        type="button"
      >
        <img
          alt=""
          aria-hidden="true"
          src={getFarmAssetUrl(FARM_TOOL_EDITOR_BULLETIN_OPTION.iconKey)}
          style={getFarmToolIconStyle(bulletinLayout)}
        />
        <span style={getFarmToolTextStyle(bulletinLayout)}>叮咚播报</span>
      </button>

      {tools.length > 0 ? (
        <nav
          aria-label={`${SCENE_OPTIONS.find((scene) => scene.id === activeScene)?.label}工具`}
          className="farm-tools"
          id="farm-scene-tools"
        >
          {tools.map((tool) => {
            const layout = FARM_TOOL_LAYOUTS[tool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT;

            return (
              <button key={tool.id} onClick={() => onSelect(tool)} type="button">
                <img
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  src={getFarmAssetUrl(tool.iconKey)}
                  style={getFarmToolIconStyle(layout)}
                />
                <span style={getFarmToolTextStyle(layout)}>{tool.label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}
    </aside>
  );
}
