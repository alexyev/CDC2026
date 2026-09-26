import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presetsFixture from "@/test/fixtures/presets.json";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_VIEW, useStore } from "@/store/useStore";
import { LayerDock } from "./LayerDock";
import { CONTEXT_NOTE, COUNTY_BADGE_NOTE } from "./layerDockModel";

vi.mock("@/lib/loaders", () => ({
  load: vi.fn(async (key: string) => {
    if (key === "presets") return presetsFixture;
    throw new Error(`unexpected load(${key})`);
  }),
}));

const chip = (id: string) => document.querySelector<HTMLButtonElement>(`[data-layer="${id}"]`)!;
const layers = () => useStore.getState().layers;
const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...init }));
  });

async function renderDock() {
  render(
    <TooltipProvider>
      <LayerDock />
    </TooltipProvider>,
  );
  await screen.findByRole("button", { name: "Where stress concentrates" });
}

beforeEach(() => {
  useStore.setState({ ...DEFAULT_VIEW, hovered: null });
});

afterEach(cleanup);

describe("LayerDock", () => {
  it("renders the seven primary chips, both lists, the display toggle, and five presets", async () => {
    await renderDock();
    expect(screen.getByTestId("slot-layer-dock")).toBeTruthy();
    for (const id of ["composite", "economic", "education", "health", "housing", "crime", "gini"]) {
      expect(chip(id)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Indicators/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: /Context \(not in the index\)/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Score" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "National percentile" })).toBeTruthy();
    expect(document.querySelectorAll("[data-preset]")).toHaveLength(5);
  });

  it("shows the county badge on the eight county-level chips and the context note", async () => {
    await renderDock();
    const badged = [...document.querySelectorAll("[data-testid=county-badge]")].map(
      (b) => b.closest<HTMLElement>("[data-layer]")!.dataset.layer,
    );
    expect(badged.sort()).toEqual(
      [
        "crime",
        "gini",
        "unemployment",
        "single_parent",
        "infant_mortality",
        "low_birth_weight",
        "violent_crime",
        "incarceration",
      ].sort(),
    );
    const note = document.getElementById(chip("crime").getAttribute("aria-describedby")!)!;
    expect(note.textContent).toBe(COUNTY_BADGE_NOTE);
    expect(chip("composite").getAttribute("aria-describedby")).toBeNull();
    expect(screen.getByText(CONTEXT_NOTE)).toBeTruthy();
  });

  it("follows the A/B selection model on clicks", async () => {
    await renderDock();
    expect(layers()).toEqual(["composite"]);
    expect(within(chip("composite")).getByText("A", { selector: "[data-slot-mark]" })).toBeTruthy();

    fireEvent.click(chip("education"));
    expect(layers()).toEqual(["composite", "education"]);
    expect(chip("education").getAttribute("aria-pressed")).toBe("true");
    expect(within(chip("education")).getByText("B", { selector: "[data-slot-mark]" })).toBeTruthy();

    fireEvent.click(chip("poverty"));
    expect(layers()).toEqual(["composite", "poverty"]);

    fireEvent.click(chip("poverty"));
    expect(layers()).toEqual(["composite"]);

    fireEvent.click(chip("ctx_hispanic"));
    fireEvent.click(chip("composite"));
    expect(layers()).toEqual(["ctx_hispanic"]);
    expect(chip("composite").getAttribute("aria-pressed")).toBe("false");
  });

  it("clears the preset tag when the visitor changes layers", async () => {
    useStore.setState({ layers: ["crime", "education"], preset: "crime-scale" });
    await renderDock();
    expect(document.querySelector('[data-preset="crime-scale"]')!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip("education"));
    expect(useStore.getState().preset).toBeUndefined();
    expect(document.querySelector('[data-preset="crime-scale"]')!.getAttribute("aria-pressed")).toBe("false");
  });

  it("sets A with 1 to 7 and B with Shift, but not while typing", async () => {
    await renderDock();
    press("Digit3");
    expect(layers()).toEqual(["education"]);
    press("Digit6", { shiftKey: true, key: "^" });
    expect(layers()).toEqual(["education", "crime"]);
    press("Digit2");
    expect(layers()).toEqual(["economic", "crime"]);

    const input = document.body.appendChild(document.createElement("input"));
    press("Digit1", {}, input);
    expect(layers()).toEqual(["economic", "crime"]);
    input.remove();

    press("Digit1", { metaKey: true });
    expect(layers()).toEqual(["economic", "crime"]);
  });

  it("switches the display between score and national percentile", async () => {
    await renderDock();
    fireEvent.click(screen.getByRole("button", { name: "National percentile" }));
    expect(useStore.getState().display).toBe("pct");
    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    expect(useStore.getState().display).toBe("score");
  });

  it("dispatches a preset's full view state", async () => {
    useStore.setState({ favorites: ["060000000001"], profile: "010000500871" });
    await renderDock();
    fireEvent.click(screen.getByRole("button", { name: "North vs south California" }));
    const s = useStore.getState();
    expect(s.layers).toEqual(["housing", "economic"]);
    expect(s.compare.pins.map((p) => p.id)).toEqual(["06075", "06037"]);
    expect(s.camera).toEqual({ zoom: 5.6, lat: 36.2, lon: -120.3 });
    expect(s.preset).toBe("california-north-south");
    expect(s.profile).toBeUndefined();
    expect(s.favorites).toEqual(["060000000001"]);
    expect(document.querySelector('[data-preset="california-north-south"]')!.getAttribute("aria-pressed")).toBe("true");
  });

  it("opens the section that holds an active layer and shows its mark when collapsed", async () => {
    useStore.setState({ layers: ["composite", "violent_crime"] });
    await renderDock();
    const indicators = screen.getByRole("button", { name: /Indicators/ });
    expect(indicators.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(indicators);
    expect(indicators.getAttribute("aria-expanded")).toBe("false");
    expect(within(indicators).getByText("B")).toBeTruthy();
  });
});
