import { useState } from "react";
import type { BoundRanchRead } from "../../../auth/ranch-client";
import { getFarmAssetUrl } from "../../farm-asset-manifest";
import { getRanchAnimalPlacementStyle, RANCH_SHOP_ANIMALS } from "../ranch-animal-data";
import {
  type FarmCartCheckoutFeedback,
  type FarmCartCheckoutLine,
  getLiveRanchShopItems,
  getShopCartKey,
  type ShopCartQuantities,
} from "./model";
import {
  RanchShopAnimalSprite,
  ShopCartPanelContent,
  ShopCartSelectionBadge,
  ShopCartShortcut,
} from "./shared";

function RanchLiveShopPanelContent({
  cart,
  farmCheckoutFeedback,
  onChangeCartQuantity,
  onCheckoutFarmCart,
  onRetryFarmCheckout,
  ranch,
}: {
  cart: ShopCartQuantities;
  farmCheckoutFeedback?: FarmCartCheckoutFeedback | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onCheckoutFarmCart?: ((items: FarmCartCheckoutLine[]) => void) | undefined;
  onRetryFarmCheckout?: (() => void) | undefined;
  ranch?: BoundRanchRead | null | undefined;
}) {
  const [shopSection, setShopSection] = useState<"animals" | "pets">("animals");
  const [cartOpen, setCartOpen] = useState(false);
  const items = getLiveRanchShopItems(ranch).filter((item) => item.section === shopSection);

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        farmCheckoutFeedback={farmCheckoutFeedback}
        liveResources={{ ranch }}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        onCheckoutFarmCart={onCheckoutFarmCart}
        onRetryFarmCheckout={onRetryFarmCheckout}
        sceneId="ranch"
      />
    );
  }

  if (
    !ranch ||
    (ranch.data.shop.animals.status !== "available" && ranch.data.shop.pets.status !== "available")
  ) {
    return (
      <div className="farm-shop__unavailable">
        <img alt="" aria-hidden="true" src={getFarmAssetUrl("panel.tool.shop")} />
        <strong>牧场商店数据尚未接入</strong>
        <span>当前页面不会显示示例动物。</span>
      </div>
    );
  }

  return (
    <section aria-label="牧场商店" className="ranch-shop">
      <nav aria-label="牧场商店分类" className="farm-shop__categories">
        {(
          [
            ["animals", "动物"],
            ["pets", "宠物"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={shopSection === id}
            key={id}
            onClick={() => setShopSection(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <ul className="ranch-shop__grid">
        {items.map((item) => {
          const cartKey = getShopCartKey("ranch", item.id);
          const quantity = cart[cartKey] ?? 0;
          const purchasable =
            item.owned === false && item.availableQuantity !== null && item.availableQuantity > 0;
          const unavailableLabel =
            item.owned === null || item.availableQuantity === null
              ? "购买状态不可用"
              : "暂不可购买";
          return (
            <li key={item.id}>
              <button
                aria-label={
                  item.owned === true
                    ? `${item.name}已拥有`
                    : purchasable
                      ? `将${item.name}加入购物车`
                      : `${item.name}${unavailableLabel}`
                }
                className="ranch-shop__product-button"
                disabled={!purchasable}
                onClick={() =>
                  onChangeCartQuantity(cartKey, 1, Math.min(1, item.availableQuantity ?? 0))
                }
                type="button"
              >
                <span className="ranch-shop__portrait">
                  <span
                    className="ranch-shop__portrait-sprite"
                    style={getRanchAnimalPlacementStyle(item.animal)}
                  >
                    <RanchShopAnimalSprite animal={item.animal} />
                  </span>
                  <strong>{item.name}</strong>
                </span>
              </button>
              <span className="ranch-shop__price">
                {item.owned === true ? (
                  "已拥有"
                ) : purchasable ? (
                  <>
                    <i aria-hidden="true" />
                    {item.price.toLocaleString("zh-CN")}
                  </>
                ) : (
                  unavailableLabel
                )}
              </span>
              <ShopCartSelectionBadge
                itemName={item.name}
                onRemove={() => onChangeCartQuantity(cartKey, -1, 1)}
                quantity={quantity}
              />
            </li>
          );
        })}
      </ul>
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}

export function RanchShopPanelContent({
  cart,
  farmCheckoutFeedback,
  onChangeCartQuantity,
  onCheckoutFarmCart,
  onRetryFarmCheckout,
  preview,
  ranch,
}: {
  cart: ShopCartQuantities;
  farmCheckoutFeedback?: FarmCartCheckoutFeedback | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onCheckoutFarmCart?: ((items: FarmCartCheckoutLine[]) => void) | undefined;
  onRetryFarmCheckout?: (() => void) | undefined;
  preview: boolean;
  ranch?: BoundRanchRead | null | undefined;
}) {
  const [shopSection, setShopSection] = useState<"animals" | "pets">("animals");
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const selectedAnimal = RANCH_SHOP_ANIMALS.find((animal) => animal.id === selectedAnimalId);
  const sectionAnimals = RANCH_SHOP_ANIMALS.filter((animal) => animal.shopSection === shopSection);

  if (!preview) {
    return (
      <RanchLiveShopPanelContent
        cart={cart}
        farmCheckoutFeedback={farmCheckoutFeedback}
        onChangeCartQuantity={onChangeCartQuantity}
        onCheckoutFarmCart={onCheckoutFarmCart}
        onRetryFarmCheckout={onRetryFarmCheckout}
        ranch={ranch}
      />
    );
  }

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        sceneId="ranch"
      />
    );
  }

  if (selectedAnimal) {
    return (
      <section aria-label={`${selectedAnimal.name}详情`} className="ranch-shop ranch-shop--detail">
        <button
          aria-label="返回牧场商店"
          className="ranch-shop__back"
          onClick={() => setSelectedAnimalId(null)}
          type="button"
        >
          ‹
        </button>
        <div className="ranch-shop__detail-head">
          <RanchShopAnimalSprite animal={selectedAnimal} />
          <div>
            <h3>{selectedAnimal.name}</h3>
            <span className="ranch-shop__category">{selectedAnimal.category}</span>
            {selectedAnimal.description ? <p>{selectedAnimal.description}</p> : null}
          </div>
        </div>
        <dl className="ranch-shop__facts">
          {selectedAnimal.produce ? (
            <div className="ranch-shop__fact">
              <dt>产物</dt>
              <dd>{selectedAnimal.produce}</dd>
            </div>
          ) : null}
          {selectedAnimal.produceEveryTicks ? (
            <div className="ranch-shop__fact">
              <dt>产出周期</dt>
              <dd>{selectedAnimal.produceEveryTicks} 个农场周期</dd>
            </div>
          ) : null}
          {selectedAnimal.producePrice ? (
            <div className="ranch-shop__fact">
              <dt>回收价</dt>
              <dd>{selectedAnimal.producePrice.toLocaleString("zh-CN")} 金币／份</dd>
            </div>
          ) : null}
          {selectedAnimal.effectLabel ? (
            <div className="ranch-shop__fact">
              <dt>作用</dt>
              <dd>{selectedAnimal.effectLabel}</dd>
            </div>
          ) : null}
          {selectedAnimal.effectText ? (
            <div className="ranch-shop__fact ranch-shop__fact--description">
              <dt>效果</dt>
              <dd>{selectedAnimal.effectText}</dd>
            </div>
          ) : null}
          {!selectedAnimal.demoOwned ? (
            <div className="ranch-shop__fact">
              <dt>入手成本</dt>
              <dd>{selectedAnimal.buyCost.toLocaleString("zh-CN")} 金币</dd>
            </div>
          ) : null}
          <div className="ranch-shop__fact">
            <dt>解锁条件</dt>
            <dd>{selectedAnimal.unlockCondition}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section aria-label="牧场商店" className="ranch-shop">
      <nav aria-label="牧场商店分类" className="farm-shop__categories">
        {(
          [
            ["animals", "动物"],
            ["pets", "宠物"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={shopSection === id}
            key={id}
            onClick={() => {
              setShopSection(id);
              setSelectedAnimalId(null);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <ul className="ranch-shop__grid">
        {sectionAnimals.map((animal) => {
          const cartKey = getShopCartKey("ranch", animal.id);
          const quantity = cart[cartKey] ?? 0;
          return (
            <li key={animal.id}>
              <button
                aria-label={
                  animal.demoOwned ? `查看${animal.name}详情` : `将${animal.name}加入购物车`
                }
                className="ranch-shop__product-button"
                onClick={() => {
                  if (animal.demoOwned) {
                    setSelectedAnimalId(animal.id);
                    return;
                  }
                  onChangeCartQuantity(cartKey, 1, 1);
                }}
                type="button"
              >
                <span className="ranch-shop__portrait">
                  <span
                    className="ranch-shop__portrait-sprite"
                    style={getRanchAnimalPlacementStyle(animal)}
                  >
                    <RanchShopAnimalSprite animal={animal} />
                  </span>
                  <strong>{animal.name}</strong>
                </span>
              </button>
              <span className="ranch-shop__price">
                {animal.demoOwned ? (
                  "已拥有"
                ) : (
                  <>
                    <i aria-hidden="true" />
                    {animal.buyCost.toLocaleString("zh-CN")}
                  </>
                )}
              </span>
              <ShopCartSelectionBadge
                itemName={animal.name}
                onRemove={() => onChangeCartQuantity(cartKey, -1, 1)}
                quantity={quantity}
              />
            </li>
          );
        })}
      </ul>
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}
