import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundRanchRead } from "../../../auth/ranch-client";
import { FarmFieldContent } from "../../page/farm-field-content";
import { createInitialFarmReadResources } from "../../page/model";
import type { RanchInteractionActionExecutor } from "../../panels/tool-panel";
import { RanchScene, type RanchSceneAnimalDefinition } from "./ranch-scene";

const visitor: RanchSceneAnimalDefinition = {
  id: "visitor:visitor-raid",
  layout: {
    x: 50,
    y: 60,
    size: 18,
    roam: { minX: 10, maxX: 88, minY: 32, maxY: 79 },
  },
  name: "小鸡",
  placementStyle: {},
  spriteStyle: {},
  visitor: true,
  visitorRaidId: "visitor-raid",
};

const resident: RanchSceneAnimalDefinition = {
  ...visitor,
  id: "resident-chicken",
  visitor: false,
  visitorRaidId: undefined,
};

afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: true })),
  });
});

describe("RanchScene visitor interaction", () => {
  it("only lets the visible animal sprite receive pointer hits", () => {
    const onSelectAnimal = vi.fn();
    const { container } = render(
      <RanchScene
        active={false}
        animals={[resident]}
        backgroundUrl="/farm/ranch.png"
        onSelectAnimal={onSelectAnimal}
      />,
    );

    const button = screen.getByRole("button", { name: "查看牧场里的小鸡" });
    const sprite = button.querySelector(".farm-ranch-resident__portrait-sprite");
    expect(sprite).not.toBeNull();
    expect(container.querySelectorAll(".farm-ranch-resident")).toHaveLength(1);
    expect(window.getComputedStyle(button).pointerEvents).toBe("none");
    expect(window.getComputedStyle(sprite as HTMLElement).pointerEvents).toBe("auto");
    fireEvent.click(sprite as HTMLElement);

    expect(onSelectAnimal).toHaveBeenCalledTimes(1);
    expect(onSelectAnimal).toHaveBeenCalledWith("resident-chicken");
  });

  it("catches an incoming visitor by clicking its animal icon", () => {
    const onCatchVisitor = vi.fn();
    render(
      <RanchScene
        active={false}
        animals={[visitor]}
        backgroundUrl="/farm/ranch.png"
        onCatchVisitor={onCatchVisitor}
        onSelectAnimal={vi.fn()}
      />,
    );

    expect(screen.queryByText("来客")).toBeNull();
    const button = screen.getByRole("button", { name: "抓住来客小鸡" });
    const sprite = button.querySelector(".farm-ranch-resident__portrait-sprite");
    expect(sprite).not.toBeNull();
    fireEvent.click(sprite as HTMLElement);

    expect(onCatchVisitor).toHaveBeenCalledTimes(1);
    expect(onCatchVisitor).toHaveBeenCalledWith("visitor-raid");
  });

  it("shows the authority catch receipt after clicking the visitor animal", async () => {
    const ranch = ranchWithVisitor();
    const onAction = vi.fn<RanchInteractionActionExecutor>(async (input) => ({
      ok: true as const,
      data: {
        data: {
          result: {
            receipt_id: input.idempotencyKey,
            action: "catch" as const,
            outcome: {
              kind: "catch" as const,
              raid_id: "visitor-raid",
              owner: "邻居家",
              animal_name: "小鸡",
              compensation: 750,
            },
          },
          resource: ranch.data,
        },
        revision: "ranch-v1:after-catch",
        server_time: "2026-09-01T04:00:00.000Z",
      },
    }));

    renderFarmWithVisitor(ranch, onAction);
    fireEvent.click(screen.getByRole("button", { name: "牧场" }));
    fireEvent.click(await screen.findByRole("button", { name: "抓住来客小鸡" }));

    const dialog = await screen.findByRole("dialog", { name: "抓捕来客结果" });
    expect(dialog.textContent).toContain("抓住了小鸡");
    expect(dialog.textContent).toContain("来自「邻居家」");
    expect(dialog.textContent).toContain("牧场金币 +750");
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "catch", raidId: "visitor-raid" }),
    );
    expect(document.querySelector(".farm-ranch-resident__visitor-badge")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭抓捕来客结果" }));
    expect(screen.queryByRole("dialog", { name: "抓捕来客结果" })).toBeNull();
  });

  it("shows catch failures in a closable popup instead of the ranch count line", async () => {
    const ranch = ranchWithVisitor();
    const onAction = vi.fn<RanchInteractionActionExecutor>(async () => ({
      ok: false as const,
      issue: {
        code: "farm_unavailable" as const,
        currentRevision: null,
        serverMessage: "这只来客已经离开了。",
      },
    }));

    renderFarmWithVisitor(ranch, onAction);
    fireEvent.click(screen.getByRole("button", { name: "牧场" }));
    fireEvent.click(await screen.findByRole("button", { name: "抓住来客小鸡" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("这只来客已经离开了。");
    expect(screen.getByText("在场动物 0 只 · 来客 1 只").textContent).not.toContain("已经离开");
    fireEvent.click(screen.getByRole("button", { name: "关闭抓捕来客提示" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

function ranchWithVisitor() {
  return {
    data: {
      farm: { farm_doorplate: "3ET3FE" },
      balance: { status: "available", ranch_coins: 100, debt_status: "available", debt_coins: 0 },
      residents: { status: "available", animals: [], pets: [], patrol_goose: null },
      collectable: {
        status: "available",
        total_pending_count: 0,
        total_pending_meat_count: 0,
        entries: [],
      },
      wardrobe: { status: "available", items: [] },
      decorations: { status: "available", placed: [], stored: [] },
      dispatch: { status: "available", active: [] },
      scene: {
        status: "available",
        resident_count: 0,
        visitor_count: 1,
        visitors: [
          {
            status: "known",
            raid_id: "visitor-raid",
            animal_kind_id: "chicken",
            animal_name: "小鸡",
            variant: {
              variant_id: "base",
              name: "原始外观",
              atlas: null,
              set: null,
              sprite_index: null,
            },
          },
        ],
      },
      shop: {
        animals: { status: "available", shop_day: null, items: [] },
        pets: { status: "available", shop_day: null, items: [] },
        skins: { status: "available", shop_day: null, items: [] },
        accessories: { status: "unavailable", shop_day: null, items: [] },
        decorations: { status: "unavailable", shop_day: null, items: [] },
      },
    },
    revision: "ranch-v1:with-visitor",
    server_time: "2026-09-01T03:59:00.000Z",
  } as unknown as BoundRanchRead;
}

function renderFarmWithVisitor(
  ranch: ReturnType<typeof ranchWithVisitor>,
  onAction: RanchInteractionActionExecutor,
) {
  const resources = {
    ...createInitialFarmReadResources(),
    ranch: { stage: "ready" as const, data: ranch },
  };
  render(
    <FarmFieldContent
      data={
        {
          data: {
            farm: {
              farm_doorplate: "3ET3FE",
              farm_name: "渡的小农场",
              welcome_message: null,
              equipped_title: null,
            },
            balance: { farm_coins: 1_000 },
            season: { id: "summer", name: "夏" },
            weather: null,
            land: { tier: 1, name: "初土", is_max_tier: true, next_upgrade: null },
            plots: [],
            harvest_assist: {
              daily_limit: 3,
              remaining: 3,
              mature_plot_count: 0,
              can_assist: false,
              reset_at: "2026-09-02T00:00:00.000Z",
            },
          },
          revision: "field-v1:test",
          server_time: "2026-09-01T04:00:00.000Z",
        } as never
      }
      onRanchInteractionAction={onAction}
      resources={resources}
    />,
  );
}
