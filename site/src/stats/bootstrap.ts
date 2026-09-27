// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Seeded percentile bootstrap for Spearman's rho (SPEC.md 6.2): resample pairs with replacement, 95% interval.
// A resample only repeats original values, so each one is ranked in O(n) from the original sort order and the
// multiplicity of every unit, instead of re-sorting: 1,000 resamples of 5,000 pairs take tens of milliseconds.

// Method: xoshiro128** (Blackman and Vigna 2021) seeded by splitmix32 (Steele, Lea, and Flood 2014); see
// CITATIONS.md, section 3.
/** xoshiro128** seeded through splitmix32; returns uniform 32-bit unsigned integers. */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  const splitmix = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();
  return () => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result;
  };
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** Linear-interpolated percentile of ascending `sorted` (numpy's default method); p in [0, 1]. */
export function percentile(sorted: Float64Array, p: number): number {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Positions in `order` where a run of equal values starts, plus a final sentinel at n. */
function tieGroups(values: Float64Array, order: Uint32Array): Uint32Array {
  const starts: number[] = [0];
  for (let k = 1; k < order.length; k++) if (values[order[k]] !== values[order[k - 1]]) starts.push(k);
  starts.push(order.length);
  return Uint32Array.from(starts);
}

/**
 * Ranks each original unit would get in a resample where unit i appears counts[i] times.
 * Ties (original ties and repeated draws alike) share the average rank of the run they span.
 */
function resampleRanks(order: Uint32Array, groups: Uint32Array, counts: Uint32Array, out: Float64Array): void {
  let offset = 0;
  for (let g = 0; g + 1 < groups.length; g++) {
    let size = 0;
    for (let k = groups[g]; k < groups[g + 1]; k++) size += counts[order[k]];
    if (size === 0) continue;
    const rank = offset + (size + 1) / 2;
    for (let k = groups[g]; k < groups[g + 1]; k++) out[order[k]] = rank;
    offset += size;
  }
}

export interface BootstrapResult {
  ci: [number, number];
  /** Resamples with a defined rho (a resample of constant values has none and is skipped). */
  valid: number;
}

// Method: Percentile bootstrap (Efron 1979; Efron and Tibshirani 1993); see CITATIONS.md, section 3.
/**
 * Percentile bootstrap 95% interval of Spearman's rho over complete pairs (x[i], y[i]).
 * Deterministic for a given seed. Returns null when fewer than half the resamples define rho.
 */
export function bootstrapSpearman(
  x: Float64Array,
  y: Float64Array,
  resamples: number,
  seed: number,
  orderX: Uint32Array,
  orderY: Uint32Array,
): BootstrapResult | null {
  const n = x.length;
  if (n < 2) return null;
  const groupsX = tieGroups(x, orderX);
  const groupsY = tieGroups(y, orderY);
  const rng = createRng(seed);
  const counts = new Uint32Array(n);
  const rx = new Float64Array(n);
  const ry = new Float64Array(n);
  const mean = (n + 1) / 2;
  const stats = new Float64Array(resamples);
  let valid = 0;
  for (let b = 0; b < resamples; b++) {
    counts.fill(0);
    for (let k = 0; k < n; k++) counts[Math.floor((rng() / 4294967296) * n)]++;
    resampleRanks(orderX, groupsX, counts, rx);
    resampleRanks(orderY, groupsY, counts, ry);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      const c = counts[i];
      if (c === 0) continue;
      const dx = rx[i] - mean;
      const dy = ry[i] - mean;
      sxy += c * dx * dy;
      sxx += c * dx * dx;
      syy += c * dy * dy;
    }
    if (sxx > 0 && syy > 0) stats[valid++] = sxy / Math.sqrt(sxx * syy);
  }
  if (valid < resamples / 2) return null;
  const sorted = stats.subarray(0, valid).sort();
  return { ci: [percentile(sorted, 0.025), percentile(sorted, 0.975)], valid };
}
