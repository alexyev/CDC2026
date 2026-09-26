import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GazetteerFile, SchoolsFile } from "@/lib/dataTypes";
import { MapProvider } from "@/map/MapProvider";
import { DEFAULT_VIEW, useStore } from "@/store/useStore";
import { CommandBar } from "./CommandBar";

vi.mock("@/command/resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/command/resolver")>();
  const gazetteer = (await import("@/test/fixtures/gazetteer.json")).default as GazetteerFile;
  const schools = (await import("@/test/fixtures/schools/all.json")).default as unknown as SchoolsFile;
  const resolver = actual.createResolver(gazetteer, schools);
  return { ...actual, getResolver: async () => resolver, peekResolver: () => resolver };
});

function renderBar() {
  return render(
    <TooltipProvider>
      <MapProvider>
        <CommandBar />
      </MapProvider>
    </TooltipProvider>,
  );
}

const input = () => screen.getByRole("textbox", { name: "Ask the map" });

function ask(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.keyDown(input(), { key: "Enter" });
}

describe("CommandBar", () => {
  beforeEach(() => useStore.setState({ ...DEFAULT_VIEW }));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("applies the function's intent and shows the summary chip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          intent: {
            action: "compare",
            layers: ["crime", "education"],
            places: [
              { query: "LA County", kind: "county" },
              { query: "California", kind: "state" },
            ],
          },
        }),
      ),
    );
    renderBar();
    ask("compare crime and education in LA County and California");
    expect(await screen.findByTestId("command-summary")).toHaveProperty(
      "textContent",
      "Crime × Education · Los Angeles County vs California · compare",
    );
    expect(screen.queryByText("offline parse")).toBeNull();
    const s = useStore.getState();
    expect(s.layers).toEqual(["crime", "education"]);
    expect(s.compare).toEqual({ armed: true, pins: [{ kind: "county", id: "06037" }] });
  });

  it("falls back to the local parser on a 503 and says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, error: "upstream_error" }, { status: 503 })),
    );
    renderBar();
    ask("show me poverty in Texas");
    expect((await screen.findByTestId("command-summary")).textContent).toBe("Poverty · Texas");
    expect(screen.getByText("offline parse")).toBeTruthy();
    expect(useStore.getState().selected).toEqual({ kind: "state", id: "48" });
  });

  it("shows Springfield choices and applies the one picked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    renderBar();
    ask("poverty in Springfield");
    const chips = await screen.findAllByTestId("command-choice");
    expect(chips.map((c) => c.textContent)).toEqual(["Springfield, IL", "Springfield, MO", "Springfield, MA"]);
    await act(async () => fireEvent.click(chips[0]!));
    await waitFor(() => expect(screen.getByTestId("command-summary").textContent).toBe("Poverty · Springfield, IL"));
    expect(useStore.getState().selected).toEqual({ kind: "city", id: "IL:Springfield" });
  });

  it("says when nothing matched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    renderBar();
    ask("tell me a joke");
    expect((await screen.findByTestId("command-no-match")).textContent).toBe(
      "I couldn't find a layer or place in that. Try: crime in Texas",
    );
  });

  it("focuses on ⌘K and Ctrl+K and clears on Escape", () => {
    renderBar();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(input());
    input().blur();
    fireEvent.keyDown(window, { key: "K", ctrlKey: true });
    expect(document.activeElement).toBe(input());
    fireEvent.change(input(), { target: { value: "crime" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveProperty("value", "");
  });
});
