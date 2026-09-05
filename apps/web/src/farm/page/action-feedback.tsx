import type { BoundFarmField, BoundFarmHarvestAssist } from "../../auth/auth-client";
import { farmHarvestRequestIssueMessage } from "../../auth/farm-harvest-request-client";
import { farmPlantRequestIssueMessage } from "../../auth/farm-plant-request-client";
import { ranchCollectionIssueMessage } from "../../auth/ranch-collection-client";
import type { BoundRanchInteractionAction } from "../../auth/ranch-interaction-action-client";
import { farmHarvestAssistIssueMessage, farmLandUpgradeIssueMessage } from "../farm-overview";
import type {
  FarmHarvestActionState,
  FarmHarvestRequestActionState,
  FarmLandUpgradeActionState,
  FarmPlantRequestActionState,
  RanchCollectionState,
} from "./model";

export function FieldSceneOverlay({
  harvestAssist,
  onHarvestAssist,
  submitting,
}: {
  harvestAssist: BoundFarmField["data"]["harvest_assist"];
  onHarvestAssist?: (() => void) | undefined;
  submitting: boolean;
}) {
  const enabled = harvestAssist.can_assist && Boolean(onHarvestAssist) && !submitting;
  return (
    <aside aria-label="农场帮收" className="farm-scene-action-dock farm-scene-action-dock--field">
      <dl>
        <div>
          <dt>成熟</dt>
          <dd>{harvestAssist.mature_plot_count}</dd>
        </div>
        <div>
          <dt>今日帮收</dt>
          <dd>
            {harvestAssist.remaining}/{harvestAssist.daily_limit}
          </dd>
        </div>
      </dl>
      <button disabled={!enabled} onClick={onHarvestAssist} type="button">
        {submitting ? "正在帮收…" : "一键帮 TA 收"}
      </button>
    </aside>
  );
}

export function FieldRequestControls({
  emptyPlotCount,
  harvestRequestAction,
  maturePlotCount,
  onHarvestRequest,
  onPlantRequest,
  onRetryHarvestRequest,
  onRetryPlantRequest,
  plantRequestAction,
}: {
  emptyPlotCount: number;
  harvestRequestAction: FarmHarvestRequestActionState;
  maturePlotCount: number;
  onHarvestRequest?: (() => void) | undefined;
  onPlantRequest?: (() => void) | undefined;
  onRetryHarvestRequest?: (() => void) | undefined;
  onRetryPlantRequest?: (() => void) | undefined;
  plantRequestAction: FarmPlantRequestActionState;
}) {
  const harvestSubmitting = harvestRequestAction.stage === "submitting";
  const harvestSent = harvestRequestAction.stage === "success";
  const harvestRetry =
    harvestRequestAction.stage === "error" && harvestRequestAction.attempt
      ? onRetryHarvestRequest
      : undefined;
  const plantSubmitting = plantRequestAction.stage === "submitting";
  const plantSent = plantRequestAction.stage === "success";
  const plantRetry =
    plantRequestAction.stage === "error" && plantRequestAction.attempt
      ? onRetryPlantRequest
      : undefined;
  return (
    <aside aria-label="通知 TA 处理田地" className="farm-field-request-controls">
      <div>
        <button
          disabled={emptyPlotCount <= 0 || !onPlantRequest || plantSubmitting || plantSent}
          onClick={plantRetry ?? onPlantRequest}
          type="button"
        >
          {plantSubmitting
            ? "正在通知…"
            : plantSent
              ? "已通知 TA"
              : plantRequestAction.stage === "error"
                ? "重试喊 TA 来种"
                : "喊 TA 来种"}
        </button>
        <button
          disabled={maturePlotCount <= 0 || !onHarvestRequest || harvestSubmitting || harvestSent}
          onClick={harvestRetry ?? onHarvestRequest}
          type="button"
        >
          {harvestSubmitting
            ? "正在通知…"
            : harvestSent
              ? "已通知 TA"
              : harvestRequestAction.stage === "error"
                ? "重试喊 TA 来收"
                : "喊 TA 来收"}
        </button>
      </div>
      {plantRequestAction.stage === "error" ? (
        <p className="farm-harvest-request-error" role="alert">
          {farmPlantRequestIssueMessage(plantRequestAction.issue)}
        </p>
      ) : null}
      {harvestRequestAction.stage === "error" ? (
        <p className="farm-harvest-request-error" role="alert">
          {farmHarvestRequestIssueMessage(harvestRequestAction.issue)}
        </p>
      ) : null}
    </aside>
  );
}

export function FarmLandUpgradeControl({
  land,
  onUpgrade,
  submitting,
}: {
  land: BoundFarmField["data"]["land"];
  onUpgrade?: (() => void) | undefined;
  submitting: boolean;
}) {
  if (land.is_max_tier === undefined || land.next_upgrade === undefined) {
    return null;
  }
  if (land.is_max_tier || land.next_upgrade === null) {
    return (
      <aside aria-label="土地升级" className="farm-land-upgrade-control is-maximum">
        <strong>土地已满级</strong>
      </aside>
    );
  }
  const upgrade = land.next_upgrade;
  const enabled = upgrade.can_upgrade && Boolean(onUpgrade) && !submitting;
  return (
    <aside aria-label="土地升级" className="farm-land-upgrade-control">
      <span>
        <strong>下一阶 · {upgrade.name}</strong>
        <small>
          {upgrade.plots} 块地 · {upgrade.cost_farm_coins.toLocaleString("zh-CN")} 金币
        </small>
        {upgrade.status_message ? <small>{upgrade.status_message}</small> : null}
      </span>
      <button disabled={!enabled} onClick={onUpgrade} type="button">
        {submitting ? "升级中…" : "升级土地"}
      </button>
    </aside>
  );
}

export function FarmLandUpgradeReceipt({
  action,
  onClose,
  onReload,
  onRetry,
}: {
  action: Exclude<FarmLandUpgradeActionState, { stage: "idle" | "submitting" }>;
  onClose: () => void;
  onReload: () => void;
  onRetry: () => void;
}) {
  if (action.stage === "success") {
    return (
      <section aria-label="土地升级结果" className="farm-land-upgrade-receipt" role="status">
        <button aria-label="关闭土地升级结果" onClick={onClose} type="button">
          ×
        </button>
        <strong>土地升级完成</strong>
        <p>{action.result.message}</p>
        <small>
          {action.result.previous_land.name} → {action.result.upgraded_land.name} · 地块{" "}
          {action.result.previous_land.plots} → {action.result.upgraded_land.plots} · 金币 -
          {action.result.farm_coins_spent.toLocaleString("zh-CN")}
        </small>
      </section>
    );
  }
  return (
    <aside className="farm-land-upgrade-receipt" role="alert">
      <button aria-label="关闭土地升级提示" onClick={onClose} type="button">
        ×
      </button>
      <strong>土地还没有升级</strong>
      <p>{farmLandUpgradeIssueMessage(action.issue)}</p>
      {action.attempt ? (
        <button className="farm-land-upgrade-receipt__action" onClick={onRetry} type="button">
          重试同一次升级
        </button>
      ) : (
        <button className="farm-land-upgrade-receipt__action" onClick={onReload} type="button">
          重新读取农场
        </button>
      )}
    </aside>
  );
}

export function FarmHarvestReceipt({
  onClose,
  result,
}: {
  onClose: () => void;
  result: BoundFarmHarvestAssist["data"]["result"];
}) {
  return (
    <section aria-label="帮收结果" aria-modal="true" className="farm-harvest-receipt" role="dialog">
      <button
        aria-label="关闭帮收结果"
        className="farm-harvest-receipt__close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      <header>
        <span>一键帮收</span>
        <strong>收获完成</strong>
        <small>共收获 {result.harvested_count} 块</small>
      </header>
      <ul className="farm-harvest-receipt__list">
        {result.harvests.map((harvest, index) => (
          <li key={`${harvest.plot_id ?? `crop-${index}`}-${harvest.crop.crop_id}`}>
            <span>
              <strong>{harvest.crop.name}</strong>
              <small>
                {harvest.crop.rarity}
                {harvest.quality ? ` · ${harvest.quality.name}` : ""}
                {harvest.is_new ? " · 新图鉴" : ""}
              </small>
              {harvest.material_drop || harvest.potion_drop ? (
                <small>
                  {harvest.material_drop
                    ? `${harvest.material_drop.name} ×${harvest.material_drop.quantity}`
                    : ""}
                  {harvest.material_drop && harvest.potion_drop ? " · " : ""}
                  {harvest.potion_drop
                    ? `${harvest.potion_drop.name} ×${harvest.potion_drop.quantity}`
                    : ""}
                </small>
              ) : null}
            </span>
            <b>
              {harvest.currency === "silver" ? "银币" : "金币"} +{harvest.value}
              {harvest.bonus_value > 0 ? <small>金币 +{harvest.bonus_value}</small> : null}
            </b>
          </li>
        ))}
      </ul>
      <footer className="farm-harvest-receipt__summary">
        {result.farm_coins_gained > 0 ? <span>金币 +{result.farm_coins_gained}</span> : null}
        {result.silver_gained > 0 ? <span>银币 +{result.silver_gained}</span> : null}
        {result.season_event ? <span>{result.season_event.label}</span> : null}
        {result.new_titles.map((title) => (
          <span key={title.title_id}>新称号：{title.name}</span>
        ))}
      </footer>
    </section>
  );
}

export function FarmHarvestNotice({
  action,
  onClose,
  onReload,
  onRetry,
}: {
  action: Extract<FarmHarvestActionState, { stage: "error" }>;
  onClose: () => void;
  onReload: () => void;
  onRetry: () => void;
}) {
  return (
    <aside className="farm-harvest-notice" role="alert">
      <button aria-label="关闭帮收提示" onClick={onClose} type="button">
        ×
      </button>
      <p>{farmHarvestAssistIssueMessage(action.issue)}</p>
      {action.attempt ? (
        <button className="farm-harvest-notice__action" onClick={onRetry} type="button">
          重试同一次帮收
        </button>
      ) : (
        <button className="farm-harvest-notice__action" onClick={onReload} type="button">
          重新读取农场
        </button>
      )}
    </aside>
  );
}

export function RanchCollectionControl({
  count,
  onCollect,
  submitting,
}: {
  count: number;
  onCollect: () => void;
  submitting: boolean;
}) {
  return (
    <button
      aria-label={`一键收取牧场产出，共 ${count} 份`}
      className="farm-ranch-collect"
      disabled={submitting}
      onClick={onCollect}
      type="button"
    >
      {submitting ? "收取中…" : `一键收取 ×${count}`}
    </button>
  );
}

export function RanchCollectionReceipt({
  onClose,
  result,
}: {
  onClose: () => void;
  result: Extract<RanchCollectionState, { stage: "success" }>["result"];
}) {
  const destinationLabel = {
    debt: "偿还欠款",
    kitchen: "进入料理柜",
    ranch_coins: "自动回收",
  } as const;
  return (
    <section
      aria-label="牧场收取结果"
      aria-modal="true"
      className="farm-harvest-receipt farm-ranch-collection-receipt"
      role="dialog"
    >
      <button
        aria-label="关闭牧场收取结果"
        className="farm-harvest-receipt__close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      <header>
        <span>牧场产出</span>
        <strong>收取完成</strong>
        <small>共处理 {result.items.reduce((sum, item) => sum + item.quantity, 0)} 份</small>
      </header>
      <ul className="farm-harvest-receipt__list">
        {result.items.map((item, index) => (
          <li key={item.instance_id ?? `${item.item_id}-${index}`}>
            <span>
              <strong>
                {item.name} ×{item.quantity}
              </strong>
              <small>{destinationLabel[item.destination]}</small>
            </span>
            {item.unit_value === null ? null : <b>单价 {item.unit_value}</b>}
          </li>
        ))}
      </ul>
      <footer className="farm-harvest-receipt__summary">
        {result.ranch_coins_gained > 0 ? <span>牧场金币 +{result.ranch_coins_gained}</span> : null}
        {result.debt_paid > 0 ? <span>偿还欠款 {result.debt_paid}</span> : null}
        {result.stored_count > 0 ? <span>料理柜 +{result.stored_count}</span> : null}
        {result.potion_count > 0 ? <span>药水 +{result.potion_count}</span> : null}
      </footer>
    </section>
  );
}

export function RanchCollectionNotice({
  action,
  onClose,
  onReload,
  onRetry,
}: {
  action: Extract<RanchCollectionState, { stage: "error" }>;
  onClose: () => void;
  onReload: () => void;
  onRetry: () => void;
}) {
  return (
    <aside className="farm-harvest-notice farm-ranch-collection-notice" role="alert">
      <button aria-label="关闭牧场收取提示" onClick={onClose} type="button">
        ×
      </button>
      <p>{ranchCollectionIssueMessage(action.issue)}</p>
      {action.attempt ? (
        <button className="farm-harvest-notice__action" onClick={onRetry} type="button">
          重试同一次收取
        </button>
      ) : (
        <button className="farm-harvest-notice__action" onClick={onReload} type="button">
          重新读取牧场
        </button>
      )}
    </aside>
  );
}

export type RanchVisitorCatchOutcome = Extract<
  BoundRanchInteractionAction["data"]["result"]["outcome"],
  { kind: "catch" }
>;

export function RanchVisitorDetail({ name, ownerName, onCatch, onClose }: {
  name: string;
  ownerName: string | null;
  onCatch: () => void;
  onClose: () => void;
}) {
  return (
    <section aria-label="牧场来客" aria-modal="true" role="dialog"
      className="farm-harvest-receipt farm-ranch-catch-receipt">
      <button aria-label="关闭来客详情" className="farm-harvest-receipt__close"
        onClick={onClose} type="button">×</button>
      <header>
        <span>牧场来客</span>
        <strong>{name}</strong>
        <small>{ownerName ? `来自「${ownerName}」` : "主人信息暂未读取"}</small>
      </header>
      <footer className="ranch-resident-detail__action-row">
        <button onClick={onCatch} type="button">抓</button>
      </footer>
    </section>
  );
}

export function RanchVisitorCatchReceipt({
  onClose,
  outcome,
}: {
  onClose: () => void;
  outcome: RanchVisitorCatchOutcome;
}) {
  return (
    <section
      aria-label="抓捕来客结果"
      aria-modal="true"
      className="farm-harvest-receipt farm-ranch-catch-receipt"
      role="dialog"
    >
      <button
        aria-label="关闭抓捕来客结果"
        className="farm-harvest-receipt__close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      <header>
        <span>牧场来客</span>
        <strong>抓住了{outcome.animal_name}</strong>
        <small>来自「{outcome.owner}」</small>
      </header>
      <footer className="farm-harvest-receipt__summary">
        <span>牧场金币 +{outcome.compensation.toLocaleString("zh-CN")}</span>
      </footer>
    </section>
  );
}

export function RanchVisitorCatchNotice({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <aside className="farm-harvest-notice farm-ranch-catch-notice" role="alert">
      <button aria-label="关闭抓捕来客提示" onClick={onClose} type="button">
        ×
      </button>
      <p>{message}</p>
    </aside>
  );
}
