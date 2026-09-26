import { describe, expect, it } from "vitest";
import presetsFixture from "@/test/fixtures/presets.json";
import type { PresetsFile } from "@/lib/dataTypes";
import {
  CONTEXT_LAYERS,
  INDICATOR_DOMAINS,
  PRIMARY_LAYERS,
  clearLayerB,
  isPresetActive,
  isTypingTarget,
  layerKeyAction,
  presetView,
  setLayerA,
  setLayerB,
  toggleLayer,
} from "./layerDockModel";

const presets = (presetsFixture as unknown as PresetsFile).presets;
const preset = (id: string) => presets.find((p) => p.id === id)!;
const key = (code: string, mods: Partial<Record<"shiftKey" | "metaKey" | "ctrlKey" | "altKey", boolean>> = {}) => ({
  code,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

describe("catalog tiers", () => {
  it("has seven primary chips in SPEC.md 3.6 order", () => {
    expect(PRIMARY_LAYERS.map((l) => l.label)).toEqual([
      "Composite Score",
      "Economic",
      "Education",
      "Health",
      "Housing",
      "Crime",
      "Gini index",
    ]);
  });

  it("groups the 20 indicators by domain and lists the 8 context shares", () => {
    expect(INDICATOR_DOMAINS.map((d) => [d.domain, d.layers.length])).toEqual([
      ["economic", 4],
      ["education", 6],
      ["health", 5],
      ["housing", 3],
      ["crime", 2],
    ]);
    expect(CONTEXT_LAYERS).toHaveLength(8);
  });

  it("marks exactly the eight county-level columns", () => {
    const county = [...PRIMARY_LAYERS, ...INDICATOR_DOMAINS.flatMap((d) => d.layers), ...CONTEXT_LAYERS]
      .filter((l) => l.resolution === "county")
      .map((l) => l.label)
      .sort();
    expect(county).toEqual(
      [
        "Crime",
        "Violent crime rate",
        "Incarceration rate",
        "Infant mortality rate",
        "Low birth weight",
        "Single-parent households",
        "Unemployment",
        "Gini index",
      ].sort(),
    );
  });
});

describe("toggleLayer (chip clicks, SPEC.md 3.6)", () => {
  it("sets A on the first click", () => {
    expect(toggleLayer([], "crime")).toEqual(["crime"]);
  });

  it("sets B on a click on another layer, turning on bivariate mode", () => {
    expect(toggleLayer(["composite"], "education")).toEqual(["composite", "education"]);
  });

  it("removes B when B is clicked again", () => {
    expect(toggleLayer(["composite", "education"], "education")).toEqual(["composite"]);
  });

  it("promotes B to A when A is clicked while B exists", () => {
    expect(toggleLayer(["composite", "education"], "composite")).toEqual(["education"]);
  });

  it("replaces B when a third layer is clicked, keeping at most two", () => {
    expect(toggleLayer(["composite", "education"], "poverty")).toEqual(["composite", "poverty"]);
  });

  it("keeps a lone A when it is clicked", () => {
    const layers = ["composite"] as ["composite"];
    expect(toggleLayer(layers, "composite")).toBe(layers);
  });
});

describe("setLayerA / setLayerB / clearLayerB", () => {
  it("sets A and keeps B", () => {
    expect(setLayerA(["composite", "education"], "health")).toEqual(["health", "education"]);
    expect(setLayerA(["composite"], "health")).toEqual(["health"]);
    expect(setLayerA([], "health")).toEqual(["health"]);
  });

  it("swaps when A is set to the current B", () => {
    expect(setLayerA(["composite", "education"], "education")).toEqual(["education", "composite"]);
  });

  it("sets B, and swaps when B is set to the current A", () => {
    expect(setLayerB(["composite"], "crime")).toEqual(["composite", "crime"]);
    expect(setLayerB(["composite", "education"], "crime")).toEqual(["composite", "crime"]);
    expect(setLayerB(["composite", "education"], "composite")).toEqual(["education", "composite"]);
  });

  it("leaves a lone A alone when B is set to it, and makes B the A when there is none", () => {
    const layers = ["composite"] as ["composite"];
    expect(setLayerB(layers, "composite")).toBe(layers);
    expect(setLayerB([], "crime")).toEqual(["crime"]);
  });

  it("clears B", () => {
    expect(clearLayerB(["composite", "education"])).toEqual(["composite"]);
    expect(clearLayerB([])).toEqual([]);
  });
});

describe("layerKeyAction (SPEC.md 3.14)", () => {
  it("maps 1 to 7 to the primary chips as A", () => {
    expect(layerKeyAction(key("Digit1"))).toEqual({ slot: "A", id: "composite" });
    expect(layerKeyAction(key("Digit7"))).toEqual({ slot: "A", id: "gini" });
    expect(layerKeyAction(key("Numpad3"))).toEqual({ slot: "A", id: "education" });
  });

  it("maps Shift variants to B, whatever character the layout produces", () => {
    expect(layerKeyAction(key("Digit6", { shiftKey: true }))).toEqual({ slot: "B", id: "crime" });
  });

  it("ignores other keys and modified chords", () => {
    expect(layerKeyAction(key("Digit8"))).toBeNull();
    expect(layerKeyAction(key("Digit0"))).toBeNull();
    expect(layerKeyAction(key("KeyC"))).toBeNull();
    expect(layerKeyAction(key("Digit1", { metaKey: true }))).toBeNull();
    expect(layerKeyAction(key("Digit1", { ctrlKey: true }))).toBeNull();
    expect(layerKeyAction(key("Digit1", { altKey: true }))).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("is true for text inputs, textareas, selects, and editable content", () => {
    const text = document.createElement("input");
    const search = Object.assign(document.createElement("input"), { type: "search" });
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    for (const el of [text, search, document.createElement("textarea"), document.createElement("select"), editable]) {
      expect(isTypingTarget(el)).toBe(true);
    }
  });

  it("is false for buttons, checkboxes, and non-elements", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(Object.assign(document.createElement("input"), { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("presetView (SPEC.md 3.8)", () => {
  it("decodes the preset's full view state and tags it with the preset id", () => {
    const view = presetView(preset("california-north-south"), { favorites: [], showOnlyStarred: false });
    expect(view.layers).toEqual(["housing", "economic"]);
    expect(view.compare).toEqual({
      armed: true,
      pins: [
        { kind: "county", id: "06075" },
        { kind: "county", id: "06037" },
      ],
    });
    expect(view.camera).toEqual({ zoom: 5.6, lat: 36.2, lon: -120.3 });
    expect(view.preset).toBe("california-north-south");
    expect(view.profile).toBeUndefined();
  });

  it("selects the place a preset names", () => {
    const view = presetView(preset("la-education"), { favorites: [], showOnlyStarred: false });
    expect(view.layers).toEqual(["education"]);
    expect(view.selected).toEqual({ kind: "county", id: "06037" });
  });

  it("keeps the visitor's favorites and starred-only toggle", () => {
    const view = presetView(preset("crime-scale"), { favorites: ["060000000001"], showOnlyStarred: true });
    expect(view.favorites).toEqual(["060000000001"]);
    expect(view.showOnlyStarred).toBe(true);
    expect(view.layers).toEqual(["crime", "education"]);
  });

  it("reads as active only while the preset's layers are still shown", () => {
    const p = preset("crime-scale");
    expect(isPresetActive(p, { preset: "crime-scale", layers: ["crime", "education"] })).toBe(true);
    expect(isPresetActive(p, { preset: "crime-scale", layers: ["crime"] })).toBe(false);
    expect(isPresetActive(p, { preset: undefined, layers: ["crime", "education"] })).toBe(false);
  });

  it("decodes every fixture preset to at least one layer", () => {
    expect(presets).toHaveLength(5);
    for (const p of presets) {
      expect(presetView(p, { favorites: [], showOnlyStarred: false }).layers.length).toBeGreaterThan(0);
    }
  });
});
