// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presetsFixture from "@/test/fixtures/presets.json";
import { PRIMER_SEEN_KEY } from "@/lib/guide";
import { useStore } from "@/store/useStore";
import { Primer } from "./Primer";

vi.mock("@/lib/loaders", () => ({
  load: vi.fn(async (key: string) => {
    if (key === "presets") return presetsFixture;
    throw new Error(`unexpected load(${key})`);
  }),
}));

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

  it("keeps the guide to reading the map behind a disclosure", () => {
    render(<Primer />);
    const toggle = screen.getByRole("button", { name: "How to read the map" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    for (const name of ["What the layers measure", "Reading one layer", "Reading two layers", "Finding patterns"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeTruthy();
    }
    expect(screen.getByRole("img", { name: "Bivariate color key" }).querySelectorAll("span.size-4")).toHaveLength(9);
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)?.textContent).toMatch(
      /Gini index:.*higher means more inequality/,
    );
  });

  it("goes to the map and remembers it was seen", () => {
    render(<Primer />);
    fireEvent.click(screen.getByRole("button", { name: "Take me there" }));
    expect(useStore.getState().guide).toBeNull();
    expect(window.localStorage.getItem(PRIMER_SEEN_KEY)).toBe("1");
  });

  it("starts the guided tour", () => {
    render(<Primer />);
    fireEvent.click(screen.getByRole("button", { name: "Walk me through an example" }));
    expect(useStore.getState().guide).toBe("tour");
    expect(window.localStorage.getItem(PRIMER_SEEN_KEY)).toBe("1");
  });

  it("is a full-page landing, not a card over the map", () => {
    render(<Primer />);
    expect(screen.getByTestId("primer").className).toMatch(/\bfixed inset-0\b/);
    expect(screen.queryByTestId("primer-overlay")).toBeNull();
  });

  it("starts the stories from the first one", async () => {
    const applyPreset = vi.fn();
    const original = useStore.getState().applyPreset;
    useStore.setState({ applyPreset });
    render(<Primer />);
    fireEvent.click(screen.getByRole("button", { name: "Tell me the story" }));
    expect(useStore.getState().guide).toBeNull();
    expect(window.localStorage.getItem(PRIMER_SEEN_KEY)).toBe("1");
    await waitFor(() => expect(applyPreset).toHaveBeenCalledWith("where-stress-concentrates"));
    useStore.setState({ applyPreset: original });
  });

  it("closes on Escape like the map button", () => {
    render(<Primer />);
    fireEvent.keyDown(screen.getByTestId("primer"), { key: "Escape" });
    expect(useStore.getState().guide).toBeNull();
    expect(window.localStorage.getItem(PRIMER_SEEN_KEY)).toBe("1");
  });
});
