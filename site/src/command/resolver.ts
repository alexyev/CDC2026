// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Place resolution for the command bar (SPEC.md 14.5): a place query as written ("LA County", "Springfield",
// "Cook County Illinois") becomes ranked candidates from the gazetteer and the school names.
// Exact name matches come from hash maps; fuse.js (threshold 0.3) is the fuzzy fallback. The query's kind and
// state hint are boosts, and candidates that name the same place at several kinds collapse to the coarsest one.

import Fuse from "fuse.js";
import type { GazetteerEntry, GazetteerFile, SchoolsFile } from "@/lib/dataTypes";
import type { BBox, Intent, PlaceKind, PlaceRef } from "@/lib/types";

export type PlaceQuery = Intent["places"][number];

/** A resolved place. `ref` is absent only for regions (e.g. "Bay Area"), which have a bbox but no single id. */
export interface PlaceCandidate {
  ref?: PlaceRef;
  kind: PlaceKind | "region";
  /** Display name as stored, e.g. "Los Angeles County", "Springfield", "Albertville High School". */
  name: string;
  /** USPS code; empty for multi-state regions. */
  st: string;
  bbox?: BBox;
  /** School location. */
  center?: [number, number];
  /** Adjusted match score, lower is better (fuse.js semantics, can go below 0 after boosts). */
  score: number;
  /** Number of schools in the place; breaks ties between same-named places ("Cook County", IL vs GA). */
  schools: number;
}

export type Decision =
  { kind: "match"; candidate: PlaceCandidate } | { kind: "choice"; candidates: PlaceCandidate[] } | { kind: "none" };

export interface ResolveOptions {
  /** Run the fuse.js fallback when no exact name matches. Default true. */
  fuzzy?: boolean;
}

export interface Resolver {
  resolve(query: PlaceQuery, opts?: ResolveOptions): PlaceCandidate[];
  /**
   * SPEC.md 14.5: one candidate, or a top candidate at least 0.15 better than the next, is a match. A tie is also
   * settled when the top candidate has at least ten times the schools of the next (Cook County, IL vs Cook County, GA).
   */
  decide(candidates: PlaceCandidate[]): Decision;
  lookup(ref: PlaceRef): PlaceCandidate | undefined;
  /** County GEOID a place belongs to: itself, the county of a school, or the modal county of a city's or district's schools. */
  countyOf(candidate: PlaceCandidate): string | undefined;
  /** Short human label: "California", "Los Angeles County", "Springfield, IL". */
  label(candidate: PlaceCandidate): string;
  /** USPS code for a state name or code, e.g. "Illinois" or "il" -> "IL". */
  stateCode(text: string): string | undefined;
  /** State name for a USPS code, e.g. "IL" -> "Illinois". */
  stateName(code: string): string | undefined;
}

export const FUZZY_THRESHOLD = 0.3;
export const DECISIVE_MARGIN = 0.15;
const KIND_BOOST = 0.2;
const STATE_BOOST = 0.2;
const STATE_MISMATCH_PENALTY = 0.3;
const MAX_FUZZY_RESULTS = 12;
const PROMINENCE_RATIO = 10;

const KIND_PRIORITY: Record<PlaceCandidate["kind"], number> = {
  region: 0,
  state: 1,
  county: 2,
  city: 3,
  district: 4,
  school: 5,
};

/** County-equivalent suffixes stripped to get a county's base name ("Cook County" -> "cook"). */
const COUNTY_SUFFIXES = [
  "city and borough",
  "census area",
  "planning region",
  "municipality",
  "municipio",
  "borough",
  "parish",
  "county",
  "city",
];

/** Whole-query shorthands, applied after normalization. */
const QUERY_ALIASES: Record<string, string> = {
  la: "los angeles",
  "la county": "los angeles county",
  sf: "san francisco",
  "sf county": "san francisco county",
  dc: "district of columbia",
  "washington dc": "district of columbia",
  philly: "philadelphia",
};

/** Multi-county regions people name that are not in the gazetteer, as county GEOIDs. */
const REGIONS: Record<string, { name: string; st: string; counties: string[] }> = {
  "bay area": {
    name: "Bay Area",
    st: "CA",
    counties: ["06001", "06013", "06041", "06055", "06075", "06081", "06085", "06095", "06097"],
  },
  "sf bay area": {
    name: "Bay Area",
    st: "CA",
    counties: ["06001", "06013", "06041", "06055", "06075", "06081", "06085", "06095", "06097"],
  },
  nyc: { name: "New York City", st: "NY", counties: ["36005", "36047", "36061", "36081", "36085"] },
  "new york city": { name: "New York City", st: "NY", counties: ["36005", "36047", "36061", "36081", "36085"] },
};

/** Word forms normalized the same way on both sides so "Saint Louis" meets "St. Louis". */
const WORD_FORMS: Record<string, string> = { saint: "st", ste: "st", ft: "fort", mt: "mount" };

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => WORD_FORMS[w] ?? w)
    .join(" ");
}

/** School names without the word "school", so "... High School for Science" meets "... High for Science". */
function schoolKey(norm: string): string {
  return norm
    .split(" ")
    .filter((w) => w !== "school" && w !== "schools")
    .join(" ");
}

function countyBase(norm: string): string {
  for (const suffix of COUNTY_SUFFIXES) {
    if (norm.endsWith(` ${suffix}`)) return norm.slice(0, -suffix.length - 1);
  }
  return norm;
}

interface Item {
  kind: PlaceKind;
  id: string;
  name: string;
  st: string;
  norm: string;
  /** County base name, or the normalized name for other kinds. */
  base: string;
  bbox?: BBox;
  center?: [number, number];
}

function unionBBox(boxes: BBox[]): BBox | undefined {
  if (boxes.length === 0) return undefined;
  return boxes.reduce<BBox>(
    (u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function createResolver(gazetteer: GazetteerFile, schools?: SchoolsFile | null): Resolver {
  const items: Item[] = gazetteer.entries.map((e: GazetteerEntry) => {
    const norm = normalize(e.n);
    return {
      kind: e.k,
      id: e.id,
      name: e.n,
      st: e.st,
      norm,
      base: e.k === "county" ? countyBase(norm) : norm,
      bbox: e.bb,
    };
  });
  const schoolIndex = new Map<string, number>();
  const schoolCounts = new Map<string, number>();
  const count = (key: string) => schoolCounts.set(key, (schoolCounts.get(key) ?? 0) + 1);
  if (schools) {
    schools.ids.forEach((id, i) => {
      schoolIndex.set(id, i);
      const st = schools.st[i] ?? "";
      count(`state:${schools.stfp[i]}`);
      count(`county:${schools.county[i]}`);
      count(`city:${st}:${schools.city[i]}`);
      count(`district:${st}:${schools.district[i]}`);
      const norm = normalize(schools.name[i] ?? "");
      items.push({
        kind: "school",
        id,
        name: schools.name[i] ?? id,
        st: schools.st[i] ?? "",
        norm,
        base: norm,
        center: [schools.lon[i] ?? 0, schools.lat[i] ?? 0],
      });
    });
  }

  const byName = new Map<string, Item[]>();
  const byRef = new Map<string, Item>();
  const statesByCode = new Map<string, Item>();
  const statesByName = new Map<string, Item>();
  const countyBBox = new Map<string, BBox>();
  for (const item of items) {
    push(byName, item.norm, item);
    if (item.base !== item.norm) push(byName, item.base, item);
    if (item.kind === "school") {
      const key = schoolKey(item.norm);
      if (key && key !== item.norm) push(byName, key, item);
    }
    byRef.set(`${item.kind}:${item.id}`, item);
    if (item.kind === "state") {
      statesByCode.set(item.st.toLowerCase(), item);
      statesByName.set(item.norm, item);
    }
    if (item.kind === "county" && item.bbox) countyBBox.set(item.id, item.bbox);
  }

  let fuse: Fuse<Item> | undefined;
  const getFuse = () =>
    (fuse ??= new Fuse(items, {
      keys: ["norm", "base"],
      includeScore: true,
      threshold: FUZZY_THRESHOLD,
      ignoreLocation: true,
      ignoreFieldNorm: true,
    }));

  function stateCode(text: string): string | undefined {
    const norm = normalize(text);
    return (statesByName.get(norm) ?? statesByCode.get(norm))?.st;
  }

  function stateName(code: string): string | undefined {
    return statesByCode.get(code.toLowerCase())?.name;
  }

  /** "cook county illinois" -> { rest: "cook county", st: "IL" }; never splits a query that is itself a state. */
  function splitTrailingState(norm: string): { rest: string; st?: string } {
    const words = norm.split(" ");
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const suffix = words.slice(-n).join(" ");
      const state = statesByName.get(suffix) ?? (n === 1 && suffix.length === 2 ? statesByCode.get(suffix) : undefined);
      if (!state) continue;
      const rest = words.slice(0, -n).join(" ");
      return rest ? { rest, st: state.st } : { rest: norm };
    }
    return { rest: norm };
  }

  function toCandidate(item: Item, score: number): PlaceCandidate {
    return {
      ref: { kind: item.kind, id: item.id },
      kind: item.kind,
      name: item.name,
      st: item.st,
      bbox: item.bbox,
      center: item.center,
      score,
      schools: item.kind === "school" ? 1 : (schoolCounts.get(`${item.kind}:${item.id}`) ?? 0),
    };
  }

  function regionCandidate(key: string): PlaceCandidate | undefined {
    const region = REGIONS[key];
    if (!region) return undefined;
    const bbox = unionBBox(
      region.counties.flatMap((id): BBox[] => {
        const bb = countyBBox.get(id);
        return bb ? [bb] : [];
      }),
    );
    if (!bbox) return undefined;
    return { kind: "region", name: region.name, st: region.st, bbox, score: 0, schools: 0 };
  }

  function resolve(query: PlaceQuery, opts: ResolveOptions = {}): PlaceCandidate[] {
    let norm = normalize(query.query).replace(/^the /, "");
    norm = QUERY_ALIASES[norm] ?? norm;
    if (!norm) return [];

    const region = regionCandidate(norm);
    if (region) return [region];

    const split = splitTrailingState(norm);
    const text = QUERY_ALIASES[split.rest] ?? split.rest;
    const hintSt = split.st ?? (query.stateHint ? stateCode(query.stateHint) : undefined);
    const wantsCounty = query.kind === "county" || countyBase(text) !== text;

    // A bare two-letter code is a state only when the query says so ("LA" is Los Angeles otherwise).
    const codeState = text.length === 2 && query.kind === "state" ? statesByCode.get(text) : undefined;
    const exact: Item[] = codeState ? [codeState] : [...(byName.get(text) ?? [])];
    if (!codeState && (query.kind === "school" || query.kind === "unknown")) {
      const key = schoolKey(text);
      for (const item of key && key !== text ? (byName.get(key) ?? []) : []) {
        if (item.kind === "school" && !exact.includes(item)) exact.push(item);
      }
    }
    if (wantsCounty && !codeState) {
      for (const item of byName.get(countyBase(text)) ?? []) {
        if (item.kind === "county" && !exact.includes(item)) exact.push(item);
      }
    }

    let scored: { item: Item; score: number }[] = exact.map((item) => ({ item, score: 0 }));
    if (scored.length === 0 && opts.fuzzy !== false) {
      scored = getFuse()
        .search(text, { limit: MAX_FUZZY_RESULTS })
        .map((r) => ({ item: r.item, score: r.score ?? 1 }));
    }

    const adjusted = scored.map(({ item, score }) => {
      let s = score;
      if (query.kind !== "unknown" && item.kind === query.kind) s -= KIND_BOOST;
      else if (wantsCounty && item.kind === "county") s -= KIND_BOOST;
      // With no kind given, a state name means the state (California, not California, MO).
      else if (query.kind === "unknown" && item.kind === "state" && score === 0) s -= KIND_BOOST;
      if (hintSt && item.kind !== "state") s += item.st === hintSt ? -STATE_BOOST : STATE_MISMATCH_PENALTY;
      return toCandidate(item, s);
    });

    // One place often appears as several kinds (Los Angeles County / Los Angeles city, Springfield city / district):
    // keep the best-scoring entry per (base name, state), preferring the coarser kind on ties.
    const groups = new Map<string, PlaceCandidate>();
    for (const c of adjusted) {
      const item = byRef.get(`${c.kind}:${c.ref?.id}`);
      const key = `${item?.base}|${c.st}`;
      const prev = groups.get(key);
      if (
        !prev ||
        c.score < prev.score ||
        (c.score === prev.score && KIND_PRIORITY[c.kind] < KIND_PRIORITY[prev.kind])
      ) {
        groups.set(key, c);
      }
    }
    return [...groups.values()].sort(
      (a, b) => a.score - b.score || b.schools - a.schools || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind],
    );
  }

  function decide(candidates: PlaceCandidate[]): Decision {
    const [top, next] = candidates;
    if (!top) return { kind: "none" };
    if (!next || next.score - top.score >= DECISIVE_MARGIN - 1e-9) return { kind: "match", candidate: top };
    if (next.score >= top.score && top.schools > 0 && top.schools >= PROMINENCE_RATIO * next.schools) {
      return { kind: "match", candidate: top };
    }
    return { kind: "choice", candidates: candidates.slice(0, 3) };
  }

  function lookup(ref: PlaceRef): PlaceCandidate | undefined {
    const item = byRef.get(`${ref.kind}:${ref.id}`);
    return item ? toCandidate(item, 0) : undefined;
  }

  function countyOf(candidate: PlaceCandidate): string | undefined {
    const ref = candidate.ref;
    if (!ref) return undefined;
    if (ref.kind === "county") return ref.id;
    if (!schools) return undefined;
    if (ref.kind === "school") {
      const i = schoolIndex.get(ref.id);
      return i === undefined ? undefined : schools.county[i];
    }
    if (ref.kind === "city" || ref.kind === "district") {
      const column = ref.kind === "city" ? schools.city : schools.district;
      const counts = new Map<string, number>();
      column.forEach((value, i) => {
        if (value === candidate.name && schools.st[i] === candidate.st) {
          const county = schools.county[i] ?? "";
          counts.set(county, (counts.get(county) ?? 0) + 1);
        }
      });
      let best: string | undefined;
      let bestN = 0;
      for (const [county, n] of counts) {
        if (n > bestN) [best, bestN] = [county, n];
      }
      return best;
    }
    return undefined;
  }

  function label(candidate: PlaceCandidate): string {
    return candidate.kind === "city" || candidate.kind === "district"
      ? `${candidate.name}, ${candidate.st}`
      : candidate.name;
  }

  return { resolve, decide, lookup, countyOf, label, stateCode, stateName };
}

let shared: Promise<Resolver> | undefined;
let ready: Resolver | undefined;

/**
 * The app-wide resolver over the gazetteer and school names, built once. School names are optional: if
 * schools/all.json fails to load, places still resolve. A failed gazetteer load is not cached, so it can be retried.
 */
export function getResolver(): Promise<Resolver> {
  shared ??= (async () => {
    const { load } = await import("@/lib/loaders");
    const [gazetteer, schools] = await Promise.all([load("gazetteer"), load("schools").catch(() => null)]);
    ready = createResolver(gazetteer, schools);
    return ready;
  })().catch((err: unknown) => {
    shared = undefined;
    throw err;
  });
  return shared;
}

/** The shared resolver if it has finished building, without waiting. */
export function peekResolver(): Resolver | undefined {
  return ready;
}
