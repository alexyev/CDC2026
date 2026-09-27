// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/store/useStore";
import { FirstRunHint } from "./FirstRunHint";

const HINT = "Scroll to zoom. Click a state to dive in. Pick two layers to see how they relate.";

const hint = () => screen.queryByTestId("first-run-hint");
const text = () => hint()?.textContent?.replace(/\s+/g, " ").trim();

beforeEach(() => {
  window.localStorage.clear();
  useStore.getState().setGuide(null);
  useStore.setState({ preset: undefined });
});
afterEach(cleanup);

describe("FirstRunHint", () => {
  it("shows the SPEC.md 3.15 copy on a first visit with no URL parameters", () => {
    render(<FirstRunHint initialSearch="" />);
    expect(text()).toBe(HINT);
    expect(screen.getByRole("button", { name: "Dismiss hint" })).toBeTruthy();
  });

  it("stays hidden when the page opens with URL parameters", () => {
    render(<FirstRunHint initialSearch="?l=crime,education" />);
    expect(hint()).toBeNull();
  });

  it.each([
    ["pointerdown", () => fireEvent.pointerDown(document.body)],
    ["wheel", () => fireEvent.wheel(window)],
    ["keydown", () => fireEvent.keyDown(window, { key: "ArrowUp" })],
    ["the close button", () => fireEvent.pointerDown(screen.getByRole("button", { name: "Dismiss hint" }))],
  ])("disappears on the first interaction (%s) and shows only once", async (_name, interact) => {
    const { unmount } = render(<FirstRunHint initialSearch="" />);
    expect(hint()).not.toBeNull();
    await act(async () => interact());
    expect(window.localStorage.getItem("schoolscape.firstRunSeen.v1")).toBe("1");
    unmount();

    render(<FirstRunHint initialSearch="" />);
    expect(hint()).toBeNull();
  });

  it("waits while the map guide is open, then shows on the map", async () => {
    act(() => useStore.getState().setGuide("primer"));
    render(<FirstRunHint initialSearch="" />);
    expect(hint()).toBeNull();
    // Interactions inside the guide do not use up the hint.
    await act(async () => fireEvent.pointerDown(document.body));
    expect(window.localStorage.getItem("schoolscape.firstRunSeen.v1")).toBeNull();

    act(() => useStore.getState().setGuide(null));
    expect(text()).toBe(HINT);
  });

  it("waits while a story is open", () => {
    act(() => useStore.setState({ preset: "where-stress-concentrates" }));
    render(<FirstRunHint initialSearch="" />);
    expect(hint()).toBeNull();
    act(() => useStore.setState({ preset: undefined }));
    expect(text()).toBe(HINT);
  });
});
