// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import { bootstrapSpearman, createRng, percentile } from "./bootstrap";
import { argsort, spearman } from "./correlation";

describe("createRng", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
  });

  it("returns roughly uniform unsigned 32-bit integers", () => {
    const rng = createRng(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const v = rng();
      expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
      buckets[Math.floor((v / 2 ** 32) * 10)]++;
    }
    for (const count of buckets) expect(Math.abs(count - 10_000)).toBeLessThan(500);
  });
});

describe("percentile", () => {
  it("interpolates linearly like numpy.percentile", () => {
    const sorted = Float64Array.from([1, 2, 3, 4]);
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile(sorted, 1)).toBe(4);
    expect(percentile(sorted, 0.5)).toBe(2.5);
    expect(percentile(sorted, 0.025)).toBeCloseTo(1.075, 12);
  });
});

/** The textbook bootstrap: materialize each resample and re-rank it from scratch, drawing indices identically. */
function naiveBootstrap(x: Float64Array, y: Float64Array, resamples: number, seed: number): [number, number] {
  const rng = createRng(seed);
  const n = x.length;
  const stats: number[] = [];
  for (let b = 0; b < resamples; b++) {
    const counts = new Uint32Array(n);
    for (let k = 0; k < n; k++) counts[Math.floor((rng() / 4294967296) * n)]++;
    const rx: number[] = [];
    const ry: number[] = [];
    counts.forEach((c, i) => {
      for (let j = 0; j < c; j++) {
        rx.push(x[i]);
        ry.push(y[i]);
      }
    });
    const rho = spearman(Float64Array.from(rx), Float64Array.from(ry));
    if (rho !== null) stats.push(rho);
  }
  const sorted = Float64Array.from(stats).sort();
  return [percentile(sorted, 0.025), percentile(sorted, 0.975)];
}

describe("bootstrapSpearman", () => {
  const rng = createRng(1);
  // Integer scores 0-20 so that both original ties and repeated draws exercise the average-rank path.
  const x = Float64Array.from({ length: 300 }, () => rng() % 21);
  const y = Float64Array.from(x, (v) => (v + (rng() % 15)) % 21);

  it("equals the materialize-and-re-rank bootstrap exactly", () => {
    const fast = bootstrapSpearman(x, y, 200, 42, argsort(x), argsort(y))!;
    const [lo, hi] = naiveBootstrap(x, y, 200, 42);
    expect(fast.ci[0]).toBeCloseTo(lo, 12);
    expect(fast.ci[1]).toBeCloseTo(hi, 12);
    expect(fast.valid).toBe(200);
  });

  it("is stable for a seed and changes with it", () => {
    const a = bootstrapSpearman(x, y, 1000, 42, argsort(x), argsort(y))!;
    const b = bootstrapSpearman(x, y, 1000, 42, argsort(x), argsort(y))!;
    const c = bootstrapSpearman(x, y, 1000, 43, argsort(x), argsort(y))!;
    expect(b.ci).toEqual(a.ci);
    expect(c.ci).not.toEqual(a.ci);
  });

  it("skips resamples with no variance and gives up when most have none", () => {
    // Two distinct x values out of 12: some resamples draw only one of them and have no rho.
    const x2 = Float64Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const y2 = Float64Array.from({ length: 12 }, (_, i) => i);
    const r = bootstrapSpearman(x2, y2, 1000, 42, argsort(x2), argsort(y2))!;
    expect(r.valid).toBeLessThan(1000);
    expect(r.valid).toBeGreaterThan(500);
    const constant = Float64Array.from([3, 3, 3, 3]);
    expect(
      bootstrapSpearman(constant, y2.subarray(0, 4), 100, 42, argsort(constant), argsort(y2.subarray(0, 4))),
    ).toBeNull();
  });
});
