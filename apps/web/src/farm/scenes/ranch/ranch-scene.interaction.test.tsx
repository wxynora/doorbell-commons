import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RanchScene, type RanchSceneAnimalDefinition } from "./ranch-scene";

const visitor: RanchSceneAnimalDefinition = {
  id: "visitor:visitor-raid",
  layout: {
    x: 50,
    y: 60,
    size: 18,
    roam: { minX: 10, maxX: 88, minY: 32, maxY: 79 },
  },
  name: "来客鸡",
  placementStyle: {},
  spriteStyle: {},
  visitor: true,
  visitorRaidId: "visitor-raid",
};

afterEach(cleanup);

describe("RanchScene visitor interaction", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "抓住来客来客鸡" }));

    expect(onCatchVisitor).toHaveBeenCalledTimes(1);
    expect(onCatchVisitor).toHaveBeenCalledWith("visitor-raid");
  });
});
