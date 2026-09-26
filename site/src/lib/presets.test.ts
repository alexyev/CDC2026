// The stories written by analysis/schoolscape/presets.py decode into the views of SPEC.md 3.8.

import { describe, expect, it } from "vitest";
// Raw imports keep the type checker away from the 3 MB gazetteer; the Appendix B types come from dataTypes.ts.
import gazetteerJson from "../../public/data/v1/gazetteer.json?raw";
import presetsJson from "../../public/data/v1/presets.json?raw";
import { levelForZoom, STATE_COUNTY_CROSSFADE } from "@/map/levels";
import { DEFAULT_CAMERA, DEFAULT_VIEW } from "@/store/useStore";
import type { GazetteerFile, PresetsFile } from "./dataTypes";
import { decodeView, encodeCamera, encodeView } from "./urlCodec";

const { presets } = JSON.parse(presetsJson) as PresetsFile;
const gazetteer = JSON.parse(gazetteerJson) as GazetteerFile;
const places = new Set(gazetteer.entries.map((e) => `${e.k}:${e.id}`));

function decode(id: string) {
  const preset = presets.find((p) => p.id === id);
  if (!preset) throw new Error(`no preset ${id}`);
  return decodeView(new URLSearchParams(preset.view).toString());
}

describe("presets.json", () => {
  it("has the six stories in story order", () => {
    expect(presets.map((p) => p.id)).toEqual([
      "where-stress-concentrates",
      "broadband-attainment",
      "education-health-by-region",
      "west-housing",
      "one-formula",
      "where-to-look",
    ]);
  });

  it("gives every story a chapter, a narration, and a caveat", () => {
    for (const p of presets) {
      expect(p.chapter).not.toBe("");
      expect(p.narration.length).toBeGreaterThan(100);
      expect(p.caveat).toMatch(/\.$/);
    }
  });

  it("round-trips every view through the URL codec", () => {
    const defaults: Record<string, string> = { v: encodeCamera(DEFAULT_CAMERA), l: DEFAULT_VIEW.layers.join(",") };
    for (const preset of presets) {
      // encodeView omits parameters equal to the default view.
      const expected = Object.fromEntries(Object.entries(preset.view).filter(([k, v]) => defaults[k] !== v));
      const reencoded = encodeView(decodeView(new URLSearchParams(preset.view).toString()));
      expect(Object.fromEntries(new URLSearchParams(reencoded))).toEqual(expected);
    }
  });

  it("opens the three national stories at the national view", () => {
    const expected = [
      ["where-stress-concentrates", ["composite"]],
      ["broadband-attainment", ["broadband", "college_2yr_plus"]],
      ["where-to-look", ["health"]],
    ] as const;
    for (const [id, layers] of expected) {
      const view = decode(id);
      expect(view.layers).toEqual(layers);
      expect(view.camera).toEqual(DEFAULT_CAMERA);
      expect(levelForZoom(view.camera.zoom)).toBe("nation");
      expect(view.selected).toBeUndefined();
      expect(view.compare).toEqual({ armed: false, pins: [] });
    }
  });

  it("compares California with Florida at the state level", () => {
    const view = decode("education-health-by-region");
    expect(view.layers).toEqual(["education", "health"]);
    expect(view.compare).toEqual({
      armed: true,
      pins: [
        { kind: "state", id: "06" },
        { kind: "state", id: "12" },
      ],
    });
    expect(levelForZoom(view.camera.zoom)).toBe("nation");
  });

  it("opens the California coast and northern Wisconsin with counties drawn", () => {
    const west = decode("west-housing");
    expect(west.layers).toEqual(["affordability", "economic"]);
    expect(west.selected).toEqual({ kind: "state", id: "06" });
    const oneida = decode("one-formula");
    expect(oneida.layers).toEqual(["composite", "vacancy"]);
    expect(oneida.selected).toEqual({ kind: "county", id: "55085" });
    for (const view of [west, oneida]) {
      // Past the state-to-county crossfade, so counties show at full opacity.
      expect(view.camera.zoom).toBeGreaterThanOrEqual(STATE_COUNTY_CROSSFADE[1]);
      expect(levelForZoom(view.camera.zoom)).toBe("state");
    }
  });

  it("names only places that are in the gazetteer", () => {
    for (const p of presets) {
      const view = decode(p.id);
      for (const place of [view.selected, ...view.compare.pins]) {
        if (place) expect(places.has(`${place.kind}:${place.id}`)).toBe(true);
      }
    }
  });
});
