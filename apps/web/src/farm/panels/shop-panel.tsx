import { useState } from "react";
import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import { getFarmAssetUrl } from "../farm-asset-manifest";
import { CookingShopPanelContent } from "./shop/cooking-shop";
import {
  FARM_FIELD_SHOP_PREVIEW_ITEMS,
  FARM_FIELD_SHOP_SECTIONS,
  type FarmCartCheckoutFeedback,
  type FarmCartCheckoutLine,
  type FarmFieldShopSectionId,
  type FarmShopPanelProps,
  getLiveFarmShopItems,
  getShopCartKey,
  type ShopCartQuantities,
} from "./shop/model";
import { RanchShopPanelContent } from "./shop/ranch-shop";
import { ShopCartAddButton, ShopCartPanelContent, ShopCartShortcut } from "./shop/shared";
import "./shop-panel.css";

export type {
  CookingCartCheckoutFeedback,
  CookingCartCheckoutLine,
  CookingShopRefreshFeedback,
  FarmCartCheckoutFeedback,
  FarmCartCheckoutLine,
  FarmShopLiveResources,
  FarmShopPanelProps,
  ShopCartItemDefinition,
  ShopCartQuantities,
  ShopCartSceneId,
  ShopCartState,
} from "./shop/model";
export {
  createEmptyShopCarts,
  EMPTY_SHOP_CART,
  getLiveCookingIngredients,
  getLiveCookingRecipes,
  getLiveFarmShopItems,
  getLiveRanchShopItems,
  getShopCartItemDefinition,
} from "./shop/model";

function FarmLiveShopPanelContent({
  cart,
  farmCheckoutFeedback,
  farmCatalog,
  onChangeCartQuantity,
  onCheckoutFarmCart,
  onRetryFarmCheckout,
}: {
  cart: ShopCartQuantities;
  farmCheckoutFeedback?: FarmCartCheckoutFeedback | undefined;
  farmCatalog?: BoundFarmCatalogRead | null | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onCheckoutFarmCart?: ((items: FarmCartCheckoutLine[]) => void) | undefined;
  onRetryFarmCheckout?: (() => void) | undefined;
}) {
  const [sectionId, setSectionId] = useState<FarmFieldShopSectionId>("seeds-and-potions");
  const [cartOpen, setCartOpen] = useState(false);
  const items = getLiveFarmShopItems(farmCatalog).filter((item) =>
    sectionId === "today" ? item.source === "persisted" : item.source === "permanent",
  );

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        farmCheckoutFeedback={farmCheckoutFeedback}
        liveResources={{ farmCatalog }}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        onCheckoutFarmCart={onCheckoutFarmCart}
        onRetryFarmCheckout={onRetryFarmCheckout}
        sceneId="field"
      />
    );
  }

  if (farmCatalog?.data.shop.status !== "available") {
    return (
      <div className="farm-shop__unavailable">
        <img alt="" aria-hidden="true" src={getFarmAssetUrl("panel.tool.shop")} />
        <strong>商店数据尚未接入</strong>
        <span>当前页面不会显示示例商品。</span>
      </div>
    );
  }

  return (
    <section aria-label="农场商店" className="farm-shop">
      <nav aria-label="商店分类" className="farm-shop__categories">
        {FARM_FIELD_SHOP_SECTIONS.map((section) => (
          <button
            aria-pressed={section.id === sectionId}
            key={section.id}
            onClick={() => setSectionId(section.id)}
            type="button"
          >
            {section.label}
          </button>
        ))}
      </nav>
      <ul className="farm-shop__items">
        {items.map((item) => {
          const disabled = item.note === "已拥有" || item.availableQuantity === 0;
          const addToCart = () => {
            if (disabled) {
              return;
            }
            onChangeCartQuantity(
              getShopCartKey("farm", item.id),
              1,
              item.availableQuantity ?? undefined,
            );
          };
          return (
            <li key={item.id}>
              <button
                aria-label={`将${item.name}加入购物车`}
                disabled={disabled}
                onClick={addToCart}
                style={{ display: "contents" }}
                type="button"
              >
                {item.iconKey ? (
                  <img alt="" aria-hidden="true" src={getFarmAssetUrl(item.iconKey)} />
                ) : null}
                <span className="farm-shop__item-copy">
                  <strong>{item.name}</strong>
                  <small>{item.note}</small>
                </span>
              </button>
              <span className="farm-shop__price">
                <span className="farm-visually-hidden">价格</span>
                <i aria-hidden="true" />
                {item.price}
              </span>
            </li>
          );
        })}
      </ul>
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}

export function FarmShopPanelContent({
  activeScene,
  cart,
  cookingCheckoutFeedback,
  cookingShopRefreshFeedback,
  farmCheckoutFeedback,
  farmCatalog,
  kitchen,
  onChangeCartQuantity,
  onCheckoutCookingCart,
  onCheckoutFarmCart,
  onRetryFarmCheckout,
  onRetryCookingCheckout,
  onRefreshCookingShop,
  preview,
  ranch,
}: FarmShopPanelProps) {
  const [sectionId, setSectionId] = useState<FarmFieldShopSectionId>("seeds-and-potions");
  const [cartOpen, setCartOpen] = useState(false);
  const previewItems = FARM_FIELD_SHOP_PREVIEW_ITEMS[sectionId];

  if (activeScene === "ranch") {
    return (
      <RanchShopPanelContent
        cart={cart}
        farmCheckoutFeedback={farmCheckoutFeedback}
        onChangeCartQuantity={onChangeCartQuantity}
        onCheckoutFarmCart={onCheckoutFarmCart}
        onRetryFarmCheckout={onRetryFarmCheckout}
        preview={preview}
        ranch={ranch}
      />
    );
  }

  if (activeScene === "cooking") {
    return preview ? (
      <CookingShopPanelContent
        cart={cart}
        cookingCheckoutFeedback={cookingCheckoutFeedback}
        cookingShopRefreshFeedback={cookingShopRefreshFeedback}
        onChangeCartQuantity={onChangeCartQuantity}
      />
    ) : (
      <CookingShopPanelContent
        cart={cart}
        cookingCheckoutFeedback={cookingCheckoutFeedback}
        cookingShopRefreshFeedback={cookingShopRefreshFeedback}
        kitchen={kitchen}
        live
        onChangeCartQuantity={onChangeCartQuantity}
        onCheckoutCookingCart={onCheckoutCookingCart}
        onRetryCookingCheckout={onRetryCookingCheckout}
        onRefreshCookingShop={onRefreshCookingShop}
      />
    );
  }

  if (!preview) {
    return (
      <FarmLiveShopPanelContent
        cart={cart}
        farmCheckoutFeedback={farmCheckoutFeedback}
        farmCatalog={farmCatalog}
        onChangeCartQuantity={onChangeCartQuantity}
        onCheckoutFarmCart={onCheckoutFarmCart}
        onRetryFarmCheckout={onRetryFarmCheckout}
      />
    );
  }

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        liveResources={undefined}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        sceneId="field"
      />
    );
  }

  return (
    <section aria-label="农场商店" className="farm-shop">
      <nav aria-label="商店分类" className="farm-shop__categories">
        {FARM_FIELD_SHOP_SECTIONS.map((section) => (
          <button
            aria-pressed={section.id === sectionId}
            key={section.id}
            onClick={() => setSectionId(section.id)}
            type="button"
          >
            {section.label}
          </button>
        ))}
      </nav>
      <ul className="farm-shop__items">
        {previewItems.map((item) => (
          <li key={item.id}>
            {item.iconKey ? (
              <img alt="" aria-hidden="true" src={getFarmAssetUrl(item.iconKey)} />
            ) : null}
            <span className="farm-shop__item-copy">
              <strong>{item.name}</strong>
              <small>{item.note}</small>
            </span>
            {item.price === undefined ? (
              <span className="farm-shop__price farm-shop__price--variable">随机</span>
            ) : (
              <span className="farm-shop__price">
                <span className="farm-visually-hidden">价格</span>
                <i aria-hidden="true" />
                {item.price}
              </span>
            )}
            <ShopCartAddButton
              disabled={item.price === undefined}
              itemName={item.name}
              onAdd={() => onChangeCartQuantity(getShopCartKey("farm", item.id), 1)}
            />
          </li>
        ))}
      </ul>
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}
