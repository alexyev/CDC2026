// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { afterEach, describe, expect, it, vi } from "vitest";
import presetsFile from "@/test/fixtures/presets.json";
import { DEFAULT_VIEW, selectView, useStore } from "@/store/useStore";
import type { PresetsFile } from "./dataTypes";
import { decodeView } from "./urlCodec";
import { CAMERA_DEBOUNCE_MS, applyPreset, presetView, resolveView, shareUrl, startUrlSync } from "./urlSync";

const fixture = presetsFile as unknown as PresetsFile;

vi.mock("./loaders", () => ({
  load: vi.fn(async (key: string) => {
    if (key !== "presets") throw new Error(`unexpected load ${key}`);
    return fixture;
  }),
}));

const presets = new Map(fixture.presets.map((p) => [p.id, p]));
const initialStore = useStore.getState();

/** Opens the app at `search` the way main.tsx does, then starts the sync. */
function boot(search: string) {
  // A push (not a replace) drops forward entries left by an earlier test, so history.length counts from here.
  window.history.pushState(null, "", `/${search}`);
  useStore.setState(initialStore, true);
  // T0 wires setAbout, setDisplay, and select; stand in for U5's openProfile, a no-op until it lands.
  useStore.setState({ openProfile: (profile) => useStore.setState({ profile }) });
  useStore.getState().setView(decodeView(window.location.search));
  stop = startUrlSync(window);
}

let stop: () => void = () => {};

const search = () => window.location.search.replace(/^\?/, "");
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** history.back() in jsdom fires popstate asynchronously. */
async function back() {
  const popped = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
  window.history.back();
  await popped;
  await settle();
}

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("resolveView", () => {
  it("opens a preset from `p` alone", () => {
    const view = resolveView("?p=broadband-attainment", presets);
    expect(view.layers).toEqual(["broadband", "college_2yr_plus"]);
    expect(view.preset).toBe("broadband-attainment");
    expect(view.camera).toEqual({ zoom: 3.6, lat: 38.5, lon: -96.5 });
  });

  it("lets explicit parameters override the preset", () => {
    const view = resolveView("?v=6/35/-80&p=one-formula", presets);
    expect(view.camera).toEqual({ zoom: 6, lat: 35, lon: -80 });
    expect(view.layers).toEqual(["composite", "vacancy"]);
    expect(view.selected).toEqual({ kind: "county", id: "55085" });
  });

  it("decodes plainly for an unknown preset or before presets load", () => {
    expect(resolveView("?p=nope", presets).layers).toEqual(DEFAULT_VIEW.layers);
    expect(resolveView("?p=broadband-attainment", undefined).layers).toEqual(DEFAULT_VIEW.layers);
  });

  it("builds every fixture preset as a full view that keeps favorites", () => {
    const current = { ...DEFAULT_VIEW, favorites: ["010000500871"], showOnlyStarred: true, about: true };
    const cmp = presetView(presets.get("education-health-by-region")!, current);
    expect(cmp).toMatchObject({
      layers: ["education", "health"],
      compare: {
        armed: true,
        pins: [
          { kind: "state", id: "06" },
          { kind: "state", id: "12" },
        ],
      },
      favorites: ["010000500871"],
      showOnlyStarred: true,
      about: false,
      preset: "education-health-by-region",
    });
    for (const preset of presets.values()) expect(presetView(preset, current).preset).toBe(preset.id);
  });
});

describe("startUrlSync", () => {
  it("replaces the entry for camera moves after a 300 ms debounce and adds no history", async () => {
    vi.useFakeTimers();
    boot("");
    const length = window.history.length;
    useStore.getState().setCamera({ zoom: 5, lat: 35, lon: -80 });
    useStore.getState().setCamera({ zoom: 6, lat: 35.5, lon: -79 });
    await vi.advanceTimersByTimeAsync(CAMERA_DEBOUNCE_MS - 1);
    expect(search()).toBe("");
    useStore.getState().setCamera({ zoom: 7, lat: 35.5, lon: -79 });
    await vi.advanceTimersByTimeAsync(CAMERA_DEBOUNCE_MS - 1);
    expect(search()).toBe("");
    await vi.advanceTimersByTimeAsync(1);
    expect(search()).toBe("v=7/35.5/-79");
    expect(window.history.length).toBe(length);
  });

  it("pushes one entry per drawer change and Back closes the drawer without moving the camera", async () => {
    boot("");
    const length = window.history.length;
    useStore.getState().setAbout(true);
    await settle();
    expect(search()).toBe("about=1");
    expect(window.history.length).toBe(length + 1);

    useStore.getState().setCamera({ zoom: 6, lat: 35, lon: -80 });
    await back();
    expect(useStore.getState().about).toBe(false);
    expect(useStore.getState().camera).toEqual({ zoom: 6, lat: 35, lon: -80 });
    expect(search()).toBe("v=6/35/-80");
  });

  it("coalesces changes made in the same task into one entry", async () => {
    boot("");
    const length = window.history.length;
    useStore.getState().openProfile("010000500871");
    useStore.getState().setDisplay("pct");
    useStore.getState().select({ kind: "county", id: "01095" });
    await settle();
    expect(window.history.length).toBe(length + 1);
    expect(search()).toBe("d=pct&sel=county:01095&s=010000500871");
    await back();
    expect(selectView(useStore.getState())).toMatchObject({
      profile: undefined,
      display: "score",
      selected: undefined,
    });
  });

  it("reproduces a preset from ?p= and keeps the URL short", async () => {
    boot("?p=broadband-attainment");
    await settle();
    expect(useStore.getState().layers).toEqual(["broadband", "college_2yr_plus"]);
    expect(useStore.getState().preset).toBe("broadband-attainment");
    expect(search()).toBe("l=broadband,college_2yr_plus&p=broadband-attainment");
  });

  it("fills a preset's camera and selection from ?p=", async () => {
    boot("?p=one-formula");
    await settle();
    expect(selectView(useStore.getState())).toMatchObject({
      camera: { zoom: 5.84, lat: 43.83, lon: -89.36 },
      layers: ["composite", "vacancy"],
      selected: { kind: "county", id: "55085" },
      preset: "one-formula",
    });
  });

  it("keeps `p` through camera moves and drops it once anything else changes", async () => {
    vi.useFakeTimers();
    boot("?p=broadband-attainment");
    await vi.advanceTimersByTimeAsync(0);
    useStore.getState().setCamera({ zoom: 6, lat: 35, lon: -80 });
    await vi.advanceTimersByTimeAsync(CAMERA_DEBOUNCE_MS);
    expect(search()).toBe("v=6/35/-80&l=broadband,college_2yr_plus&p=broadband-attainment");

    useStore.setState({ layers: ["composite"] });
    await vi.advanceTimersByTimeAsync(0);
    expect(useStore.getState().preset).toBeUndefined();
    expect(search()).toBe("v=6/35/-80");
    expect(decodeView(search()).layers).toEqual(["composite"]);
  });

  it("drops an unknown preset id", async () => {
    boot("?p=nope&l=health");
    await settle();
    expect(useStore.getState().preset).toBeUndefined();
    expect(search()).toBe("l=health");
  });

  it("applies presets through the store action with one history entry", async () => {
    boot("");
    const length = window.history.length;
    useStore.getState().applyPreset("education-health-by-region");
    await settle();
    expect(search()).toBe("v=3.46/27.46/-99.67&l=education,health&cmp=state:06,state:12&p=education-health-by-region");
    expect(window.history.length).toBe(length + 1);
    await expect(applyPreset("nope")).resolves.toBe(false);
  });

  it("strips `fav` from the address bar but keeps the favorites in the store", () => {
    boot("?fav=010000500871&l=health");
    expect(useStore.getState().favorites).toEqual(["010000500871"]);
    expect(search()).toBe("l=health");
  });

  it("restores the store action on stop", () => {
    boot("");
    const ours = useStore.getState().applyPreset;
    stop();
    expect(useStore.getState().applyPreset).not.toBe(ours);
    stop = () => {};
  });
});

describe("shareUrl", () => {
  it("appends up to 20 favorites as `fav`", () => {
    const favorites = Array.from({ length: 25 }, (_, i) => `0100005008${String(i).padStart(2, "0")}`);
    const url = new URL(
      shareUrl({ ...DEFAULT_VIEW, layers: ["crime", "education"], favorites }, new URL("https://x.test/app")),
    );
    expect(url.origin + url.pathname).toBe("https://x.test/app");
    expect(url.searchParams.get("l")).toBe("crime,education");
    expect(url.searchParams.get("fav")!.split(",")).toEqual(favorites.slice(0, 20));
  });

  it("is the bare page for the default view", () => {
    expect(shareUrl(DEFAULT_VIEW, new URL("https://x.test/"))).toBe("https://x.test/");
  });
});
