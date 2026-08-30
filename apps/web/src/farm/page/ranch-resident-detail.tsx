import { useCallback, useState } from "react";
import {
  type RanchResidentActionInput,
  type RanchResidentActionIssue,
  ranchResidentActionIssueMessage,
} from "../../auth/ranch-action-client";
import type { BoundRanchRead } from "../../auth/ranch-client";
import {
  getRanchResidentSpriteVisual,
  RANCH_PATROL_GOOSE_VISUAL,
  RANCH_SHOP_ANIMALS,
  type RanchShopAnimal,
  type RanchVariantSelection,
} from "../panels/ranch-animal-data";
import type {
  RanchResidentActionAttempt,
  RanchResidentActionExecutor,
  RanchResidentActionOutcome,
  RanchResidentActionResult,
  RanchResidentActionState,
} from "./model";

export type { RanchResidentActionExecutor } from "./model";

export function RanchShopAnimalSprite({
  animal,
  residentKindId,
  variants,
}: {
  animal: RanchShopAnimal;
  residentKindId?: string | undefined;
  variants?: RanchVariantSelection | null | undefined;
}) {
  const visual = getRanchResidentSpriteVisual(animal, variants, residentKindId);
  return (
    <span
      aria-hidden="true"
      className={`ranch-shop__animal-sprite ranch-shop__animal-sprite--${visual.kind}`}
      style={visual.spriteStyle}
    />
  );
}

export type FarmRanchResident = BoundRanchRead["data"]["residents"]["animals"][number];

export interface LiveRanchResidentView {
  category: "动物" | "宠物" | "巡逻鹅";
  id: string;
  resident: FarmRanchResident;
  residentType: RanchResidentActionInput["residentType"];
  spriteAnimal: RanchShopAnimal;
}

export function getLiveRanchResidents(
  ranch: BoundRanchRead | null,
): readonly LiveRanchResidentView[] {
  if (ranch?.data.residents.status !== "available") {
    return [];
  }

  const candidates: Array<{
    category: LiveRanchResidentView["category"];
    resident: FarmRanchResident;
    residentType: LiveRanchResidentView["residentType"];
  }> = [
    ...ranch.data.residents.animals.map((resident) => ({
      category: "动物" as const,
      resident,
      residentType: "animal" as const,
    })),
    ...ranch.data.residents.pets.map((resident) => ({
      category: "宠物" as const,
      resident,
      residentType: "pet" as const,
    })),
    ...(ranch.data.residents.patrol_goose
      ? [
          {
            category: "巡逻鹅" as const,
            resident: ranch.data.residents.patrol_goose,
            residentType: "patrol_goose" as const,
          },
        ]
      : []),
  ];

  return candidates.flatMap(({ category, resident, residentType }) => {
    const kindId = resident.identity.kind_id;
    const name = resident.identity.custom_name ?? resident.identity.name;
    const spriteAnimal =
      kindId === "patrol_goose"
        ? RANCH_PATROL_GOOSE_VISUAL
        : RANCH_SHOP_ANIMALS.find((animal) => animal.id === kindId);
    return resident.status === "known" &&
      resident.identity.status === "known" &&
      kindId !== null &&
      name !== null &&
      spriteAnimal
      ? [
          {
            category,
            id: `${category}:${kindId}`,
            resident,
            residentType,
            spriteAnimal,
          },
        ]
      : [];
  });
}

export function getLiveRanchSceneLayout(index: number, total: number) {
  const columns = total > 9 ? 4 : 3;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rowCount = Math.max(1, Math.ceil(total / columns));
  return {
    x: 18 + (column * 64) / Math.max(1, columns - 1),
    y: 42 + (row * 32) / Math.max(1, rowCount - 1),
    size: total > 12 ? 12 : total > 6 ? 15 : 18,
    roam: { minX: 10, maxX: 88, minY: 32, maxY: 79 },
  };
}

function ranchResidentOutcomeMessage(outcome: RanchResidentActionOutcome): string {
  if (outcome.kind === "feed") {
    return `投喂完成，花费 ${outcome.cost_silver} 银币，今天还可投喂 ${outcome.remaining_today} 次`;
  }
  if (outcome.kind === "upgrade") {
    return `已升到 ${outcome.level} 级，花费 ${outcome.cost_ranch_coins} 牧场金币`;
  }
  if (outcome.kind === "rename") {
    return `名字已改为 ${outcome.name}`;
  }
  if (outcome.kind === "toggle_pin") {
    return outcome.pinned ? "已加入农场氛围" : "已移出农场氛围";
  }
  if (outcome.kind === "wear_accessory") {
    return `${outcome.wearer_name}已佩戴${outcome.accessory_name}`;
  }
  if (outcome.kind === "takeoff_accessory") {
    return `${outcome.wearer_name}已取下${outcome.accessory_name}`;
  }
  return `已切换为${outcome.variant_name}`;
}

export function RanchResidentDetail({
  onAction,
  view,
  onClose,
  onReload,
  ranch,
}: {
  onAction?: RanchResidentActionExecutor | undefined;
  view:
    | { kind: "preview"; animal: RanchShopAnimal }
    | { kind: "live"; resident: LiveRanchResidentView };
  onClose: () => void;
  onReload?: (() => void) | undefined;
  ranch: BoundRanchRead | null;
}) {
  const animal = view.kind === "preview" ? view.animal : view.resident.spriteAnimal;
  const liveResident = view.kind === "live" ? view.resident : null;
  const residentData = liveResident?.resident ?? null;
  const name =
    view.kind === "preview"
      ? animal.name
      : (residentData?.identity.custom_name ?? residentData?.identity.name ?? "");
  const titleId = `ranch-resident-detail-${view.kind === "preview" ? animal.id : liveResident?.id}`;
  const [renameDraft, setRenameDraft] = useState(name);
  const [selectedWearAccessoryId, setSelectedWearAccessoryId] = useState("");
  const [selectedTakeoffAccessoryId, setSelectedTakeoffAccessoryId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [actionState, setActionState] = useState<RanchResidentActionState>({ stage: "idle" });
  const allowedActions = residentData?.allowed_actions ?? null;
  const submitting = actionState.stage === "submitting";
  const wornAccessories =
    residentData?.accessories.status === "available"
      ? residentData.accessories.items.flatMap((accessory) =>
          accessory.status === "known" && accessory.accessory_id && accessory.name
            ? [{ id: accessory.accessory_id, name: accessory.name }]
            : [],
        )
      : [];
  const wornAccessoryIds = new Set(wornAccessories.map((accessory) => accessory.id));
  const wearableAccessories =
    ranch?.data.wardrobe.status === "available"
      ? ranch.data.wardrobe.items.flatMap((accessory) =>
          accessory.status === "known" &&
          accessory.accessory_id &&
          accessory.name &&
          !wornAccessoryIds.has(accessory.accessory_id)
            ? [{ id: accessory.accessory_id, name: accessory.name }]
            : [],
        )
      : [];
  const wearAccessoryId = wearableAccessories.some(
    (accessory) => accessory.id === selectedWearAccessoryId,
  )
    ? selectedWearAccessoryId
    : (wearableAccessories[0]?.id ?? "");
  const takeoffAccessoryId = wornAccessories.some(
    (accessory) => accessory.id === selectedTakeoffAccessoryId,
  )
    ? selectedTakeoffAccessoryId
    : (wornAccessories[0]?.id ?? "");
  const variantIds = residentData?.variants?.available_variant_ids ?? [];
  const variantOptions = residentData?.variants?.available_variants ?? [];
  const variantId = variantIds.includes(selectedVariantId)
    ? selectedVariantId
    : (residentData?.variants?.current_variant_id ?? variantIds[0] ?? "");

  const submitAction = useCallback(
    async (
      action: RanchResidentActionInput["action"],
      payload: RanchResidentActionInput["payload"],
      label: string,
      retryAttempt?: RanchResidentActionAttempt,
    ) => {
      const kindId = residentData?.identity.kind_id;
      if (!onAction || !ranch || !liveResident || !kindId) {
        return;
      }
      const attempt =
        retryAttempt ??
        ({
          label,
          input: {
            action,
            expectedRevision: ranch.revision,
            idempotencyKey: crypto.randomUUID(),
            kindId,
            payload,
            residentType: liveResident.residentType,
          },
        } satisfies RanchResidentActionAttempt);
      setActionState({ stage: "submitting", attempt });

      let result: RanchResidentActionResult;
      try {
        result = await onAction(attempt.input);
      } catch {
        setActionState({
          stage: "error",
          attempt: null,
          issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
        });
        return;
      }

      if (
        !result.ok &&
        result.issue.code === "state_conflict" &&
        result.issue.currentRevision &&
        result.issue.currentRevision !== attempt.input.expectedRevision
      ) {
        const refreshedAttempt = {
          ...attempt,
          input: { ...attempt.input, expectedRevision: result.issue.currentRevision },
        };
        try {
          result = await onAction(refreshedAttempt.input);
        } catch {
          setActionState({
            stage: "error",
            attempt: null,
            issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
          });
          return;
        }
      }

      if (result.ok) {
        setActionState({ stage: "success", outcome: result.data.data.result.outcome });
        return;
      }
      setActionState({
        stage: "error",
        attempt: shouldRetryRanchResidentAction(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [liveResident, onAction, ranch, residentData?.identity.kind_id],
  );

  const actionCostLabel = (
    action: NonNullable<
      NonNullable<typeof allowedActions>[keyof NonNullable<typeof allowedActions>]
    >,
  ) => {
    if (action.cost.currency === null || action.cost.amount === null) {
      return null;
    }
    return `${action.cost.currency === "silver" ? "银币" : "牧场金币"} ${action.cost.amount.toLocaleString("zh-CN")}`;
  };

  const renderActionButton = (
    actionName: "feed" | "upgrade" | "toggle_pin",
    label: string,
    payload: RanchResidentActionInput["payload"] = {},
  ) => {
    const action = allowedActions?.[actionName];
    if (!action) return null;
    const costLabel = actionCostLabel(action);
    return (
      <span className="ranch-resident-detail__action-item">
        <button
          disabled={!action.enabled || submitting}
          onClick={() => void submitAction(actionName, payload, label)}
          title={action.reason ?? undefined}
          type="button"
        >
          <strong>{label}</strong>
          {costLabel ? <small>{costLabel}</small> : null}
        </button>
        {!action.enabled && action.reason ? <small>{action.reason}</small> : null}
      </span>
    );
  };

  return (
    <section
      aria-labelledby={titleId}
      aria-modal="true"
      className="ranch-resident-detail"
      data-animal-id={animal.id}
      role="dialog"
    >
      <div className="ranch-resident-detail__paper">
        <button
          aria-label={`关闭${name}详情`}
          className="ranch-resident-detail__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <header className="ranch-resident-detail__head">
          <span className="ranch-resident-detail__portrait">
            <RanchShopAnimalSprite
              animal={animal}
              residentKindId={residentData?.identity.kind_id ?? animal.id}
              variants={residentData?.variants}
            />
          </span>
          <span className="ranch-resident-detail__identity">
            <small>{liveResident?.category ?? animal.category}</small>
            <strong id={titleId}>{name}</strong>
            {view.kind === "preview" && animal.description ? <p>{animal.description}</p> : null}
          </span>
        </header>
        <dl className="ranch-resident-detail__facts">
          {view.kind === "live" && residentData?.level !== null ? (
            <div>
              <dt>等级</dt>
              <dd>{residentData?.level}</dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.produce?.item.status === "known" ? (
            <div>
              <dt>产物</dt>
              <dd>
                {residentData.produce.item.name}
                {residentData.produce.item.pending_count !== null
                  ? ` ×${residentData.produce.item.pending_count}`
                  : ""}
                {residentData.produce.item.unit_value !== null
                  ? ` · 单份价值 ${residentData.produce.item.unit_value.toLocaleString("zh-CN")} 牧场金币`
                  : ""}
              </dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.produce?.meat?.status === "known" ? (
            <div>
              <dt>肉类</dt>
              <dd>
                {residentData.produce.meat.name}
                {residentData.produce.meat.pending_count !== null
                  ? ` ×${residentData.produce.meat.pending_count}`
                  : ""}
                {residentData.produce.meat.unit_value !== null
                  ? ` · 单份价值 ${residentData.produce.meat.unit_value.toLocaleString("zh-CN")} 牧场金币`
                  : ""}
              </dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.dispatch ? (
            <div>
              <dt>状态</dt>
              <dd>
                {residentData.dispatch.state === "home"
                  ? "在牧场"
                  : residentData.dispatch.state === "active"
                    ? "派遣中"
                    : residentData.dispatch.state === "pending_settlement"
                      ? "等待结算"
                      : "暂不可用"}
              </dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.health ? (
            <div>
              <dt>健康</dt>
              <dd>{residentData.health.label}</dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.accessories.status === "available" ? (
            <div>
              <dt>配饰</dt>
              <dd>
                {residentData.accessories.items
                  .flatMap((accessory) =>
                    accessory.status === "known" && accessory.name ? [accessory.name] : [],
                  )
                  .join("、") || "未佩戴"}
              </dd>
            </div>
          ) : null}
          {view.kind === "preview" && animal.produce ? (
            <div>
              <dt>产物</dt>
              <dd>{animal.produce}</dd>
            </div>
          ) : null}
          {view.kind === "preview" && animal.produceEveryTicks ? (
            <div>
              <dt>产出周期</dt>
              <dd>{animal.produceEveryTicks} 个农场周期</dd>
            </div>
          ) : null}
          {view.kind === "preview" && animal.effectLabel ? (
            <div>
              <dt>作用</dt>
              <dd>{animal.effectLabel}</dd>
            </div>
          ) : null}
          {view.kind === "preview" && animal.effectText ? (
            <div className="ranch-resident-detail__fact-description">
              <dt>效果</dt>
              <dd>{animal.effectText}</dd>
            </div>
          ) : null}
        </dl>
        {view.kind === "live" && allowedActions && onAction && ranch ? (
          <div className="ranch-resident-detail__actions">
            <div className="ranch-resident-detail__action-grid">
              {liveResident?.residentType === "animal" ? renderActionButton("feed", "投喂") : null}
              {liveResident?.residentType === "animal"
                ? renderActionButton("upgrade", "升级")
                : null}
              {renderActionButton("toggle_pin", residentData?.pinned ? "移出氛围" : "加入氛围")}
            </div>
            <p className="ranch-resident-detail__action-status">
              氛围选择只影响小机看到的农场描述，不改变动物排序。
            </p>

            <form
              className="ranch-resident-detail__action-row"
              onSubmit={(event) => {
                event.preventDefault();
                const nextName = renameDraft.trim();
                if (nextName && nextName !== name) {
                  void submitAction("rename", { name: nextName }, "改名");
                }
              }}
            >
              <label htmlFor={`${titleId}-rename`}>名字</label>
              <input
                id={`${titleId}-rename`}
                maxLength={12}
                onChange={(event) => setRenameDraft(event.currentTarget.value)}
                value={renameDraft}
              />
              <button
                disabled={
                  !allowedActions.rename.enabled ||
                  submitting ||
                  !renameDraft.trim() ||
                  renameDraft.trim() === name
                }
                title={allowedActions.rename.reason ?? undefined}
                type="submit"
              >
                改名
              </button>
            </form>
            {!allowedActions.rename.enabled && allowedActions.rename.reason ? (
              <small className="ranch-resident-detail__action-reason">
                {allowedActions.rename.reason}
              </small>
            ) : null}

            {wearableAccessories.length > 0 ? (
              <div className="ranch-resident-detail__action-row">
                <label htmlFor={`${titleId}-wear`}>配饰</label>
                <select
                  id={`${titleId}-wear`}
                  onChange={(event) => setSelectedWearAccessoryId(event.currentTarget.value)}
                  value={wearAccessoryId}
                >
                  {wearableAccessories.map((accessory) => (
                    <option key={accessory.id} value={accessory.id}>
                      {accessory.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={
                    !allowedActions.wear_accessory.enabled || submitting || !wearAccessoryId
                  }
                  onClick={() =>
                    void submitAction(
                      "wear_accessory",
                      { accessory_id: wearAccessoryId },
                      "佩戴配饰",
                    )
                  }
                  title={allowedActions.wear_accessory.reason ?? undefined}
                  type="button"
                >
                  佩戴
                </button>
              </div>
            ) : null}

            {wornAccessories.length > 0 ? (
              <div className="ranch-resident-detail__action-row">
                <label htmlFor={`${titleId}-takeoff`}>已佩戴</label>
                <select
                  id={`${titleId}-takeoff`}
                  onChange={(event) => setSelectedTakeoffAccessoryId(event.currentTarget.value)}
                  value={takeoffAccessoryId}
                >
                  {wornAccessories.map((accessory) => (
                    <option key={accessory.id} value={accessory.id}>
                      {accessory.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={
                    !allowedActions.takeoff_accessory.enabled || submitting || !takeoffAccessoryId
                  }
                  onClick={() =>
                    void submitAction(
                      "takeoff_accessory",
                      { accessory_id: takeoffAccessoryId },
                      "取下配饰",
                    )
                  }
                  title={allowedActions.takeoff_accessory.reason ?? undefined}
                  type="button"
                >
                  取下
                </button>
              </div>
            ) : null}

            {variantIds.length > 0 ? (
              <div className="ranch-resident-detail__action-row">
                <label htmlFor={`${titleId}-variant`}>外观</label>
                <select
                  id={`${titleId}-variant`}
                  onChange={(event) => setSelectedVariantId(event.currentTarget.value)}
                  value={variantId}
                >
                  {variantIds.map((itemId) => {
                    const variantName = variantOptions.find(
                      (candidate) => candidate.variant_id === itemId,
                    )?.name;
                    return (
                      <option key={itemId} value={itemId}>
                        {variantName ?? (itemId === "base" ? "原始外观" : itemId)}
                        {itemId === residentData?.variants?.current_variant_id ? "（当前）" : ""}
                      </option>
                    );
                  })}
                </select>
                <button
                  disabled={
                    !allowedActions.set_variant.enabled ||
                    submitting ||
                    !variantId ||
                    variantId === residentData?.variants?.current_variant_id
                  }
                  onClick={() =>
                    void submitAction("set_variant", { variant_id: variantId }, "更换外观")
                  }
                  title={allowedActions.set_variant.reason ?? undefined}
                  type="button"
                >
                  更换
                </button>
              </div>
            ) : null}

            {actionState.stage === "submitting" ? (
              <p className="ranch-resident-detail__action-status" role="status">
                正在{actionState.attempt.label}…
              </p>
            ) : null}
            {actionState.stage === "success" ? (
              <p className="ranch-resident-detail__action-status" role="status">
                {ranchResidentOutcomeMessage(actionState.outcome)}
              </p>
            ) : null}
            {actionState.stage === "error" ? (
              <div className="ranch-resident-detail__action-error" role="alert">
                <span>{ranchResidentActionIssueMessage(actionState.issue)}</span>
                {actionState.attempt ? (
                  <button
                    onClick={() => {
                      const attempt = actionState.attempt;
                      if (attempt) {
                        void submitAction(
                          attempt.input.action,
                          attempt.input.payload,
                          attempt.label,
                          attempt,
                        );
                      }
                    }}
                    type="button"
                  >
                    重试
                  </button>
                ) : null}
                {actionState.issue.code === "state_conflict" && onReload ? (
                  <button onClick={onReload} type="button">
                    重新读取
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function shouldRetryRanchResidentAction(issue: RanchResidentActionIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}
