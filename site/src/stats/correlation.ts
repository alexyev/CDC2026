// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Correlation statistics for the insight panel (SPEC.md 6.2): pairwise deletion, average ranks for ties,
// Spearman and Pearson, and the Bonett-Wright and Fisher approximate intervals. Pure functions, no DOM.

import type { PairStats } from "@/lib/types";
import { bootstrapSpearman } from "./bootstrap";

/** Below this many complete pairs the panel shows "too few" and no number (SPEC.md 6.2). */
export const TOO_FEW_N = 10;
/** Up to this many pairs the Spearman interval is a percentile bootstrap; above it, Bonett-Wright. */
export const BOOTSTRAP_MAX_N = 5000;

const Z_975 = 1.959963984540054;

/** The complete pairs of two aligned columns (pairwise deletion); `y` absent keeps every present `x`. */
export interface Pairs {
  x: Float64Array;
  y: Float64Array | null;
  /** Units in the request, including those missing a value. */
  total: number;
}

function present(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v);
}

export function completePairs(x: readonly (number | null)[], y?: readonly (number | null)[]): Pairs {
  const total = x.length;
  let n = 0;
  for (let i = 0; i < total; i++) if (present(x[i]) && (!y || present(y[i]))) n++;
  const px = new Float64Array(n);
  const py = y ? new Float64Array(n) : null;
  let k = 0;
  for (let i = 0; i < total; i++) {
    const xi = x[i];
    if (!present(xi)) continue;
    if (y) {
      const yi = y[i];
      if (!present(yi)) continue;
      py![k] = yi;
    }
    px[k++] = xi;
  }
  return { x: px, y: py, total };
}

/** Indices of `values` in ascending value order. */
export function argsort(values: Float64Array): Uint32Array {
  const order = new Uint32Array(values.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((a, b) => values[a] - values[b]);
  return order;
}

// Method: Average (mid) ranks for ties, as in Spearman 1904; see CITATIONS.md, section 3.
/** 1-based ranks; tied values share the average of the ranks they span (scipy's "average" method). */
export function averageRanks(values: Float64Array, order: Uint32Array = argsort(values)): Float64Array {
  const n = values.length;
  const ranks = new Float64Array(n);
  let start = 0;
  while (start < n) {
    let end = start + 1;
    while (end < n && values[order[end]] === values[order[start]]) end++;
    const rank = (start + end + 1) / 2;
    for (let k = start; k < end; k++) ranks[order[k]] = rank;
    start = end;
  }
  return ranks;
}

// Method: Pearson product-moment correlation (Pearson 1895); see CITATIONS.md, section 3.
/** Pearson product-moment correlation; null when either column has no variance or n < 2. */
export function pearson(x: Float64Array, y: Float64Array): number | null {
  const n = x.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return clampUnit(sxy / Math.sqrt(sxx * syy));
}

// Method: Spearman rank correlation (Spearman 1904); see CITATIONS.md, section 3.
/** Spearman rank correlation with average ranks for ties; null when either column is constant. */
export function spearman(x: Float64Array, y: Float64Array): number | null {
  return pearson(averageRanks(x), averageRanks(y));
}

// Method: Bonett-Wright interval for Spearman's rho (Bonett and Wright 2000); see CITATIONS.md, section 3.
/** Bonett and Wright (2000) 95% interval for Spearman's rho: se = sqrt((1 + rho^2 / 2) / (n - 3)) on atanh. */
export function bonettWrightInterval(rho: number, n: number): [number, number] | null {
  if (n <= 3) return null;
  return fisherInterval(rho, Math.sqrt((1 + (rho * rho) / 2) / (n - 3)));
}

// Method: Fisher z interval for Pearson's r (Fisher 1915, 1921); see CITATIONS.md, section 3.
/** Fisher z 95% interval for Pearson's r: se = 1 / sqrt(n - 3) on atanh. */
export function pearsonInterval(r: number, n: number): [number, number] | null {
  if (n <= 3) return null;
  return fisherInterval(r, 1 / Math.sqrt(n - 3));
}

function fisherInterval(r: number, se: number): [number, number] {
  const z = Math.atanh(clampUnit(r));
  return [Math.tanh(z - Z_975 * se), Math.tanh(z + Z_975 * se)];
}

function clampUnit(r: number): number {
  return r > 1 ? 1 : r < -1 ? -1 : r;
}

/** Statistics for one layer only: the counts, no coefficient. */
export function countOnly(method: PairStats["method"], pairs: Pairs): PairStats {
  const n = pairs.x.length;
  return { method, r: null, ci: null, ciMethod: null, n, nMissing: pairs.total - n, tooFew: n < TOO_FEW_N };
}

/**
 * Pearson r with its Fisher 95% interval. With `tooFew` the coefficient is withheld (r and ci null),
 * because the panel never prints a number for fewer than TOO_FEW_N pairs.
 */
export function pearsonStats(pairs: Pairs): PairStats {
  const base = countOnly("pearson", pairs);
  if (!pairs.y || base.tooFew) return base;
  const r = pearson(pairs.x, pairs.y);
  if (r === null) return base;
  const ci = pearsonInterval(r, base.n);
  return { ...base, r, ci, ciMethod: ci ? "approx" : null };
}

export interface SpearmanOptions {
  resamples: number;
  seed: number;
}

/**
 * Spearman rho with its 95% interval: a seeded percentile bootstrap up to BOOTSTRAP_MAX_N pairs,
 * Bonett-Wright above it. With `tooFew` the coefficient is withheld (r and ci null).
 */
export function spearmanStats(pairs: Pairs, options: SpearmanOptions): PairStats {
  const base = countOnly("spearman", pairs);
  if (!pairs.y || base.tooFew) return base;
  const orderX = argsort(pairs.x);
  const orderY = argsort(pairs.y);
  const r = pearson(averageRanks(pairs.x, orderX), averageRanks(pairs.y, orderY));
  if (r === null) return base;
  if (base.n <= BOOTSTRAP_MAX_N) {
    const boot = bootstrapSpearman(pairs.x, pairs.y, options.resamples, options.seed, orderX, orderY);
    return { ...base, r, ci: boot?.ci ?? null, ciMethod: boot ? "bootstrap" : null };
  }
  const ci = bonettWrightInterval(r, base.n);
  return { ...base, r, ci, ciMethod: ci ? "approx" : null };
}
