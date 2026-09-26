// Distribution histograms for the one-layer insight state (SPEC.md 6.4): 20 equal bins over the layer's national
// range (0-100 in steps of 5; Gini 0-1 in steps of 0.05) plus the median of the values given.

import catalog from "../../data/catalog.json";
import type { Histogram } from "@/lib/types";

export const HISTOGRAM_BINS = 20;

const GINI_LAYERS = new Set(catalog.layers.filter((l) => l.unit === "gini").map((l) => l.id));

/** The fixed value range of a layer: [0, 1] for Gini-unit layers, [0, 100] for every other catalog layer. */
export function layerDomain(layerId: string): [number, number] {
  return GINI_LAYERS.has(layerId) ? [0, 1] : [0, 100];
}

/** Median of the finite values (mean of the middle two for an even count); null when there are none. */
export function median(values: Float64Array): number | null {
  const n = values.length;
  if (n === 0) return null;
  const sorted = Float64Array.from(values).sort();
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * `bins` holds the HISTOGRAM_BINS + 1 bin edges and `counts` the HISTOGRAM_BINS counts: bin k covers
 * [bins[k], bins[k + 1]), the last bin also includes the upper edge, and values outside the domain go to the end bins.
 */
export function histogram(values: Float64Array, domain: [number, number]): Histogram {
  const [lo, hi] = domain;
  const width = (hi - lo) / HISTOGRAM_BINS;
  const bins = Array.from({ length: HISTOGRAM_BINS + 1 }, (_, k) => roundEdge(lo + k * width));
  const counts = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (const v of values) {
    // The epsilon keeps a value that sits on an edge (0.15 in Gini) in the upper bin despite float division.
    const k = Math.floor((v - lo) / width + 1e-9);
    counts[k < 0 ? 0 : k >= HISTOGRAM_BINS ? HISTOGRAM_BINS - 1 : k]++;
  }
  return { bins, counts, median: median(values) };
}

/** Removes floating-point noise from edges such as 0.15000000000000002. */
function roundEdge(edge: number): number {
  return Math.round(edge * 1e9) / 1e9;
}
