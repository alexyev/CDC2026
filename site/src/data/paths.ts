// Data file locations. Bump DATA_VERSION together with analysis/schoolscape/config.py when the data changes.

export const DATA_VERSION = "v1";

const useFixtures = Boolean(import.meta.env.VITE_USE_FIXTURES);

/** Base URL of the data files: the pipeline outputs, or the bundled fixtures when VITE_USE_FIXTURES is set. */
export const DATA_BASE = useFixtures ? "fixtures" : `/data/${DATA_VERSION}`;

export const DATA_FILES = {
  meta: "meta.json",
  catalog: "catalog.json",
  statesTopo: "states.topo.json",
  countiesTopo: "counties.topo.json",
  states: "states.json",
  counties: "counties.json",
  schools: "schools/all.json",
  gazetteer: "gazetteer.json",
  breaks: "breaks.json",
  national: "national.json",
  presets: "presets.json",
} as const;

export type DataFileKey = keyof typeof DATA_FILES;
