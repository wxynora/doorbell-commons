import { useEffect, useRef, useState } from "react";
import type { ApiResult } from "../../auth/auth-client";
import {
  type BoundCropCodexAction,
  type CropCodexActionInput,
  type CropCodexActionIssue,
  cropCodexActionIssueMessage,
} from "../../auth/crop-codex-action-client";
import {
  type BoundExpeditionAction,
  type ExpeditionActionInput,
  type ExpeditionActionIssue,
  expeditionActionIssueMessage,
} from "../../auth/expedition-action-client";
import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import {
  type BoundMarketAction,
  type MarketActionInput,
  type MarketActionIssue,
  marketActionIssueMessage,
} from "../../auth/market-action-client";
import type { BoundRanchRead } from "../../auth/ranch-client";
import {
  type BoundRanchInteractionAction,
  type RanchInteractionActionInput,
  type RanchInteractionActionIssue,
  ranchInteractionActionIssueMessage,
} from "../../auth/ranch-interaction-action-client";
import {
  FARM_CROP_CATALOG,
  FARM_CROP_CATEGORIES,
  FARM_CROP_RARITY_ORDER,
  type FarmCropCategoryId,
} from "../farm-crop-catalog";
import { FarmUnavailablePanel } from "./tool-panel";
import "./farm-action-panels.css";

export type CropCodexActionExecutor = (
  input: CropCodexActionInput,
) => Promise<ApiResult<BoundCropCodexAction, CropCodexActionIssue>>;

export type ExpeditionActionExecutor = (
  input: ExpeditionActionInput,
) => Promise<ApiResult<BoundExpeditionAction, ExpeditionActionIssue>>;

export type MarketActionExecutor = (
  input: MarketActionInput,
) => Promise<ApiResult<BoundMarketAction, MarketActionIssue>>;

export type RanchInteractionActionExecutor = (
  input: RanchInteractionActionInput,
) => Promise<ApiResult<BoundRanchInteractionAction, RanchInteractionActionIssue>>;

type FarmCatalogMarketAvailable = Extract<
  BoundFarmCatalogRead["data"]["market"],
  { status: "available" }
>;

type FarmCatalogMarketBarterItem = FarmCatalogMarketAvailable["barter_listings"][number]["give"];

function marketItemLabel(item: FarmCatalogMarketBarterItem): string {
  return item.name ?? item.item_id ?? "身份未知的物品";
}

function marketBarterItemLabel(item: FarmCatalogMarketBarterItem): string {
  return `${marketItemLabel(item)} ×${item.quantity}`;
}

function purchaseOrderItemKey(kind: string, itemId: string): string {
  return `${kind}:${itemId}`;
}

function mysteryMerchantTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function mysteryMerchantCurrency(currency: "gold" | "silver"): string {
  return currency === "gold" ? "金币" : "银币";
}

export function FarmMarketPanelContent({
  farmCatalog,
  market,
  onMarketAction,
}: {
  farmCatalog: BoundFarmCatalogRead;
  market: FarmCatalogMarketAvailable;
  onMarketAction?: MarketActionExecutor | undefined;
}) {
  const listings = market.listings.filter(
    (listing) => listing.identity_state === "known" && listing.name !== null,
  );
  const barterListings = market.barter_listings;
  const purchaseOrders = market.purchase_orders.filter(
    (order) => order.identity_state === "known" && order.name !== null,
  );
  const mysteryMerchant = market.mystery_merchant;
  const purchaseOrderItems = market.purchase_order_items;
  const farmDoorplate = farmCatalog.data.farm.farm_doorplate;
  const farmNameByDoorplate = new Map<string, string>([
    [farmDoorplate, farmCatalog.data.farm.farm_name],
  ]);
  if (farmCatalog.data.neighborhood.status === "available") {
    for (const board of farmCatalog.data.neighborhood.message_boards ?? []) {
      farmNameByDoorplate.set(board.farm_doorplate, board.farm_name);
    }
    for (const rows of Object.values(farmCatalog.data.neighborhood.rankings)) {
      for (const row of rows) farmNameByDoorplate.set(row.farm_doorplate, row.farm_name);
    }
  }
  const sellerGroups = new Map<
    string,
    { barterListings: typeof barterListings; listings: typeof listings }
  >();
  for (const listing of listings) {
    const group = sellerGroups.get(listing.seller_farm_doorplate) ?? {
      barterListings: [],
      listings: [],
    };
    group.listings.push(listing);
    sellerGroups.set(listing.seller_farm_doorplate, group);
  }
  for (const listing of barterListings) {
    const group = sellerGroups.get(listing.seller_farm_doorplate) ?? {
      barterListings: [],
      listings: [],
    };
    group.barterListings.push(listing);
    sellerGroups.set(listing.seller_farm_doorplate, group);
  }
  const inventory =
    farmCatalog.data.backpack.status === "available"
      ? farmCatalog.data.backpack.items
          .filter(
            (item) =>
              (item.kind === "seed" || item.kind === "material") &&
              item.identity_state === "known" &&
              item.name !== null &&
              item.quantity > 0,
          )
          .map((item) => ({
            kind: item.kind === "seed" ? ("seed" as const) : ("material" as const),
            item_id: item.item_id,
            name: item.name as string,
            quantity: item.quantity,
          }))
      : [];
  const [selectedItemId, setSelectedItemId] = useState(inventory[0]?.item_id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [wantKind, setWantKind] = useState<"seed" | "material" | "ingredient" | "dish">("seed");
  const [wantItemId, setWantItemId] = useState("");
  const [wantQuantity, setWantQuantity] = useState("1");
  const [purchaseItemKeyValue, setPurchaseItemKeyValue] = useState(
    purchaseOrderItems[0]
      ? purchaseOrderItemKey(purchaseOrderItems[0].kind, purchaseOrderItems[0].item_id)
      : "",
  );
  const [purchaseQuantity, setPurchaseQuantity] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("1");
  const [fulfillQuantities, setFulfillQuantities] = useState<Record<string, string>>({});
  const [selectedMerchantItemIds, setSelectedMerchantItemIds] = useState<string[]>([]);
  type Attempt = { input: MarketActionInput; label: string };
  type ActionState =
    | { stage: "idle" }
    | { stage: "submitting"; attempt: Attempt }
    | { stage: "success"; message: string }
    | { stage: "error"; attempt: Attempt | null; issue: MarketActionIssue };
  const [action, setAction] = useState<ActionState>({ stage: "idle" });
  const busy = action.stage === "submitting";
  const expectedRevision = farmCatalog.market_revision;
  const selectedItem = inventory.find((item) => item.item_id === selectedItemId) ?? inventory[0];
  const parsedQuantity = Number(quantity);
  const parsedWantQuantity = Number(wantQuantity);
  const validQuantity =
    selectedItem !== undefined &&
    Number.isSafeInteger(parsedQuantity) &&
    parsedQuantity > 0 &&
    parsedQuantity <= selectedItem.quantity;
  const validWant =
    wantItemId.trim().length > 0 &&
    Number.isSafeInteger(parsedWantQuantity) &&
    parsedWantQuantity > 0;
  const selectedPurchaseItem =
    purchaseOrderItems.find(
      (item) => purchaseOrderItemKey(item.kind, item.item_id) === purchaseItemKeyValue,
    ) ?? purchaseOrderItems[0];
  const parsedPurchaseQuantity = Number(purchaseQuantity);
  const parsedPurchasePrice = Number(purchasePrice);
  const validPurchaseOrder =
    selectedPurchaseItem !== undefined &&
    Number.isSafeInteger(parsedPurchaseQuantity) &&
    parsedPurchaseQuantity > 0 &&
    Number.isSafeInteger(parsedPurchasePrice) &&
    parsedPurchasePrice > 0;

  const shouldRetry = (issue: MarketActionIssue) =>
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response";

  const submit = async (attempt: Attempt) => {
    if (!onMarketAction) return;
    setAction({ stage: "submitting", attempt });
    let result: Awaited<ReturnType<MarketActionExecutor>>;
    try {
      result = await onMarketAction(attempt.input);
    } catch {
      setAction({
        stage: "error",
        attempt,
        issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
      });
      return;
    }
    if (result.ok) {
      const outcome = result.data.data.result.outcome;
      const completedAction = result.data.data.result.action;
      if (completedAction === "mystery-merchant-buy") setSelectedMerchantItemIds([]);
      setAction({
        stage: "success",
        message:
          completedAction === "browse"
            ? "集市已重新读取"
            : completedAction === "mystery-merchant-buy"
              ? "神秘商人这一单已经买下"
            : outcome === null
              ? "集市动作已完成"
              : "集市动作已完成",
      });
      return;
    }
    setAction({
      stage: "error",
      attempt: shouldRetry(result.issue) ? attempt : null,
      issue: result.issue,
    });
  };

  const submitBrowse = () => {
    if (!onMarketAction || !farmDoorplate) return;
    void submit({
      input: {
        action: "browse",
        expectedFarmDoorplate: farmDoorplate,
        expectedRevision,
        idempotencyKey: crypto.randomUUID(),
      },
      label: "刷新集市",
    });
  };

  const browsedFarm = useRef<string | null>(null);
  useEffect(() => {
    if (!onMarketAction || !farmDoorplate || browsedFarm.current === farmDoorplate) return;
    browsedFarm.current = farmDoorplate;
    submitBrowse();
  }, [farmDoorplate, onMarketAction, submitBrowse]);

  const submitList = (barter: boolean) => {
    if (!onMarketAction || !farmDoorplate || !selectedItem || !validQuantity) return;
    const base = {
      expectedFarmDoorplate: farmDoorplate,
      expectedRevision,
      idempotencyKey: crypto.randomUUID(),
    } as const;
    if (barter) {
      if (!validWant) return;
      void submit({
        input: {
          ...base,
          action: "barter-list",
          giveKind: selectedItem.kind,
          giveItemId: selectedItem.item_id,
          giveQuantity: parsedQuantity,
          wantKind,
          wantItemId: wantItemId.trim(),
          wantQuantity: parsedWantQuantity,
        },
        label: "发布换物",
      });
      return;
    }
    void submit({
      input: {
        ...base,
        action: "list",
        kind: selectedItem.kind,
        itemId: selectedItem.item_id,
        quantity: parsedQuantity,
      },
      label: "上架集市",
    });
  };

  const submitPurchaseOrder = () => {
    if (!onMarketAction || !farmDoorplate || !selectedPurchaseItem || !validPurchaseOrder) return;
    void submit({
      input: {
        action: "purchase-order-list",
        expectedFarmDoorplate: farmDoorplate,
        expectedRevision,
        idempotencyKey: crypto.randomUUID(),
        kind: selectedPurchaseItem.kind,
        itemId: selectedPurchaseItem.item_id,
        quantity: parsedPurchaseQuantity,
        price: parsedPurchasePrice,
      },
      label: "发布收购",
    });
  };

  return (
    <section aria-label="真实集市" className="farm-feature">
      <div className="farm-action-toolbar">
        <strong>集市</strong>
        <button disabled={!onMarketAction || busy} onClick={submitBrowse} type="button">
          {busy ? "处理中" : "重新读取"}
        </button>
      </div>
      {action.stage === "success" ? (
        <p className="farm-action-feedback" role="status">
          {action.message}
        </p>
      ) : action.stage === "error" ? (
        <p className="farm-action-feedback farm-action-feedback--error" role="alert">
          {marketActionIssueMessage(action.issue)}
          {action.attempt ? (
            <button onClick={() => void submit(action.attempt as Attempt)} type="button">
              重试
            </button>
          ) : null}
        </p>
      ) : null}
      <section aria-label="神秘商人" className="farm-market__mystery-merchant">
        <header>
          <strong>神秘商人</strong>
          {mysteryMerchant.status === "present" ? (
            <span>停留至 {mysteryMerchantTime(mysteryMerchant.ends_at)}</span>
          ) : (
            <span>今天会出现三次</span>
          )}
        </header>
        <div aria-label="今日大概出现时段" className="farm-market__mystery-windows">
          {mysteryMerchant.approximate_windows.map((window) => (
            <span key={window.starts_at}>
              {mysteryMerchantTime(window.starts_at)}–{mysteryMerchantTime(window.ends_at)}
            </span>
          ))}
        </div>
        {mysteryMerchant.status === "present" ? (
          <>
            <p>
              现在在 <strong>{mysteryMerchant.host_farm_name ?? mysteryMerchant.host_farm_doorplate}</strong>
            </p>
            <ul>
              {mysteryMerchant.offers.map((offer) => (
                <li key={offer.kind + ":" + offer.item_id}>
                  <span>
                    <strong>{offer.name}</strong>
                    <small>
                      {offer.rarity ? offer.rarity + " · " : ""}
                      {offer.unit_price} {mysteryMerchantCurrency(offer.currency)}
                      {offer.grant_quantity > 1 ? " · 得到 " + offer.grant_quantity : ""}
                    </small>
                  </span>
                  <button
                    aria-pressed={selectedMerchantItemIds.includes(offer.item_id)}
                    disabled={busy || !onMarketAction || offer.already_bought}
                    onClick={() =>
                      setSelectedMerchantItemIds((current) =>
                        current.includes(offer.item_id)
                          ? current.filter((itemId) => itemId !== offer.item_id)
                          : [...current, offer.item_id],
                      )
                    }
                    type="button"
                  >
                    {offer.already_bought
                      ? "本轮已买"
                      : selectedMerchantItemIds.includes(offer.item_id)
                        ? "已选"
                        : "选择"}
                  </button>
                </li>
              ))}
            </ul>
            <button
              disabled={busy || !onMarketAction || selectedMerchantItemIds.length === 0}
              onClick={() =>
                void submit({
                  input: {
                    action: "mystery-merchant-buy",
                    expectedFarmDoorplate: farmDoorplate,
                    expectedRevision,
                    idempotencyKey: crypto.randomUUID(),
                    items: selectedMerchantItemIds,
                  },
                  label: "向神秘商人结账",
                })
              }
              type="button"
            >
              结账（{selectedMerchantItemIds.length}）
            </button>
          </>
        ) : (
          <p>还没有发现这次商人的准确位置。</p>
        )}
      </section>
      {onMarketAction && (inventory.length > 0 || purchaseOrderItems.length > 0) ? (
        <form
          aria-label="发布集市商品"
          className="farm-market__form"
          onSubmit={(event) => event.preventDefault()}
        >
          {inventory.length > 0 ? (
            <>
              <label>
                <span>上架物品</span>
                <select
                  disabled={busy}
                  onChange={(event) => setSelectedItemId(event.currentTarget.value)}
                  value={selectedItem?.item_id ?? ""}
                >
                  {inventory.map((item) => (
                    <option key={`${item.kind}:${item.item_id}`} value={item.item_id}>
                      {item.name} · {item.quantity}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>数量</span>
                <input
                  disabled={busy}
                  min="1"
                  onChange={(event) => setQuantity(event.currentTarget.value)}
                  type="number"
                  value={quantity}
                />
              </label>
              <button
                disabled={busy || !validQuantity}
                onClick={() => submitList(false)}
                type="button"
              >
                上架
              </button>
              <details className="farm-market__barter">
                <summary>发布换物</summary>
                <div className="farm-market__barter-fields">
                  <label>
                    <span>想换类型</span>
                    <select
                      disabled={busy}
                      onChange={(event) =>
                        setWantKind(event.currentTarget.value as typeof wantKind)
                      }
                      value={wantKind}
                    >
                      <option value="seed">种子</option>
                      <option value="material">素材</option>
                      <option value="ingredient">食材</option>
                      <option value="dish">料理</option>
                    </select>
                  </label>
                  <label>
                    <span>想换 ID</span>
                    <input
                      disabled={busy}
                      onChange={(event) => setWantItemId(event.currentTarget.value)}
                      placeholder="填写真实物品 ID"
                      type="text"
                      value={wantItemId}
                    />
                  </label>
                  <label>
                    <span>想换数量</span>
                    <input
                      disabled={busy}
                      min="1"
                      onChange={(event) => setWantQuantity(event.currentTarget.value)}
                      type="number"
                      value={wantQuantity}
                    />
                  </label>
                  <button
                    disabled={busy || !validQuantity || !validWant}
                    onClick={() => submitList(true)}
                    type="button"
                  >
                    发布换物
                  </button>
                </div>
              </details>
            </>
          ) : null}
          {purchaseOrderItems.length > 0 ? (
            <details className="farm-market__barter">
              <summary>发布收购</summary>
              <div className="farm-market__barter-fields">
                <label>
                  <span>想收什么</span>
                  <select
                    disabled={busy}
                    onChange={(event) => setPurchaseItemKeyValue(event.currentTarget.value)}
                    value={
                      selectedPurchaseItem
                        ? purchaseOrderItemKey(
                            selectedPurchaseItem.kind,
                            selectedPurchaseItem.item_id,
                          )
                        : ""
                    }
                  >
                    {purchaseOrderItems.map((item) => (
                      <option
                        key={purchaseOrderItemKey(item.kind, item.item_id)}
                        value={purchaseOrderItemKey(item.kind, item.item_id)}
                      >
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>总共收购</span>
                  <input
                    disabled={busy}
                    min="1"
                    onChange={(event) => setPurchaseQuantity(event.currentTarget.value)}
                    type="number"
                    value={purchaseQuantity}
                  />
                </label>
                <label>
                  <span>每份银币</span>
                  <input
                    disabled={busy}
                    min="1"
                    onChange={(event) => setPurchasePrice(event.currentTarget.value)}
                    type="number"
                    value={purchasePrice}
                  />
                </label>
                <button
                  disabled={busy || !validPurchaseOrder}
                  onClick={submitPurchaseOrder}
                  type="button"
                >
                  发布收购
                </button>
              </div>
            </details>
          ) : null}
        </form>
      ) : null}
      {purchaseOrders.length > 0 ? (
        <section aria-label="公开收购需求" className="farm-market__purchase-orders">
          <h3>大家正在收购</h3>
          <ul>
            {purchaseOrders.map((order) => {
              const ownOrder = order.buyer_farm_doorplate === farmDoorplate;
              const ownedQuantity =
                purchaseOrderItems.find(
                  (item) => item.kind === order.kind && item.item_id === order.item_id,
                )?.owned_quantity ?? 0;
              const maximum = Math.min(ownedQuantity, order.remaining_quantity);
              const rawQuantity = fulfillQuantities[order.listing_id] ?? "1";
              const parsedFulfillQuantity = Number(rawQuantity);
              const validFulfillQuantity =
                Number.isSafeInteger(parsedFulfillQuantity) &&
                parsedFulfillQuantity > 0 &&
                parsedFulfillQuantity <= maximum;
              return (
                <li key={`purchase-order:${order.buyer_farm_doorplate}:${order.listing_id}`}>
                  <span>
                    <strong>{order.name}</strong>
                    <small>
                      {farmNameByDoorplate.get(order.buyer_farm_doorplate) ??
                        `农场 ${order.buyer_farm_doorplate}`}
                      {` · 还收 ${order.remaining_quantity}/${order.target_quantity} · 每份 ${order.price} 银币`}
                    </small>
                  </span>
                  {ownOrder ? (
                    <button
                      disabled={busy || !onMarketAction}
                      onClick={() =>
                        void submit({
                          input: {
                            action: "purchase-order-unlist",
                            expectedFarmDoorplate: farmDoorplate,
                            expectedRevision,
                            idempotencyKey: crypto.randomUUID(),
                            listingId: order.listing_id,
                          },
                          label: "撤下收购",
                        })
                      }
                      type="button"
                    >
                      撤下
                    </button>
                  ) : (
                    <span className="farm-market__purchase-order-action">
                      <small>你有 {ownedQuantity}</small>
                      <input
                        aria-label={`交付${order.name ?? "物品"}数量`}
                        disabled={busy || maximum <= 0}
                        max={maximum}
                        min="1"
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setFulfillQuantities((current) => ({
                            ...current,
                            [order.listing_id]: nextValue,
                          }));
                        }}
                        type="number"
                        value={rawQuantity}
                      />
                      <button
                        disabled={busy || !onMarketAction || !validFulfillQuantity}
                        onClick={() =>
                          void submit({
                            input: {
                              action: "purchase-order-fulfill",
                              expectedFarmDoorplate: farmDoorplate,
                              expectedRevision,
                              idempotencyKey: crypto.randomUUID(),
                              orderOwnerDoorplate: order.buyer_farm_doorplate,
                              listingId: order.listing_id,
                              quantity: parsedFulfillQuantity,
                            },
                            label: "交货",
                          })
                        }
                        type="button"
                      >
                        交货
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <div aria-label="真实集市商品" className="farm-market__seller-list">
        {sellerGroups.size > 0 ? (
          [...sellerGroups.entries()].map(([sellerDoorplate, group]) => {
            const ownListing = farmDoorplate === sellerDoorplate;
            return (
              <section
                aria-label={`${farmNameByDoorplate.get(sellerDoorplate) ?? sellerDoorplate}的摊位`}
                className="farm-market__seller-card"
                data-own={ownListing}
                key={sellerDoorplate}
              >
                <header>
                  <strong>
                    {ownListing
                      ? `${farmNameByDoorplate.get(sellerDoorplate) ?? "我的农场"} · 我的摊位`
                      : (farmNameByDoorplate.get(sellerDoorplate) ?? `农场 ${sellerDoorplate}`)}
                  </strong>
                  <span>门牌 {sellerDoorplate}</span>
                </header>
                <ul>
                  {group.listings.map((listing, index) => {
                    const itemId = listing.item_id;
                    const canBuy =
                      !ownListing && itemId !== null && listing.quantity > 0 && onMarketAction;
                    return (
                      <li
                        key={`${listing.seller_farm_doorplate}:${listing.kind}:${listing.item_id ?? index}`}
                      >
                        <span>{listing.name}</span>
                        <span className="farm-market__listing-meta">
                          <small>
                            ×{listing.quantity}
                            {listing.price === null ? "" : ` · 价格 ${listing.price}`}
                          </small>
                          {ownListing && itemId ? (
                            <button
                              disabled={busy || !onMarketAction}
                              onClick={() =>
                                void submit({
                                  input: {
                                    action: "unlist",
                                    expectedFarmDoorplate: farmDoorplate,
                                    expectedRevision,
                                    idempotencyKey: crypto.randomUUID(),
                                    itemId,
                                    kind: listing.kind,
                                  },
                                  label: "下架",
                                })
                              }
                              type="button"
                            >
                              下架
                            </button>
                          ) : canBuy ? (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void submit({
                                  input: {
                                    action: "buy",
                                    expectedFarmDoorplate: farmDoorplate,
                                    expectedRevision,
                                    idempotencyKey: crypto.randomUUID(),
                                    sellerDoorplate: listing.seller_farm_doorplate,
                                    kind: listing.kind,
                                    itemId,
                                    quantity: Math.min(1, listing.quantity),
                                  },
                                  label: "购买",
                                })
                              }
                              type="button"
                            >
                              购买
                            </button>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                  {group.barterListings.map((listing) => {
                    return (
                      <li key={`barter:${listing.seller_farm_doorplate}:${listing.listing_id}`}>
                        <span>
                          用 {marketBarterItemLabel(listing.give)} 换{" "}
                          {marketBarterItemLabel(listing.want)}
                        </span>
                        <span className="farm-market__listing-meta">
                          <small>
                            {ownListing ? "我的换物" : `来自 ${listing.seller_farm_doorplate}`}
                          </small>
                          <button
                            disabled={busy || !onMarketAction}
                            onClick={() =>
                              void submit({
                                input: ownListing
                                  ? {
                                      action: "barter-unlist",
                                      expectedFarmDoorplate: farmDoorplate,
                                      expectedRevision,
                                      idempotencyKey: crypto.randomUUID(),
                                      listingId: listing.listing_id,
                                    }
                                  : {
                                      action: "barter-accept",
                                      expectedFarmDoorplate: farmDoorplate,
                                      expectedRevision,
                                      idempotencyKey: crypto.randomUUID(),
                                      sellerDoorplate: listing.seller_farm_doorplate,
                                      listingId: listing.listing_id,
                                    },
                                label: ownListing ? "撤下换物" : "接受换物",
                              })
                            }
                            type="button"
                          >
                            {ownListing ? "撤下" : "接受换物"}
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        ) : (
          <p className="farm-market__empty">当前没有真实摊位</p>
        )}
      </div>
    </section>
  );
}

type FarmCatalogCodexAvailable = Extract<
  BoundFarmCatalogRead["data"]["codex"],
  { status: "available" }
>;

type FarmCatalogCodexEntry = FarmCatalogCodexAvailable["entries"][number];

interface CropCodexActionAttempt {
  input: CropCodexActionInput;
  label: "收藏" | "取消收藏";
}

type CropCodexActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: CropCodexActionAttempt }
  | { stage: "success"; result: BoundCropCodexAction }
  | {
      stage: "error";
      attempt: CropCodexActionAttempt | null;
      issue: CropCodexActionIssue;
    };

function FarmCropCodexDetail({ entry }: { entry: FarmCatalogCodexEntry }) {
  return (
    <dl className="farm-crop-codex__detail">
      {entry.description !== null ? (
        <div className="farm-crop-codex__detail-row--wide">
          <dt>简介</dt>
          <dd>{entry.description}</dd>
        </div>
      ) : null}
      {entry.latin_name !== null ? (
        <div>
          <dt>学名</dt>
          <dd>{entry.latin_name}</dd>
        </div>
      ) : null}
      {entry.grow_ticks !== null ? (
        <div>
          <dt>生长 Tick</dt>
          <dd>{entry.grow_ticks}</dd>
        </div>
      ) : null}
      {entry.seed_price !== null ? (
        <div>
          <dt>种子价格</dt>
          <dd>{entry.seed_price}</dd>
        </div>
      ) : null}
      {entry.sell_price !== null ? (
        <div>
          <dt>出售价格</dt>
          <dd>{entry.sell_price}</dd>
        </div>
      ) : null}
      {entry.unlock_condition !== null ? (
        <div className="farm-crop-codex__detail-row--wide">
          <dt>解锁条件</dt>
          <dd>{entry.unlock_condition}</dd>
        </div>
      ) : null}
      {entry.discovery_count !== null ? (
        <div>
          <dt>发现次数</dt>
          <dd>{entry.discovery_count}</dd>
        </div>
      ) : null}
      {entry.best_quality !== null ? (
        <div>
          <dt>最佳品质</dt>
          <dd>{entry.best_quality}</dd>
        </div>
      ) : null}
      {entry.first_discovered_at !== null ? (
        <div className="farm-crop-codex__detail-row--wide">
          <dt>首次发现</dt>
          <dd>{entry.first_discovered_at}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function FarmCropCodex({
  farmCatalog,
  onCropCodexAction,
  preview,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  onCropCodexAction?: CropCodexActionExecutor | undefined;
  preview: boolean;
}) {
  const [categoryId, setCategoryId] = useState<FarmCropCategoryId | "all">("common");
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);
  const [action, setAction] = useState<CropCodexActionState>({ stage: "idle" });

  if (!preview) {
    const codex = farmCatalog?.data.codex;
    if (!farmCatalog || !codex || codex.status === "unavailable") {
      return (
        <FarmUnavailablePanel
          label={codex?.status === "unavailable" ? codex.message : "作物图鉴数据尚未接入"}
        />
      );
    }

    const categories = [
      { id: "all" as const, label: "全部", count: codex.entries.length },
      ...FARM_CROP_CATEGORIES.map((category) => ({
        id: category.id,
        label: category.label,
        count: codex.entries.filter((entry) => entry.category === category.id).length,
      })),
    ];
    const entries = codex.entries
      .filter((entry) => categoryId === "all" || entry.category === categoryId)
      .sort((left, right) => {
        const leftRarity = left.rarity
          ? (FARM_CROP_RARITY_ORDER[left.rarity as keyof typeof FARM_CROP_RARITY_ORDER] ?? 99)
          : 99;
        const rightRarity = right.rarity
          ? (FARM_CROP_RARITY_ORDER[right.rarity as keyof typeof FARM_CROP_RARITY_ORDER] ?? 99)
          : 99;
        return leftRarity - rightRarity;
      });
    const busy = action.stage === "submitting";
    const selectedEntry =
      entries.find((entry) => entry.discovered && entry.crop_id === selectedCropId) ?? null;

    const submit = async (attempt: CropCodexActionAttempt) => {
      if (!onCropCodexAction) return;
      setAction({ stage: "submitting", attempt });
      let result: Awaited<ReturnType<CropCodexActionExecutor>>;
      try {
        result = await onCropCodexAction(attempt.input);
      } catch {
        setAction({
          stage: "error",
          attempt: null,
          issue: { code: "unexpected_response", currentCodexRevision: null, serverMessage: null },
        });
        return;
      }
      if (result.ok) {
        setAction({ stage: "success", result: result.data });
        return;
      }
      setAction({
        stage: "error",
        attempt: result.issue.code === "network_unavailable" ? attempt : null,
        issue: result.issue,
      });
    };

    const toggleStar = (entry: FarmCatalogCodexEntry) => {
      if (!onCropCodexAction || busy) return;
      const actionName = entry.starred ? "unstar" : "star";
      void submit({
        input: {
          action: actionName,
          cropId: entry.crop_id,
          expectedCodexRevision: farmCatalog.codex_revision,
          expectedFarmDoorplate: farmCatalog.data.farm.farm_doorplate,
          idempotencyKey: crypto.randomUUID(),
        },
        label: actionName === "star" ? "收藏" : "取消收藏",
      });
    };

    return (
      <section aria-label="真实作物图鉴文字目录" className="farm-crop-codex">
        <nav aria-label="作物类型" className="farm-crop-codex__categories">
          {categories.map((category) => (
            <button
              aria-pressed={categoryId === category.id}
              key={category.id}
              onClick={() => {
                setCategoryId(category.id);
                setSelectedCropId(null);
              }}
              type="button"
            >
              <span>{category.label}</span>
              <small>{category.count}</small>
            </button>
          ))}
        </nav>
        <div
          aria-hidden={selectedEntry ? true : undefined}
          className="farm-crop-codex__body"
          inert={selectedEntry ? true : undefined}
        >
          {action.stage === "success" ? (
            <p className="farm-crop-codex__feedback" role="status">
              {action.result.data.result.starred ? "已收藏" : "已取消收藏"}：
              {action.result.data.result.crop_id}
            </p>
          ) : action.stage === "error" ? (
            <p className="farm-crop-codex__feedback farm-crop-codex__feedback--error" role="alert">
              {cropCodexActionIssueMessage(action.issue)}
              {action.attempt ? (
                <button
                  onClick={() => void submit(action.attempt as CropCodexActionAttempt)}
                  type="button"
                >
                  重试
                </button>
              ) : null}
            </p>
          ) : null}
          <ul className="farm-crop-codex__list farm-crop-codex__list--details">
            {entries.length > 0 ? (
              entries.map((entry) => {
                const discovered = entry.discovered;
                const name =
                  entry.identity_state === "known" && entry.name ? entry.name : "身份不可用";
                return (
                  <li key={entry.crop_id}>
                    <div className="farm-crop-codex__entry-head">
                      <button
                        aria-expanded={discovered ? selectedCropId === entry.crop_id : undefined}
                        aria-haspopup={discovered ? "dialog" : undefined}
                        className="farm-crop-codex__entry-toggle"
                        disabled={!discovered}
                        onClick={() => {
                          if (discovered) {
                            setSelectedCropId(entry.crop_id);
                          }
                        }}
                        type="button"
                      >
                        <span>{name}</span>
                        <small
                          className="farm-crop-codex__entry-rarity"
                          data-rarity={entry.rarity ?? undefined}
                        >
                          {entry.rarity ?? (discovered ? "已发现" : "未发现")}
                        </small>
                      </button>
                      {discovered ? (
                        <button
                          aria-label={`${entry.starred ? "取消收藏" : "收藏"}${name}`}
                          className="farm-crop-codex__star"
                          disabled={busy || !onCropCodexAction}
                          onClick={() => toggleStar(entry)}
                          type="button"
                        >
                          {entry.starred ? "★" : "☆"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })
            ) : (
              <li>
                <span>当前分类没有真实条目</span>
              </li>
            )}
          </ul>
        </div>
        {selectedEntry ? (
          <div
            className="farm-crop-codex__detail-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelectedCropId(null);
            }}
          >
            <section
              aria-label={`${selectedEntry.name ?? "作物"}详情`}
              aria-modal="true"
              className="farm-crop-codex__detail-dialog"
              role="dialog"
            >
              <header>
                <div>
                  <h3>{selectedEntry.name ?? "作物详情"}</h3>
                  <small data-rarity={selectedEntry.rarity ?? undefined}>
                    {selectedEntry.rarity ?? "已发现"}
                  </small>
                </div>
                <button
                  aria-label={`关闭${selectedEntry.name ?? "作物"}详情`}
                  autoFocus
                  onClick={() => setSelectedCropId(null)}
                  type="button"
                >
                  ×
                </button>
              </header>
              <div className="farm-crop-codex__detail-scroll">
                <FarmCropCodexDetail entry={selectedEntry} />
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  const categoryCrops = FARM_CROP_CATALOG.filter((crop) => crop.category === categoryId).sort(
    (left, right) => FARM_CROP_RARITY_ORDER[left.rarity] - FARM_CROP_RARITY_ORDER[right.rarity],
  );

  return (
    <section aria-label="作物图鉴文字目录" className="farm-crop-codex">
      <nav aria-label="作物类型" className="farm-crop-codex__categories">
        {FARM_CROP_CATEGORIES.map((category) => {
          const cropCount = FARM_CROP_CATALOG.filter(
            (crop) => crop.category === category.id,
          ).length;
          return (
            <button
              aria-pressed={categoryId === category.id}
              key={category.id}
              onClick={() => setCategoryId(category.id)}
              type="button"
            >
              <span>{category.label}</span>
              <small>{cropCount}</small>
            </button>
          );
        })}
      </nav>
      <ul className="farm-crop-codex__list">
        {categoryCrops.map((crop) => (
          <li key={crop.id}>
            <span>{crop.name}</span>
            <small data-rarity={crop.rarity}>{crop.rarity}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

type FarmCatalogExpeditionAvailable = Extract<
  BoundFarmCatalogRead["data"]["expedition"],
  { status: "available" }
>;

const FARM_EXPEDITION_TABS = [
  { id: "journey", label: "当前旅程" },
  { id: "bag", label: "行囊" },
  { id: "story", label: "本趟故事" },
  { id: "codex", label: "秘境图鉴" },
  { id: "history", label: "旅程簿" },
] as const;

type FarmExpeditionTabId = (typeof FARM_EXPEDITION_TABS)[number]["id"];

function formatExpeditionTime(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function FarmExpeditionEmpty({ children }: { children: string }) {
  return <p className="farm-expedition__empty">{children}</p>;
}

function summarizeExpeditionBag(bag: FarmCatalogExpeditionAvailable["bag"]) {
  const rows = new Map<string, { key: string; name: string; quantity: number | null }>();
  for (const drop of bag) {
    const key = `${drop.kind}:${drop.item_id ?? ""}:${drop.name ?? ""}`;
    const previous = rows.get(key);
    rows.set(key, {
      key,
      name: drop.name ?? "物品名称暂不可读",
      quantity:
        previous?.quantity === null || drop.quantity === null
          ? null
          : (previous?.quantity ?? 0) + drop.quantity,
    });
  }
  return [...rows.values()];
}

type FarmExpeditionCodexEntry = {
  at: string | null;
  eventId: string;
  mapId: string | null;
  mapName: string | null;
  text: string;
  title: string | null;
};

function buildExpeditionCodex(expedition: FarmCatalogExpeditionAvailable) {
  const seenEventIds = new Set(expedition.seen_event_ids);
  const entriesByEventId = new Map<string, FarmExpeditionCodexEntry>();
  const addLog = (
    log: FarmCatalogExpeditionAvailable["log"],
    mapId: string | null,
    mapName: string | null,
  ) => {
    for (const entry of log) {
      if (!entry.event_id || !seenEventIds.has(entry.event_id)) continue;
      const previous = entriesByEventId.get(entry.event_id);
      entriesByEventId.set(entry.event_id, {
        at: previous?.at ?? entry.at,
        eventId: entry.event_id,
        mapId: previous?.mapId ?? mapId,
        mapName: previous?.mapName ?? mapName,
        text: previous?.text || entry.text,
        title: previous?.title ?? entry.title,
      });
    }
  };

  addLog(expedition.log, expedition.map_id, expedition.map_name);
  for (const journey of expedition.journeys) {
    addLog(journey.log, journey.map_id, journey.map_name);
  }

  const groupsByMap = new Map<
    string,
    { key: string; mapName: string; entries: FarmExpeditionCodexEntry[] }
  >();
  for (const entry of entriesByEventId.values()) {
    const key = entry.mapId ?? entry.mapName ?? "unclassified";
    const group = groupsByMap.get(key) ?? {
      key,
      mapName: entry.mapName ?? "未标明秘境",
      entries: [],
    };
    group.entries.push(entry);
    groupsByMap.set(key, group);
  }

  return {
    discoveredCount: seenEventIds.size,
    groups: [...groupsByMap.values()],
    missingDetailCount: Math.max(0, seenEventIds.size - entriesByEventId.size),
  };
}

export function FarmExpeditionPanelContent({
  expedition,
  farmCatalog,
  onExpeditionAction,
}: {
  expedition: FarmCatalogExpeditionAvailable;
  farmCatalog: BoundFarmCatalogRead;
  onExpeditionAction?: ExpeditionActionExecutor | undefined;
}) {
  type Attempt = { input: ExpeditionActionInput; label: string };
  type ActionState =
    | { stage: "idle" }
    | { stage: "submitting"; attempt: Attempt }
    | { stage: "success"; message: string }
    | { stage: "error"; attempt: Attempt | null; issue: ExpeditionActionIssue };
  const [action, setAction] = useState<ActionState>({ stage: "idle" });
  const [activeTab, setActiveTab] = useState<FarmExpeditionTabId>("journey");
  const bagRows = summarizeExpeditionBag(expedition.bag);
  const codex = buildExpeditionCodex(expedition);
  const busy = action.stage === "submitting";
  const writable = onExpeditionAction !== undefined;
  const expectedRevision = farmCatalog.expedition_revision;
  const shouldRetry = (issue: ExpeditionActionIssue) =>
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response";

  const submit = async (attempt: Attempt) => {
    if (!onExpeditionAction) return;
    setAction({ stage: "submitting", attempt });
    let result: Awaited<ReturnType<ExpeditionActionExecutor>>;
    try {
      result = await onExpeditionAction(attempt.input);
    } catch {
      setAction({
        stage: "error",
        attempt,
        issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
      });
      return;
    }
    if (result.ok) {
      setAction({ stage: "success", message: result.data.data.result.outcome.text });
      return;
    }
    setAction({
      stage: "error",
      attempt: shouldRetry(result.issue) ? attempt : null,
      issue: result.issue,
    });
  };

  const actionInput = (
    actionName: ExpeditionActionInput["action"],
    payload: ExpeditionActionInput["payload"],
    label: string,
  ): Attempt => ({
    input: {
      action: actionName,
      expectedRevision,
      idempotencyKey: crypto.randomUUID(),
      payload,
    } as ExpeditionActionInput,
    label,
  });

  const currentAction = (
    actionName: ExpeditionActionInput["action"],
    payload: ExpeditionActionInput["payload"],
    label: string,
  ) => {
    if (!onExpeditionAction) return;
    void submit(actionInput(actionName, payload, label));
  };

  return (
    <section aria-label="真实探险" className="farm-feature farm-expedition">
      <div className="farm-expedition__header">
        <div className="farm-action-toolbar">
          <strong>探险</strong>
          <span>
            新旅程可用次数 {expedition.remaining_today}/{expedition.daily_limit}
          </span>
        </div>
        {action.stage === "success" ? (
          <p className="farm-action-feedback" role="status">
            {action.message}
          </p>
        ) : action.stage === "error" ? (
          <p className="farm-action-feedback farm-action-feedback--error" role="alert">
            {expeditionActionIssueMessage(action.issue)}
            {action.attempt ? (
              <button onClick={() => void submit(action.attempt as Attempt)} type="button">
                重试
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <nav aria-label="探险分类" className="farm-expedition__tabs">
        {FARM_EXPEDITION_TABS.map((tab) => (
          <button
            aria-pressed={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="farm-expedition__content">
        {activeTab === "journey" ? (
          <div className="farm-expedition__journey">
            <div className="farm-expedition__summary" role="status">
              <strong>
                {expedition.active
                  ? (expedition.map_name ?? "地图名称暂不可读")
                  : "当前没有进行中的旅程"}
              </strong>
              {expedition.active ? (
                <>
                <p>当前旅程仍可由小机继续。</p>
                <dl>
                  <div>
                    <dt>阶段</dt>
                    <dd>{expedition.step === null ? "暂不可读" : `第 ${expedition.step} 格`}</dd>
                  </div>
                  <div>
                    <dt>体力</dt>
                    <dd>{expedition.hp === null ? "暂不可读" : expedition.hp}</dd>
                  </div>
                </dl>
                </>
              ) : null}
              {expedition.pending ? (
                <p>
                  <b>{expedition.pending.title ?? "当前事件名称暂不可读"}</b>
                  {expedition.pending.kind === "combat" && expedition.pending.foe
                    ? ` · 对手：${expedition.pending.foe}`
                    : ""}
                </p>
              ) : null}
            </div>
            {expedition.pending?.kind === "choice" && expedition.pending.options?.length ? (
              <ul aria-label="当前分支选项">
                {expedition.pending.options.map((option) => <li key={option.key}>{option.label}</li>)}
              </ul>
            ) : null}
            {writable && expedition.active && expedition.pending?.kind === "combat" ? (
              <div className="farm-action-buttons farm-expedition__actions">
                <button
                  disabled={busy}
                  onClick={() => currentAction("roll", {}, "掷骰推进战斗")}
                  type="button"
                >
                  掷骰推进战斗
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTab === "bag" ? (
          bagRows.length > 0 ? (
            <ul aria-label="本趟行囊" className="farm-expedition__list">
              {bagRows.map((drop) => (
                <li key={drop.key}>
                  <strong>{drop.name}</strong>
                  <span>{drop.quantity === null ? "数量暂不可读" : `×${drop.quantity}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <FarmExpeditionEmpty>本趟行囊还是空的。</FarmExpeditionEmpty>
          )
        ) : null}
        {activeTab === "story" ? (
          expedition.log.length > 0 ? (
            <ol aria-label="本趟故事" className="farm-expedition__story-list">
              {expedition.log.map((entry, index) => {
                const time = formatExpeditionTime(entry.at);
                return (
                  <li key={`${entry.event_id ?? "entry"}-${entry.at ?? index}`}>
                    <div>
                      <strong>{entry.title ?? "未提供标题"}</strong>
                      {time ? <time dateTime={entry.at ?? undefined}>{time}</time> : null}
                    </div>
                    <p>{entry.text}</p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <FarmExpeditionEmpty>本趟还没有故事记录。</FarmExpeditionEmpty>
          )
        ) : null}
        {activeTab === "codex" ? (
          <div className="farm-expedition__codex" role="status">
            <strong>已发现 {codex.discoveredCount} 个秘境片段</strong>
            {codex.groups.length > 0 ? (
              <div className="farm-expedition__codex-groups">
                {codex.groups.map((group) => (
                  <section
                    aria-label={`秘境图鉴·${group.mapName}`}
                    className="farm-expedition__codex-group"
                    key={group.key}
                  >
                    <h3>{group.mapName}</h3>
                    <ol>
                      {group.entries.map((entry) => {
                        const time = formatExpeditionTime(entry.at);
                        return (
                          <li key={entry.eventId}>
                            <div>
                              <strong>{entry.title ?? "未提供标题"}</strong>
                              {time ? <time dateTime={entry.at ?? undefined}>{time}</time> : null}
                            </div>
                            {entry.text ? <p>{entry.text}</p> : null}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            ) : null}
            {codex.missingDetailCount > 0 ? (
              <p>另有 {codex.missingDetailCount} 个已发现片段缺少可读详情。</p>
            ) : codex.groups.length === 0 ? (
              <p>还没有可收录的真实秘境记录。</p>
            ) : null}
          </div>
        ) : null}
        {activeTab === "history" ? (
          expedition.journeys.length > 0 ? (
            <ol aria-label="旅程簿" className="farm-expedition__history-list">
              {expedition.journeys.map((journey, index) => {
                const time = formatExpeditionTime(journey.at);
                return (
                  <li key={`${journey.map_id ?? "journey"}-${journey.at ?? index}`}>
                    <div>
                      <strong>{journey.map_name ?? "地图名称暂不可读"}</strong>
                      {time ? <time dateTime={journey.at ?? undefined}>{time}</time> : null}
                    </div>
                    <p>{journey.summary}</p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <FarmExpeditionEmpty>还没有完成过旅程。</FarmExpeditionEmpty>
          )
        ) : null}
      </div>
    </section>
  );
}

type RanchDispatchAvailable = NonNullable<BoundRanchRead["data"]["dispatch"]>;

type RanchDispatchTarget = {
  aiName: string | null;
  farmDoorplate: string;
  farmName: string;
};

function getRanchDispatchTargets(
  farmCatalog: BoundFarmCatalogRead | null | undefined,
): RanchDispatchTarget[] {
  const neighborhood = farmCatalog?.data.neighborhood;
  if (!farmCatalog || !neighborhood || neighborhood.status === "unavailable") return [];

  const ownFarmDoorplate = farmCatalog.data.farm.farm_doorplate;
  const targets: RanchDispatchTarget[] = [];
  const seenDoorplates = new Set<string>();
  const addTarget = (farmDoorplate: string, farmName: string, aiName: string | null) => {
    if (farmDoorplate === ownFarmDoorplate || seenDoorplates.has(farmDoorplate)) return;
    seenDoorplates.add(farmDoorplate);
    targets.push({ aiName, farmDoorplate, farmName });
  };

  if (neighborhood.message_boards !== undefined) {
    for (const board of neighborhood.message_boards) {
      if (!board.is_own) {
        addTarget(board.farm_doorplate, board.farm_name, board.ai_name ?? null);
      }
    }
    return targets;
  }

  for (const rows of Object.values(neighborhood.rankings)) {
    for (const row of rows) addTarget(row.farm_doorplate, row.farm_name, null);
  }
  return targets;
}

type RanchInteractionActionFields =
  | Omit<
      Extract<RanchInteractionActionInput, { action: "dispatch" }>,
      "expectedRevision" | "idempotencyKey"
    >
  | Omit<
      Extract<RanchInteractionActionInput, { action: "catch" }>,
      "expectedRevision" | "idempotencyKey"
    >
  | Omit<
      Extract<RanchInteractionActionInput, { action: "remit" }>,
      "expectedRevision" | "idempotencyKey"
    >
  | Omit<
      Extract<RanchInteractionActionInput, { action: "send" }>,
      "expectedRevision" | "idempotencyKey"
    >;

export function RanchDispatchPanelContent({
  dispatch,
  farmCatalog,
  onRanchInteractionAction,
  ranch,
}: {
  dispatch: RanchDispatchAvailable;
  farmCatalog: BoundFarmCatalogRead | null;
  onRanchInteractionAction?: RanchInteractionActionExecutor | undefined;
  ranch: BoundRanchRead;
}) {
  type Attempt = { input: RanchInteractionActionInput; label: string };
  type ActionState =
    | { stage: "idle" }
    | { stage: "submitting"; attempt: Attempt }
    | { stage: "success"; message: string }
    | { stage: "error"; attempt: Attempt | null; issue: RanchInteractionActionIssue };
  const [action, setAction] = useState<ActionState>({ stage: "idle" });
  const [selectedTargetFarmDoorplate, setSelectedTargetFarmDoorplate] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [amount, setAmount] = useState("1");
  const residents = ranch.data.residents.animals.filter(
    (resident) =>
      resident.status === "known" &&
      resident.identity.status === "known" &&
      resident.identity.kind_id !== null,
  );
  const dispatchAvailability = (resident: (typeof residents)[number]) => {
    const projected = resident.allowed_actions?.dispatch;
    if (projected) return projected;
    if (resident.dispatch?.state === "active") {
      return { enabled: false, reason: "这只动物已经在外面潜伏了" };
    }
    if (resident.dispatch?.state === "pending_settlement") {
      return { enabled: false, reason: "这只动物正在等待派遣结算" };
    }
    if (resident.dispatch?.state !== "home") {
      return { enabled: false, reason: "派遣状态不可用" };
    }
    return { enabled: true, reason: null };
  };
  const firstEnabledResident = residents.find((resident) => dispatchAvailability(resident).enabled);
  const [animalKindId, setAnimalKindId] = useState(firstEnabledResident?.identity.kind_id ?? "");
  const expectedRevision = ranch.revision;
  const busy = action.stage === "submitting";
  const parsedDuration = Number(durationHours);
  const parsedAmount = Number(amount);
  const validDuration = Number.isSafeInteger(parsedDuration) && parsedDuration > 0;
  const validAmount = Number.isSafeInteger(parsedAmount) && parsedAmount > 0;
  const selectedResident = residents.find(
    (resident) =>
      resident.identity.kind_id === animalKindId && dispatchAvailability(resident).enabled,
  );
  useEffect(() => {
    if (!selectedResident) {
      setAnimalKindId(firstEnabledResident?.identity.kind_id ?? "");
    }
  }, [firstEnabledResident?.identity.kind_id, selectedResident]);
  const dispatchTargets = getRanchDispatchTargets(farmCatalog);
  const selectedTarget =
    dispatchTargets.find((target) => target.farmDoorplate === selectedTargetFarmDoorplate) ??
    dispatchTargets[0] ??
    null;
  const dispatchTargetLabel = (farmDoorplate: string | null | undefined) => {
    if (!farmDoorplate) return "目标农场未记录";
    const target = dispatchTargets.find((candidate) => candidate.farmDoorplate === farmDoorplate);
    if (!target) return `门牌 ${farmDoorplate}`;
    return target.aiName ? `${target.farmName}（${target.aiName}）` : target.farmName;
  };
  const dispatchStateLabel = (entry: RanchDispatchAvailable["active"][number]) => {
    if (entry.state === "pending_settlement") return "待结算";
    if (entry.state !== "active" || entry.remaining_ms === null) return "状态不可用";
    const minutes = Math.max(1, Math.ceil(entry.remaining_ms / 60_000));
    return minutes >= 60
      ? `剩余 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
      : `剩余 ${minutes} 分钟`;
  };
  const shouldRetry = (issue: RanchInteractionActionIssue) =>
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response";

  const outcomeMessage = (result: BoundRanchInteractionAction["data"]["result"]) => {
    switch (result.outcome.kind) {
      case "dispatch":
        return `${result.outcome.animal_name}已派往${result.outcome.target_farm_doorplate}`;
      case "catch":
        return `已抓捕${result.outcome.animal_name}，补偿 ${result.outcome.compensation}`;
      case "remit":
        return `已转回农场 ${result.outcome.amount}，剩余 ${result.outcome.ranch_coins_remaining}`;
      case "send":
        return `已转入牧场 ${result.outcome.amount}，农场剩余 ${result.outcome.farm_coins_remaining}`;
    }
  };

  const submit = async (attempt: Attempt) => {
    if (!onRanchInteractionAction) return;
    setAction({ stage: "submitting", attempt });
    let result: Awaited<ReturnType<RanchInteractionActionExecutor>>;
    try {
      result = await onRanchInteractionAction(attempt.input);
    } catch {
      setAction({
        stage: "error",
        attempt,
        issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
      });
      return;
    }
    if (result.ok) {
      setAction({ stage: "success", message: outcomeMessage(result.data.data.result) });
      return;
    }
    setAction({
      stage: "error",
      attempt: shouldRetry(result.issue) ? attempt : null,
      issue: result.issue,
    });
  };

  const currentAction = (input: RanchInteractionActionFields, label: string) => {
    if (!onRanchInteractionAction) return;
    void submit({
      input: {
        ...input,
        expectedRevision,
        idempotencyKey: crypto.randomUUID(),
      } as RanchInteractionActionInput,
      label,
    });
  };

  return (
    <section aria-label="真实派遣" className="farm-feature">
      <div className="farm-action-toolbar">
        <strong>派遣</strong>
        <span>
          牧场金币{" "}
          {ranch.data.balance.status === "available"
            ? (ranch.data.balance.ranch_coins ?? "—")
            : "—"}
        </span>
      </div>
      {action.stage === "success" ? (
        <p className="farm-action-feedback" role="status">
          {action.message}
        </p>
      ) : action.stage === "error" ? (
        <p className="farm-action-feedback farm-action-feedback--error" role="alert">
          {ranchInteractionActionIssueMessage(action.issue)}
          {action.attempt ? (
            <button onClick={() => void submit(action.attempt as Attempt)} type="button">
              重试
            </button>
          ) : null}
        </p>
      ) : null}
      <form
        aria-label="派遣动物"
        className="farm-ranch-dispatch__form"
        onSubmit={(event) => event.preventDefault()}
      >
        <label>
          <span>动物</span>
          <select
            disabled={busy || !onRanchInteractionAction || !firstEnabledResident}
            onChange={(event) => setAnimalKindId(event.currentTarget.value)}
            value={selectedResident?.identity.kind_id ?? ""}
          >
            {residents.length > 0 ? (
              residents.map((resident) => (
                <option
                  disabled={!dispatchAvailability(resident).enabled}
                  key={resident.identity.kind_id}
                  value={resident.identity.kind_id as string}
                >
                  {resident.identity.custom_name ?? resident.identity.name ?? "身份不可用"}
                  {dispatchAvailability(resident).enabled
                    ? ""
                    : `（${dispatchAvailability(resident).reason ?? "当前不可派遣"}）`}
                </option>
              ))
            ) : (
              <option value="">没有在家的生产动物</option>
            )}
          </select>
        </label>
        <label>
          <span>目标农场</span>
          <select
            disabled={busy || !onRanchInteractionAction || dispatchTargets.length === 0}
            onChange={(event) => setSelectedTargetFarmDoorplate(event.currentTarget.value)}
            value={selectedTarget?.farmDoorplate ?? ""}
          >
            {dispatchTargets.length > 0 ? (
              dispatchTargets.map((target) => (
                <option key={target.farmDoorplate} value={target.farmDoorplate}>
                  {target.aiName ? `${target.farmName}（${target.aiName}）` : target.farmName}
                </option>
              ))
            ) : (
              <option value="">
                {farmCatalog ? "暂无可派遣的邻居农场" : "正在读取可派遣农场"}
              </option>
            )}
          </select>
        </label>
        <label>
          <span>时长（小时）</span>
          <input
            disabled={busy || !onRanchInteractionAction}
            min="1"
            onChange={(event) => setDurationHours(event.currentTarget.value)}
            type="number"
            value={durationHours}
          />
        </label>
        <button
          disabled={
            busy ||
            !onRanchInteractionAction ||
            !selectedTarget ||
            !validDuration ||
            !selectedResident
          }
          onClick={() => {
            if (!selectedTarget || !selectedResident?.identity.kind_id) return;
            currentAction(
              {
                action: "dispatch",
                targetFarmDoorplate: selectedTarget.farmDoorplate,
                animalKindId: selectedResident.identity.kind_id,
                durationHours: parsedDuration,
              },
              "派遣",
            );
          }}
          type="button"
        >
          派遣
        </button>
      </form>
      <section aria-label="正在潜伏" className="farm-ranch-active-dispatches">
        <div className="farm-action-toolbar">
          <strong>正在潜伏</strong>
          <span>{dispatch.active.length} 只</span>
        </div>
        <ul aria-label="潜伏动物列表" className="farm-ranch-active-dispatches__list">
          {dispatch.active.length > 0 ? (
            dispatch.active.map((entry) => (
              <li key={`${entry.raid_id ?? "dispatch"}-${entry.animal_kind_id ?? "animal"}`}>
                <strong>
                  {entry.status === "known" && entry.animal_name ? entry.animal_name : "身份不可用"}
                </strong>
                <span className="farm-ranch-active-dispatches__state">
                  {dispatchStateLabel(entry)}
                </span>
                <small>{dispatchTargetLabel(entry.target_farm_doorplate)}</small>
              </li>
            ))
          ) : (
            <li className="farm-ranch-active-dispatches__empty">
              <span>当前没有正在潜伏的动物</span>
            </li>
          )}
        </ul>
      </section>
      <section aria-label="牧场金币往来" className="farm-ranch-money">
        <div className="farm-action-toolbar">
          <strong>金币往来</strong>
          <span>仅提交真实金额</span>
        </div>
        <label>
          <span>金额</span>
          <input
            disabled={busy || !onRanchInteractionAction}
            min="1"
            onChange={(event) => setAmount(event.currentTarget.value)}
            type="number"
            value={amount}
          />
        </label>
        <div className="farm-action-buttons">
          <button
            disabled={busy || !onRanchInteractionAction || !validAmount}
            onClick={() => currentAction({ action: "remit", amount: parsedAmount }, "转回农场")}
            type="button"
          >
            转回农场
          </button>
          <button
            disabled={busy || !onRanchInteractionAction || !validAmount}
            onClick={() => currentAction({ action: "send", amount: parsedAmount }, "转入牧场")}
            type="button"
          >
            转入牧场
          </button>
        </div>
      </section>
    </section>
  );
}
