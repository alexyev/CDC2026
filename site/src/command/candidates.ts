// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Place candidates for the Jev engine (SPEC.md 14.5): the browser finds every place the text might name in its own
// index, and Jev only chooses among them, so the model never has to spell a place or invent one.
//
// Spans of the text are looked up with the resolver: exact names first over 1- to 4-word spans (up to 10 words when
// the span looks like a school name), then a strict fuzzy pass over leftover runs for typos. Each place keeps the
// longest span that found it, and a place found only inside a longer matched span ("York" in "New York", "Illinois" in
// "Cook County Illinois") is dropped. The currently selected place joins the list so "this county" can point at it.

import type { PlaceKind, PlaceRef } from "@/lib/types";
import { COMPARE_WORDS, COUNTY_WORDS, FILLER, layerPhraseWords, PCT_WORDS, SCHOOL_WORDS } from "./localParser";
import { normalize, type PlaceCandidate, type PlaceQuery, type Resolver } from "./resolver";

export const MAX_CANDIDATES = 20;
/** Places kept per span: enough for "Springfield" (IL, MO, MA) without flooding the list. */
const PER_SPAN = 3;
const MAX_WINDOW = 4;
const MAX_SCHOOL_WINDOW = 10;
/** Adjusted fuse.js score a fuzzy hit must beat; kind boosts can take a good hit below 0. */
const FUZZY_MAX_SCORE = 0.15;
/** Exact hits in the wrong state carry a +0.3 penalty ("Wayne County, Michigan" is not Wayne County, Ohio). */
const EXACT_MAX_SCORE = 0.05;
/** A fuzzy hit's name may differ in length from the typed words by this share, so "about" never finds a long name. */
const FUZZY_LENGTH_SLACK = 0.34;

export interface PlaceOption {
  /** Unique, human-readable option name sent to Jev, e.g. "Cook County, Illinois". */
  label: string;
  kind: PlaceKind | "region";
  name: string;
  /** Full state name for places inside one state. */
  state?: string;
  /** The words of the request that name it, as typed; empty for the selected place when the text does not name it. */
  text: string;
  /** Character offsets of `text` in the request; -1 when not in the text. */
  start: number;
  end: number;
  /** Absent only for regions ("Bay Area"), which resolve by name. */
  ref?: PlaceRef;
  /** The place selected on the map when the command was sent. */
  selected?: boolean;
  score: number;
}

interface Word {
  norm: string;
  start: number;
  end: number;
  /** Part of a layer phrase where it stands ("park" in "park access"). */
  measure: boolean;
}

function words(text: string): Word[] {
  const found = [...text.normalize("NFC").matchAll(/[\p{L}\p{N}]+/gu)].flatMap((m) =>
    normalize(m[0])
      .split(" ")
      .filter(Boolean)
      .map((norm) => ({ norm, start: m.index, end: m.index + m[0].length, measure: false })),
  );
  const measures = layerPhraseWords(found.map((w) => w.norm));
  return found.map((w, i) => ({ ...w, measure: measures[i]! }));
}

const isBreak = (w: Word) => FILLER.has(w.norm) || COMPARE_WORDS.has(w.norm) || PCT_WORDS.has(w.norm);

function kindFor(span: Word[]): PlaceQuery["kind"] {
  if (span.some((w) => COUNTY_WORDS.has(w.norm))) return "county";
  if (span.some((w) => SCHOOL_WORDS.has(w.norm))) return "school";
  return "unknown";
}

const KIND_NAMES: Partial<Record<PlaceOption["kind"], string>> = {
  city: "city",
  district: "school district",
  school: "school",
  region: "region",
};

function labelFor(c: PlaceCandidate, state: string | undefined): string {
  const where = c.kind === "state" || !state ? c.name : `${c.name}, ${state}`;
  const kind = KIND_NAMES[c.kind];
  return kind ? `${where} (${kind})` : where;
}

const refKey = (c: { kind: string; ref?: PlaceRef; name: string }) =>
  c.ref ? `${c.ref.kind}:${c.ref.id}` : `${c.kind}:${c.name}`;

export function findPlaceCandidates(text: string, resolver: Resolver, selected?: PlaceRef): PlaceOption[] {
  const all = words(text);
  const found = new Map<string, PlaceOption>();

  const add = (c: PlaceCandidate, span: Word[]) => {
    const start = span[0]!.start;
    const end = span[span.length - 1]!.end;
    const key = refKey(c);
    const prev = found.get(key);
    // The longest span wins ("Cook County Illinois" over "Cook County"), then the better score.
    if (
      prev &&
      (prev.end - prev.start > end - start || (prev.end - prev.start === end - start && prev.score <= c.score))
    )
      return;
    const state = c.kind === "state" ? undefined : c.st ? resolver.stateName(c.st) : undefined;
    found.set(key, {
      label: labelFor(c, state),
      kind: c.kind,
      name: c.name,
      ...(state ? { state } : {}),
      text: text.slice(start, end),
      start,
      end,
      ...(c.ref ? { ref: c.ref } : {}),
      score: c.score,
    });
  };

  // 1. Exact names over every span that neither starts nor ends on a filler word nor is only school or measure words
  // ("park" in "park access" is a measure, not Park County).
  const exact: { i: number; size: number; hits: PlaceCandidate[] }[] = [];
  for (let i = 0; i < all.length; i++) {
    if (isBreak(all[i]!)) continue;
    for (let size = 1; size <= Math.min(MAX_SCHOOL_WINDOW, all.length - i); size++) {
      const span = all.slice(i, i + size);
      if (isBreak(span[size - 1]!) || span.every((w) => SCHOOL_WORDS.has(w.norm) || w.measure)) continue;
      const kind = kindFor(span);
      if (size > MAX_WINDOW && kind !== "school") continue;
      const hits = resolver
        .resolve({ query: text.slice(span[0]!.start, span[size - 1]!.end), kind }, { fuzzy: false })
        .filter((c) => c.score <= EXACT_MAX_SCORE)
        .slice(0, PER_SPAN);
      if (hits.length) exact.push({ i, size, hits });
    }
  }
  const covered = new Set<number>();
  const kept = exact.filter(
    (e) => !exact.some((o) => o !== e && o.i <= e.i && o.i + o.size >= e.i + e.size && o.size > e.size),
  );
  for (const e of kept) {
    for (const c of e.hits) add(c, all.slice(e.i, e.i + e.size));
    for (let k = e.i; k < e.i + e.size; k++) covered.add(k);
  }

  // 2. Fuzzy names for runs of words nothing matched exactly, skipping runs made only of measure words.
  const runs: Word[][] = [];
  let run: Word[] = [];
  all.forEach((w, i) => {
    if (covered.has(i) || isBreak(w)) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(w);
  });
  if (run.length) runs.push(run);
  const fuzzy = (r: Word[]): boolean => {
    if (r.every((w) => w.measure) || r.map((w) => w.norm).join("").length < 4) return false;
    const query = { query: text.slice(r[0]!.start, r[r.length - 1]!.end), kind: kindFor(r) };
    const typed = normalize(query.query).length;
    const hits = resolver.resolve(query).filter((c) => {
      const close = Math.abs(normalize(c.name).length - typed) <= Math.max(3, FUZZY_LENGTH_SLACK * typed);
      return c.score <= FUZZY_MAX_SCORE && close;
    });
    for (const c of hits.slice(0, PER_SPAN)) add(c, r);
    return hits.length > 0;
  };
  // "north carolna": an exact hit on one word (North, a city in South Carolina) next to a typo can be the start of a
  // longer name, so a run nothing matched also tries itself joined with the exact span beside it. Both places stay
  // candidates and Jev picks between them.
  const indexOf = new Map(all.map((w, i) => [w, i]));
  const joined = (r: Word[]): boolean => {
    const first = indexOf.get(r[0]!)!;
    const last = indexOf.get(r[r.length - 1]!)!;
    return kept.some((e) => {
      if (e.i + e.size === first) return fuzzy(all.slice(e.i, last + 1));
      if (e.i === last + 1) return fuzzy(all.slice(first, e.i + e.size));
      return false;
    });
  };
  for (const r of runs) {
    if (fuzzy(r) || joined(r)) continue;
    // "Missisippi poverty": retry the pieces between measure words.
    let piece: Word[] = [];
    for (const w of [...r, undefined]) {
      if (w && !w.measure) piece.push(w);
      else {
        if (piece.length && piece.length < r.length) fuzzy(piece);
        piece = [];
      }
    }
  }

  const options = [...found.values()]
    .sort((a, b) => a.score - b.score || a.start - b.start)
    .slice(0, MAX_CANDIDATES - (selected ? 1 : 0));

  // 3. The selected place, so "here" or "this county" has something to point at.
  if (selected && !options.some((o) => o.ref?.kind === selected.kind && o.ref.id === selected.id)) {
    const c = resolver.lookup(selected);
    if (c) {
      const state = c.kind === "state" ? undefined : resolver.stateName(c.st);
      options.push({
        label: labelFor(c, state),
        kind: c.kind,
        name: c.name,
        ...(state ? { state } : {}),
        text: "",
        start: -1,
        end: -1,
        ref: selected,
        selected: true,
        score: 0,
      });
    }
  } else if (selected) {
    const o = options.find((o) => o.ref?.kind === selected.kind && o.ref.id === selected.id);
    if (o) o.selected = true;
  }

  // Labels must be unique option names; text order reads naturally for "first" and "second".
  const seen = new Map<string, number>([["none", 1]]); // "none" is the no-place option
  for (const o of options) {
    const n = (seen.get(o.label) ?? 0) + 1;
    seen.set(o.label, n);
    if (n > 1) o.label = `${o.label} #${n}`;
  }
  return options.sort((a, b) => (a.start < 0 ? 1 : b.start < 0 ? -1 : a.start - b.start));
}
