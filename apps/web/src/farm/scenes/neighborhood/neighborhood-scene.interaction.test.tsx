import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import { NeighborhoodScene } from "./neighborhood-scene";

const OPTIONS = [
  { id: "ranking", label: "排行榜" },
  { id: "message-board", label: "留言板" },
  { id: "original-crops", label: "原创作物" },
] as const;

const RANKING_IDS = [
  "wealth",
  "collection",
  "diligence",
  "kindness",
  "thief",
  "land",
  "todayTasks",
  "todayLogins",
  "todayMessages",
  "todayEvents",
  "todayRaidIncome",
  "todayRaidLoss",
] as const;

function catalog(): BoundFarmCatalogRead {
  const rankings = Object.fromEntries(
    RANKING_IDS.map((id, index) => [
      id,
      [
        {
          farm_doorplate: "ABC234",
          farm_name: `${id}农场`,
          value: index + 1,
          equipped_title: id === "wealth" ? "小麦大王" : null,
        },
      ],
    ]),
  );
  return {
    data: {
      farm: { farm_doorplate: "3ET3FE", farm_name: "渡的小农场" },
      neighborhood: {
        status: "available",
        rankings,
        messages: [],
        message_boards: [
          {
            farm_doorplate: "3ET3FE",
            farm_name: "渡的小农场",
            is_own: true,
            status: "open",
            messages: [
              {
                id: "message-own",
                author_farm_doorplate: "ABC234",
                author_name: "邻居",
                text: "来看看吧",
                at: "2026-08-30T02:00:00.000Z",
              },
            ],
          },
          {
            farm_doorplate: "ABC234",
            farm_name: "邻居农场",
            is_own: false,
            status: "open",
            messages: [],
          },
          {
            farm_doorplate: "CDE456",
            farm_name: "关门农场",
            is_own: false,
            status: "closed",
            messages: [],
          },
        ],
        original_crops: [
          {
            crop_id: "hot-2",
            identity_state: "known",
            name: "第二名花",
            designer_name: "乙农场",
            buyers: 8,
            banned: false,
          },
          {
            crop_id: "hot-1",
            identity_state: "known",
            name: "第一名花",
            designer_name: "甲农场",
            buyers: 12,
            banned: false,
          },
          {
            crop_id: "banned",
            identity_state: "known",
            name: "已下架花",
            designer_name: "丙农场",
            buyers: 99,
            banned: true,
          },
          {
            crop_id: "no-buyers",
            identity_state: "known",
            name: "还没人买花",
            designer_name: "丁农场",
            buyers: 0,
            banned: false,
          },
        ],
      },
    },
  } as unknown as BoundFarmCatalogRead;
}

afterEach(cleanup);

describe("NeighborhoodScene live rankings", () => {
  it("renders every legacy cumulative and daily board with its original name and unit", () => {
    render(
      <NeighborhoodScene
        emptyLabels={{}}
        farmCatalog={catalog()}
        options={OPTIONS}
        preview={false}
        shellUrl="/farm/neighborhood-shell.png"
      />,
    );

    expect(screen.getByRole("heading", { name: "总榜（累计）" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "今日榜（每天 0 点归零，新人同台）" }),
    ).toBeTruthy();

    const expectedBoards = [
      ["财富榜", "1 金"],
      ["收集榜", "2 种"],
      ["勤劳榜", "3 株"],
      ["热心榜", "4 次"],
      ["大盗榜", "5 次"],
      ["土地榜", "6 阶"],
      ["卷王榜", "7 个"],
      ["网瘾榜", "8 次"],
      ["热情榜", "9 次"],
      ["奇遇榜", "10 次"],
      ["摸金榜", "11 金"],
      ["漏财榜", "-12 金"],
    ] as const;
    for (const [label, value] of expectedBoards) {
      const board = screen.getByRole("region", { name: label });
      expect(within(board).getByText(value)).toBeTruthy();
    }
    expect(
      within(screen.getByRole("region", { name: "财富榜" })).getByText("✧小麦大王✧"),
    ).toBeTruthy();
  });

  it(
    "derives the original-crop hot board from real buyer counts and excludes zero or banned crops",
    () => {
      render(
        <NeighborhoodScene
          emptyLabels={{}}
          farmCatalog={catalog()}
          options={OPTIONS}
          preview={false}
          shellUrl="/farm/neighborhood-shell.png"
        />,
      );

      const hotBoard = screen.getByRole("region", { name: "原创热门榜" });
      const rows = within(hotBoard).getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(rows[0]?.textContent).toContain("第一名花");
      expect(rows[0]?.textContent).toContain("12 人买过");
      expect(rows[1]?.textContent).toContain("第二名花");
      expect(within(hotBoard).queryByText("已下架花")).toBeNull();
      expect(within(hotBoard).queryByText("还没人买花")).toBeNull();
    },
  );

  it("keeps every board visible with the legacy empty labels when nobody has ranked", () => {
    const emptyCatalog = catalog();
    if (emptyCatalog.data.neighborhood.status === "available") {
      emptyCatalog.data.neighborhood.rankings = {};
      emptyCatalog.data.neighborhood.original_crops = [];
    }

    render(
      <NeighborhoodScene
        emptyLabels={{}}
        farmCatalog={emptyCatalog}
        options={OPTIONS}
        preview={false}
        shellUrl="/farm/neighborhood-shell.png"
      />,
    );

    expect(screen.getAllByText("还没有上榜的")).toHaveLength(12);
    expect(screen.getByText("还没有热卖的原创")).toBeTruthy();
  });
});

describe("NeighborhoodScene message boards", () => {
  it("lets the player choose an available public farm before enabling message input", () => {
    render(
      <NeighborhoodScene
        emptyLabels={{}}
        farmCatalog={catalog()}
        onMessageAction={async () => {
          throw new Error("not submitted in this operability test");
        }}
        options={OPTIONS}
        preview={false}
        shellUrl="/farm/neighborhood-shell.png"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "留言板" }));
    fireEvent.click(screen.getByText("写留言"));

    const target = screen.getByRole("combobox", { name: "选择留言目标农场" });
    const body = screen.getByRole("textbox", { name: "留言内容" });
    const submit = screen.getByRole("button", { name: "发送留言" });
    expect((target as HTMLSelectElement).disabled).toBe(false);
    expect((body as HTMLTextAreaElement).disabled).toBe(true);
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(target, { target: { value: "ABC234" } });
    expect((body as HTMLTextAreaElement).disabled).toBe(false);
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(body, { target: { value: "来串门啦" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps one horizontal card per real farm and moves compose behind a secondary disclosure", () => {
    render(
      <NeighborhoodScene
        emptyLabels={{}}
        farmCatalog={catalog()}
        onMessageAction={async () => {
          throw new Error("not submitted in this layout test");
        }}
        options={OPTIONS}
        preview={false}
        shellUrl="/farm/neighborhood-shell.png"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "留言板" }));

    const ownBoard = screen.getByRole("article", { name: "我的留言板" });
    const neighborBoard = screen.getByRole("article", { name: "邻居农场的留言板" });
    const closedBoard = screen.getByRole("article", { name: "关门农场的留言板" });
    expect(within(ownBoard).getByText("来看看吧")).toBeTruthy();
    expect(within(neighborBoard).getByText("还没有访客留言")).toBeTruthy();
    expect(within(closedBoard).getByText("留言板已关闭")).toBeTruthy();
    expect(screen.getByText("写留言")).toBeTruthy();
    expect(screen.getByRole("option", { name: "邻居农场 · ABC234" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /关门农场/ })).toBeNull();
  });
});
