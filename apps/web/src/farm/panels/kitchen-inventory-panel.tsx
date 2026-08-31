import { useState } from "react";
import type { BoundKitchenRead } from "../../auth/kitchen-client";
import {
  type BoundKitchenInventoryAction,
  type KitchenInventoryActionInput,
  type KitchenInventoryActionIssue,
  kitchenInventoryActionIssueMessage,
} from "../../auth/kitchen-inventory-action-client";
import { CookingCatalogSprite } from "./shop/shared";
import type { KitchenInventoryActionExecutor } from "./tool-panel";
import "./kitchen-inventory-panel.css";

type KitchenData = BoundKitchenRead["data"];
type KitchenProductInstance = KitchenData["product_instances"]["items"][number];
type KitchenInventoryActionAttempt = {
  input: KitchenInventoryActionInput;
  label: string;
};

type KitchenInventoryActionDraft =
  | Omit<
      Extract<KitchenInventoryActionInput, { action: "use" }>,
      "expectedFarmDoorplate" | "expectedInventoryRevision" | "idempotencyKey"
    >
  | Omit<
      Extract<KitchenInventoryActionInput, { action: "recycle" }>,
      "expectedFarmDoorplate" | "expectedInventoryRevision" | "idempotencyKey"
    >
  | Omit<
      Extract<KitchenInventoryActionInput, { action: "stall" }>,
      "expectedFarmDoorplate" | "expectedInventoryRevision" | "idempotencyKey"
    >
  | Omit<
      Extract<KitchenInventoryActionInput, { action: "sell_fish" }>,
      "expectedFarmDoorplate" | "expectedInventoryRevision" | "idempotencyKey"
    >
  | Omit<
      Extract<KitchenInventoryActionInput, { action: "sell_treasure" }>,
      "expectedFarmDoorplate" | "expectedInventoryRevision" | "idempotencyKey"
    >;

type KitchenInventoryActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: KitchenInventoryActionAttempt }
  | { stage: "success"; message: string }
  | {
      stage: "error";
      attempt: KitchenInventoryActionAttempt | null;
      issue: KitchenInventoryActionIssue;
    };

type KitchenActionSubmitter = (input: KitchenInventoryActionDraft, label: string) => void;

function hasStableId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function itemName(name: string | null, fallback: string): string {
  return name?.trim() || fallback;
}

function canOperate(status: string, id: string | null | undefined): boolean {
  return status === "available" && hasStableId(id);
}

function shouldRetryKitchenInventoryAction(issue: KitchenInventoryActionIssue): boolean {
  return issue.code === "network_unavailable" || (issue.code as string) === "network_unknown";
}

function kitchenInventoryOutcomeMessage(
  outcome: BoundKitchenInventoryAction["data"]["result"]["outcome"],
): string {
  switch (outcome.kind) {
    case "use":
      return outcome.target === "self"
        ? `已让小机吃下${outcome.dish_name}`
        : `已给${outcome.target === "cat" ? "小猫" : "小狗"}吃${outcome.dish_name}`;
    case "recycle":
      return outcome.item_kind === "product"
        ? `已回收 ${outcome.quantity} 份${outcome.name}，获得 ${outcome.value} 牧场金币`
        : `已回收 ${outcome.quantity} 份${outcome.name}，获得 ${outcome.silver} 银币`;
    case "stall":
      return `已将 ${outcome.quantity} 份${outcome.name}以 ${outcome.price} 银币摆摊`;
    case "sell_fish":
      return `已出售 ${outcome.quantity} 条${outcome.name}，获得 ${outcome.silver} 银币`;
    case "sell_treasure":
      return `已回收 ${outcome.quantity} 份${outcome.name}，获得 ${outcome.silver} 银币`;
  }
}

function InventoryUnavailable({ label }: { label: string }) {
  return (
    <div className="kitchen-inventory-panel__empty" role="status">
      <strong>{label}</strong>
    </div>
  );
}

function InventoryEmpty({ label }: { label: string }) {
  return (
    <div className="kitchen-inventory-panel__empty" role="status">
      <strong>{label}</strong>
    </div>
  );
}

function KitchenIngredientSection({ section }: { section: KitchenData["stacked_ingredients"] }) {
  if (section.status === "unavailable") {
    return <InventoryUnavailable label="食材库存暂不可用" />;
  }
  if (section.items.length === 0) {
    return <InventoryEmpty label="当前没有真实食材" />;
  }
  return (
    <ul aria-label="真实食材库存" className="kitchen-inventory-panel__list">
      {section.items.map((item) => (
        <li className="kitchen-inventory-panel__row" key={`ingredient:${item.ingredient_id}`}>
          <div className="kitchen-inventory-panel__copy">
            <span className="kitchen-inventory-panel__name">
              {item.status === "available" && item.name ? item.name : "身份不可用"}
            </span>
            <small className="kitchen-inventory-panel__meta">数量 {item.quantity ?? "—"}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface KitchenProductDisplayGroup {
  key: string;
  items: KitchenProductInstance[];
}

function groupKitchenProductsForDisplay(
  items: KitchenProductInstance[],
): KitchenProductDisplayGroup[] {
  const groups: KitchenProductDisplayGroup[] = [];
  const stackableGroups = new Map<string, KitchenProductDisplayGroup>();
  for (const [index, item] of items.entries()) {
    const stackable =
      item.status === "available" &&
      item.name !== null &&
      item.value_gold !== null &&
      item.reason === null;
    if (!stackable) {
      groups.push({ key: `instance:${item.product_instance_id}:${index}`, items: [item] });
      continue;
    }
    const key = `stack:${JSON.stringify([item.product_id, item.name, item.value_gold])}`;
    const existing = stackableGroups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const group = { key, items: [item] };
    stackableGroups.set(key, group);
    groups.push(group);
  }
  return groups;
}

function KitchenProductSection({
  actionsEnabled,
  busy,
  onSubmit,
  section,
}: {
  actionsEnabled: boolean;
  busy: boolean;
  onSubmit: KitchenActionSubmitter;
  section: KitchenData["product_instances"];
}) {
  const [recycleQuantities, setRecycleQuantities] = useState<Record<string, string>>({});
  if (section.status === "unavailable") {
    return <InventoryUnavailable label="牧场产物库存暂不可用" />;
  }
  if (section.items.length === 0) {
    return <InventoryEmpty label="当前没有真实牧场产物" />;
  }
  const groups = groupKitchenProductsForDisplay(section.items);
  return (
    <ul aria-label="真实牧场产物库存" className="kitchen-inventory-panel__list">
      {groups.map((group) => {
        const item = group.items[0];
        if (!item) return null;
        const actionable = actionsEnabled && canOperate(item.status, item.product_instance_id);
        const name = itemName(item.name, "身份不可用");
        const rawQuantity = recycleQuantities[group.key] ?? "1";
        const quantity = Number(rawQuantity);
        const validQuantity =
          actionable &&
          Number.isSafeInteger(quantity) &&
          quantity > 0 &&
          quantity <= group.items.length;
        return (
          <li className="kitchen-inventory-panel__row" key={group.key}>
            <div className="kitchen-inventory-panel__copy">
              <span className="kitchen-inventory-panel__name">{name}</span>
              <small className="kitchen-inventory-panel__meta">
                数量 {group.items.length}
                {item.value_gold === null ? "" : ` · 每份回收价 ${item.value_gold} 牧场金币`}
              </small>
            </div>
            {actionable ? (
              <div className="kitchen-inventory-panel__actions">
                {group.items.length > 1 ? (
                  <label className="kitchen-inventory-panel__quantity">
                    <span>数量</span>
                    <input
                      aria-label={`${name}回收数量`}
                      disabled={busy}
                      inputMode="numeric"
                      max={group.items.length}
                      min="1"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setRecycleQuantities((current) => ({
                          ...current,
                          [group.key]: value,
                        }));
                      }}
                      step="1"
                      type="number"
                      value={rawQuantity}
                    />
                  </label>
                ) : null}
                <button
                  className="farm-inventory-action"
                  disabled={busy || !validQuantity}
                  onClick={() =>
                    onSubmit(
                      {
                        action: "recycle",
                        itemInstanceIds: group.items
                          .slice(0, quantity)
                          .map((entry) => entry.product_instance_id),
                        itemKind: "product",
                        quantity,
                      },
                      `${name}回收`,
                    )
                  }
                  type="button"
                >
                  {busy ? "处理中" : "回收"}
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function KitchenDishSection({
  actionsEnabled,
  busy,
  onChangeStallPrice,
  onSubmit,
  section,
  stallPrices,
}: {
  actionsEnabled: boolean;
  busy: boolean;
  onChangeStallPrice: (dishInstanceId: string, value: string) => void;
  onSubmit: KitchenActionSubmitter;
  section: KitchenData["dish_instances"];
  stallPrices: Readonly<Record<string, string>>;
}) {
  if (section.status === "unavailable") {
    return <InventoryUnavailable label="料理库存暂不可用" />;
  }
  if (section.items.length === 0) {
    return <InventoryEmpty label="当前没有真实料理" />;
  }
  const dishGroups: Array<{ items: typeof section.items; recipeId: string }> = [];
  for (const item of section.items) {
    const existing = dishGroups.find((group) => group.recipeId === item.recipe_id);
    if (existing) existing.items.push(item);
    else dishGroups.push({ items: [item], recipeId: item.recipe_id });
  }
  return (
    <ul aria-label="真实料理库存" className="kitchen-inventory-panel__list">
      {dishGroups.map(({ items, recipeId }) => {
        const item = items[0];
        if (!item) return null;
        const actionable = actionsEnabled && canOperate(item.status, item.dish_instance_id);
        const isOddDish = recipeId === "odd_dish";
        const name = itemName(item.name, "身份不可用");
        const rawPrice = stallPrices[item.dish_instance_id] ?? "";
        const price = Number(rawPrice);
        const validPrice = Number.isSafeInteger(price) && price > 0;
        return (
          <li
            className="kitchen-inventory-panel__row kitchen-inventory-panel__row--dish"
            key={`dish:${recipeId}`}
          >
            <span className="kitchen-inventory-panel__dish-visual">
              <CookingCatalogSprite entityId={recipeId} kind="recipe" name={name} />
            </span>
            <div className="kitchen-inventory-panel__copy">
              <span className="kitchen-inventory-panel__name">{name}</span>
              <small className="kitchen-inventory-panel__meta">数量 {items.length}</small>
            </div>
            {actionable ? (
              <div className="kitchen-inventory-panel__actions kitchen-inventory-panel__actions--dish">
                {isOddDish ? (
                  <button
                    className="farm-inventory-action"
                    disabled={busy}
                    onClick={() =>
                      onSubmit(
                        {
                          action: "use",
                          dishInstanceId: item.dish_instance_id,
                          target: "self",
                        },
                        `${name}让小机吃`,
                      )
                    }
                    type="button"
                  >
                    {busy ? "处理中" : "让小机吃"}
                  </button>
                ) : (
                  <>
                    <button
                      className="farm-inventory-action"
                      disabled={busy}
                      onClick={() =>
                        onSubmit(
                          {
                            action: "use",
                            dishInstanceId: item.dish_instance_id,
                            target: "cat",
                          },
                          `${name}给猫`,
                        )
                      }
                      type="button"
                    >
                      {busy ? "处理中" : "给猫"}
                    </button>
                    <button
                      className="farm-inventory-action"
                      disabled={busy}
                      onClick={() =>
                        onSubmit(
                          {
                            action: "use",
                            dishInstanceId: item.dish_instance_id,
                            target: "dog",
                          },
                          `${name}给狗`,
                        )
                      }
                      type="button"
                    >
                      {busy ? "处理中" : "给狗"}
                    </button>
                  </>
                )}
                <button
                  className="farm-inventory-action"
                  disabled={busy}
                  onClick={() =>
                    onSubmit(
                      {
                        action: "recycle",
                        itemInstanceIds: [item.dish_instance_id],
                        itemKind: "dish",
                        quantity: 1,
                      },
                      `${name}回收`,
                    )
                  }
                  type="button"
                >
                  {busy ? "处理中" : "回收"}
                </button>
                {isOddDish ? null : (
                  <>
                    <label className="kitchen-inventory-panel__price">
                      <span>摊位价</span>
                      <input
                        aria-label={`${name}摆摊价格`}
                        disabled={busy}
                        inputMode="numeric"
                        min="1"
                        onChange={(event) =>
                          onChangeStallPrice(item.dish_instance_id, event.currentTarget.value)
                        }
                        placeholder="输入价格"
                        step="1"
                        type="number"
                        value={rawPrice}
                      />
                    </label>
                    <button
                      className="farm-inventory-action"
                      disabled={busy || !validPrice}
                      onClick={() =>
                        onSubmit(
                          {
                            action: "stall",
                            itemInstanceIds: [item.dish_instance_id],
                            price,
                            quantity: 1,
                          },
                          `${name}摆摊`,
                        )
                      }
                      type="button"
                    >
                      {busy ? "处理中" : "摆摊"}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function KitchenFishSection({
  actionsEnabled,
  busy,
  onSubmit,
  section,
  treasureSection,
  treasureQuantities,
  onChangeTreasureQuantity,
}: {
  actionsEnabled: boolean;
  busy: boolean;
  onSubmit: KitchenActionSubmitter;
  section: KitchenData["fish_instances"];
  treasureSection: KitchenData["treasure_items"];
  treasureQuantities: Readonly<Record<string, string>>;
  onChangeTreasureQuantity: (itemId: string, value: string) => void;
}) {
  const fishIds =
    actionsEnabled && section.status === "available"
      ? section.items
          .filter((item) => canOperate(item.status, item.catch_instance_id))
          .map((item) => item.catch_instance_id)
      : [];

  return (
    <div className="kitchen-inventory-panel__fish-groups">
      <section className="kitchen-inventory-panel__group" aria-label="鱼">
        <div className="kitchen-inventory-panel__group-head">
          <h3>鱼</h3>
          {fishIds.length > 0 ? (
            <button
              className="farm-inventory-action"
              disabled={busy}
              onClick={() =>
                onSubmit(
                  {
                    action: "sell_fish",
                    catchInstanceIds: fishIds,
                    quantity: fishIds.length,
                  },
                  "全部卖鱼",
                )
              }
              type="button"
            >
              {busy ? "处理中" : "全部卖鱼"}
            </button>
          ) : null}
        </div>
        {section.status === "unavailable" ? (
          <InventoryUnavailable label="鱼篓暂不可用" />
        ) : section.items.length === 0 ? (
          <InventoryEmpty label="当前没有真实鱼" />
        ) : (
          <ul aria-label="真实鱼库存" className="kitchen-inventory-panel__list">
            {section.items.map((item) => {
              const actionable = actionsEnabled && canOperate(item.status, item.catch_instance_id);
              const name = itemName(item.name, "身份不可用");
              return (
                <li className="kitchen-inventory-panel__row" key={`fish:${item.catch_instance_id}`}>
                  <div className="kitchen-inventory-panel__copy">
                    <span className="kitchen-inventory-panel__name">{name}</span>
                    <small className="kitchen-inventory-panel__meta">
                      {item.sell_silver == null ? "单条鱼" : `${item.sell_silver} 银`}
                    </small>
                  </div>
                  {actionable ? (
                    <button
                      className="farm-inventory-action"
                      disabled={busy}
                      onClick={() =>
                        onSubmit(
                          {
                            action: "sell_fish",
                            catchInstanceIds: [item.catch_instance_id],
                            quantity: 1,
                          },
                          `${name}出售`,
                        )
                      }
                      type="button"
                    >
                      {busy ? "处理中" : "出售"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="kitchen-inventory-panel__group" aria-label="财宝">
        <div className="kitchen-inventory-panel__group-head">
          <h3>财宝</h3>
        </div>
        {treasureSection.status === "unavailable" ? (
          <InventoryUnavailable label="财宝库存暂不可用" />
        ) : treasureSection.items.length === 0 ? (
          <InventoryEmpty label="当前没有真实财宝" />
        ) : (
          <ul aria-label="真实财宝库存" className="kitchen-inventory-panel__list">
            {treasureSection.items.map((item) => {
              const actionable =
                actionsEnabled &&
                canOperate(item.status, item.item_id) &&
                item.sellable === true &&
                item.quantity !== null &&
                item.quantity > 0;
              const name = itemName(item.name, "身份不可用");
              const rawQuantity = treasureQuantities[item.item_id] ?? "";
              const quantity = Number(rawQuantity);
              const validQuantity =
                actionable &&
                Number.isSafeInteger(quantity) &&
                quantity > 0 &&
                quantity <= (item.quantity ?? 0);
              return (
                <li className="kitchen-inventory-panel__row" key={`treasure:${item.item_id}`}>
                  <div className="kitchen-inventory-panel__copy">
                    <span className="kitchen-inventory-panel__name">{name}</span>
                    <small className="kitchen-inventory-panel__meta">
                      数量 {item.quantity ?? "—"}
                    </small>
                  </div>
                  {actionable ? (
                    <div className="kitchen-inventory-panel__actions">
                      <label className="kitchen-inventory-panel__quantity">
                        <span>数量</span>
                        <input
                          aria-label={`${name}回收数量`}
                          disabled={busy}
                          inputMode="numeric"
                          max={item.quantity ?? undefined}
                          min="1"
                          onChange={(event) =>
                            onChangeTreasureQuantity(item.item_id, event.currentTarget.value)
                          }
                          placeholder="输入数量"
                          step="1"
                          type="number"
                          value={rawQuantity}
                        />
                      </label>
                      <button
                        className="farm-inventory-action"
                        disabled={busy || !validQuantity}
                        onClick={() =>
                          onSubmit(
                            {
                              action: "sell_treasure",
                              quantity,
                              treasureItemId: item.item_id,
                            },
                            `${name}回收`,
                          )
                        }
                        type="button"
                      >
                        {busy ? "处理中" : "回收"}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function KitchenInventoryPanelContent({
  kitchen,
  onKitchenInventoryAction,
}: {
  kitchen: BoundKitchenRead | null | undefined;
  onKitchenInventoryAction?: KitchenInventoryActionExecutor | undefined;
}) {
  const tabs = ["食材", "牧场产物", "鱼篓", "料理"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("食材");
  const [stallPrices, setStallPrices] = useState<Record<string, string>>({});
  const [treasureQuantities, setTreasureQuantities] = useState<Record<string, string>>({});
  const [action, setAction] = useState<KitchenInventoryActionState>({ stage: "idle" });

  const submitAction = async (attempt: KitchenInventoryActionAttempt): Promise<void> => {
    if (!kitchen || !onKitchenInventoryAction || action.stage === "submitting") return;
    setAction({ stage: "submitting", attempt });
    let result: Awaited<ReturnType<KitchenInventoryActionExecutor>>;
    try {
      result = await onKitchenInventoryAction(attempt.input);
    } catch {
      setAction({
        stage: "error",
        attempt: null,
        issue: { code: "unexpected_response", currentInventoryRevision: null, serverMessage: null },
      });
      return;
    }
    if (result.ok) {
      setAction({
        stage: "success",
        message: kitchenInventoryOutcomeMessage(result.data.data.result.outcome),
      });
      return;
    }
    setAction({
      stage: "error",
      attempt: shouldRetryKitchenInventoryAction(result.issue) ? attempt : null,
      issue: result.issue,
    });
  };

  const makeInputBase = () => ({
    expectedFarmDoorplate: kitchen?.data.farm.farm_doorplate ?? "",
    expectedInventoryRevision: kitchen?.kitchen_inventory_revision ?? "",
    idempotencyKey: crypto.randomUUID(),
  });

  const queueAction: KitchenActionSubmitter = (input, label) => {
    const { expectedFarmDoorplate, expectedInventoryRevision, idempotencyKey } = makeInputBase();
    void submitAction({
      input: {
        ...input,
        expectedFarmDoorplate,
        expectedInventoryRevision,
        idempotencyKey,
      } as KitchenInventoryActionInput,
      label,
    });
  };

  if (!kitchen) {
    return <InventoryUnavailable label="料理库存数据尚未接入" />;
  }

  const busy = action.stage === "submitting";
  const actionsEnabled = Boolean(onKitchenInventoryAction);
  const body =
    activeTab === "食材" ? (
      <KitchenIngredientSection section={kitchen.data.stacked_ingredients} />
    ) : activeTab === "牧场产物" ? (
      <KitchenProductSection
        actionsEnabled={actionsEnabled}
        busy={busy}
        onSubmit={queueAction}
        section={kitchen.data.product_instances}
      />
    ) : activeTab === "鱼篓" ? (
      <KitchenFishSection
        actionsEnabled={actionsEnabled}
        busy={busy}
        onChangeTreasureQuantity={(itemId, value) =>
          setTreasureQuantities((current) => ({ ...current, [itemId]: value }))
        }
        onSubmit={queueAction}
        section={kitchen.data.fish_instances}
        treasureQuantities={treasureQuantities}
        treasureSection={kitchen.data.treasure_items}
      />
    ) : (
      <KitchenDishSection
        actionsEnabled={actionsEnabled}
        busy={busy}
        onChangeStallPrice={(dishInstanceId, value) =>
          setStallPrices((current) => ({ ...current, [dishInstanceId]: value }))
        }
        onSubmit={queueAction}
        section={kitchen.data.dish_instances}
        stallPrices={stallPrices}
      />
    );

  return (
    <section aria-label="料理背包" className="kitchen-inventory-panel">
      <nav aria-label="料理库存分类" className="farm-feature__tabs">
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
      <div className="kitchen-inventory-panel__feedback-slot">
        {action.stage === "success" ? (
          <p className="kitchen-inventory-panel__feedback" role="status">
            <strong>已确认</strong>
            <span>{action.message}</span>
          </p>
        ) : action.stage === "error" ? (
          <p
            className="kitchen-inventory-panel__feedback kitchen-inventory-panel__feedback--error"
            role="alert"
          >
            <span>{kitchenInventoryActionIssueMessage(action.issue)}</span>
            {action.attempt ? (
              <button
                onClick={() => void submitAction(action.attempt as KitchenInventoryActionAttempt)}
                type="button"
              >
                重试同一次动作
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="kitchen-inventory-panel__body">{body}</div>
    </section>
  );
}
