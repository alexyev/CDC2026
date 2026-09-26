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
    const view = resolveView("?p=crime-scale", presets);
    expect(view.layers).toEqual(["crime", "education"]);
    expect(view.preset).toBe("crime-scale");
    expect(view.camera).toEqual({ zoom: 3.6, lat: 38.5, lon: -96.5 });
  });

  it("lets explicit parameters override the preset", () => {
    const view = resolveView("?v=6/35/-80&p=la-education", presets);
    expect(view.camera).toEqual({ zoom: 6, lat: 35, lon: -80 });
    expect(view.layers).toEqual(["education"]);
    expect(view.selected).toEqual({ kind: "county", id: "06037" });
  });

  it("decodes plainly for an unknown preset or before presets load", () => {
    expect(resolveView("?p=nope", presets).layers).toEqual(DEFAULT_VIEW.layers);
    expect(resolveView("?p=crime-scale", undefined).layers).toEqual(DEFAULT_VIEW.layers);
  });

  it("builds every fixture preset as a full view that keeps favorites", () => {
    const current = { ...DEFAULT_VIEW, favorites: ["010000500871"], showOnlyStarred: true, about: true };
    const cmp = presetView(presets.get("california-north-south")!, current);
    expect(cmp).toMatchObject({
      layers: ["housing", "economic"],
      compare: {
        armed: true,
        pins: [
          { kind: "county", id: "06075" },
          { kind: "county", id: "06037" },
        ],
      },
      favorites: ["010000500871"],
      showOnlyStarred: true,
      about: false,
      preset: "california-north-south",
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
    boot("?p=crime-scale");
    await settle();
    expect(useStore.getState().layers).toEqual(["crime", "education"]);
    expect(useStore.getState().preset).toBe("crime-scale");
    expect(search()).toBe("l=crime,education&p=crime-scale");
  });

  it("fills a preset's camera and selection from ?p=", async () => {
    boot("?p=la-education");
    await settle();
    expect(selectView(useStore.getState())).toMatchObject({
      camera: { zoom: 9.2, lat: 34.05, lon: -118.3 },
      layers: ["education"],
      selected: { kind: "county", id: "06037" },
      preset: "la-education",
    });
  });

  it("keeps `p` through camera moves and drops it once anything else changes", async () => {
    vi.useFakeTimers();
    boot("?p=crime-scale");
    await vi.advanceTimersByTimeAsync(0);
    useStore.getState().setCamera({ zoom: 6, lat: 35, lon: -80 });
    await vi.advanceTimersByTimeAsync(CAMERA_DEBOUNCE_MS);
    expect(search()).toBe("v=6/35/-80&l=crime,education&p=crime-scale");

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
    useStore.getState().applyPreset("california-north-south");
    await settle();
    expect(search()).toBe(
      "v=5.6/36.2/-120.3&l=housing,economic&cmp=county:06075,county:06037&p=california-north-south",
    );
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
