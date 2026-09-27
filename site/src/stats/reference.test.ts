// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// @vitest-environment node
/// <reference types="node" />
// Reproduces the Appendix C full-data reference values from the pipeline input CSV, and checks the performance
// budgets of SPEC.md 10.1 (a 23k-pair request under 400 ms; a 5,000-unit bootstrap under 1.5 s) in Node.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import cases from "@/test/fixtures/stats-cases.json";
import type { InsightRequest } from "@/lib/types";
import { completePairs, pearsonStats, spearmanStats } from "./correlation";
import { clearInsightCache, computeInsight } from "./insight";

const CSV = fileURLToPath(new URL("../../../data/index_scores_v3_2026_ct_filled.csv", import.meta.url));
const COLUMNS = { crime: "Crime", education: "Education", economic: "Economic" } as const;
type Layer = keyof typeof COLUMNS;
const OPTIONS = { resamples: 1000, seed: 42 } as const;

/** RFC 4180 rows: quoted fields may hold commas, doubled quotes, and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

interface School {
  state: string;
  county: string;
  values: Record<Layer, number | null>;
}

let schools: School[] = [];

beforeAll(() => {
  const [header, ...rows] = parseCsv(readFileSync(CSV, "utf8"));
  const col = (name: string) => header.indexOf(name);
  const missing = new Set(["", "N/A", "Null"]);
  const num = (s: string) => (missing.has(s) ? null : Number(s));
  schools = rows.map((r) => ({
    state: r[col("State")],
    county: r[col("FIPS County Code")],
    values: {
      crime: num(r[col(COLUMNS.crime)]),
      education: num(r[col(COLUMNS.education)]),
      economic: num(r[col(COLUMNS.economic)]),
    },
  }));
});

/** Unrounded per-area means of each layer over the schools that have a value (Appendix C). */
function areaMeans(key: (s: School) => string, a: Layer, b: Layer): { x: (number | null)[]; y: (number | null)[] } {
  const acc = new Map<string, { sa: number; na: number; sb: number; nb: number }>();
  for (const s of schools) {
    const k = key(s);
    const e = acc.get(k) ?? { sa: 0, na: 0, sb: 0, nb: 0 };
    if (s.values[a] !== null) {
      e.sa += s.values[a];
      e.na++;
    }
    if (s.values[b] !== null) {
      e.sb += s.values[b];
      e.nb++;
    }
    acc.set(k, e);
  }
  const areas = [...acc.values()];
  return { x: areas.map((e) => (e.na ? e.sa / e.na : null)), y: areas.map((e) => (e.nb ? e.sb / e.nb : null)) };
}

function columns(level: string, scope: string, a: Layer, b: Layer) {
  if (level === "counties") return areaMeans((s) => s.county, a, b);
  if (level === "states") return areaMeans((s) => s.state, a, b);
  const inScope = scope === "national" ? schools : schools.filter((s) => s.state === scope);
  return { x: inScope.map((s) => s.values[a]), y: inScope.map((s) => s.values[b]) };
}

describe("Appendix C reference values from the full data", () => {
  it("reads all 23,595 schools", () => {
    expect(schools).toHaveLength(23595);
  });

  for (const ref of cases.reference) {
    const [a, b] = ref.pair as [Layer, Layer];
    it(`${a} vs ${b}, ${ref.level}, ${ref.scope}: rho ${ref.spearman}, r ${ref.pearson}, n ${ref.n}`, () => {
      const { x, y } = columns(ref.level, ref.scope, a, b);
      const pairs = completePairs(x, y);
      const s = spearmanStats(pairs, OPTIONS);
      const p = pearsonStats(pairs);
      expect(s.n).toBe(ref.n);
      expect(s.r!).toBeCloseTo(ref.spearman, 4);
      expect(p.r!).toBeCloseTo(ref.pearson, 4);
      expect(s.ciMethod).toBe(ref.n > 5000 ? "approx" : "bootstrap");
      expect(s.ci![0]).toBeLessThan(s.r!);
      expect(s.ci![1]).toBeGreaterThan(s.r!);
    });
  }

  it("county-mean bootstrap: contains 0.3966, width 0.05 to 0.10, identical across runs with seed 42", () => {
    const { x, y } = columns("counties", "national", "crime", "education");
    const first = spearmanStats(completePairs(x, y), OPTIONS);
    const second = spearmanStats(completePairs(x, y), OPTIONS);
    const [lo, hi] = first.ci!;
    expect(first.ciMethod).toBe("bootstrap");
    expect(lo).toBeLessThan(cases.bootstrap.numpyInterval[0] + 0.01);
    expect(hi).toBeGreaterThan(cases.bootstrap.numpyInterval[1] - 0.01);
    expect(lo).toBeLessThan(0.3966);
    expect(hi).toBeGreaterThan(0.3966);
    expect(hi - lo).toBeGreaterThanOrEqual(0.05);
    expect(hi - lo).toBeLessThanOrEqual(0.1);
    expect(second.ci).toEqual(first.ci);
  });
});

describe("performance budgets (SPEC.md 10.1)", () => {
  function request(
    requestId: number,
    areas: InsightRequest["areas"],
    x: (number | null)[],
    y: (number | null)[],
  ): InsightRequest {
    const ids = x.map((_, i) => String(i));
    return { requestId, layerA: "crime", layerB: "education", areas, schools: { ids, x, y }, bootstrap: OPTIONS };
  }

  it("the national school-level pair (23,595 schools) returns in under 400 ms", () => {
    clearInsightCache();
    const { x, y } = columns("schools", "national", "crime", "education");
    const t0 = performance.now();
    const result = computeInsight(request(1, undefined, x, y));
    const ms = performance.now() - t0;
    expect(x).toHaveLength(23595);
    expect(result.schools.spearman.n).toBe(20201);
    expect(result.schools.spearman.r!).toBeCloseTo(0.2419, 4);
    console.info(`23,595-school request: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(400);
  });

  it("a 5,000-unit bootstrap plus 23k schools returns in under 1.5 s", () => {
    clearInsightCache();
    const { x, y } = columns("schools", "national", "economic", "education");
    const areas = { ids: x.slice(0, 5000).map((_, i) => `a${i}`), x: x.slice(0, 5000), y: y.slice(0, 5000) };
    const t0 = performance.now();
    const result = computeInsight(request(2, areas, x, y));
    const ms = performance.now() - t0;
    expect(result.areas!.spearman.ciMethod).toBe("bootstrap");
    expect(result.areas!.spearman.n).toBeGreaterThan(4900);
    console.info(`5,000-unit bootstrap + 23,595 schools: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1500);
  });
});
