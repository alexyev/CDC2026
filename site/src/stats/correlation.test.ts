// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import cases from "@/test/fixtures/stats-cases.json";
import {
  averageRanks,
  bonettWrightInterval,
  completePairs,
  pearson,
  pearsonInterval,
  pearsonStats,
  spearman,
  spearmanStats,
} from "./correlation";

const f64 = (v: number[]) => Float64Array.from(v);
const OPTIONS = { resamples: 1000, seed: 42 };

describe("Appendix C small cases", () => {
  for (const c of cases.small) {
    it(`${c.name}: Spearman and Pearson to 6 decimals`, () => {
      expect(spearman(f64(c.x), f64(c.y))!).toBeCloseTo(c.spearman, 6);
      expect(pearson(f64(c.x), f64(c.y))!).toBeCloseTo(c.pearson, 6);
    });
  }
});

describe("averageRanks", () => {
  it("gives tied values the average of the ranks they span", () => {
    expect(Array.from(averageRanks(f64([1, 2, 2, 3, 4, 4, 4, 5])))).toEqual([1, 2.5, 2.5, 4, 6, 6, 6, 8]);
  });

  it("ranks unsorted input with ties", () => {
    expect(Array.from(averageRanks(f64([10, 30, 20, 30, 10])))).toEqual([1.5, 4.5, 3, 4.5, 1.5]);
  });

  it("gives an all-equal column the middle rank", () => {
    expect(Array.from(averageRanks(f64([7, 7, 7])))).toEqual([2, 2, 2]);
  });
});

describe("completePairs (pairwise deletion)", () => {
  it("keeps only units where both values are present", () => {
    const p = completePairs([1, null, 3, 4, NaN], [5, 6, null, 8, 9]);
    expect(Array.from(p.x)).toEqual([1, 4]);
    expect(Array.from(p.y!)).toEqual([5, 8]);
    expect(p.total).toBe(5);
  });

  it("keeps every present value when there is no second column", () => {
    const p = completePairs([1, null, 3]);
    expect(Array.from(p.x)).toEqual([1, 3]);
    expect(p.y).toBeNull();
  });
});

describe("coefficients", () => {
  it("returns null for a constant column instead of NaN", () => {
    expect(pearson(f64([1, 1, 1]), f64([1, 2, 3]))).toBeNull();
    expect(spearman(f64([1, 2, 3]), f64([4, 4, 4]))).toBeNull();
  });

  it("is exactly +-1 for monotone data", () => {
    expect(spearman(f64([1, 2, 3, 4]), f64([1, 8, 27, 64]))).toBe(1);
    expect(spearman(f64([1, 2, 3, 4]), f64([4, 3, 2, 1]))).toBe(-1);
  });
});

describe("intervals", () => {
  it("Bonett-Wright matches tanh(atanh(rho) +- 1.96 sqrt((1 + rho^2/2) / (n - 3)))", () => {
    const [lo, hi] = bonettWrightInterval(0.2419, 20201)!;
    const se = Math.sqrt((1 + 0.2419 ** 2 / 2) / 20198);
    expect(lo).toBeCloseTo(Math.tanh(Math.atanh(0.2419) - 1.959964 * se), 9);
    expect(hi).toBeCloseTo(Math.tanh(Math.atanh(0.2419) + 1.959964 * se), 9);
    // SPEC.md 6.3 example row: "rho = 0.24 95% CI 0.23 to 0.26 n = 20,201 schools".
    expect(lo.toFixed(2)).toBe("0.23");
    expect(hi.toFixed(2)).toBe("0.26");
  });

  it("Fisher interval for Pearson and degenerate inputs", () => {
    const [lo, hi] = pearsonInterval(0.5, 103)!;
    expect(lo).toBeCloseTo(Math.tanh(Math.atanh(0.5) - 0.1959964), 6);
    expect(hi).toBeCloseTo(Math.tanh(Math.atanh(0.5) + 0.1959964), 6);
    expect(pearsonInterval(0.5, 3)).toBeNull();
    expect(bonettWrightInterval(1, 50)).toEqual([1, 1]);
  });
});

describe("PairStats", () => {
  const x = Array.from({ length: 12 }, (_, i) => i);
  const y = x.map((v) => (v * 7) % 12);

  it("withholds the coefficient below 10 complete pairs and reports the missing count", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const ys = [1, 3, 2, 5, 4, 7, 6, 9, 8, null, null];
    const s = spearmanStats(completePairs(xs, ys), OPTIONS);
    expect(s).toEqual({ method: "spearman", r: null, ci: null, ciMethod: null, n: 9, nMissing: 2, tooFew: true });
    expect(pearsonStats(completePairs(xs, ys)).tooFew).toBe(true);
  });

  it("uses the bootstrap at 10 pairs and up to 5,000", () => {
    const s = spearmanStats(completePairs(x, y), OPTIONS);
    expect(s.tooFew).toBe(false);
    expect(s.n).toBe(12);
    expect(s.ciMethod).toBe("bootstrap");
    expect(s.ci![0]).toBeLessThanOrEqual(s.r!);
    expect(s.ci![1]).toBeGreaterThanOrEqual(s.r!);
  });

  it("switches to the Bonett-Wright approximation above 5,000 pairs", () => {
    const big = Array.from({ length: 5001 }, (_, i) => i);
    const s = spearmanStats(
      completePairs(
        big,
        big.map((v) => (v * 37) % 101),
      ),
      OPTIONS,
    );
    expect(s.ciMethod).toBe("approx");
    expect(s.ci).toEqual(bonettWrightInterval(s.r!, 5001));
  });

  it("reports Pearson with an approximate interval", () => {
    const s = pearsonStats(completePairs(x, y));
    expect(s.method).toBe("pearson");
    expect(s.r).toBeCloseTo(pearson(f64(x), f64(y))!, 12);
    expect(s.ciMethod).toBe("approx");
  });
});
