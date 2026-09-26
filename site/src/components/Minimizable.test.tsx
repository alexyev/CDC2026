import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PANELS_KEY, usePanels } from "@/lib/panels";
import { MinimizeButton, Minimizable } from "./Minimizable";

const NONE = { layers: false, command: false, insight: false, search: false, legend: false };

function renderPanel() {
  return render(
    <TooltipProvider>
      <Minimizable panel="insight" corner="top-right" restoreLabel="Show insight" chip="Insight">
        <section aria-label="Insight">
          <MinimizeButton panel="insight" label="insight" />
          <p>Panel body</p>
        </section>
      </Minimizable>
    </TooltipProvider>,
  );
}

beforeAll(() => {
  // Radix measures the focused button's tooltip with ResizeObserver, which jsdom lacks.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

beforeEach(() => {
  localStorage.clear();
  usePanels.setState({ minimized: { ...NONE } });
});

afterEach(cleanup);

describe("Minimizable", () => {
  it("folds the panel into a chip and moves focus to it", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "Show insight" })).toBeNull();
    const minimize = screen.getByRole("button", { name: "Minimize insight" });
    minimize.focus();
    fireEvent.click(minimize);

    const chip = screen.getByRole("button", { name: "Show insight" });
    expect(screen.getByText("Panel body").closest("[hidden]")).not.toBeNull();
    expect(document.activeElement).toBe(chip);
    expect(localStorage.getItem(PANELS_KEY)).toBe('["insight"]');
  });

  it("restores from the chip; a keyboard restore focuses the minimize button again", () => {
    usePanels.setState({ minimized: { ...NONE, insight: true } });
    renderPanel();
    expect(screen.getByText("Panel body").closest("[hidden]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show insight" }), { detail: 0 });
    expect(screen.queryByRole("button", { name: "Show insight" })).toBeNull();
    expect(screen.getByText("Panel body").closest("[hidden]")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Minimize insight" }));
    expect(localStorage.getItem(PANELS_KEY)).toBe("[]");
  });

  it("keeps the panel mounted while minimized", () => {
    renderPanel();
    const body = screen.getByText("Panel body");
    act(() => usePanels.getState().setMinimized("insight", true));
    act(() => usePanels.getState().setMinimized("insight", false));
    expect(screen.getByText("Panel body")).toBe(body);
  });
});
