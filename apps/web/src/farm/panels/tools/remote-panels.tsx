import { lazy, Suspense } from "react";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import type { BoundRanchRead } from "../../../auth/ranch-client";
import { FarmLazyLoading } from "../../page/farm-lazy-boundary";
import type {
  ExpeditionActionExecutor,
  MarketActionExecutor,
  RanchInteractionActionExecutor,
} from "../farm-action-panels";
import { FarmFeaturePanelContent, FarmUnavailablePanel, getFeatureDefinition } from "./common";
import type { FarmToolOption } from "./types";

const FarmMarketPanelContent = lazy(async () => {
  const module = await import("../farm-action-panels");
  return { default: module.FarmMarketPanelContent };
});

const FarmExpeditionPanelContent = lazy(async () => {
  const module = await import("../farm-action-panels");
  return { default: module.FarmExpeditionPanelContent };
});

const RanchDispatchPanelContent = lazy(async () => {
  const module = await import("../farm-action-panels");
  return { default: module.RanchDispatchPanelContent };
});

export function FarmMarketPanel({
  farmCatalog,
  onMarketAction,
  preview,
  tool,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  onMarketAction?: MarketActionExecutor | undefined;
  preview: boolean;
  tool: FarmToolOption;
}) {
  if (preview) {
    return (
      <FarmFeaturePanelContent definition={getFeatureDefinition("field", "market")} tool={tool} />
    );
  }

  const market = farmCatalog?.data.market;
  if (!market || market.status === "unavailable") {
    return (
      <FarmUnavailablePanel
        iconKey="panel.tool.market"
        label={market?.message ?? "集市数据尚未接入"}
      />
    );
  }

  return (
    <Suspense fallback={<FarmLazyLoading label="正在打开集市" />}>
      <FarmMarketPanelContent
        farmCatalog={farmCatalog}
        market={market}
        onMarketAction={onMarketAction}
      />
    </Suspense>
  );
}

export function FarmExpeditionPanel({
  farmCatalog,
  onExpeditionAction,
  preview,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  onExpeditionAction?: ExpeditionActionExecutor | undefined;
  preview: boolean;
}) {
  if (preview) {
    return (
      <FarmFeaturePanelContent
        definition={getFeatureDefinition("field", "adventure")}
        tool={{ id: "adventure", label: "探险", iconKey: "panel.tool.adventure" }}
      />
    );
  }
  const expedition = farmCatalog?.data.expedition;
  if (!expedition || expedition.status === "unavailable") {
    return (
      <FarmUnavailablePanel
        iconKey="panel.tool.adventure"
        label={expedition?.message ?? "探险数据尚未接入"}
      />
    );
  }

  return (
    <Suspense fallback={<FarmLazyLoading label="正在打开探险" />}>
      <FarmExpeditionPanelContent
        expedition={expedition}
        farmCatalog={farmCatalog}
        onExpeditionAction={onExpeditionAction}
      />
    </Suspense>
  );
}

export function RanchDispatchPanel({
  farmCatalog,
  onRanchInteractionAction,
  ranch,
  preview,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  onRanchInteractionAction?: RanchInteractionActionExecutor | undefined;
  ranch?: BoundRanchRead | null;
  preview: boolean;
}) {
  if (preview) {
    return (
      <FarmFeaturePanelContent
        definition={getFeatureDefinition("ranch", "dispatch")}
        tool={{ id: "dispatch", label: "派遣", iconKey: "panel.tool.dispatch" }}
      />
    );
  }
  const dispatch = ranch?.data.dispatch;
  if (!dispatch || dispatch.status === "unavailable") {
    return <FarmUnavailablePanel iconKey="panel.tool.dispatch" label="派遣数据尚未接入" />;
  }

  return (
    <Suspense fallback={<FarmLazyLoading label="正在打开派遣" />}>
      <RanchDispatchPanelContent
        dispatch={dispatch}
        farmCatalog={farmCatalog ?? null}
        onRanchInteractionAction={onRanchInteractionAction}
        ranch={ranch}
      />
    </Suspense>
  );
}
