import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRIMER_SEEN_KEY } from "@/lib/guide";
import { useStore } from "@/store/useStore";
import { Primer } from "./Primer";

beforeEach(() => {
  window.localStorage.clear();
  useStore.getState().setGuide("primer");
});
afterEach(cleanup);

describe("Primer (SPEC.md 3.15)", () => {
  it("renders nothing while the guide is closed", () => {
    useStore.getState().setGuide(null);
    render(<Primer />);
    expect(screen.queryByTestId("primer")).toBeNull();
  });

  it("says what stress means before anything else", () => {
    render(<Primer />);
    const dialog = screen.getByRole("dialog", { name: "Community stress around 23,595 US public high schools" });
    const description = document.getElementById(dialog.getAttribute("aria-describedby")!);
    expect(description?.textContent).toMatch(
      /adverse social and economic conditions in the neighborhood around each school/,
    );
    expect(description?.textContent).toMatch(
      /It is not psychological stress, and it does not measure the school or its students/,
    );
  });

  it("covers one layer, two layers, and patterns", () => {
    render(<Primer />);
    for (const name of ["What the layers measure", "Reading one layer", "Reading two layers", "Finding patterns"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    }
    expect(screen.getByRole("img", { name: "Bivariate color key" }).querySelectorAll("span.size-4")).toHaveLength(9);
  });

  it("goes to the map and remembers it was seen", () => {
    render(<Primer />);
    fireEvent.click(screen.getByRole("button", { name: "Explore the map" }));
    expect(useStore.getState().guide).toBeNull();
    expect(window.localStorage.getItem(PRIMER_SEEN_KEY)).toBe("1");
  });

  it("starts the guided tour", () => {
    render(<Primer />);
    fireEvent.click(screen.getByRole("button", { name: "Walk me through an example" }));
    expect(useStore.getState().guide).toBe("tour");
    expect(window.localStorage.getItem(PRIMER_SEEN_KEY)).toBe("1");
  });

  it("closes on Escape like the map button", () => {
    render(<Primer />);
    fireEvent.keyDown(screen.getByTestId("primer"), { key: "Escape" });
    expect(useStore.getState().guide).toBeNull();
    expect(window.localStorage.getItem(PRIMER_SEEN_KEY)).toBe("1");
  });
});
