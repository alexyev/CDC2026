// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Place and school search (SPEC.md 3.11): an index over the gazetteer and school names.
// Ranking is deterministic and explainable (exact name, then name plus place context, then prefix, then word
// prefixes); a Fuse.js token index catches typos when those tiers leave room. This module is loaded lazily with
// fuse.js (SPEC.md 10.1 step 4), so the main bundle only imports its types.

import Fuse, { type FuseIndex } from "fuse.js";
import type { GazetteerFile, SchoolsFile } from "./dataTypes";
import type { BBox, Camera, PlaceKind } from "./types";

/** One searchable place or school. */
export interface SearchDoc {
  kind: PlaceKind;
  /** PlaceRef id: STATEFP, GEOID, "{ST}:{name}", or NCESSCH. */
  id: string;
  /** Display name, as in the data. */
  name: string;
  /** USPS state code. */
  st: string;
  /** Secondary line, e.g. "Albertville, AL · Albertville City". */
  sub: string;
  /** Bounding box for states, counties, cities, and districts. */
  bbox: BBox | null;
  /** Location for schools. */
  lonLat: [number, number] | null;
  /** Normalized name. */
  key: string;
  /** Normalized name without its kind suffix ("los angeles" for "Los Angeles County"). */
  core: string;
  words: string[];
  /** Normalized context words: state code and name, and a school's city. */
  ctx: string[];
  /**
   * How big the place is, to put Springfield, MO before Springfield, CO: its number of schools once schools are
   * loaded, its bbox area in square degrees before that. Only compared between docs of one index.
   */
  size: number;
}

/** A ranked result. `ranges` are [start, end) character ranges of the display name to emphasize. */
export interface SearchHit {
  doc: SearchDoc;
  tier: Tier;
  ranges: [number, number][];
}

export interface SearchGroup {
  kind: PlaceKind;
  hits: SearchHit[];
}

/** Match quality, best first. */
export const Tier = {
  /** The name (or its core, or a state's USPS code) equals the query. */
  exact: 0,
  /** The query is the name followed by place context, e.g. "springfield il". */
  exactInPlace: 1,
  /** The name starts with the query. */
  prefix: 2,
  /** Every query word starts a word of the name. */
  words: 3,
  /** Every query word starts a word of the name or its context, at least one in the name. */
  wordsInPlace: 4,
  /** Fuzzy (typo-tolerant) match from the Fuse index. */
  fuzzy: 5,
} as const;
export type Tier = (typeof Tier)[keyof typeof Tier];

/** Most results shown at once (SPEC.md 3.11). */
export const MAX_RESULTS = 8;
/** Per-kind share of the results while other kinds have matches, so 24 "Lincoln County" rows cannot crowd out Lincoln, NE. */
const KIND_CAP = 5;
/** Fuzzy matching starts at this query length; shorter queries match everything fuzzily. */
const FUZZY_MIN_LENGTH = 3;

const KIND_RANK: Record<PlaceKind, number> = { state: 0, county: 1, city: 2, district: 3, school: 4 };

// County-equivalent suffixes in Census names (longest first), and the school suffix.
const COUNTY_SUFFIXES = [
  " city and borough",
  " census area",
  " planning region",
  " municipality",
  " municipio",
  " borough",
  " parish",
  " county",
];
const SCHOOL_SUFFIXES = [" school"];

/** Lowercase, strip diacritics and punctuation, and collapse whitespace. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function stripSuffix(key: string, suffixes: readonly string[]): string {
  for (const s of suffixes) if (key.endsWith(s) && key.length > s.length) return key.slice(0, -s.length);
  return key;
}

function words(key: string): string[] {
  return key ? key.split(" ") : [];
}

function makeDoc(
  kind: PlaceKind,
  id: string,
  name: string,
  st: string,
  sub: string,
  ctx: string[],
  bbox: BBox | null,
  lonLat: [number, number] | null,
): SearchDoc {
  const key = normalize(name);
  const core =
    kind === "county" ? stripSuffix(key, COUNTY_SUFFIXES) : kind === "school" ? stripSuffix(key, SCHOOL_SUFFIXES) : key;
  const size = bbox ? (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) : 0;
  return {
    kind,
    id,
    name,
    st,
    sub,
    bbox,
    lonLat,
    key,
    core,
    words: words(key),
    ctx: words(normalize(ctx.join(" "))),
    size,
  };
}

/** Maps USPS codes to state names, from the gazetteer's state entries. */
function stateNames(gazetteer: GazetteerFile): Map<string, string> {
  const names = new Map<string, string>();
  for (const e of gazetteer.entries) if (e.k === "state") names.set(e.st, e.n);
  return names;
}

export function gazetteerDocs(gazetteer: GazetteerFile): SearchDoc[] {
  const names = stateNames(gazetteer);
  return gazetteer.entries.map((e) => {
    const stateName = names.get(e.st) ?? e.st;
    switch (e.k) {
      case "state":
        return makeDoc("state", e.id, e.n, e.st, "State", [e.st], e.bb, null);
      case "county":
        return makeDoc("county", e.id, e.n, e.st, stateName, [e.st, stateName], e.bb, null);
      case "city":
        return makeDoc("city", e.id, e.n, e.st, `City in ${stateName}`, [e.st, stateName], e.bb, null);
      case "district":
        return makeDoc("district", e.id, e.n, e.st, `School district in ${stateName}`, [e.st, stateName], e.bb, null);
    }
  });
}

/** School docs; `stateNames` (USPS to name) lets "lincoln high nebraska" match. */
export function schoolDocs(schools: SchoolsFile, names: Map<string, string> = new Map()): SearchDoc[] {
  const docs: SearchDoc[] = new Array(schools.ids.length);
  for (let i = 0; i < schools.ids.length; i++) {
    const st = schools.st[i];
    const city = schools.city[i];
    const district = schools.district[i];
    const place = city ? `${city}, ${st}` : st;
    const sub = district ? `${place} · ${district}` : place;
    const ctx = [city, st, names.get(st) ?? ""];
    docs[i] = makeDoc("school", schools.ids[i], schools.name[i], st, sub, ctx, null, [schools.lon[i], schools.lat[i]]);
  }
  return docs;
}

/** Number of schools per place, keyed `{kind}:{PlaceRef id}` like the gazetteer docs. */
function schoolCounts(schools: SchoolsFile): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (let i = 0; i < schools.ids.length; i++) {
    const st = schools.st[i];
    add(`state:${schools.stfp[i]}`);
    add(`county:${schools.county[i]}`);
    if (schools.city[i]) add(`city:${st}:${schools.city[i]}`);
    if (schools.district[i]) add(`district:${st}:${schools.district[i]}`);
  }
  return counts;
}

/** Every query word starts some word in `pool`. */
function allPrefix(tokens: readonly string[], pool: readonly string[]): boolean {
  return tokens.every((t) => pool.some((w) => w.startsWith(t)));
}

function tierOf(doc: SearchDoc, q: string, tokens: readonly string[]): Tier | null {
  if (doc.key === q || doc.core === q || (doc.kind === "state" && doc.st.toLowerCase() === q)) return Tier.exact;
  for (const head of [doc.key, doc.core]) {
    if (q.length > head.length + 1 && q.startsWith(head + " ") && allPrefix(words(q.slice(head.length + 1)), doc.ctx))
      return Tier.exactInPlace;
  }
  if (doc.key.startsWith(q) || doc.core.startsWith(q)) return Tier.prefix;
  if (allPrefix(tokens, doc.words)) return Tier.words;
  const inName = tokens.some((t) => doc.words.some((w) => w.startsWith(t)));
  if (inName && tokens.every((t) => doc.words.some((w) => w.startsWith(t)) || doc.ctx.some((w) => w.startsWith(t))))
    return Tier.wordsInPlace;
  return null;
}

function compareHits(a: { doc: SearchDoc; tier: number }, b: { doc: SearchDoc; tier: number }): number {
  return (
    a.tier - b.tier ||
    KIND_RANK[a.doc.kind] - KIND_RANK[b.doc.kind] ||
    a.doc.words.length - b.doc.words.length ||
    a.doc.name.length - b.doc.name.length ||
    b.doc.size - a.doc.size ||
    a.doc.name.localeCompare(b.doc.name) ||
    a.doc.st.localeCompare(b.doc.st)
  );
}

/**
 * Picks at most `limit` hits from a ranked list, giving each kind at most KIND_CAP slots while other kinds still
 * have matches, then fills any remaining slots in rank order.
 */
function diversify<T extends { doc: SearchDoc }>(ranked: readonly T[], limit: number): T[] {
  const picked = new Set<T>();
  const perKind = new Map<PlaceKind, number>();
  for (const h of ranked) {
    if (picked.size >= limit) break;
    const n = perKind.get(h.doc.kind) ?? 0;
    if (n < KIND_CAP) {
      picked.add(h);
      perKind.set(h.doc.kind, n + 1);
    }
  }
  for (const h of ranked) {
    if (picked.size >= limit) break;
    picked.add(h);
  }
  return ranked.filter((h) => picked.has(h));
}

/**
 * Character ranges of `name` covered by `tokens` at word starts, mapped back through normalization so the
 * original casing and accents are kept.
 */
export function highlightRanges(name: string, tokens: readonly string[]): [number, number][] {
  if (tokens.length === 0) return [];
  // Normalize character by character, remembering where each normalized character came from.
  let norm = "";
  const origin: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < name.length; i++) {
    const piece = normalize(name[i]);
    if (!piece) {
      if (!lastSpace && name[i] !== "'" && name[i] !== "’") {
        norm += " ";
        origin.push(i);
        lastSpace = true;
      }
      continue;
    }
    for (const ch of piece) {
      norm += ch;
      origin.push(i);
    }
    lastSpace = false;
  }
  const ranges: [number, number][] = [];
  for (let start = 0; start < norm.length;) {
    if (norm[start] === " ") {
      start++;
      continue;
    }
    let end = norm.indexOf(" ", start);
    if (end < 0) end = norm.length;
    const word = norm.slice(start, end);
    let best = 0;
    for (const t of tokens) if (word.startsWith(t) && t.length > best) best = t.length;
    if (best > 0) ranges.push([origin[start], origin[start + best - 1] + 1]);
    start = end;
  }
  return mergeRanges(ranges);
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

function fuzzyRanges(
  doc: SearchDoc,
  matches: ReadonlyArray<{ key?: string; indices: ReadonlyArray<readonly [number, number]> }> | undefined,
): [number, number][] {
  // Fuse reports indices in the normalized key; re-derive name ranges from the matched substrings.
  const tokens = (matches ?? [])
    .filter((m) => m.key === "key")
    .flatMap((m) => m.indices.map(([s, e]) => doc.key.slice(s, e + 1).trim()))
    .filter((t) => t.length > 1);
  return highlightRanges(doc.name, tokens);
}

/** The search index over the gazetteer and, once schools/all.json lands, school names. Immutable once built. */
export class SearchIndex {
  private readonly docs: SearchDoc[];
  private fuse: Fuse<SearchDoc> | null = null;
  readonly hasSchools: boolean;

  constructor(gazetteer: GazetteerFile, schools?: SchoolsFile) {
    this.docs = gazetteerDocs(gazetteer);
    this.hasSchools = Boolean(schools);
    if (schools) {
      const counts = schoolCounts(schools);
      for (const doc of this.docs) doc.size = counts.get(`${doc.kind}:${doc.id}`) ?? 0;
      this.docs.push(...schoolDocs(schools, stateNames(gazetteer)));
    }
  }

  get size(): number {
    return this.docs.length;
  }

  /** Builds the fuzzy index now instead of on the first fuzzy query (call from idle time). */
  warm(): void {
    this.getFuse();
  }

  private getFuse(): Fuse<SearchDoc> {
    if (!this.fuse) {
      const options = {
        keys: [
          { name: "key", weight: 1 },
          { name: "ctxText", weight: 0.3, getFn: (d: SearchDoc) => d.ctx.join(" ") },
        ],
        useTokenSearch: true,
        tokenMatch: "all" as const,
        includeScore: true,
        includeMatches: true,
        ignoreLocation: true,
        threshold: 0.34,
      };
      const index: FuseIndex<SearchDoc> = Fuse.createIndex(options.keys, this.docs);
      this.fuse = new Fuse(this.docs, options, index);
    }
    return this.fuse;
  }

  /**
   * Ranked hits for `query`, at most `limit`, in display order (see `groupHits`). The fuzzy tier costs about
   * 100 to 200 ms over the full data, so callers can skip it (`fuzzy: false`) while the user is still typing.
   */
  search(query: string, { limit = MAX_RESULTS, fuzzy = true }: { limit?: number; fuzzy?: boolean } = {}): SearchHit[] {
    const q = normalize(query);
    if (!q) return [];
    const tokens = words(q);

    const ranked: { doc: SearchDoc; tier: Tier }[] = [];
    for (const doc of this.docs) {
      const tier = tierOf(doc, q, tokens);
      if (tier !== null) ranked.push({ doc, tier });
    }
    ranked.sort(compareHits);

    const hits: SearchHit[] = diversify(ranked, limit).map((h) => ({
      ...h,
      ranges: highlightRanges(h.doc.name, tokens),
    }));

    if (fuzzy && hits.length < limit && q.length >= FUZZY_MIN_LENGTH) {
      const seen = new Set(ranked.map((h) => h.doc));
      const fuzzy = this.getFuse()
        .search(q, { limit: limit * 4 })
        .filter((r) => !seen.has(r.item));
      // Fuse's score orders the fuzzy tier; kind rank breaks ties.
      fuzzy.sort((a, b) => (a.score ?? 1) - (b.score ?? 1) || KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind]);
      for (const r of diversify(
        fuzzy.map((r) => ({ doc: r.item, r })),
        limit - hits.length,
      )) {
        hits.push({ doc: r.doc, tier: Tier.fuzzy, ranges: fuzzyRanges(r.doc, r.r.matches) });
      }
    }
    return orderByGroup(hits);
  }
}

/** Reorders hits so each kind's hits are contiguous, groups ordered by their best hit. */
function orderByGroup(hits: SearchHit[]): SearchHit[] {
  return groupHits(hits).flatMap((g) => g.hits);
}

/** Groups hits by kind, groups ordered by their best hit (SPEC.md 3.11: grouped by kind). */
export function groupHits(hits: readonly SearchHit[]): SearchGroup[] {
  const groups: SearchGroup[] = [];
  for (const hit of hits) {
    let group = groups.find((g) => g.kind === hit.doc.kind);
    if (!group) {
      group = { kind: hit.doc.kind, hits: [] };
      groups.push(group);
    }
    group.hits.push(hit);
  }
  return groups;
}

const TILE_SIZE = 512;
const MAX_LAT = 85.051129;

function mercatorY(lat: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

function latFromMercatorY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The camera that fits `bbox` inside a `width` x `height` viewport with `padding`, like MapLibre's
 * `cameraForBounds`. The center is the center of the padded area, so the camera matches a map that has no padding
 * of its own. Used when the map is not up yet, so the store (and URL) still land on the place.
 */
export function cameraForBBox(
  bbox: BBox,
  viewport: { width: number; height: number },
  padding: Padding,
  maxZoom = 22,
): Camera {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const x0 = (minLon + 180) / 360;
  const x1 = (maxLon + 180) / 360;
  const y0 = mercatorY(maxLat);
  const y1 = mercatorY(minLat);
  const availW = Math.max(1, viewport.width - padding.left - padding.right);
  const availH = Math.max(1, viewport.height - padding.top - padding.bottom);
  const spanW = Math.max(x1 - x0, 1e-9);
  const spanH = Math.max(y1 - y0, 1e-9);
  const zoom = Math.min(maxZoom, Math.log2(Math.min(availW / (spanW * TILE_SIZE), availH / (spanH * TILE_SIZE))));
  // Shift the center so the bbox sits in the middle of the padded area rather than the viewport.
  const scale = TILE_SIZE * 2 ** zoom;
  const cx = (x0 + x1) / 2 - (padding.left - padding.right) / 2 / scale;
  const cy = (y0 + y1) / 2 - (padding.top - padding.bottom) / 2 / scale;
  return { lon: cx * 360 - 180, lat: latFromMercatorY(cy), zoom };
}
