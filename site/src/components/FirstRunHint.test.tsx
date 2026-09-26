import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FirstRunHint } from "./FirstRunHint";

const HINT = "Scroll to zoom. Click a state to dive in. Pick two layers to see how they relate.";

const hint = () => screen.queryByTestId("first-run-hint");
const text = () => hint()?.textContent?.replace(/\s+/g, " ").trim();

beforeEach(() => window.localStorage.clear());
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
});
