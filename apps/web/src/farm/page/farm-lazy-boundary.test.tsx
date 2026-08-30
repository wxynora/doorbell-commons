import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FarmLazyBoundary, FarmLazyFailure, FarmLazyLoading } from "./farm-lazy-boundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function BrokenLazySurface(): never {
  throw new TypeError("Failed to fetch dynamically imported module");
}

describe("Farm lazy loading protection", () => {
  it("keeps the surrounding page mounted when a lazy Farm surface fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onDismiss = vi.fn();

    render(
      <main>
        <span>社区页面仍在</span>
        <FarmLazyBoundary
          fallback={<FarmLazyFailure label="农场状态仍然保留。" onDismiss={onDismiss} />}
        >
          <BrokenLazySurface />
        </FarmLazyBoundary>
      </main>,
    );

    expect(screen.getByText("社区页面仍在")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("农场状态仍然保留");
    fireEvent.click(screen.getByRole("button", { name: "返回铃野" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows a visible loading status instead of an empty suspense fallback", () => {
    render(<FarmLazyLoading label="正在打开商店" />);
    expect(screen.getByRole("status").textContent).toContain("正在打开商店");
  });
});
