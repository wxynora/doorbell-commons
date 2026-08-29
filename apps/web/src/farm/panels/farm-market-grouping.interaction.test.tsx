import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import { FarmMarketPanelContent } from "./farm-action-panels";

function catalog(): BoundFarmCatalogRead {
  return {
    market_revision: `farm-market-v1:${"a".repeat(64)}`,
    data: {
      farm: { farm_doorplate: "3ET3FE", farm_name: "真的不种了" },
      backpack: { status: "available", items: [] },
      neighborhood: {
        status: "available",
        rankings: {},
        messages: [],
        message_boards: [
          { farm_doorplate: "3ET3FE", farm_name: "真的不种了", is_own: true, status: "open", messages: [] },
          { farm_doorplate: "352HQ6", farm_name: "夏安农场", is_own: false, status: "open", messages: [] },
        ],
        original_crops: [],
      },
      market: {
        status: "available",
        listings: [
          {
            seller_farm_doorplate: "3ET3FE",
            kind: "material",
            item_id: "iron",
            identity_state: "known",
            name: "锈铁片",
            rarity: null,
            quantity: 1,
            price: 30,
          },
          {
            seller_farm_doorplate: "352HQ6",
            kind: "seed",
            item_id: "orange_tree",
            identity_state: "known",
            name: "橘子树",
            rarity: null,
            quantity: 5,
            price: 20,
          },
        ],
        barter_listings: [],
      },
    },
  } as unknown as BoundFarmCatalogRead;
}

afterEach(cleanup);

describe("FarmMarketPanelContent", () => {
  it("groups only real listings into one named card per seller farm", () => {
    const farmCatalog = catalog();
    if (farmCatalog.data.market.status !== "available") throw new Error("market fixture");
    render(<FarmMarketPanelContent farmCatalog={farmCatalog} market={farmCatalog.data.market} />);

    const own = screen.getByRole("region", { name: "真的不种了的摊位" });
    const neighbor = screen.getByRole("region", { name: "夏安农场的摊位" });
    expect(within(own).getByText("锈铁片")).toBeTruthy();
    expect(within(neighbor).getByText("橘子树")).toBeTruthy();
    expect(screen.getAllByRole("region", { name: /的摊位$/ })).toHaveLength(2);
    expect(screen.queryByText("当前没有真实摊位")).toBeNull();
  });
});
