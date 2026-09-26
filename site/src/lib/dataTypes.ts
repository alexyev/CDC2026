// Data file schemas from SPEC.md Appendix B (site/public/data/v1/).
// Columnar JSON: arrays are aligned by index and `null` marks a missing value.

import type { BBox, LayerDef } from "./types";

export type LonLat = [number, number];

export interface MetaFile {
  build: string;
  dataVersion: string;
  odis: string;
  nces: string;
  census: string;
  input: string;
  counts: { schools: number; states: number; counties: number; countyPolygons: number };
  placeholders: { connecticut: "filled" };
}

export interface CatalogFile {
  version: number;
  layers: LayerDef[];
}

export interface MeasureColumns {
  mean: (number | null)[];
  median: (number | null)[];
  n: number[];
}

interface AreaFileBase {
  ids: string[];
  names: string[];
  n: number[];
  centroid: LonLat[];
  bbox: BBox[];
  measures: Record<string, MeasureColumns>;
}

/** states.json: ids are STATEFP ("06"). */
export interface StatesFile extends AreaFileBase {
  usps: string[];
}

/** counties.json: ids are GEOID ("06037"); counties with no school have n 0 and null means. */
export interface CountiesFile extends AreaFileBase {
  st: string[];
}

/** Bit flags in SchoolsFile.flags. */
export const SchoolFlag = {
  /** Connecticut row with values filled from non-ODIS public sources (ct_fill_sources non-empty). */
  ctFilled: 1,
} as const;

/** schools/all.json. `values` holds every catalog layer id plus "<id>_pct" for the six percentile columns. */
export interface SchoolsFile {
  ids: string[];
  name: string[];
  district: string[];
  st: string[];
  stfp: string[];
  county: string[];
  countyName: string[];
  city: string[];
  zip: string[];
  sab: number[];
  lat: number[];
  lon: number[];
  flags: number[];
  values: Record<string, (number | null)[]>;
}

export interface LevelBreaks {
  quint: [number, number, number, number];
  terc: [number, number];
}

/** breaks.json: layer id -> level -> breaks. */
export type BreaksFile = Record<string, { nation: LevelBreaks; state: LevelBreaks; local: LevelBreaks }>;

export interface CorrelationLevel {
  n: number;
  spearman: (number | null)[][];
  pearson: (number | null)[][];
}

/** national.json: matrices are indexed by `layers`. */
export interface NationalFile {
  layers: string[];
  schools: CorrelationLevel & {
    mean: Record<string, number | null>;
    median: Record<string, number | null>;
  };
  counties: CorrelationLevel;
  states: CorrelationLevel;
}

export type GazetteerKind = "state" | "county" | "city" | "district";

export interface GazetteerEntry {
  k: GazetteerKind;
  id: string;
  n: string;
  st: string;
  bb: BBox;
}

export interface GazetteerFile {
  entries: GazetteerEntry[];
}

/**
 * A narrated data story (SPEC.md 3.8). Its view uses the URL parameter names of SPEC.md section 3.10; the story card
 * shows its chapter, label, narration, and caveat while the view is live.
 */
export interface Preset {
  id: string;
  label: string;
  /** The part of the story arc it belongs to, such as "Nationally". */
  chapter: string;
  view: Record<string, string>;
  /** Two to four sentences with the key numbers, each from the committed analyses. */
  narration: string;
  /** One line on what the view does not show. */
  caveat: string;
}

export interface PresetsFile {
  presets: Preset[];
}
