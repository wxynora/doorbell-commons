import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BoundKitchenRead } from "../../auth/kitchen-client";
import { KitchenInventoryPanelContent } from "./kitchen-inventory-panel";
import { CookingRecipeCatalog } from "./tools/cooking-recipe-catalog";

function kitchen(): BoundKitchenRead {
  return {
    kitchen_inventory_revision: `kitchen-inventory-v1:${"a".repeat(64)}`,
    data: {
      farm: { farm_doorplate: "3ET3FE", farm_name: "渡的小农场" },
      stacked_ingredients: {
        status: "available",
        reason: null,
        items: [
          { status: "available", ingredient_id: "egg", name: "鸡蛋", quantity: 1, reason: null },
          { status: "available", ingredient_id: "salt", name: "盐", quantity: 2, reason: null },
        ],
      },
      product_instances: {
        status: "available",
        reason: null,
        items: [
          {
            status: "available",
            product_instance_id: "lamb-1",
            product_id: "lamb",
            name: "羊肉",
            value_gold: 10,
            created_at: null,
            reason: null,
          },
        ],
      },
      fish_instances: { status: "available", reason: null, items: [] },
      treasure_items: { status: "available", reason: null, items: [] },
      tools: { status: "available", reason: null, items: [] },
      dish_instances: {
        status: "available",
        reason: null,
        items: [
          ...["dish-1", "dish-2"].map((dishId) => ({
            status: "available" as const,
            recipe_id: "fried_egg",
            dish_instance_id: dishId,
            name: "香煎蛋",
            rarity: "N" as const,
            category: "热菜",
            ingredients: [],
            method: { status: "available" as const, id: "stir_fry", name: "炒", reason: null },
            tool: { status: "available" as const, id: null, name: null, reason: null },
            reason: null,
            value_gold: 8,
            recycle_silver: 1,
            created_at: null,
          })),
          {
            status: "available",
            recipe_id: "grilled_fish",
            dish_instance_id: "dish-3",
            name: "香煎鲜鱼",
            rarity: "N",
            category: "热菜",
            ingredients: [],
            method: { status: "available", id: "stir_fry", name: "炒", reason: null },
            tool: { status: "available", id: null, name: null, reason: null },
            reason: null,
            value_gold: 10,
            recycle_silver: 1,
            created_at: null,
          },
        ],
      },
      known_recipes: {
        status: "available",
        reason: null,
        items: [
          {
            status: "available",
            recipe_id: "fried_egg",
            name: "香煎蛋",
            rarity: "N",
            category: "主食小吃",
            ingredients: [
              { status: "available", ingredient_id: "egg", name: "鸡蛋", quantity: 1, reason: null },
              { status: "available", ingredient_id: "salt", name: "盐", quantity: 1, reason: null },
            ],
            method: { status: "available", id: "stir_fry", name: "炒", reason: null },
            tool: { status: "available", id: null, name: null, reason: null },
            reason: null,
          },
          {
            status: "available",
            recipe_id: "rainbow_lamb",
            name: "彩虹玉米羊排",
            rarity: "SR",
            category: "主食小吃",
            ingredients: [
              { status: "available", ingredient_id: "lamb", name: "羊肉", quantity: 1, reason: null },
              { status: "available", ingredient_id: "rainbow_corn", name: "彩虹玉米", quantity: 1, reason: null },
              { status: "available", ingredient_id: "spice", name: "香料", quantity: 1, reason: null },
            ],
            method: { status: "available", id: "stir_fry", name: "炒", reason: null },
            tool: { status: "available", id: null, name: null, reason: null },
            reason: null,
          },
        ],
      },
    },
  } as unknown as BoundKitchenRead;
}

afterEach(cleanup);

describe("kitchen inventory presentation", () => {
  it("groups identical dish instances, keeps one sprite and names self use honestly", () => {
    render(
      <KitchenInventoryPanelContent
        kitchen={kitchen()}
        onKitchenInventoryAction={async () => {
          throw new Error("not submitted in this presentation test");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "料理" }));

    const list = screen.getByRole("list", { name: "真实料理库存" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("数量 2")).toBeTruthy();
    expect(within(list).getAllByRole("img", { name: "香煎蛋料理小图" })).toHaveLength(1);
    expect(within(list).getAllByRole("button", { name: "自己食用" })).toHaveLength(2);
    expect(within(list).queryByText("给自己")).toBeNull();
  });
});

describe("known recipe availability", () => {
  it("keeps the old recipe/missing hierarchy and only exposes quick make when stock is complete", () => {
    render(
      <CookingRecipeCatalog
        kitchen={kitchen()}
        onQuickMake={() => undefined}
        preview={false}
        selectedIngredientIds={[]}
      />,
    );

    const friedEgg = screen.getByText("香煎蛋").closest("li");
    const rainbowLamb = screen.getByText("彩虹玉米羊排").closest("li");
    expect(friedEgg).not.toBeNull();
    expect(rainbowLamb).not.toBeNull();
    expect(within(friedEgg as HTMLElement).getByText("配方：鸡蛋×1、盐×1")).toBeTruthy();
    expect(within(friedEgg as HTMLElement).getByRole("button", { name: "香煎蛋一键制作" })).toBeTruthy();
    expect(
      within(rainbowLamb as HTMLElement).getByText("缺少：彩虹玉米×1、香料×1"),
    ).toBeTruthy();
    expect(within(rainbowLamb as HTMLElement).queryByRole("button")).toBeNull();
  });
});
