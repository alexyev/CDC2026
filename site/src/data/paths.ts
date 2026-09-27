// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Data file locations. Bump DATA_VERSION together with analysis/schoolscape/config.py when the data changes.
// Kept free of import.meta.env: vite.config.ts reads it to preload the critical files.

export const DATA_VERSION = "v1";

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

/** The files the first paint needs (SPEC.md 10.1); index.html preloads them and loadCritical() reads them. */
export const CRITICAL_FILES = ["statesTopo", "states", "breaks", "catalog"] as const satisfies readonly DataFileKey[];
