import type { CSSProperties } from "react";
import {
  type FarmAssetManifestEntry,
  getCookingIngredientAsset,
  getCookingRecipeAsset,
  getFarmAssetUrl,
} from "../../farm-asset-manifest";
import {
  getRanchAnimalSpriteStyle,
  getRanchSkinSpriteStyle,
  RANCH_SHOP_ANIMALS,
  type RanchShopAnimal,
} from "../ranch-animal-data";
import {
  type CookingCartCheckoutFeedback,
  type CookingCartCheckoutLine,
  type FarmCartCheckoutFeedback,
  type FarmCartCheckoutLine,
  type FarmShopLiveResources,
  getCookingToolAssetKey,
  getShopCartItemDefinition,
  type ShopCartItemDefinition,
  type ShopCartQuantities,
  type ShopCartSceneId,
} from "./model";

function shopCartItemCount(cart: ShopCartQuantities) {
  return Object.values(cart).reduce((total, quantity) => total + quantity, 0);
}

function getCookingCatalogSpriteStyle(asset: FarmAssetManifestEntry): CSSProperties {
  const frame = asset.atlasFrame;
  if (!frame) {
    return {};
  }

  return {
    backgroundImage: `url("${asset.url}")`,
    backgroundPosition: `${(frame.column * 100) / (frame.columns - 1)}% ${(frame.row * 100) / (frame.rows - 1)}%`,
    backgroundSize: `${frame.columns * 100}% ${frame.rows * 100}%`,
  };
}

export function CookingCatalogSprite({
  entityId,
  kind,
  name,
}: {
  entityId: string;
  kind: "ingredient" | "recipe";
  name: string;
}) {
  const asset =
    kind === "ingredient" ? getCookingIngredientAsset(entityId) : getCookingRecipeAsset(entityId);

  return asset ? (
    <span
      aria-label={`${name}${kind === "ingredient" ? "食材" : "料理"}小图`}
      className="cooking-catalog__sprite"
      role="img"
      style={getCookingCatalogSpriteStyle(asset)}
    />
  ) : (
    <span aria-hidden="true" className="cooking-catalog__sprite cooking-catalog__sprite--missing" />
  );
}

export function RanchShopAnimalSprite({ animal }: { animal: RanchShopAnimal }) {
  return (
    <span
      aria-hidden="true"
      className="ranch-shop__animal-sprite"
      style={getRanchAnimalSpriteStyle(animal)}
    />
  );
}

export function RanchShopSkinSprite({ skinId }: { skinId: string }) {
  return (
    <span
      aria-hidden="true"
      className="ranch-shop__animal-sprite ranch-shop__animal-sprite--skin"
      style={getRanchSkinSpriteStyle(skinId)}
    />
  );
}

export function ShopCartSelectionBadge({
  itemName,
  onRemove,
  quantity,
}: {
  itemName: string;
  onRemove: () => void;
  quantity: number;
}) {
  if (quantity < 1) {
    return null;
  }

  return (
    <button
      aria-label={`从购物车减少一份${itemName}`}
      className="shop-cart__selection-count"
      onClick={onRemove}
      type="button"
    >
      {quantity}
    </button>
  );
}

export function ShopCartShortcut({
  cart,
  onOpen,
}: {
  cart: ShopCartQuantities;
  onOpen: () => void;
}) {
  const itemCount = shopCartItemCount(cart);

  return (
    <button
      aria-label={`查看购物车，${itemCount}件`}
      className="shop-cart__shortcut"
      onClick={onOpen}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 4h2l2.2 9.2a2 2 0 0 0 2 1.55h7.9a2 2 0 0 0 1.94-1.5L21 7H6" />
        <circle cx="9" cy="19" r="1.25" />
        <circle cx="18" cy="19" r="1.25" />
      </svg>
      <span className="farm-visually-hidden">购物车</span>
      <strong>{itemCount}</strong>
    </button>
  );
}

function ShopCartItemVisual({ item }: { item: ShopCartItemDefinition }) {
  if (item.visual.kind === "farm") {
    return item.visual.iconKey ? (
      <img alt="" aria-hidden="true" src={getFarmAssetUrl(item.visual.iconKey)} />
    ) : null;
  }

  if (item.visual.kind === "ranch") {
    const visual = item.visual;
    if (visual.skinId) {
      return <RanchShopSkinSprite skinId={visual.skinId} />;
    }
    const animal = RANCH_SHOP_ANIMALS.find((candidate) => candidate.id === visual.animalId);
    return animal ? <RanchShopAnimalSprite animal={animal} /> : null;
  }

  if (item.visual.catalogKind === "tool") {
    const assetKey = getCookingToolAssetKey(item.visual.entityId);
    return assetKey ? <img alt="" aria-hidden="true" src={getFarmAssetUrl(assetKey)} /> : null;
  }

  return (
    <CookingCatalogSprite
      entityId={item.visual.entityId}
      kind={item.visual.catalogKind}
      name={item.name}
    />
  );
}

function ShopCartPrice({
  amount,
  currency,
}: {
  amount: number;
  currency: ShopCartItemDefinition["currency"];
}) {
  return (
    <span className={`shop-cart__price shop-cart__price--${currency}`}>
      <span className="farm-visually-hidden">{currency === "silver" ? "银币" : "金币"}</span>
      <i aria-hidden="true" />
      {amount.toLocaleString("zh-CN")}
    </span>
  );
}

export function ShopCartPanelContent({
  cart,
  cookingCheckoutFeedback = { stage: "idle" },
  farmCheckoutFeedback = { stage: "idle" },
  liveResources,
  onBack,
  onChangeQuantity,
  onCheckoutCookingCart,
  onCheckoutFarmCart,
  onRetryCookingCheckout,
  onRetryFarmCheckout,
  sceneId,
}: {
  cart: ShopCartQuantities;
  cookingCheckoutFeedback?: CookingCartCheckoutFeedback | undefined;
  farmCheckoutFeedback?: FarmCartCheckoutFeedback | undefined;
  liveResources?: FarmShopLiveResources | undefined;
  onBack: () => void;
  onChangeQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onCheckoutCookingCart?: ((items: CookingCartCheckoutLine[]) => void) | undefined;
  onCheckoutFarmCart?: ((items: FarmCartCheckoutLine[]) => void) | undefined;
  onRetryCookingCheckout?: (() => void) | undefined;
  onRetryFarmCheckout?: (() => void) | undefined;
  sceneId: ShopCartSceneId;
}) {
  const cartEntries = Object.entries(cart).filter(([, quantity]) => quantity > 0);
  const items = cartEntries.flatMap(([cartKey, quantity]) => {
    const item = getShopCartItemDefinition(sceneId, cartKey, liveResources);
    return item ? [{ item, quantity }] : [];
  });
  const total = items.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const currency = sceneId === "cooking" ? "silver" : "gold";
  const actionLabel = sceneId === "cooking" ? "确认购买" : "喊 TA 来买";
  const checkoutLines = items.flatMap(({ item, quantity }) =>
    item.visual.kind === "cooking"
      ? [
          {
            kind: item.visual.catalogKind,
            itemId: item.visual.entityId,
            quantity,
          } satisfies CookingCartCheckoutLine,
        ]
      : [],
  );
  const farmCheckoutLines = items.flatMap<FarmCartCheckoutLine>(({ item, quantity }) => {
    if (item.visual.kind === "farm") {
      return [
        {
          kind: item.visual.catalogKind,
          itemId: item.visual.entityId,
          quantity,
        } satisfies FarmCartCheckoutLine,
      ];
    }
    if (item.visual.kind === "ranch") {
      return [
        {
          kind: item.visual.catalogKind,
          itemId: item.visual.animalId,
          quantity,
        } satisfies FarmCartCheckoutLine,
      ];
    }
    return [];
  });
  const submitting = cookingCheckoutFeedback.stage === "submitting";
  const hasPendingRetryAttempt =
    cookingCheckoutFeedback.stage === "error" && cookingCheckoutFeedback.retryable;
  const cartLocked = submitting || hasPendingRetryAttempt;
  const farmSubmitting = farmCheckoutFeedback.stage === "submitting";
  const hasPendingFarmRetry =
    farmCheckoutFeedback.stage === "error" && farmCheckoutFeedback.retryable;
  const farmCartLocked = farmSubmitting || hasPendingFarmRetry;
  const checkoutEnabled =
    sceneId === "cooking" &&
    Boolean(onCheckoutCookingCart) &&
    items.length > 0 &&
    items.length === cartEntries.length &&
    checkoutLines.length === items.length &&
    !cartLocked;
  const farmCheckoutEnabled =
    sceneId !== "cooking" &&
    Boolean(onCheckoutFarmCart) &&
    items.length > 0 &&
    items.length === cartEntries.length &&
    farmCheckoutLines.length === items.length &&
    !farmCartLocked;
  const quantityLocked = sceneId === "cooking" ? cartLocked : farmCartLocked;

  return (
    <section aria-label="购物车" className="shop-cart">
      <header className="shop-cart__header">
        <button aria-label="返回商店" className="shop-cart__back" onClick={onBack} type="button">
          ‹
        </button>
        <h3>购物车</h3>
        <span>{shopCartItemCount(cart)} 件</span>
      </header>
      {items.length > 0 ? (
        <ul className="shop-cart__items">
          {items.map(({ item, quantity }) => (
            <li key={item.cartKey}>
              <span className="shop-cart__visual">
                <ShopCartItemVisual item={item} />
              </span>
              <span className="shop-cart__item-copy">
                <strong>{item.name}</strong>
                <ShopCartPrice amount={item.price} currency={item.currency} />
              </span>
              <span className="shop-cart__quantity">
                <button
                  aria-label={`减少${item.name}数量`}
                  disabled={quantityLocked}
                  onClick={() => onChangeQuantity(item.cartKey, -1, item.maxQuantity)}
                  type="button"
                >
                  −
                </button>
                <strong>
                  <span className="farm-visually-hidden">{item.name}数量</span>
                  {quantity}
                </strong>
                <button
                  aria-label={`增加${item.name}数量`}
                  disabled={
                    quantityLocked ||
                    (item.maxQuantity !== undefined && quantity >= item.maxQuantity)
                  }
                  onClick={() => onChangeQuantity(item.cartKey, 1, item.maxQuantity)}
                  type="button"
                >
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="shop-cart__empty" role="status">
          <strong>购物车还是空的</strong>
          <span>返回商店，选择商品加入。</span>
        </div>
      )}
      <footer className="shop-cart__footer">
        <span>合计</span>
        <ShopCartPrice amount={total} currency={currency} />
        <button
          disabled={sceneId === "cooking" ? !checkoutEnabled : !farmCheckoutEnabled}
          onClick={() =>
            sceneId === "cooking"
              ? onCheckoutCookingCart?.(checkoutLines)
              : onCheckoutFarmCart?.(farmCheckoutLines)
          }
          type="button"
        >
          {actionLabel}
        </button>
        {cookingCheckoutFeedback.stage === "submitting" ? (
          <p className="shop-cart__feedback" role="status">
            正在确认购买…
          </p>
        ) : cookingCheckoutFeedback.stage === "success" ? (
          <p className="shop-cart__feedback" role="status">
            已购 {cookingCheckoutFeedback.itemCount} 件，支付
            {cookingCheckoutFeedback.totalPriceSilver.toLocaleString("zh-CN")} 银币
          </p>
        ) : cookingCheckoutFeedback.stage === "error" ? (
          <p className="shop-cart__feedback shop-cart__feedback--error" role="alert">
            {cookingCheckoutFeedback.message}
            {cookingCheckoutFeedback.retryable && onRetryCookingCheckout ? (
              <button onClick={onRetryCookingCheckout} type="button">
                重试
              </button>
            ) : null}
          </p>
        ) : sceneId !== "cooking" && farmCheckoutFeedback.stage === "submitting" ? (
          <p className="shop-cart__feedback" role="status">
            正在发送…
          </p>
        ) : sceneId !== "cooking" && farmCheckoutFeedback.stage === "success" ? (
          <p className="shop-cart__feedback" role="status">
            已通知 TA
          </p>
        ) : sceneId !== "cooking" && farmCheckoutFeedback.stage === "error" ? (
          <p className="shop-cart__feedback shop-cart__feedback--error" role="alert">
            {farmCheckoutFeedback.message}
            {farmCheckoutFeedback.retryable && onRetryFarmCheckout ? (
              <button onClick={onRetryFarmCheckout} type="button">
                重试
              </button>
            ) : null}
          </p>
        ) : null}
      </footer>
    </section>
  );
}

export function CookingSilverPrice({ amount }: { amount: number }) {
  return (
    <span className="cooking-catalog__price">
      <span className="farm-visually-hidden">银币价格</span>
      <i aria-hidden="true" className="cooking-catalog__silver-coin" />
      {amount}
    </span>
  );
}
