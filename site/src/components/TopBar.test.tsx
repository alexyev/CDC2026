import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MapContext } from "@/map/mapContext";
import { useStore } from "@/store/useStore";
import { TopBar } from "./TopBar";

beforeEach(() => useStore.getState().setGuide(null));
afterEach(cleanup);

describe("TopBar brand (SPEC.md 3.2)", () => {
  it("is a button that opens the landing page", () => {
    render(
      <MapContext.Provider value={{ map: null, ready: false, level: "nation", registerMap: () => {} }}>
        <TooltipProvider>
          <TopBar />
        </TooltipProvider>
      </MapContext.Provider>,
    );
    const brand = screen.getByRole("button", { name: "Schoolscape - about this map" });
    expect(brand.textContent).toBe("Schoolscape");
    fireEvent.click(brand);
    expect(useStore.getState().guide).toBe("primer");
  });
});
