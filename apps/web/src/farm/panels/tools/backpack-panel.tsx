import { lazy, Suspense, useState } from "react";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import type { BoundKitchenRead } from "../../../auth/kitchen-client";
import type { BoundRanchRead } from "../../../auth/ranch-client";
import {
  type RanchDecorationActionInput,
  type RanchDecorationActionIssue,
  ranchDecorationActionIssueMessage,
} from "../../../auth/ranch-decoration-action-client";
import {
  FARM_FEATURE_PANELS,
  FarmFeaturePanelContent,
  FarmUnavailablePanel,
  getFeatureDefinition,
} from "./common";
import type {
  FarmSceneId,
  KitchenInventoryActionExecutor,
  RanchDecorationActionExecutor,
} from "./types";

const KitchenInventoryPanelContent = lazy(async () => {
  const module = await import("../kitchen-inventory-panel");
  return { default: module.KitchenInventoryPanelContent };
});

type FarmCatalogBackpackItems = Extract<
  BoundFarmCatalogRead["data"]["backpack"],
  { status: "available" }
>["items"];

export function getFarmBackpackItemsForTab(
  items: FarmCatalogBackpackItems,
  tab: string,
): FarmCatalogBackpackItems {
  if (tab === "种子与药水") {
    return items.filter(
      (item) => item.kind === "seed" || (item.kind === "item" && item.item_id === "speed_potion"),
    );
  }
  if (tab === "素材") {
    return items.filter((item) => item.kind === "material");
  }
  return items.filter((item) => item.kind === "item" && item.item_id !== "speed_potion");
}

function CatalogInventoryRows({
  items,
  emptyLabel,
}: {
  items: FarmCatalogBackpackItems;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <div className="farm-feature__empty" role="status">
        <strong>{emptyLabel}</strong>
      </div>
    );
  }

  return (
    <ul className="farm-crop-codex__list" aria-label="真实库存">
      {items.map((item) => (
        <li key={`${item.kind}:${item.item_id}`}>
          <span>{item.identity_state === "known" && item.name ? item.name : "身份不可用"}</span>
          <small>{item.quantity}</small>
        </li>
      ))}
    </ul>
  );
}

interface RanchDecorationActionAttempt {
  input: RanchDecorationActionInput;
  label: string;
}

type RanchDecorationActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: RanchDecorationActionAttempt }
  | { stage: "success"; message: string }
  | {
      stage: "error";
      attempt: RanchDecorationActionAttempt | null;
      issue: RanchDecorationActionIssue;
    };

function shouldRetryRanchDecorationAction(issue: RanchDecorationActionIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function FarmBackpackPanel({
  kitchen,
  onKitchenInventoryAction,
  onRanchDecorationAction,
  preview,
  ranch,
  farmCatalog,
  scene,
}: {
  kitchen?: BoundKitchenRead | null;
  onKitchenInventoryAction?: KitchenInventoryActionExecutor | undefined;
  onRanchDecorationAction?: RanchDecorationActionExecutor | undefined;
  preview: boolean;
  ranch?: BoundRanchRead | null;
  farmCatalog?: BoundFarmCatalogRead | null;
  scene: Exclude<FarmSceneId, "neighborhood">;
}) {
  const tabs = FARM_FEATURE_PANELS[scene].backpack?.tabs ?? [];
  const [activeTab, setActiveTab] = useState(tabs[0] ?? "");
  const [decorationAction, setDecorationAction] = useState<RanchDecorationActionState>({
    stage: "idle",
  });

  const submitDecorationAction = async (attempt: RanchDecorationActionAttempt) => {
    if (!onRanchDecorationAction) return;
    setDecorationAction({ stage: "submitting", attempt });
    let result: Awaited<ReturnType<RanchDecorationActionExecutor>>;
    try {
      result = await onRanchDecorationAction(attempt.input);
    } catch {
      setDecorationAction({
        stage: "error",
        attempt,
        issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
      });
      return;
    }
    if (result.ok) {
      setDecorationAction({
        stage: "success",
        message: `${result.data.data.result.outcome.decoration_name}已${attempt.label}`,
      });
      return;
    }
    setDecorationAction({
      stage: "error",
      attempt: shouldRetryRanchDecorationAction(result.issue) ? attempt : null,
      issue: result.issue,
    });
  };

  if (preview) {
    return (
      <FarmFeaturePanelContent
        definition={getFeatureDefinition(scene, "backpack")}
        tool={{ id: "backpack", label: "背包", iconKey: "panel.tool.backpack" }}
      />
    );
  }

  if (scene === "field") {
    const section = farmCatalog?.data.backpack;
    if (!section || section.status === "unavailable") {
      return (
        <FarmUnavailablePanel
          iconKey="panel.tool.backpack"
          label={section?.message ?? "背包数据尚未接入"}
        />
      );
    }
    return (
      <section aria-label="农场背包" className="farm-feature">
        <nav aria-label="背包分类" className="farm-feature__tabs">
          {tabs.map((tab) => (
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
        <CatalogInventoryRows
          emptyLabel="当前分类没有真实物品"
          items={getFarmBackpackItemsForTab(section.items, activeTab)}
        />
      </section>
    );
  }

  if (scene === "ranch") {
    if (!ranch) {
      return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="牧场背包数据尚未接入" />;
    }
    const wardrobe = ranch.data.wardrobe;
    const decorations = ranch.data.decorations;
    if (activeTab === "配饰") {
      if (wardrobe.status === "unavailable") {
        return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="配饰库存暂不可用" />;
      }
      return (
        <section aria-label="牧场配饰库存" className="farm-feature">
          <nav aria-label="背包分类" className="farm-feature__tabs">
            {tabs.map((tab) => (
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
          <ul className="farm-crop-codex__list">
            {wardrobe.items.length > 0 ? (
              wardrobe.items.map((item) => (
                <li key={`${item.accessory_id ?? "unavailable"}-${item.name ?? "item"}`}>
                  <span>{item.status === "known" && item.name ? item.name : "身份不可用"}</span>
                </li>
              ))
            ) : (
              <li>
                <span>当前没有真实配饰</span>
              </li>
            )}
          </ul>
        </section>
      );
    }
    if (activeTab === "装饰") {
      if (decorations.status === "unavailable") {
        return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="装饰库存暂不可用" />;
      }
      const items = [
        ...decorations.stored.map((item) => ({ action: "place" as const, item, label: "摆放" })),
        ...decorations.placed.map((item) => ({ action: "unplace" as const, item, label: "收回" })),
      ];
      const decorationBusy = decorationAction.stage === "submitting";
      return (
        <section aria-label="牧场装饰库存" className="farm-feature">
          <nav aria-label="背包分类" className="farm-feature__tabs">
            {tabs.map((tab) => (
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
          {decorationAction.stage === "success" ? (
            <p className="farm-inventory-action__feedback" role="status">
              {decorationAction.message}
            </p>
          ) : decorationAction.stage === "error" ? (
            <p
              className="farm-inventory-action__feedback farm-inventory-action__feedback--error"
              role="alert"
            >
              {ranchDecorationActionIssueMessage(decorationAction.issue)}
              {decorationAction.attempt ? (
                <button
                  onClick={() =>
                    void submitDecorationAction(
                      decorationAction.attempt as RanchDecorationActionAttempt,
                    )
                  }
                  type="button"
                >
                  重试
                </button>
              ) : null}
            </p>
          ) : null}
          <ul className="farm-crop-codex__list">
            {items.length > 0 ? (
              items.map(({ action, item, label }) => (
                <li key={`${action}-${item.decoration_id ?? "unavailable"}-${item.name ?? "item"}`}>
                  <span>{item.status === "known" && item.name ? item.name : "身份不可用"}</span>
                  {item.status === "known" && item.decoration_id && onRanchDecorationAction ? (
                    <button
                      className="farm-inventory-action"
                      disabled={decorationBusy}
                      onClick={() =>
                        void submitDecorationAction({
                          input: {
                            action,
                            decorationId: item.decoration_id as string,
                            expectedRevision: ranch.revision,
                            idempotencyKey: crypto.randomUUID(),
                          },
                          label,
                        })
                      }
                      type="button"
                    >
                      {decorationBusy ? "处理中" : label}
                    </button>
                  ) : null}
                </li>
              ))
            ) : (
              <li>
                <span>当前没有真实装饰</span>
              </li>
            )}
          </ul>
        </section>
      );
    }
    return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="其他牧场库存暂无真实数据" />;
  }

  return (
    <Suspense
      fallback={<FarmUnavailablePanel iconKey="panel.tool.backpack" label="正在读取料理库存" />}
    >
      <KitchenInventoryPanelContent
        kitchen={kitchen ?? null}
        onKitchenInventoryAction={onKitchenInventoryAction}
      />
    </Suspense>
  );
}
