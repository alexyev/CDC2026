// Shared contracts from SPEC.md Appendix A, copied verbatim. Frozen after T0: change only through I1.

export type Level = "nation" | "state" | "local";
export type LayerGroup = "score" | "indicator" | "context";
export type Domain = "composite" | "economic" | "education" | "health" | "housing" | "crime" | "gini";
export type Resolution = "tract" | "county";
export type Polarity = "stress" | "neutral";
export type Display = "score" | "pct";

export interface LayerDef {
  id: string;                 // catalog id, e.g. "composite", "poverty", "ctx_hispanic"
  label: string;              // exact CSV column name
  group: LayerGroup;
  domain?: Domain;            // indicators only
  column: string;             // CSV column
  pctColumn?: string;         // "<X> Percentile Rank" for the six scores
  resolution: Resolution;
  polarity: Polarity;
  unit: "score" | "scaled" | "percent" | "gini";
  subtitle: string;
  aliases: string[];          // for the command bar and local parser
  missingShare: number;       // 0..1
  note?: string;              // e.g. "includes county-level components"
}

export type PlaceKind = "state" | "county" | "city" | "district" | "school";
export interface PlaceRef { kind: PlaceKind; id: string; }          // state: STATEFP "06"; county: GEOID "06037"; school: NCESSCH; city/district: "{ST}:{name}"
export interface Camera { lon: number; lat: number; zoom: number; }
export type BBox = [number, number, number, number];                 // [minLon, minLat, maxLon, maxLat]

export interface ViewState {
  camera: Camera;
  layers: [] | [string] | [string, string];   // A, B
  display: Display;
  selected?: PlaceRef;
  compare: { armed: boolean; pins: PlaceRef[] };   // 0..2 pins, same kind
  profile?: string;                            // NCESSCH
  favorites: string[];                         // NCESSCH[]
  favoritesPanel: boolean;
  showOnlyStarred: boolean;
  about: boolean;
  preset?: string;
}

export interface UnitValues { id: string; name: string; parent?: string; n: number; values: Record<string, number | null>; medians?: Record<string, number | null>; }

export interface PairStats { method: "spearman" | "pearson"; r: number | null; ci: [number, number] | null; ciMethod: "bootstrap" | "approx" | null; n: number; nMissing: number; tooFew: boolean; }
export interface InsightRequest { requestId: number; layerA: string; layerB?: string; areas?: { ids: string[]; x: (number | null)[]; y?: (number | null)[] }; schools: { ids: string[]; x: (number | null)[]; y?: (number | null)[] }; bootstrap: { resamples: 1000; seed: 42 }; }
export interface Histogram { bins: number[]; counts: number[]; median: number | null; }
export interface InsightResult { requestId: number; areas?: { spearman: PairStats; pearson: PairStats; histA: Histogram; histB?: Histogram }; schools: { spearman: PairStats; pearson: PairStats; histA: Histogram; histB?: Histogram }; ms: number; }

export interface Intent { action: "explore" | "compare" | "profile" | "clear"; layers: string[]; places: { query: string; kind: PlaceKind | "unknown"; stateHint?: string }[]; display?: Display; note?: string; }
export type CommandOutcome = { status: "applied"; summary: string } | { status: "needs-choice"; place: string; candidates: PlaceRef[] } | { status: "no-match" } | { status: "degraded"; summary: string };
