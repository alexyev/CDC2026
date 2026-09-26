import { ArrowDown, ArrowUp, ChartColumn, ChevronDown, Copy, GitCompareArrows, Table2, X } from "lucide-react";
import { Dialog as DialogPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import catalogJson from "../../data/catalog.json";
import type {
  BreaksFile,
  CatalogFile,
  CountiesFile,
  NationalFile,
  PresetsFile,
  SchoolsFile,
  StatesFile,
} from "@/lib/dataTypes";
import { boundsToBBox, containsPoint } from "@/lib/geo";
import { load } from "@/lib/loaders";
import type { BBox, Camera, InsightResult, LayerDef, Level, PlaceRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { flyToAreas } from "@/map/camera";
import { MapContext } from "@/map/mapContext";
import { useLevel } from "@/map/useLevel";
import { useMap } from "@/map/useMap";
import { nextRequestId, requestInsight } from "@/stats/client";
import { layerDomain } from "@/stats/histogram";
import { isAreaPlace } from "@/store/compareSlice";
import { useStore } from "@/store/useStore";
import { CompareBody, CompareShortcuts } from "./ComparePanel";
import { Distribution } from "./Distribution";
import { insightScope, unitLevel, type InsightScope } from "./insightScope";
import { MinimizeButton, Minimizable } from "./Minimizable";
import { Scatter } from "./Scatter";

// Insight panel (SPEC.md 3.7, 6.1 to 6.5): what the active layers look like, and how they correlate, for what is on screen.
// The container gathers the units in view, asks the stats worker, and memoizes results; InsightView renders the states.

const CATALOG = catalogJson as CatalogFile;
const LAYER_BY_ID = new Map(CATALOG.layers.map((l) => [l.id, l]));

/** Recompute this long after the map settles (SPEC.md 3.7). */
const MOVE_DEBOUNCE_MS = 150;
/** Deferred data loads start after first paint (SPEC.md 10.1, loading sequence step 4). */
const DEFERRED_LOAD_MS = 300;
const TOO_FEW = 10;
const SMALL_SAMPLE = 30;
const TABLE_ROW_CAP = 1000;

const COUNTY_BADGE_TEXT = "This measure is only available per county. Every school in a county shares the same value.";
const FALLACY_TEXT =
  "Correlations across areas and across schools answer different questions. An area-level number says nothing about any individual school (the ecological fallacy).";

// ---------------------------------------------------------------------------------------------------------------------
// Units on screen (SPEC.md 6.1)

type UnitNoun = "states" | "counties" | "schools";
type Half = "areas" | "schools";

export interface UnitSet {
  noun: UnitNoun;
  ids: string[];
  names: string[];
  /** Parent place for the data table: the state of a county, "City, ST" for a school. */
  parents: string[];
  /** Schools in each area; 1 for schools. */
  n: number[];
  x: (number | null)[];
  y?: (number | null)[];
}

interface InsightData {
  states?: StatesFile;
  counties?: CountiesFile;
  schools?: SchoolsFile;
  breaks?: BreaksFile;
  national?: NationalFile;
  presets?: PresetsFile;
}

interface Gathered {
  areas?: UnitSet;
  /** Null while the schools file (or, at state level, the counties file) is still loading. */
  schools: UnitSet | null;
  /** True at state level until counties.json lands. */
  areasLoading: boolean;
  /** Distinct counties among the schools in view (local level note). */
  countiesInView?: number;
  /** Indices used for the memo key. */
  areaIdx: number[];
  schoolIdx: number[];
}

interface SchoolGroups {
  byState: Map<string, number[]>;
  byCounty: Map<string, number[]>;
}
const groupCache = new WeakMap<SchoolsFile, SchoolGroups>();

function schoolGroups(s: SchoolsFile): SchoolGroups {
  let g = groupCache.get(s);
  if (!g) {
    g = { byState: new Map(), byCounty: new Map() };
    for (let i = 0; i < s.ids.length; i++) {
      const st = g.byState.get(s.stfp[i]) ?? [];
      st.push(i);
      g.byState.set(s.stfp[i], st);
      const co = g.byCounty.get(s.county[i]) ?? [];
      co.push(i);
      g.byCounty.set(s.county[i], co);
    }
    groupCache.set(s, g);
  }
  return g;
}

function areaUnits(
  noun: "states" | "counties",
  file: StatesFile | CountiesFile,
  idx: number[],
  a: string,
  b: string | undefined,
  parentOf: (i: number) => string,
): UnitSet {
  const col = (id: string) => idx.map((i) => file.measures[id]?.mean[i] ?? null);
  return {
    noun,
    ids: idx.map((i) => file.ids[i]),
    names: idx.map((i) => file.names[i]),
    parents: idx.map(parentOf),
    n: idx.map((i) => file.n[i]),
    x: col(a),
    y: b ? col(b) : undefined,
  };
}

function schoolUnits(s: SchoolsFile, idx: number[], a: string, b: string | undefined): UnitSet {
  const col = (id: string) => idx.map((i) => s.values[id]?.[i] ?? null);
  return {
    noun: "schools",
    ids: idx.map((i) => s.ids[i]),
    names: idx.map((i) => s.name[i]),
    parents: idx.map((i) => `${s.city[i]}, ${s.st[i]}`),
    n: idx.map(() => 1),
    x: col(a),
    y: b ? col(b) : undefined,
  };
}

function gather(level: Level, bounds: BBox, data: InsightData, a: string, b: string | undefined): Gathered {
  const { states, counties, schools } = data;
  const stateName = new Map<string, string>();
  if (states) states.ids.forEach((id, i) => stateName.set(id, states.names[i]));

  if (level === "local") {
    if (!schools) return { schools: null, areasLoading: false, areaIdx: [], schoolIdx: [] };
    const idx: number[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < schools.ids.length; i++) {
      if (containsPoint(bounds, schools.lon[i], schools.lat[i])) {
        idx.push(i);
        seen.add(schools.county[i]);
      }
    }
    return {
      schools: schoolUnits(schools, idx, a, b),
      areasLoading: false,
      countiesInView: seen.size,
      areaIdx: [],
      schoolIdx: idx,
    };
  }

  const file = level === "nation" ? states : counties;
  if (!file) return { schools: null, areasLoading: true, areaIdx: [], schoolIdx: [] };
  const areaIdx: number[] = [];
  for (let i = 0; i < file.ids.length; i++) {
    const [lon, lat] = file.centroid[i];
    if (file.n[i] > 0 && containsPoint(bounds, lon, lat)) areaIdx.push(i);
  }
  const areas =
    level === "nation"
      ? areaUnits("states", file, areaIdx, a, b, () => "United States")
      : areaUnits("counties", file, areaIdx, a, b, (i) => {
          const st = (file as CountiesFile).st[i];
          return stateName.get(st) ?? st;
        });

  if (!schools) return { areas, schools: null, areasLoading: false, areaIdx, schoolIdx: [] };
  const groups = schoolGroups(schools);
  const byArea = level === "nation" ? groups.byState : groups.byCounty;
  const schoolIdx = areas.ids.flatMap((id) => byArea.get(id) ?? []);
  return { areas, schools: schoolUnits(schools, schoolIdx, a, b), areasLoading: false, areaIdx, schoolIdx };
}

// ---------------------------------------------------------------------------------------------------------------------
// Scope (SPEC.md 3.7): a selected state or county replaces what is on screen

/** The counties with schools in a selected state and the schools inside them, or a selected county's schools. */
function gatherScope(scope: InsightScope, data: InsightData, a: string, b: string | undefined): Gathered {
  const { counties, schools } = data;
  if (scope.kind === "county") {
    if (!schools) return { schools: null, areasLoading: false, areaIdx: [], schoolIdx: [] };
    const idx = schoolGroups(schools).byCounty.get(scope.id) ?? [];
    return {
      schools: schoolUnits(schools, idx, a, b),
      areasLoading: false,
      countiesInView: 1,
      areaIdx: [],
      schoolIdx: idx,
    };
  }
  if (!counties) return { schools: null, areasLoading: true, areaIdx: [], schoolIdx: [] };
  const areaIdx: number[] = [];
  for (let i = 0; i < counties.ids.length; i++) {
    if (counties.n[i] > 0 && counties.st[i] === scope.id) areaIdx.push(i);
  }
  const areas = areaUnits("counties", counties, areaIdx, a, b, () => scope.name);
  if (!schools) return { areas, schools: null, areasLoading: false, areaIdx, schoolIdx: [] };
  const schoolIdx = schoolGroups(schools).byState.get(scope.id) ?? [];
  return { areas, schools: schoolUnits(schools, schoolIdx, a, b), areasLoading: false, areaIdx, schoolIdx };
}

// ---------------------------------------------------------------------------------------------------------------------
// Viewport and data hooks

/** Web Mercator bounds of a camera over a window, for when the MapLibre instance is not mounted yet. */
function boundsFromCamera(c: Camera, width: number, height: number): BBox {
  const world = 512 * 2 ** c.zoom;
  const cx = ((c.lon + 180) / 360) * world;
  const sin = Math.sin((c.lat * Math.PI) / 180);
  const cy = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
  const lon = (px: number) => (px / world) * 360 - 180;
  const lat = (py: number) => (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * py) / world)) * 180) / Math.PI;
  return [lon(cx - width / 2), lat(cy + height / 2), lon(cx + width / 2), lat(cy - height / 2)];
}

function windowBounds(c: Camera): BBox {
  return boundsFromCamera(c, window.innerWidth, window.innerHeight);
}

/** The visible map bounds, updated 150 ms after the map (or, without a map, the store camera) settles. */
function useViewportBounds(): BBox {
  const { map } = useMap();
  const camera = useStore((s) => s.camera);
  const [mapBounds, setMapBounds] = useState<BBox | null>(null);
  const [camBounds, setCamBounds] = useState<BBox>(() => windowBounds(camera));

  useEffect(() => {
    if (!map) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setMapBounds(boundsToBBox(map.getBounds()));
      }, MOVE_DEBOUNCE_MS);
    };
    schedule();
    map.on("moveend", schedule);
    map.on("resize", schedule);
    return () => {
      window.clearTimeout(timer);
      map.off("moveend", schedule);
      map.off("resize", schedule);
    };
  }, [map]);

  useEffect(() => {
    if (map) return;
    const timer = window.setTimeout(() => setCamBounds(windowBounds(camera)), MOVE_DEBOUNCE_MS);
    const onResize = () => setCamBounds(windowBounds(camera));
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [map, camera]);

  return map && mapBounds ? mapBounds : camBounds;
}

function useInsightData(): { data: InsightData; error: boolean; retry: () => void } {
  const [data, setData] = useState<InsightData>({});
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const put =
      <K extends keyof InsightData>(key: K) =>
      (value: InsightData[K]) => {
        if (alive) setData((d) => ({ ...d, [key]: value }));
      };
    const fail = () => {
      if (alive) setError(true);
    };
    load("states").then(put("states"), fail);
    load("breaks").then(put("breaks"), fail);
    const timer = window.setTimeout(() => {
      load("counties").then(put("counties"), fail);
      load("schools").then(put("schools"), fail);
      load("national").then(put("national"), fail);
      load("presets").then(put("presets"), fail);
    }, DEFERRED_LOAD_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [attempt]);

  const retry = () => {
    setError(false);
    setAttempt((n) => n + 1);
  };
  return { data, error, retry };
}

/** FNV-1a over index lists: a cheap memo key for a set of units. */
function hashIdx(...lists: number[][]): string {
  let h = 0x811c9dc5;
  for (const list of lists) {
    h = Math.imul(h ^ list.length, 0x01000193);
    for (const v of list) h = Math.imul(h ^ v, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Correlation results memoized by (scope, level, layers, units) (SPEC.md 10.2). */
const resultCache = new Map<string, InsightResult>();
const RESULT_CACHE_MAX = 40;

function remember(key: string, result: InsightResult) {
  resultCache.delete(key);
  resultCache.set(key, result);
  if (resultCache.size > RESULT_CACHE_MAX) resultCache.delete(resultCache.keys().next().value as string);
}

interface Shown {
  layersKey: string;
  result: InsightResult;
}

function useInsightResult(
  level: Level,
  scopeKey: string,
  g: Gathered,
  a: string | undefined,
  b: string | undefined,
): { result: InsightResult | null; stale: boolean } {
  const layersKey = `${scopeKey}|${level}|${a ?? ""}|${b ?? ""}`;
  const key = `${layersKey}|${g.schools ? "s" : "-"}|${hashIdx(g.areaIdx, g.schoolIdx)}`;
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (!a || resultCache.has(key)) return;
    if (level !== "local" && !g.areas) return;
    if (level === "local" && !g.schools) return;
    const requestId = nextRequestId();
    const areas = level === "local" || !g.areas ? undefined : { ids: g.areas.ids, x: g.areas.x, y: g.areas.y };
    const schools = g.schools
      ? { ids: g.schools.ids, x: g.schools.x, y: g.schools.y }
      : { ids: [], x: [], y: b ? [] : undefined };
    requestInsight({ requestId, layerA: a, layerB: b, areas, schools, bootstrap: { resamples: 1000, seed: 42 } }).then(
      (result) => {
        if (!result) return;
        remember(key, result);
        setShown({ layersKey, result });
      },
      () => {},
    );
  }, [key, layersKey, level, a, b, g]);

  const cached = resultCache.get(key);
  if (cached) return { result: cached, stale: false };
  if (shown && shown.layersKey === layersKey) return { result: shown.result, stale: true };
  return { result: null, stale: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatting

const fmtInt = (n: number) => n.toLocaleString("en-US");
/** Correlations use a true minus sign so columns of numbers line up. */
const fmtR = (r: number) => `${r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}`;

function valueFormatter(layer: LayerDef): (v: number) => string {
  if (layer.unit === "gini") return (v) => v.toFixed(2);
  return (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? v.toFixed(0) : v.toFixed(1));
}

/** Where the units are, for headings and labels: "on screen" or "in Texas". */
function where(scope?: InsightScope | null): string {
  return scope ? `in ${scope.name}` : "on screen";
}

function levelNoun(level: Level): "states" | "counties" {
  return level === "nation" ? "states" : "counties";
}

function singular(noun: UnitNoun): string {
  return noun === "counties" ? "county" : noun.slice(0, -1);
}

/** False while the shown result predates the schools file (it was computed over no schools). */
function schoolsComputed(result: InsightResult, schools: UnitSet): boolean {
  const s = result.schools.spearman;
  return s.n + s.nMissing > 0 || schools.ids.length === 0;
}

function isConstant(x: (number | null)[], y?: (number | null)[]): boolean {
  let first: number | null = null;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (v === null || (y && y[i] === null)) continue;
    if (first === null) first = v;
    else if (v !== first) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// View

export interface InsightViewProps {
  /** The map level. With a scope, the units follow the scope instead (unitLevel). */
  level: Level;
  /** The selected state or county the numbers describe; null or absent means what is on screen. */
  scope?: InsightScope | null;
  layerA?: LayerDef;
  layerB?: LayerDef;
  areas?: UnitSet;
  schools: UnitSet | null;
  countiesInView?: number;
  result: InsightResult | null;
  /** The result is for the same layers but an earlier viewport; shown dimmed while the new one computes. */
  stale?: boolean;
  breaks?: BreaksFile;
  national?: NationalFile;
  /** Story preset note for the current view (SPEC.md 3.8). */
  presetNote?: string;
  /** Display names of the compare pins, keyed by id. */
  pinNames?: Record<string, string>;
  error?: boolean;
  onRetry?: () => void;
}

type PanelState = "empty" | "loading" | "one-layer" | "two-layers" | "compare";

function panelState(p: InsightViewProps, pins: PlaceRef[]): PanelState {
  if (pins.length > 0) return "compare";
  if (!p.layerA) return "empty";
  const level = unitLevel(p.scope, p.level);
  const areasReady = level === "local" || (p.areas && p.result?.areas);
  if (!p.result || !areasReady || (level === "local" && !p.schools)) return "loading";
  return p.layerB ? "two-layers" : "one-layer";
}

/** The panel's top offset in the shell and the gap it keeps from the viewport bottom and the legend (SPEC.md 3.2). */
const PANEL_TOP = 72;
const PANEL_GAP = 16;
/** Legend height assumed until the legend is measured. */
const LEGEND_FALLBACK = 196;

/**
 * Height of the legend below the panel in the same right-hand column, so the panel stops above it. The legend grows
 * when a second layer turns it into the 3x3 grid and shrinks to its chip when minimized, so it is re-measured on
 * resize and whenever `dep` changes.
 */
function useLegendHeight(dep: string): number {
  const [height, setHeight] = useState(LEGEND_FALLBACK);
  useEffect(() => {
    const el =
      document.querySelector<HTMLElement>('[data-panel="legend"]') ??
      document.querySelector<HTMLElement>('[data-testid="slot-legend"]');
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeight(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [dep]);
  return height;
}

/** The panel for the current view. Pure apart from store reads for hover, compare, and focus. */
export function InsightView(props: InsightViewProps) {
  const { level, scope, layerA, layerB, error, onRetry } = props;
  const pins = useStore((s) => s.compare.pins);
  const state = panelState(props, pins);
  const legendHeight = useLegendHeight(`${state}|${layerA?.id}|${layerB?.id}|${level}`);
  // Fades the bottom edge while more content sits below the fold.
  const [more, setMore] = useState(false);
  const updateMore = (el: HTMLElement) => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  const [scrollEl, scrollRef] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrollEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateMore(scrollEl));
    ro.observe(scrollEl);
    for (const child of scrollEl.children) ro.observe(child);
    return () => ro.disconnect();
  }, [scrollEl, state]);
  // Entering or leaving compare swaps the whole panel, so start it at the top where its heading and Done are.
  const comparing = state === "compare";
  useEffect(() => {
    scrollEl?.scrollTo?.({ top: 0 });
  }, [scrollEl, comparing]);

  return (
    <section
      data-testid="slot-insight-panel"
      data-state={state}
      aria-label="Insight"
      aria-busy={state === "loading" || props.stale}
      style={{ maxHeight: `calc(100dvh - ${PANEL_TOP + 2 * PANEL_GAP + legendHeight}px)` }}
      className="glass flex min-h-0 w-full flex-col overflow-hidden"
    >
      <div
        onScroll={(e) => updateMore(e.currentTarget)}
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin]",
          more && "[mask-image:linear-gradient(to_bottom,black_calc(100%-32px),transparent)]",
        )}
      >
        <Eyebrow
          level={level}
          scope={scope}
          busy={Boolean(props.stale)}
          table={state === "one-layer" || state === "two-layers" ? <DataTable {...props} /> : null}
        />
        {error && <LoadError onRetry={onRetry} />}
        {state === "empty" && (
          <p className="mt-2 text-body text-text-2">Pick a layer to see how it is distributed {where(scope)}.</p>
        )}
        {state === "loading" && <Skeleton />}
        {state === "compare" && <CompareFrame level={level} pinNames={props.pinNames ?? {}} />}
        {state === "one-layer" && layerA && <OneLayer {...props} layerA={layerA} />}
        {state === "two-layers" && layerA && layerB && <TwoLayers {...props} layerA={layerA} layerB={layerB} />}
      </div>
    </section>
  );
}

const LEVEL_LABEL: Record<Level, string> = { nation: "Nation", state: "State", local: "Local" };

function Eyebrow({
  level,
  scope,
  busy,
  table,
}: {
  level: Level;
  scope?: InsightScope | null;
  busy: boolean;
  table: ReactNode;
}) {
  return (
    <div className="mb-2 flex h-6 items-center justify-between text-badge font-medium tracking-[0.06em] text-text-3 uppercase">
      <span className="flex items-center gap-1.5">
        Insight
        <ScopeChip scope={scope} />
        {busy && (
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent-brand" data-testid="updating" />
        )}
      </span>
      <span className="flex items-center gap-1">
        {LEVEL_LABEL[level]} view
        {table}
        <MinimizeButton panel="insight" label="insight" className="-mr-1" />
      </span>
    </div>
  );
}

/** What the numbers describe: a dashed "On screen" chip, or the selected area's kind with a button to clear it. */
function ScopeChip({ scope }: { scope?: InsightScope | null }) {
  const clearSelection = useStore((s) => s.clearSelection);
  if (!scope) {
    return (
      <span
        data-testid="insight-scope"
        title="The numbers describe what is on screen. Select a state or county to describe it instead."
        className="inline-flex h-5 items-center rounded-full border border-dashed border-border-strong px-2 text-[10px] leading-none"
      >
        On screen
      </span>
    );
  }
  return (
    <span
      data-testid="insight-scope"
      title={`The numbers describe ${scope.name}, wherever the map is.`}
      className="inline-flex h-5 items-center gap-0.5 rounded-full border border-accent-brand/50 bg-accent-dim pr-0.5 pl-2 text-[10px] leading-none text-accent-strong"
    >
      Selected {scope.kind}
      <button
        type="button"
        aria-label="Clear selection and show what is on screen"
        title="Show what is on screen"
        onClick={clearSelection}
        className="grid size-4 place-items-center rounded-full transition-colors duration-(--dur-hover) hover:bg-white/10 hover:text-text-1"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}

function LoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-card border border-border bg-highlight px-3 py-2 text-caption text-text-2">
      <span>Some data could not be loaded.</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-chip px-2 py-0.5 text-accent-strong hover:bg-accent">
          Retry
        </button>
      )}
    </div>
  );
}

function Skeleton({ lines = 6 }: { lines?: number }) {
  const widths = ["w-3/4", "w-full", "w-5/6", "w-2/3", "w-full", "w-1/2", "w-4/5"];
  return (
    <div data-testid="insight-skeleton" aria-label="Loading" className="flex flex-col gap-2.5 py-1">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={cn("h-3 animate-pulse rounded-full bg-white/[0.06]", widths[i % widths.length])} />
      ))}
    </div>
  );
}

function CountyBadge() {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <span
          tabIndex={0}
          aria-label={`County-level measure. ${COUNTY_BADGE_TEXT}`}
          className="inline-flex h-4 items-center rounded-[4px] border border-border-strong px-1 align-middle text-[10px] leading-none font-medium tracking-[0.06em] text-text-2 uppercase"
        >
          county
        </span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          sideOffset={6}
          className="z-50 max-w-[260px] rounded-card border border-border-strong bg-surface-strong px-3 py-2 text-caption text-text-1 shadow-panel"
        >
          {COUNTY_BADGE_TEXT}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function LayerName({ layer, mark }: { layer: LayerDef; mark?: "A" | "B" }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {mark && (
        <span
          aria-hidden
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-[4px] text-[10px] leading-none font-semibold text-bg-0",
            mark === "A" ? "bg-u5" : "bg-bv2",
          )}
        >
          {mark}
        </span>
      )}
      <span className="truncate" title={layer.label}>
        {layer.label}
      </span>
      {layer.resolution === "county" && <CountyBadge />}
    </span>
  );
}

// ----- one layer

function OneLayer(props: InsightViewProps & { layerA: LayerDef }) {
  const { scope, layerA, areas, schools, result, stale, breaks, national, countiesInView } = props;
  const level = unitLevel(scope, props.level);
  const fmt = valueFormatter(layerA);
  const domain = layerDomain(layerA.id);
  const median = national?.schools.median[layerA.id] ?? null;
  const areaNoun = levelNoun(level);
  const schoolsText = schools ? fmtInt(schools.ids.length) : "…";

  return (
    <div className={cn("flex flex-col gap-3 transition-opacity duration-(--dur-toggle)", stale && "opacity-60")}>
      {scope && (
        <div className="flex flex-col gap-1">
          <h2 data-testid="scope-heading" className="text-title leading-snug font-semibold break-words text-text-1">
            <LayerName layer={layerA} /> <span className="font-normal text-text-2">in</span> {scope.name}
          </h2>
          <p className="text-caption text-text-3 tabular">
            {level === "local"
              ? `${schoolsText} schools`
              : `${fmtInt(areas?.ids.length ?? 0)} counties · ${schoolsText} schools`}
          </p>
        </div>
      )}
      {level !== "local" && areas && result?.areas && (
        <div className="flex flex-col gap-2">
          {scope ? (
            <p className="text-body text-text-2">By county</p>
          ) : (
            <h2 className="text-title leading-snug font-semibold text-text-1">
              <LayerName layer={layerA} /> <span className="font-normal text-text-2">across</span>{" "}
              <span className="tabular">{fmtInt(areas.ids.length)}</span>{" "}
              <span className="font-normal text-text-2">{areaNoun} on screen</span>
            </h2>
          )}
          {areas.ids.length === 0 ? (
            <p className="text-caption text-text-3">No {areaNoun} have their center on screen. Pan or zoom out.</p>
          ) : (
            <Distribution
              hist={result.areas.histA}
              domain={domain}
              quint={breaks?.[layerA.id]?.[level].quint}
              median={median}
              label={`${layerA.label} across ${areas.ids.length} ${areaNoun}`}
              format={fmt}
            />
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {scope && level === "local" ? null : level === "local" ? (
          <>
            <h2 className="text-title leading-snug font-semibold text-text-1">
              <LayerName layer={layerA} /> <span className="font-normal text-text-2">across</span>{" "}
              <span className="tabular">{fmtInt(schools?.ids.length ?? 0)}</span>{" "}
              <span className="font-normal text-text-2">schools on screen</span>
            </h2>
            <p className="-mt-1 text-caption text-text-3 tabular">
              {fmtInt(countiesInView ?? 0)} {countiesInView === 1 ? "county" : "counties"} in view
            </p>
          </>
        ) : scope ? (
          <p className="text-body text-text-2">By school</p>
        ) : (
          <p className="text-body text-text-2">
            and <span className="font-medium text-text-1 tabular">{schoolsText}</span> schools inside them
          </p>
        )}
        {!schools || !result || !schoolsComputed(result, schools) ? (
          <Skeleton lines={2} />
        ) : (
          <Distribution
            hist={result.schools.histA}
            domain={domain}
            quint={breaks?.[layerA.id]?.local.quint}
            median={median}
            label={`${layerA.label} across ${schools.ids.length} schools`}
            format={fmt}
          />
        )}
      </div>
      <MedianKey median={median} format={fmt} />
    </div>
  );
}

function MedianKey({ median, format }: { median: number | null; format: (v: number) => string }) {
  if (median === null) return null;
  return (
    <div className="flex items-center gap-2 text-caption text-text-3">
      <svg aria-hidden width="10" height="12" className="shrink-0">
        <line x1="5" x2="5" y1="0" y2="12" stroke="var(--text-1)" strokeOpacity={0.85} strokeDasharray="2 2" />
      </svg>
      <span>
        National median <span className="text-text-2 tabular">{format(median)}</span> (all schools)
      </span>
    </div>
  );
}

// ----- two layers

function TwoLayers(props: InsightViewProps & { layerA: LayerDef; layerB: LayerDef }) {
  const { scope, layerA, layerB, areas, schools, result, stale, breaks, national, presetNote, countiesInView } = props;
  const level = unitLevel(scope, props.level);
  const hovered = useStore((s) => s.hovered);
  const hoverUnit = useStore((s) => s.hoverUnit);
  const showAreas = level !== "local";
  const [focusChoice, setFocus] = useState<Half | null>(null);
  const [details, setDetails] = useState(false);

  const areaPart = showAreas && areas && result?.areas ? { set: areas, stats: result.areas } : null;
  const schoolPart =
    schools && result && schoolsComputed(result, schools) ? { set: schools, stats: result.schools } : null;

  const areasOk = areaPart !== null && !areaPart.stats.spearman.tooFew && areaPart.stats.spearman.n >= TOO_FEW;
  const schoolsOk = schoolPart !== null && !schoolPart.stats.spearman.tooFew && schoolPart.stats.spearman.n >= TOO_FEW;
  const focus: Half = showAreas ? (focusChoice ?? (areasOk || !schoolsOk ? "areas" : "schools")) : "schools";
  const settled = schoolPart !== null && (!showAreas || areaPart !== null);
  let note: string | null = null;
  if (!settled) note = null;
  else if (areasOk && schoolsOk) note = FALLACY_TEXT;
  else if (scope?.kind === "county") {
    // A county-level measure is one value for every school in the county, so it cannot rank them.
    const perCounty = [layerA, layerB].filter((l) => l.resolution === "county").map((l) => l.label);
    if (perCounty.length === 2)
      note = `${perCounty.join(" and ")} are only available per county, so every school here shares one value of each.`;
    else if (perCounty.length === 1)
      note = `${perCounty[0]} is only available per county, so every school here shares one value.`;
    else if (schoolsOk) note = "Only schools can be correlated inside one county.";
  } else if (schoolsOk)
    note = scope ? "Only schools can be correlated in this state." : "Only schools can be correlated at this zoom.";
  else if (areasOk)
    note = scope ? "Only counties can be correlated in this state." : "Only areas can be correlated at this zoom.";
  const areaLabel = scope ? "Counties in this state" : "Areas on screen";
  const schoolLabel = showAreas ? "Schools inside them" : scope ? "Schools in this county" : "Schools on screen";
  const schoolsText = schools ? fmtInt(schools.ids.length) : "…";

  const focused = focus === "areas" ? areaPart : schoolPart;
  const scatterLevel: keyof BreaksFile[string] = focus === "areas" ? (level as "nation" | "state") : "local";

  return (
    <div className={cn("flex flex-col gap-3 transition-opacity duration-(--dur-toggle)", stale && "opacity-60")}>
      <h2 className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-title leading-snug font-semibold text-text-1">
        <LayerName layer={layerA} mark="A" />
        <span aria-label="by" className="font-normal text-text-3">
          ×
        </span>
        <LayerName layer={layerB} mark="B" />
      </h2>
      {scope ? (
        <p data-testid="scope-heading" className="-mt-2 text-caption break-words text-text-3 tabular">
          {showAreas
            ? `${fmtInt(areas?.ids.length ?? 0)} counties and ${schoolsText} schools`
            : `${schoolsText} schools`}{" "}
          in <span className="font-medium text-text-1">{scope.name}</span>
        </p>
      ) : (
        <p className="-mt-2 text-caption text-text-3 tabular">
          {showAreas
            ? `${fmtInt(areas?.ids.length ?? 0)} ${levelNoun(level)} on screen · ${schoolsText} schools inside them`
            : `${fmtInt(schools?.ids.length ?? 0)} schools on screen · ${fmtInt(countiesInView ?? 0)} ${countiesInView === 1 ? "county" : "counties"} in view`}
        </p>
      )}

      <div className="flex flex-col gap-1" role="group" aria-label="Correlation">
        {showAreas &&
          (areaPart ? (
            <CorrelationRow
              label={areaLabel}
              half="areas"
              part={areaPart}
              focused={focus === "areas"}
              scoped={Boolean(scope)}
              onFocus={() => setFocus("areas")}
            />
          ) : (
            <Skeleton lines={1} />
          ))}
        {schoolPart ? (
          <CorrelationRow
            label={schoolLabel}
            half="schools"
            part={schoolPart}
            focused={focus === "schools"}
            scoped={Boolean(scope)}
            onFocus={showAreas ? () => setFocus("schools") : undefined}
          />
        ) : (
          <div className="py-2 pr-2.5 pl-3">
            <Skeleton lines={1} />
            <span className="mt-1.5 block text-caption text-text-3">Loading schools…</span>
          </div>
        )}
      </div>

      {note && (
        <p data-testid="correlation-note" className="text-caption leading-snug text-text-2">
          {note}
        </p>
      )}
      <Baseline layerA={layerA} layerB={layerB} national={national} presetNote={presetNote} />

      {focused && (
        <Scatter
          ids={focused.set.ids}
          names={focused.set.names}
          x={focused.set.x}
          y={focused.set.y ?? []}
          rangeX={layerDomain(layerA.id)}
          rangeY={layerDomain(layerB.id)}
          tercX={breaks?.[layerA.id]?.[scatterLevel].terc}
          tercY={breaks?.[layerB.id]?.[scatterLevel].terc}
          labelX={layerA.label}
          labelY={layerB.label}
          unitNoun={focused.set.noun}
          formatX={valueFormatter(layerA)}
          formatY={valueFormatter(layerB)}
          hoveredId={hovered}
          onHover={hoverUnit}
        />
      )}

      {(areasOk || schoolsOk) && (
        <div>
          <button
            type="button"
            aria-expanded={details}
            aria-controls="insight-details"
            onClick={() => setDetails((d) => !d)}
            className="flex w-full items-center justify-between rounded-chip px-1 py-1 text-caption font-medium text-text-2 transition-colors duration-(--dur-hover) hover:text-text-1"
          >
            Details
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform duration-(--dur-toggle)", details && "rotate-180")}
            />
          </button>
          {details && (
            <div
              id="insight-details"
              data-testid="insight-details"
              ref={(el) => el?.scrollIntoView?.({ block: "nearest" })}
              className="mt-1 flex flex-col gap-3"
            >
              {areaPart && areasOk && <DetailsBlock title={areaLabel} part={areaPart} />}
              {schoolPart && schoolsOk && <DetailsBlock title={schoolLabel} part={schoolPart} />}
            </div>
          )}
        </div>
      )}

      <CompareControls {...props} />
    </div>
  );
}

interface Part {
  set: UnitSet;
  stats: NonNullable<InsightResult["areas"]>;
}

function CorrelationRow({
  label,
  half,
  part,
  focused,
  scoped,
  onFocus,
}: {
  label: string;
  half: Half;
  part: Part;
  focused: boolean;
  /** A selected area is being described, so zooming out would not add units. */
  scoped: boolean;
  onFocus?: () => void;
}) {
  const s = part.stats.spearman;
  const noun = part.set.noun;
  const nText = `n = ${fmtInt(s.n)} ${s.n === 1 ? singular(noun) : noun}`;

  if (s.tooFew || s.n < TOO_FEW) {
    return (
      <div data-testid={`row-${half}`} className="rounded-card py-2 pr-2.5 pl-3">
        <div className="text-body text-text-2">{label}</div>
        <p data-testid={`too-few-${half}`} className="mt-0.5 text-caption leading-snug text-text-3">
          {`Too few ${noun} to correlate (n = ${fmtInt(s.n)}). ${scoped ? "Clear the selection or pick a larger area." : "Zoom out or pick a larger area."}`}
        </p>
      </div>
    );
  }

  const rText = s.r === null ? "ρ n/a" : `ρ = ${fmtR(s.r)}`;
  const ciText = s.ci ? `95% CI ${fmtR(s.ci[0])} to ${fmtR(s.ci[1])}` : null;
  const flat =
    s.r === null &&
    (isConstant(part.set.x, part.set.y) || (part.set.y !== undefined && isConstant(part.set.y, part.set.x)));
  const content = (
    <>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-text-2">{label}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-text-3 tabular">
          {ciText && <span>{ciText}</span>}
          <span>{nText}</span>
          {s.n < SMALL_SAMPLE && (
            <span className="rounded-[4px] border border-border-strong px-1 text-[10px] leading-4 font-medium tracking-[0.06em] text-text-2 uppercase">
              small sample
            </span>
          )}
        </span>
        {s.r === null && (
          <span className="text-caption text-text-3">
            {flat
              ? `A layer does not vary across these ${noun}, so there is no ranking to correlate.`
              : "Not computed for these units."}
          </span>
        )}
      </span>
      <span className="shrink-0 text-headline leading-[1.1] font-semibold text-text-1 tabular">{rText}</span>
    </>
  );
  const aria = [label, rText, ciText, nText].filter(Boolean).join("   ");
  const base = "flex w-full items-center justify-between gap-2 rounded-card py-2 pr-2.5 pl-3 text-left";

  if (!onFocus) {
    return (
      <div data-testid={`row-${half}`} aria-label={aria} className={cn(base, "bg-highlight")}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-testid={`row-${half}`}
      aria-label={aria}
      aria-pressed={focused}
      title="Show this row in the scatter"
      onClick={onFocus}
      className={cn(
        base,
        "relative transition-colors duration-(--dur-hover)",
        focused ? "bg-white/[0.05] shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-highlight",
      )}
    >
      {content}
    </button>
  );
}

function DetailsBlock({ title, part }: { title: string; part: Part }) {
  const { spearman, pearson } = part.stats;
  const total = part.set.ids.length;
  const noun = part.set.noun;
  const method =
    spearman.ciMethod === "bootstrap"
      ? "Spearman rank correlation with average ranks for ties; 95% percentile bootstrap interval, 1,000 resamples of pairs."
      : spearman.ciMethod === "approx"
        ? "Spearman rank correlation with average ranks for ties; 95% interval by the Bonett and Wright approximation (approx.)."
        : "Spearman rank correlation with average ranks for ties.";
  return (
    <div className="rounded-card border border-border px-3 py-2.5">
      <div className="mb-1.5 text-badge font-medium tracking-[0.06em] text-text-3 uppercase">{title}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption tabular">
        <dt className="text-text-3">Pearson r</dt>
        <dd className="m-0 text-text-1">{pearson.r === null ? "n/a" : fmtR(pearson.r)}</dd>
        <dt className="text-text-3">r²</dt>
        <dd className="m-0 text-text-1">{pearson.r === null ? "n/a" : (pearson.r * pearson.r).toFixed(2)}</dd>
        <dt className="text-text-3">Pairs</dt>
        <dd className="m-0 text-text-1">
          {fmtInt(spearman.n)} of {fmtInt(total)} {noun} have both values
        </dd>
        {spearman.ciMethod === "bootstrap" && (
          <>
            <dt className="text-text-3">Seed</dt>
            <dd className="m-0 text-text-1">42</dd>
          </>
        )}
      </dl>
      <p className="mt-1.5 text-caption leading-snug text-text-3">{method}</p>
    </div>
  );
}

/** "Nationwide" baseline from national.json (SPEC.md 6.5), or the story preset's note when a preset set this view. */
function Baseline({
  layerA,
  layerB,
  national,
  presetNote,
}: {
  layerA: LayerDef;
  layerB: LayerDef;
  national?: NationalFile;
  presetNote?: string;
}) {
  if (presetNote) {
    return <p className="text-caption text-text-3 tabular">{presetNote}</p>;
  }
  if (!national) return null;
  const i = national.layers.indexOf(layerA.id);
  const j = national.layers.indexOf(layerB.id);
  if (i < 0 || j < 0) return null;
  const levels: [string, number | null | undefined][] = [
    ["schools", national.schools.spearman[i]?.[j]],
    ["counties", national.counties.spearman[i]?.[j]],
    ["states", national.states.spearman[i]?.[j]],
  ];
  const parts = levels.flatMap(([noun, r]) => (typeof r === "number" ? [`${fmtR(r)} across ${noun}`] : []));
  if (parts.length === 0) return null;
  return (
    <p data-testid="national-baseline" className="text-caption text-text-3 tabular">
      Nationwide: ρ = {parts.join(", ")}
    </p>
  );
}

// ----- compare controls (the compare state itself is U4's, SPEC.md 3.9)

function CompareControls({ level, pinNames = {} }: InsightViewProps) {
  const armed = useStore((s) => s.compare.armed);
  const pins = useStore((s) => s.compare.pins);
  const armCompare = useStore((s) => s.armCompare);
  const noun = levelNoun(level);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={armed}
          onClick={() => armCompare(!armed)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-chip border px-2.5 text-caption font-medium transition-colors duration-(--dur-hover)",
            armed
              ? "border-accent-brand/50 bg-accent-dim text-accent-strong"
              : "border-border-strong text-text-2 hover:bg-highlight hover:text-text-1",
          )}
        >
          <GitCompareArrows aria-hidden className="size-3.5" />
          Compare
        </button>
        <span className="ml-auto flex items-center gap-3 text-caption text-text-3">
          <PinSlot mark="A" name={pins[0] ? pinNames[pins[0].id] : undefined} />
          <PinSlot mark="B" name={pins[1] ? pinNames[pins[1].id] : undefined} />
        </span>
      </div>
      {armed && pins.length === 0 && (
        <p className="text-caption text-accent-strong">Click up to two {noun} to pin them.</p>
      )}
    </div>
  );
}

function PinSlot({ mark, name }: { mark: "A" | "B"; name?: string }) {
  return (
    <span className="inline-flex items-center gap-1 tabular">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full border",
          mark === "A" ? "border-mark-a" : "border-mark-b",
          name && (mark === "A" ? "bg-mark-a" : "bg-mark-b"),
        )}
      />
      <span className={cn(mark === "A" ? "text-mark-a" : "text-mark-b", "font-medium")}>{mark}</span>
      <span className="max-w-[72px] truncate">{name ?? "–"}</span>
    </span>
  );
}

// ----- compare frame (the compare body itself is U4's ComparePanel, SPEC.md 3.9)

function CompareFrame({ level, pinNames }: { level: Level; pinNames: Record<string, string> }) {
  const pins = useStore((s) => s.compare.pins);
  const unpin = useStore((s) => s.unpinCompare);
  const armCompare = useStore((s) => s.armCompare);
  const map = useContext(MapContext)?.map ?? null;
  const areaPins = useMemo(() => pins.filter(isAreaPlace), [pins]);
  // Done leaves compare mode and frames the pinned areas together, so the user sees the region they compared.
  const done = () => {
    armCompare(false);
    if (map) void flyToAreas(map, areaPins);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="compare-frame">
      <div className="flex items-center justify-between">
        <h2 className="text-title font-semibold text-text-1">Compare {levelNoun(level)}</h2>
        <button
          type="button"
          onClick={done}
          className="rounded-chip px-2 py-1 text-caption text-text-2 hover:bg-highlight hover:text-text-1"
        >
          Done
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {pins.map((p, i) => (
          <span
            key={`${p.kind}:${p.id}`}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border pr-1 pl-2.5 text-caption text-text-1",
              i === 0 ? "border-mark-a/60" : "border-mark-b/60",
            )}
          >
            <span className={cn("font-semibold", i === 0 ? "text-mark-a" : "text-mark-b")}>{i === 0 ? "A" : "B"}</span>
            {pinNames[p.id] ?? p.id}
            <button
              type="button"
              aria-label={`Remove ${pinNames[p.id] ?? p.id}`}
              onClick={() => unpin(p)}
              className="grid size-5 place-items-center rounded-full text-text-3 hover:bg-highlight hover:text-text-1"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        {pins.length === 1 && (
          <span className="inline-flex h-7 items-center rounded-full border border-dashed border-border-strong px-2.5 text-caption text-text-3">
            Viewport
          </span>
        )}
      </div>
      <CompareBody pins={areaPins} level={level} removable={false} />
    </div>
  );
}

// ----- data table (SPEC.md 10.3)

type SortKey = "name" | "parent" | "a" | "b" | "n";

function DataTable(props: InsightViewProps) {
  const { scope, layerA, layerB, areas, schools } = props;
  const level = unitLevel(scope, props.level);
  const halves = (
    [
      ["areas", level === "local" ? undefined : areas],
      ["schools", schools ?? undefined],
    ] as const
  ).filter((h): h is readonly [Half, UnitSet] => Boolean(h[1]));
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Half>(level === "local" ? "schools" : "areas");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "a", desc: true });
  const current = halves.find((h) => h[0] === tab)?.[1] ?? halves[0]?.[1];

  const rows = useMemo(() => {
    if (!current) return [];
    const idx = current.ids.map((_, i) => i);
    const val = (i: number): string | number | null => {
      switch (sort.key) {
        case "name":
          return current.names[i];
        case "parent":
          return current.parents[i];
        case "a":
          return current.x[i];
        case "b":
          return current.y?.[i] ?? null;
        case "n":
          return current.n[i];
      }
    };
    idx.sort((i, j) => {
      const a = val(i);
      const b = val(j);
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      const c = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return sort.desc ? -c : c;
    });
    return idx;
  }, [current, sort]);

  if (!layerA || !current) return null;
  const isSchools = current.noun === "schools";
  // Area values are means and always show their fixed decimals; school values are shown as the CSV has them.
  const fmtFor = (layer: LayerDef) =>
    isSchools ? valueFormatter(layer) : (v: number) => v.toFixed(layer.unit === "gini" ? 2 : 1);
  const fmtA = fmtFor(layerA);
  const fmtB = layerB ? fmtFor(layerB) : fmtA;
  const cols: { key: SortKey; label: string; numeric: boolean }[] = [
    {
      key: "name",
      label: isSchools ? "School" : singular(current.noun).replace(/^./, (c) => c.toUpperCase()),
      numeric: false,
    },
    ...(current.noun === "states"
      ? []
      : [{ key: "parent" as const, label: isSchools ? "City" : "State", numeric: false }]),
    { key: "a", label: layerA.label, numeric: true },
    ...(layerB ? [{ key: "b" as const, label: layerB.label, numeric: true }] : []),
    ...(isSchools ? [] : [{ key: "n" as const, label: "Schools", numeric: true }]),
  ];
  const cell = (key: SortKey, i: number): string => {
    switch (key) {
      case "name":
        return current.names[i];
      case "parent":
        return current.parents[i];
      case "a":
        return current.x[i] === null ? "no data" : fmtA(current.x[i] as number);
      case "b":
        return current.y?.[i] == null ? "no data" : fmtB(current.y[i] as number);
      case "n":
        return fmtInt(current.n[i]);
    }
  };

  const copyCsv = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [cols.map((c) => esc(c.label)).join(",")];
    for (const i of rows) lines.push(cols.map((c) => esc(cell(c.key, i).replace(/,/g, ""))).join(","));
    void navigator.clipboard?.writeText(lines.join("\n"));
  };

  const shown = rows.slice(0, TABLE_ROW_CAP);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Data table"
          title="Data table"
          className="ml-1 grid size-6 place-items-center rounded-[6px] text-text-3 transition-colors duration-(--dur-hover) hover:bg-highlight hover:text-text-1"
        >
          <Table2 aria-hidden className="size-3.5" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid="data-table"
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className="glass glass-strong fixed top-1/2 left-1/2 z-50 flex max-h-[min(720px,calc(100dvh-96px))] w-[min(760px,calc(100vw-64px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 pt-4 pb-3">
            <div>
              <DialogPrimitive.Title className="text-title font-semibold text-text-1">Data table</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-caption text-text-3 tabular">
                {fmtInt(current.ids.length)} {current.noun} {where(scope)}
                {rows.length > TABLE_ROW_CAP && ` · showing ${fmtInt(TABLE_ROW_CAP)}, copy for all`}
              </DialogPrimitive.Description>
            </div>
            <div className="flex items-center gap-2">
              {halves.length > 1 && (
                <div role="tablist" aria-label="Units" className="flex rounded-chip border border-border p-0.5">
                  {halves.map(([h, set]) => (
                    <button
                      key={h}
                      type="button"
                      role="tab"
                      aria-selected={current === set}
                      onClick={() => setTab(h)}
                      className={cn(
                        "rounded-[6px] px-2.5 py-1 text-caption font-medium capitalize transition-colors duration-(--dur-hover)",
                        current === set ? "bg-white/[0.08] text-text-1" : "text-text-3 hover:text-text-1",
                      )}
                    >
                      {set.noun}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={copyCsv}
                className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-border-strong px-2.5 text-caption font-medium text-text-2 hover:bg-highlight hover:text-text-1"
              >
                <Copy aria-hidden className="size-3.5" />
                Copy CSV
              </button>
              <DialogPrimitive.Close
                aria-label="Close"
                className="grid size-8 place-items-center rounded-chip text-text-3 hover:bg-highlight hover:text-text-1"
              >
                <X aria-hidden className="size-4" />
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2 [scrollbar-width:thin]">
            <table className="w-full border-separate border-spacing-0 text-body">
              <thead>
                <tr>
                  {cols.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
                        className={cn(
                          "sticky top-0 z-10 border-b border-border bg-[rgb(18,21,28)] px-3 py-2 font-medium text-text-3",
                          c.numeric ? "text-right" : "text-left",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSort({ key: c.key, desc: active ? !sort.desc : c.numeric })}
                          className={cn(
                            "inline-flex max-w-[200px] items-center gap-1 rounded-[4px] text-caption hover:text-text-1",
                            active && "text-text-1",
                          )}
                        >
                          <span className="truncate" title={c.label}>
                            {c.label}
                          </span>
                          {active &&
                            (sort.desc ? (
                              <ArrowDown aria-hidden className="size-3 shrink-0" />
                            ) : (
                              <ArrowUp aria-hidden className="size-3 shrink-0" />
                            ))}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={current.ids[i]} className="hover:bg-highlight">
                    {cols.map((c) => {
                      const text = cell(c.key, i);
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            "border-b border-white/[0.04] px-3 py-1.5",
                            c.numeric ? "text-right tabular" : "max-w-[260px] truncate",
                            text === "no data" ? "text-text-3" : c.key === "name" ? "text-text-1" : "text-text-2",
                          )}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Container

export function InsightPanel() {
  const layers = useStore((s) => s.layers);
  const pins = useStore((s) => s.compare.pins);
  const preset = useStore((s) => s.preset);
  const selKind = useStore((s) => s.selected?.kind);
  const selId = useStore((s) => s.selected?.id);
  const level = useLevel();
  const bounds = useViewportBounds();
  const { data, error, retry } = useInsightData();

  const layerA = layers[0] ? LAYER_BY_ID.get(layers[0]) : undefined;
  const layerB = layers[1] ? LAYER_BY_ID.get(layers[1]) : undefined;

  const scope = useMemo(
    () => insightScope(selKind && selId ? { kind: selKind, id: selId } : undefined, data.states, data.counties),
    [selKind, selId, data.states, data.counties],
  );
  // A selected area ignores the camera, so panning or zooming inside it recomputes nothing.
  const viewLevel = scope === null ? level : null;
  const viewBounds = scope === null ? bounds : null;
  const gathered = useMemo(() => {
    if (!layerA || scope === undefined) return null;
    if (scope) return gatherScope(scope, data, layerA.id, layerB?.id);
    return viewLevel && viewBounds ? gather(viewLevel, viewBounds, data, layerA.id, layerB?.id) : null;
  }, [scope, viewLevel, viewBounds, data, layerA, layerB]);
  const empty: Gathered = { schools: null, areasLoading: false, areaIdx: [], schoolIdx: [] };
  const scopeKey = scope === undefined ? "pending" : scope ? `${scope.kind}:${scope.id}` : "view";
  const { result, stale } = useInsightResult(
    unitLevel(scope, level),
    scopeKey,
    gathered ?? empty,
    layerA?.id,
    layerB?.id,
  );

  const presetNote = useMemo(() => {
    const p = data.presets?.presets.find((x) => x.id === preset);
    return p?.note && p.view.l === layers.join(",") ? p.note : undefined;
  }, [data.presets, preset, layers]);

  const pinNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const p of pins) {
      const file = p.kind === "state" ? data.states : p.kind === "county" ? data.counties : undefined;
      const i = file ? file.ids.indexOf(p.id) : -1;
      if (file && i >= 0) names[p.id] = file.names[i];
    }
    return names;
  }, [pins, data.states, data.counties]);

  // Compare's hotkey and toast live outside the minimizable panel so they keep working while it is minimized.
  return (
    <>
      <Minimizable
        panel="insight"
        corner="top-right"
        restoreLabel="Show insight"
        chip={
          <>
            <ChartColumn aria-hidden />
            Insight
          </>
        }
      >
        <InsightView
          level={level}
          scope={scope}
          layerA={layerA}
          layerB={layerB}
          areas={gathered?.areas}
          schools={gathered?.schools ?? null}
          countiesInView={gathered?.countiesInView}
          result={result}
          stale={stale}
          breaks={data.breaks}
          national={data.national}
          presetNote={presetNote}
          pinNames={pinNames}
          error={error}
          onRetry={retry}
        />
      </Minimizable>
      <CompareShortcuts />
    </>
  );
}
