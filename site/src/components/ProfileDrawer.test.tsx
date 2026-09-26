import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import counties from "@/test/fixtures/counties.json";
import national from "@/test/fixtures/national.json";
import schools from "@/test/fixtures/schools/all.json";
import states from "@/test/fixtures/states.json";
import type { CountiesFile, NationalFile, SchoolsFile, StatesFile } from "@/lib/dataTypes";
import {
  buildProfile,
  COUNTY_BADGE_TIP,
  formatValue,
  layerDef,
  missingReason,
  ncesUrl,
  ordinal,
  tooltipLines,
  type ProfileSources,
} from "./profileData";

const sources: ProfileSources = {
  schools: schools as SchoolsFile,
  counties: counties as unknown as CountiesFile,
  states: states as unknown as StatesFile,
  national: national as unknown as NationalFile,
};

const ALBERTVILLE = "010000500871";
const CT_SCHOOL = "090000201136";
const PR_SCHOOL = "720003000061";

describe("buildProfile", () => {
  it("reads the school's identifiers and composite with its national percentile", () => {
    const p = buildProfile(sources, ALBERTVILLE)!;
    expect(p.name).toBe("Albertville High School");
    expect(p.district).toBe("Albertville City");
    expect(p.city).toBe("Albertville");
    expect(p.st).toBe("AL");
    expect(p.stateName).toBe("Alabama");
    expect(p.countyName).toBe("Marshall County");
    expect(p.composite.value).toBe(31);
    expect(p.composite.pct).toBe(63);
    expect(p.ctFilled).toBe(false);
  });

  it("computes county, state, and nation benchmarks from the aggregates", () => {
    const p = buildProfile(sources, ALBERTVILLE)!;
    const ci = sources.counties.ids.indexOf("01095");
    const si = sources.states.ids.indexOf("01");
    expect(p.composite.bench).toEqual({
      county: sources.counties.measures.composite!.mean[ci],
      state: sources.states.measures.composite!.mean[si],
      nation: sources.national.schools.mean.composite,
    });
    const poverty = p.domains.find((d) => d.id === "economic")!.rows.find((r) => r.layer.id === "poverty")!;
    expect(poverty.bench.county).toBe(sources.counties.measures.poverty!.mean[ci]);
    expect(poverty.bench.state).toBe(sources.states.measures.poverty!.mean[si]);
    expect(poverty.bench.nation).toBe(sources.national.schools.mean.poverty);
  });

  it("groups every indicator under its domain score and keeps context separate", () => {
    const p = buildProfile(sources, ALBERTVILLE)!;
    expect(p.domains.map((d) => d.id)).toEqual(["economic", "education", "health", "housing", "crime", "gini"]);
    for (const d of p.domains) {
      expect(d.score?.layer.id).toBe(d.id);
      for (const r of d.rows) expect(r.layer.domain).toBe(d.id);
    }
    expect(p.domains.flatMap((d) => d.rows)).toHaveLength(20);
    expect(p.context.rows).toHaveLength(8);
    expect(p.context.rows.every((r) => r.layer.group === "context")).toBe(true);
  });

  it("badges the eight county-level measures", () => {
    const p = buildProfile(sources, ALBERTVILLE)!;
    const rows = [...p.domains.flatMap((d) => [d.score!, ...d.rows]), p.composite];
    const county = rows.filter((r) => r.badges.includes("county")).map((r) => r.layer.id);
    expect(county.sort()).toEqual(
      [
        "crime",
        "gini",
        "incarceration",
        "infant_mortality",
        "low_birth_weight",
        "single_parent",
        "unemployment",
        "violent_crime",
      ].sort(),
    );
  });

  it("marks Connecticut rows and explains missing crime", () => {
    const p = buildProfile(sources, CT_SCHOOL)!;
    expect(p.ctFilled).toBe(true);
    const rows = p.domains.flatMap((d) => [d.score!, ...d.rows]);
    const byId = new Map(rows.map((r) => [r.layer.id, r]));
    expect(byId.get("lead_risk")!.badges).toContain("approx");
    expect(byId.get("park_access")!.badges).toContain("proxy");
    expect(byId.get("crime")!.value).toBeNull();
    expect(byId.get("crime")!.missingReason).toBe("ODIS has no crime inputs for this state");
    expect(byId.get("violent_crime")!.missingReason).toBe("ODIS has no crime inputs for this state");
  });

  it("returns null for an id that is not in the data", () => {
    expect(buildProfile(sources, "000000000000")).toBeNull();
  });
});

describe("profile helpers", () => {
  it("builds the NCES link from the id", () => {
    expect(ncesUrl("010000500871")).toBe("https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=010000500871");
  });

  it("gives the SPEC section 7 missing-data reasons", () => {
    expect(missingReason("incarceration", "PR")).toBe("ODIS has no crime inputs for this state");
    expect(missingReason("crime", "TX")).toBeUndefined();
    expect(missingReason("lead_risk", "TX")).toBe("Not available for about half of schools nationally");
    expect(missingReason("poverty", "TX")).toBeUndefined();
  });

  it("formats values and ordinals", () => {
    expect(formatValue(layerDef("gini")!, 0.456)).toBe("0.46");
    expect(formatValue(layerDef("ctx_white")!, 74)).toBe("74%");
    expect(formatValue(layerDef("composite")!, null)).toBe("no data");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 63, 100].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "63rd",
      "100th",
    ]);
  });

  it("builds pin tooltip lines with the national percentile in parentheses", () => {
    const i = sources.schools.ids.indexOf(ALBERTVILLE);
    const lines = tooltipLines(sources.schools, i, ["composite", "crime", "poverty"]);
    expect(lines.map((l) => [l.layer.id, l.value, l.pct, l.county])).toEqual([
      ["composite", "31", "63rd percentile", false],
      ["crime", "50", "74th percentile", true],
      ["poverty", "66", undefined, false],
    ]);
  });
});

describe("<ProfileDrawer>", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_USE_FIXTURES", "1");
    vi.resetModules();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  async function setup(search: string, map?: Partial<MapLibreMap>) {
    const { ProfileDrawer } = await import("./ProfileDrawer");
    const { useStore } = await import("@/store/useStore");
    const { decodeView } = await import("@/lib/urlCodec");
    const { MapProvider } = await import("@/map/MapProvider");
    const { useMap } = await import("@/map/useMap");
    const { TooltipProvider } = await import("@/components/ui/tooltip");

    const actions = {
      closeProfile: vi.fn(),
      toggleFavorite: vi.fn(),
      setAbout: vi.fn(),
    };
    useStore.setState({ ...decodeView(search), ...actions });

    function RegisterMap({ children }: { children: ReactNode }) {
      const { registerMap } = useMap();
      useEffect(() => {
        if (map) registerMap(map as MapLibreMap);
      }, [registerMap]);
      return children;
    }

    render(
      <TooltipProvider>
        <MapProvider>
          <RegisterMap>
            <ProfileDrawer />
          </RegisterMap>
        </MapProvider>
      </TooltipProvider>,
    );
    return { useStore, actions };
  }

  it("opens from s= in the URL with the school's full card", async () => {
    await setup(`?s=${ALBERTVILLE}`);
    expect(await screen.findByRole("heading", { name: "Albertville High School" })).toBeTruthy();
    const hero = screen.getByRole("region", { name: "Composite Score" });
    expect(hero.textContent).toContain("31");
    expect(hero.textContent).toContain("63rd pct");
    expect(screen.getByRole("group", { name: "Poverty: 66" })).toBeTruthy();
    for (const domain of ["Economic", "Education", "Health", "Housing", "Crime", "Income inequality"]) {
      expect(screen.getByRole("region", { name: domain })).toBeTruthy();
    }
    expect(screen.getByRole("region", { name: "Context (not in the index)" })).toBeTruthy();
    expect(screen.getAllByText("county").length).toBe(8);
    const nces = screen.getByRole("link", { name: /NCES profile/ });
    expect(nces.getAttribute("href")).toBe("https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=010000500871");
  });

  it("is closed without s=", async () => {
    await setup("");
    expect(screen.queryByTestId("profile-drawer")).toBeNull();
  });

  it("toggles the star and closes through the store actions", async () => {
    const { actions } = await setup(`?s=${ALBERTVILLE}`);
    fireEvent.click(await screen.findByRole("button", { name: "Add to favorites" }));
    expect(actions.toggleFavorite).toHaveBeenCalledWith(ALBERTVILLE);
    fireEvent.click(screen.getByRole("button", { name: "Close profile" }));
    expect(actions.closeProfile).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(actions.closeProfile).toHaveBeenCalledTimes(2);
  });

  it("shows a starred school as pressed", async () => {
    await setup(`?s=${ALBERTVILLE}&fav=${ALBERTVILLE}`);
    const star = await screen.findByRole("button", { name: "Remove from favorites" });
    expect(star.getAttribute("aria-pressed")).toBe("true");
  });

  it("centers the map on the school through the camera", async () => {
    const flyTo = vi.fn();
    const jumpTo = vi.fn();
    await setup(`?s=${ALBERTVILLE}`, {
      loaded: () => true,
      on: vi.fn() as unknown as MapLibreMap["on"],
      off: vi.fn() as unknown as MapLibreMap["off"],
      getZoom: () => 4,
      flyTo: flyTo as unknown as MapLibreMap["flyTo"],
      jumpTo: jumpTo as unknown as MapLibreMap["jumpTo"],
    });
    const center = await screen.findByRole("button", { name: /Center on map/ });
    act(() => fireEvent.click(center));
    const call = flyTo.mock.calls[0]?.[0] ?? jumpTo.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      center: [-86.2049, 34.2622],
      zoom: 12,
      padding: { top: 72, left: 332, right: 412, bottom: 96 },
    });
  });

  it("shows the Connecticut note with a link to About", async () => {
    const { actions } = await setup(`?s=${CT_SCHOOL}`);
    expect(await screen.findByText(/Connecticut values filled from current public sources/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "About the Connecticut fill" }));
    expect(actions.setAbout).toHaveBeenCalledWith(true);
    expect(screen.getByText("approx.")).toBeTruthy();
    expect(screen.getByText("proxy")).toBeTruthy();
  });

  it("explains missing crime for Puerto Rico", async () => {
    await setup(`?s=${PR_SCHOOL}`);
    expect((await screen.findAllByText("ODIS has no crime inputs for this state")).length).toBe(3);
  });

  it("says when the school is not in the data", async () => {
    await setup("?s=000000000000");
    expect(await screen.findByRole("heading", { name: "School not found" })).toBeTruthy();
  });

  it("keeps the county badge tooltip text from SPEC section 3.6", () => {
    expect(COUNTY_BADGE_TIP).toBe(
      "This measure is only available per county. Every school in a county shares the same value.",
    );
  });
});
