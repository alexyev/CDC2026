// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Computes an InsightResult from an InsightRequest (SPEC.md 6.2): for the areas row and the schools row, Spearman
// with its interval, Pearson, and the histograms of both layers. Each row is memoized by its layers, options, and a
// 64-bit hash of its ids and values, so panning back to a view or re-requesting the same units costs nothing.

import type { InsightRequest, InsightResult } from "@/lib/types";
import { completePairs, countOnly, pearsonStats, spearmanStats } from "./correlation";
import { histogram, layerDomain } from "./histogram";

type Units = InsightRequest["schools"];
type Row = InsightResult["schools"];

const CACHE_SIZE = 32;
const cache = new Map<string, Row>();

function computeRow(req: InsightRequest, units: Units): Row {
  const options = { resamples: req.bootstrap.resamples, seed: req.bootstrap.seed };
  const histA = histogram(completePairs(units.x).x, layerDomain(req.layerA));
  const { layerB } = req;
  if (layerB === undefined || units.y === undefined) {
    const pairs = completePairs(units.x);
    return { spearman: countOnly("spearman", pairs), pearson: countOnly("pearson", pairs), histA };
  }
  const pairs = completePairs(units.x, units.y);
  return {
    spearman: spearmanStats(pairs, options),
    pearson: pearsonStats(pairs),
    histA,
    histB: histogram(completePairs(units.y).x, layerDomain(layerB)),
  };
}

function cachedRow(req: InsightRequest, units: Units): Row {
  const key = rowKey(req, units);
  const hit = cache.get(key);
  if (hit) {
    // Re-insert so the Map's insertion order doubles as least-recently-used order.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const row = computeRow(req, units);
  cache.set(key, row);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return row;
}

export function computeInsight(req: InsightRequest): InsightResult {
  const t0 = performance.now();
  const areas = req.areas ? cachedRow(req, req.areas) : undefined;
  const schools = cachedRow(req, req.schools);
  return { requestId: req.requestId, areas, schools, ms: performance.now() - t0 };
}

/** Drops every memoized row (tests and memory pressure). */
export function clearInsightCache(): void {
  cache.clear();
}

function rowKey(req: InsightRequest, units: Units): string {
  const h = new UnitsHash();
  for (const id of units.ids) h.string(id);
  h.values(units.x);
  if (units.y) h.values(units.y);
  const b = req.bootstrap;
  return `${req.layerA}|${req.layerB ?? ""}|${units.y ? "xy" : "x"}|${b.resamples}|${b.seed}|${units.ids.length}|${h.digest()}`;
}

/** Two independent 32-bit FNV-1a streams, giving a 64-bit digest of the unit ids and values. */
class UnitsHash {
  private a = 0x811c9dc5;
  private b = 0x01000193 ^ 0x9e3779b9;
  private readonly f64 = new Float64Array(1);
  private readonly u32 = new Uint32Array(this.f64.buffer);

  private word(w: number): void {
    this.a = Math.imul(this.a ^ w, 0x01000193);
    this.b = Math.imul(this.b ^ w, 0x5bd1e995);
    this.b ^= this.b >>> 15;
  }

  string(s: string): void {
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
    this.word(0x1f);
  }

  values(values: readonly (number | null)[]): void {
    for (const v of values) {
      if (v === null) {
        this.word(0x7ff80001);
        this.word(0x7ff80001);
        continue;
      }
      this.f64[0] = v;
      this.word(this.u32[0]);
      this.word(this.u32[1]);
    }
    this.word(0x1e);
  }

  digest(): string {
    return (this.a >>> 0).toString(36) + "." + (this.b >>> 0).toString(36);
  }
}
