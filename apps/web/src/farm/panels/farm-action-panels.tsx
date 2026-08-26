import { useState } from "react";
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
  const farmDoorplate = farmCatalog.data.farm.farm_doorplate;
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
      setAction({
        stage: "success",
        message:
          result.data.data.result.action === "browse"
            ? "集市已重新读取"
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
      {onMarketAction && inventory.length > 0 ? (
        <form
          aria-label="发布集市商品"
          className="farm-market__form"
          onSubmit={(event) => event.preventDefault()}
        >
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
          <button disabled={busy || !validQuantity} onClick={() => submitList(false)} type="button">
            上架
          </button>
          <details className="farm-market__barter">
            <summary>发布换物</summary>
            <div className="farm-market__barter-fields">
              <label>
                <span>想换类型</span>
                <select
                  disabled={busy}
                  onChange={(event) => setWantKind(event.currentTarget.value as typeof wantKind)}
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
        </form>
      ) : null}
      <ul aria-label="真实集市商品" className="farm-crop-codex__list">
        {listings.length + barterListings.length > 0 ? (
          <>
            {listings.map((listing, index) => {
              const ownListing = farmDoorplate === listing.seller_farm_doorplate;
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
            {barterListings.map((listing) => {
              const ownListing = farmDoorplate === listing.seller_farm_doorplate;
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
          </>
        ) : (
          <li>
            <span>当前没有真实摊位</span>
          </li>
        )}
      </ul>
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
  const [expandedCropId, setExpandedCropId] = useState<string | null>(null);
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
              onClick={() => setCategoryId(category.id)}
              type="button"
            >
              <span>{category.label}</span>
              <small>{category.count}</small>
            </button>
          ))}
        </nav>
        <div className="farm-crop-codex__body">
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
                const expanded = discovered && expandedCropId === entry.crop_id;
                const name =
                  entry.identity_state === "known" && entry.name ? entry.name : "身份不可用";
                return (
                  <li
                    className={expanded ? "farm-crop-codex__entry--expanded" : undefined}
                    key={entry.crop_id}
                  >
                    <div className="farm-crop-codex__entry-head">
                      <button
                        aria-expanded={discovered ? expanded : undefined}
                        className="farm-crop-codex__entry-toggle"
                        disabled={!discovered}
                        onClick={() => {
                          if (discovered) {
                            setExpandedCropId(expanded ? null : entry.crop_id);
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
                    {expanded ? <FarmCropCodexDetail entry={entry} /> : null}
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
  const [charges, setCharges] = useState("1");
  const [charmKind, setCharmKind] = useState<"check" | "hp">("check");
  const [blessing, setBlessing] = useState("");
  const busy = action.stage === "submitting";
  const expectedRevision = farmCatalog.expedition_revision;
  const parsedCharges = Number(charges);
  const validCharges = Number.isSafeInteger(parsedCharges) && parsedCharges > 0;
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
    <section aria-label="真实探险" className="farm-feature">
      <div className="farm-action-toolbar">
        <strong>探险</strong>
        <span>
          {expedition.remaining_today}/{expedition.daily_limit} 次
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
      <div className="farm-action-summary" role="status">
        <strong>
          {expedition.active ? (expedition.map_name ?? "地图身份不可用") : "当前没有进行中的旅程"}
        </strong>
        <span>
          {expedition.step === null ? "" : `进度 ${expedition.step}`}
          {expedition.hp === null ? "" : ` · 体力 ${expedition.hp}`}
        </span>
        {expedition.pending ? (
          <span>
            {expedition.pending.title ?? "事件身份不可用"}
            {expedition.pending.kind === "combat" && expedition.pending.foe
              ? ` · 对手 ${expedition.pending.foe}`
              : ""}
          </span>
        ) : null}
      </div>
      <div className="farm-action-controls">
        {!expedition.active ? (
          <label>
            <span>进入次数</span>
            <input
              disabled={busy || !onExpeditionAction}
              min="1"
              onChange={(event) => setCharges(event.currentTarget.value)}
              type="number"
              value={charges}
            />
          </label>
        ) : null}
        {expedition.active && expedition.pending === null ? (
          <label>
            <span>探索次数</span>
            <input
              disabled={busy || !onExpeditionAction}
              min="1"
              onChange={(event) => setCharges(event.currentTarget.value)}
              type="number"
              value={charges}
            />
          </label>
        ) : null}
        <div className="farm-action-buttons">
          {!expedition.active ? (
            <button
              disabled={busy || !onExpeditionAction || !validCharges}
              onClick={() => currentAction("enter", { charges: parsedCharges }, "进入探险")}
              type="button"
            >
              进入探险
            </button>
          ) : expedition.pending === null ? (
            <button
              disabled={busy || !onExpeditionAction || !validCharges}
              onClick={() => currentAction("explore", { charges: parsedCharges }, "继续探索")}
              type="button"
            >
              继续探索
            </button>
          ) : expedition.pending.kind === "choice" ? (
            expedition.pending.options?.map((option) => (
              <button
                disabled={busy || !onExpeditionAction}
                key={option.key}
                onClick={() => currentAction("choose", { option: option.key }, option.label)}
                type="button"
              >
                {option.label}
              </button>
            ))
          ) : (
            <button
              disabled={busy || !onExpeditionAction}
              onClick={() => currentAction("roll", {}, "掷骰")}
              type="button"
            >
              掷骰
            </button>
          )}
          {expedition.active ? (
            <button
              disabled={busy || !onExpeditionAction}
              onClick={() => currentAction("retreat", {}, "撤退")}
              type="button"
            >
              撤退
            </button>
          ) : null}
        </div>
        {expedition.pending ? (
          <div className="farm-action-inline-form">
            <select
              aria-label="祈福方式"
              disabled={busy || !onExpeditionAction}
              onChange={(event) => setCharmKind(event.currentTarget.value as typeof charmKind)}
              value={charmKind}
            >
              <option value="check">检定</option>
              <option value="hp">体力</option>
            </select>
            <input
              aria-label="祈福文案"
              disabled={busy || !onExpeditionAction}
              onChange={(event) => setBlessing(event.currentTarget.value)}
              placeholder="祈福内容"
              type="text"
              value={blessing}
            />
            <button
              disabled={busy || !onExpeditionAction}
              onClick={() => currentAction("charm", { kind: charmKind, blessing }, "祈福")}
              type="button"
            >
              祈福
            </button>
          </div>
        ) : null}
      </div>
      {expedition.log.length > 0 ? (
        <ul className="farm-crop-codex__list" aria-label="探险记录">
          {expedition.log.map((entry) => (
            <li key={`${entry.event_id ?? "entry"}-${entry.at ?? entry.text}`}>
              <span>{entry.title ?? entry.text}</span>
              {entry.title ? <small>{entry.text}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type RanchDispatchAvailable = NonNullable<BoundRanchRead["data"]["dispatch"]>;

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
  onRanchInteractionAction,
  ranch,
}: {
  dispatch: RanchDispatchAvailable;
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
  const [targetFarmDoorplate, setTargetFarmDoorplate] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [amount, setAmount] = useState("1");
  const residents = [
    ...ranch.data.residents.animals,
    ...ranch.data.residents.pets,
    ...(ranch.data.residents.patrol_goose ? [ranch.data.residents.patrol_goose] : []),
  ].filter(
    (resident) =>
      resident.status === "known" &&
      resident.identity.status === "known" &&
      resident.identity.kind_id !== null,
  );
  const [animalKindId, setAnimalKindId] = useState(residents[0]?.identity.kind_id ?? "");
  const expectedRevision = ranch.revision;
  const busy = action.stage === "submitting";
  const parsedDuration = Number(durationHours);
  const parsedAmount = Number(amount);
  const validDoorplate = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(targetFarmDoorplate);
  const validDuration = Number.isSafeInteger(parsedDuration) && parsedDuration > 0;
  const validAmount = Number.isSafeInteger(parsedAmount) && parsedAmount > 0;
  const selectedResident = residents.find((resident) => resident.identity.kind_id === animalKindId);
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
            disabled={busy || !onRanchInteractionAction || residents.length === 0}
            onChange={(event) => setAnimalKindId(event.currentTarget.value)}
            value={selectedResident?.identity.kind_id ?? ""}
          >
            {residents.map((resident) => (
              <option key={resident.identity.kind_id} value={resident.identity.kind_id as string}>
                {resident.identity.custom_name ?? resident.identity.name ?? "身份不可用"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>目标农场门牌</span>
          <input
            disabled={busy || !onRanchInteractionAction}
            maxLength={6}
            onChange={(event) => setTargetFarmDoorplate(event.currentTarget.value.toUpperCase())}
            placeholder="六位门牌"
            type="text"
            value={targetFarmDoorplate}
          />
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
            !validDoorplate ||
            !validDuration ||
            !selectedResident
          }
          onClick={() =>
            currentAction(
              {
                action: "dispatch",
                targetFarmDoorplate,
                animalKindId: selectedResident?.identity.kind_id as string,
                durationHours: parsedDuration,
              },
              "派遣",
            )
          }
          type="button"
        >
          派遣
        </button>
      </form>
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
      <ul className="farm-crop-codex__list">
        {dispatch.active.length > 0 ? (
          dispatch.active.map((entry) => (
            <li key={`${entry.raid_id ?? "dispatch"}-${entry.animal_kind_id ?? "animal"}`}>
              <span>
                {entry.status === "known" && entry.animal_name ? entry.animal_name : "身份不可用"}
              </span>
              <small>
                {entry.state === "active"
                  ? "进行中"
                  : entry.state === "pending_settlement"
                    ? "待结算"
                    : "不可用"}
              </small>
              {entry.state === "pending_settlement" && entry.raid_id && onRanchInteractionAction ? (
                <button
                  className="farm-inventory-action"
                  disabled={busy}
                  onClick={() =>
                    currentAction({ action: "catch", raidId: entry.raid_id as string }, "收取")
                  }
                  type="button"
                >
                  收取
                </button>
              ) : null}
            </li>
          ))
        ) : (
          <li>
            <span>当前没有真实派遣</span>
          </li>
        )}
      </ul>
    </section>
  );
}
