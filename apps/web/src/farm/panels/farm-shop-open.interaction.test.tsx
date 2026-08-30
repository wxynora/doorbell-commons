import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import { FarmShopPanelContent } from "./shop-panel";

function catalog(items: unknown[] = []): BoundFarmCatalogRead {
  return {
    data: {
      shop: {
        status: "available",
        initialized: true,
        revision: `farm-catalog-v1:${"a".repeat(64)}`,
        refreshed_at: "2026-08-30T04:00:00.000Z",
        next_refresh_at: "2026-08-30T08:00:00.000Z",
        items,
      },
    },
  } as unknown as BoundFarmCatalogRead;
}

afterEach(cleanup);

describe("Farm field shop opening state", () => {
  it("shows an honest current empty draw instead of a blank panel", () => {
    render(
      <FarmShopPanelContent
        activeScene="field"
        cart={{}}
        farmCatalog={catalog()}
        farmShopOpenFeedback={{ stage: "success" }}
        onChangeCartQuantity={() => undefined}
        preview={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "今日商店" }));
    expect(screen.getByText("本轮暂无随机商品")).toBeTruthy();
    expect(screen.getByText("常备种子和加速药水在“种子与药水”。")).toBeTruthy();
  });

  it("keeps refresh failure visible and lets the same action retry", () => {
    const retry = vi.fn();
    render(
      <FarmShopPanelContent
        activeScene="field"
        cart={{}}
        farmCatalog={catalog()}
        farmShopOpenFeedback={{ stage: "error", message: "现在连不上农场商店" }}
        onChangeCartQuantity={() => undefined}
        onRetryFarmShopOpen={retry}
        preview={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "今日商店" }));
    expect(screen.getByRole("alert").textContent).toContain("现在连不上农场商店");
    expect(screen.queryByText("本轮暂无随机商品")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps initial catalog failure retryable before a shelf exists", () => {
    const retry = vi.fn();
    render(
      <FarmShopPanelContent
        activeScene="field"
        cart={{}}
        farmCatalog={null}
        farmShopOpenFeedback={{ stage: "error", message: "农场目录暂时不可用" }}
        onChangeCartQuantity={() => undefined}
        onRetryFarmShopOpen={retry}
        preview={false}
      />,
    );

    expect(screen.getByText("农场目录暂时不可用")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps permanent items out of the current random shelf", () => {
    render(
      <FarmShopPanelContent
        activeScene="field"
        cart={{}}
        farmCatalog={catalog([
          {
            kind: "seed",
            item_id: "common",
            identity_state: "known",
            name: "普通种子",
            rarity: null,
            price: 8,
            currency: "gold",
            quantity: null,
            available_quantity: null,
            daily_limit: null,
            purchased_today: null,
            condition: null,
            source: "permanent",
          },
        ])}
        farmShopOpenFeedback={{ stage: "success" }}
        onChangeCartQuantity={() => undefined}
        preview={false}
      />,
    );

    expect(screen.getByText("普通种子")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "今日商店" }));
    expect(screen.queryByText("普通种子")).toBeNull();
    expect(screen.getByText("本轮暂无随机商品")).toBeTruthy();
  });
});
