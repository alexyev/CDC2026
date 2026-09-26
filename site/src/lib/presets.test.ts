// The story presets written by analysis/schoolscape/presets.py decode into the views of SPEC.md 3.8.

import { describe, expect, it } from "vitest";
// Raw imports keep the type checker away from the 3 MB gazetteer; the Appendix B types come from dataTypes.ts.
import gazetteerJson from "../../public/data/v1/gazetteer.json?raw";
import presetsJson from "../../public/data/v1/presets.json?raw";
import { levelForZoom } from "@/map/levels";
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
  it("has the five presets in chip order", () => {
    expect(presets.map((p) => p.id)).toEqual([
      "stress-usa",
      "economic-education",
      "crime-scale",
      "la-education",
      "california-north-south",
    ]);
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

  it("opens the three national stories at the default camera", () => {
    const expected = [
      ["stress-usa", ["composite"]],
      ["economic-education", ["economic", "education"]],
      ["crime-scale", ["crime", "education"]],
    ] as const;
    for (const [id, layers] of expected) {
      const view = decode(id);
      expect(view.layers).toEqual(layers);
      expect(view.camera).toEqual(DEFAULT_CAMERA);
      expect(levelForZoom(view.camera.zoom)).toBe("nation");
      expect(view.selected).toBeUndefined();
      expect(view.compare).toEqual({ armed: false, pins: [] });
    }
    expect(presets.find((p) => p.id === "crime-scale")?.note).toBe(
      "ρ = 0.17 across states, 0.40 across counties, 0.24 across schools",
    );
  });

  it("flies to Los Angeles County at the local level", () => {
    const view = decode("la-education");
    expect(view.layers).toEqual(["education"]);
    expect(view.selected).toEqual({ kind: "county", id: "06037" });
    expect(levelForZoom(view.camera.zoom)).toBe("local");
    expect(view.camera.lat).toBeCloseTo(34.2, 0);
    expect(view.camera.lon).toBeCloseTo(-118.2, 0);
  });

  it("compares San Francisco with Los Angeles at the county level", () => {
    const view = decode("california-north-south");
    expect(view.layers).toEqual(["housing", "economic"]);
    expect(view.compare).toEqual({
      armed: true,
      pins: [
        { kind: "county", id: "06075" },
        { kind: "county", id: "06037" },
      ],
    });
    expect(levelForZoom(view.camera.zoom)).toBe("state");
  });

  it("names only places that are in the gazetteer", () => {
    for (const id of ["la-education", "california-north-south"]) {
      const view = decode(id);
      for (const place of [view.selected, ...view.compare.pins]) {
        if (place) expect(places.has(`${place.kind}:${place.id}`)).toBe(true);
      }
    }
  });
});
