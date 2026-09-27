// Typed loaders for the data files of SPEC.md Appendix B.
// With VITE_USE_FIXTURES set they read the bundled fixtures in src/test/fixtures/ instead of /data/v1/.

import type { Topology } from "topojson-specification";
import { CRITICAL_FILES, DATA_FILES, DATA_VERSION, type DataFileKey } from "@/data/paths";
import { cached } from "./dataCache";
import type {
  BreaksFile,
  CatalogFile,
  CountiesFile,
  GazetteerFile,
  MetaFile,
  NationalFile,
  PresetsFile,
  SchoolsFile,
  StatesFile,
} from "./dataTypes";

export interface DataFileTypes {
  meta: MetaFile;
  catalog: CatalogFile;
  statesTopo: Topology;
  countiesTopo: Topology;
  states: StatesFile;
  counties: CountiesFile;
  schools: SchoolsFile;
  gazetteer: GazetteerFile;
  breaks: BreaksFile;
  national: NationalFile;
  presets: PresetsFile;
}

export class DataLoadError extends Error {
  readonly path: string;
  readonly status?: number;
  constructor(path: string, status?: number, cause?: unknown) {
    super(`Failed to load ${path}${status ? ` (HTTP ${status})` : ""}`, { cause });
    this.name = "DataLoadError";
    this.path = path;
    this.status = status;
  }
}

/** Base URL of the data files: the pipeline outputs, or the bundled fixtures when VITE_USE_FIXTURES is set. */
const DATA_BASE = import.meta.env.VITE_USE_FIXTURES ? "fixtures" : `/data/${DATA_VERSION}`;

// Gated on the env flag so production builds contain no fixture chunks.
const fixtureModules: Record<string, () => Promise<unknown>> = import.meta.env.VITE_USE_FIXTURES
  ? import.meta.glob<unknown>("../test/fixtures/**/*.json", { import: "default" })
  : {};

async function fetchJson(path: string): Promise<unknown> {
  if (path.startsWith("fixtures/")) {
    const load = fixtureModules[`../test/${path}`];
    if (!load) throw new DataLoadError(path, 404);
    return load();
  }
  let res: Response;
  try {
    res = await fetch(path);
  } catch (err) {
    throw new DataLoadError(path, undefined, err);
  }
  if (!res.ok) throw new DataLoadError(path, res.status);
  return res.json();
}

export function dataPath(key: DataFileKey): string {
  return `${DATA_BASE}/${DATA_FILES[key]}`;
}

/** Loads and caches one data file. */
export function load<K extends DataFileKey>(key: K): Promise<DataFileTypes[K]> {
  return cached<DataFileTypes[K]>(dataPath(key), fetchJson);
}

/** The first-paint files (SPEC.md 8.2): about 70 KB gzipped. */
export function loadCritical() {
  const [statesTopo, states, breaks, catalog] = CRITICAL_FILES;
  return Promise.all([load(statesTopo), load(states), load(breaks), load(catalog)]);
}
