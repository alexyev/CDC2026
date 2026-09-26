// Offline fallback for the command bar (SPEC.md 14.5): keyword and fuzzy matching that produces the same Intent
// shape as the command function. It runs when the function returns non-200, times out, or the app is offline.
//
// Order of passes over the tokens:
//   1. exact layer phrases from catalog labels and aliases, longest first;
//   2. exact place names over 1- to 4-word windows of what is left;
//   3. fuzzy layer names for leftover single words (typos such as "educaton");
//   4. fuzzy place names for leftover runs of words.

import Fuse from "fuse.js";
import catalogFile from "../../data/catalog.json";
import type { Display, Intent, LayerDef } from "@/lib/types";
import { normalize, type PlaceQuery, type Resolver } from "./resolver";

const catalog = catalogFile.layers as LayerDef[];

const CLEAR_PHRASES = ["reset", "start over", "clear", "clear all", "clear everything", "reset the map", "reset map"];
export const COMPARE_WORDS = new Set(["vs", "versus", "compare", "compared", "comparing", "comparison", "against"]);
export const PCT_WORDS = new Set(["percentile", "percentiles", "rank", "ranks", "ranking", "rankings", "ranked"]);
export const SCHOOL_WORDS = new Set(["high", "school", "hs", "academy", "prep", "preparatory", "magnet", "charter"]);
export const COUNTY_WORDS = new Set(["county", "parish", "borough", "municipio"]);

/** Words that are never part of a place or layer name. */
export const FILLER = new Set(
  (
    "a an the and or of in on at by for to from with within inside into near around across between " +
    "show me map view look looking see display give tell find what where which how is are was does do did " +
    "take go fly zoom jump bring open pull up " +
    "i want would like please can could let lets let's us my our it this that these those there here " +
    "worst best highest lowest most least more less top bottom " +
    "rate rates share shares level levels score scores measure measures layer layers data stats statistics " +
    "household households access overlay correlation correlate correlated relationship related relate " +
    "also plus then just only all both"
  ).split(" "),
);

interface Phrase {
  words: string[];
  layer: string;
}

/** Plural-tolerant word match: "rates" meets "rate", "crimes" meets "crime". */
const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

const PHRASES: Phrase[] = catalog
  .flatMap((l) => [l.label, ...l.aliases].map((text) => ({ words: normalize(text).split(" ").map(stem), layer: l.id })))
  .filter((p) => p.words.length > 0 && p.words[0] !== "")
  // Longest phrase first; ties keep catalog order, so "violence" means Crime before Violent crime rate.
  .sort((a, b) => b.words.length - a.words.length);

const SINGLE_WORDS = [...new Map(PHRASES.filter((p) => p.words.length === 1).map((p) => [p.words[0], p])).values()];
let layerFuse: Fuse<Phrase> | undefined;
const getLayerFuse = () =>
  (layerFuse ??= new Fuse(SINGLE_WORDS, {
    keys: [{ name: "word", getFn: (p) => p.words[0] ?? "" }],
    includeScore: true,
    threshold: 0.25,
    ignoreLocation: true,
  }));

const MAX_WINDOW = 4;
const MAX_SCHOOL_WINDOW = 10;
const LOCAL_FUZZY_PLACE = 0.2;
const MIN_FUZZY_PLACE_CHARS = 3;

interface Token {
  raw: string;
  norm: string;
  used: boolean;
}

function tokenize(text: string): Token[] {
  return (text.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? []).flatMap((raw) =>
    normalize(raw)
      .split(" ")
      .filter(Boolean)
      .map((norm) => ({ raw, norm, used: false })),
  );
}

function matchesAt(tokens: Token[], i: number, words: string[]): boolean {
  if (i + words.length > tokens.length) return false;
  return words.every((w, k) => {
    const t = tokens[i + k];
    return t !== undefined && !t.used && stem(t.norm) === w;
  });
}

const beforeCountyWord = (tokens: Token[], next: number) => COUNTY_WORDS.has(tokens[next]?.norm ?? "");

function placeKindFor(words: Token[]): PlaceQuery["kind"] {
  if (words.some((t) => COUNTY_WORDS.has(t.norm))) return "county";
  if (words.some((t) => SCHOOL_WORDS.has(t.norm))) return "school";
  return "unknown";
}

/** Maximal runs of unused, non-filler tokens. */
function runs(tokens: Token[]): Token[][] {
  const out: Token[][] = [];
  let current: Token[] = [];
  for (const t of tokens) {
    if (t.used || FILLER.has(t.norm) || COMPARE_WORDS.has(t.norm) || PCT_WORDS.has(t.norm)) {
      if (current.length) out.push(current);
      current = [];
    } else current.push(t);
  }
  if (current.length) out.push(current);
  return out;
}

/** Marks the tokens of exact layer phrases as used. A phrase right before "county" is a place ("White County"). */
function matchLayerPhrases(tokens: Token[], found: (layer: string, at: number) => void): void {
  for (let i = 0; i < tokens.length; i++) {
    for (const p of PHRASES) {
      if (!matchesAt(tokens, i, p.words)) continue;
      if (beforeCountyWord(tokens, i + p.words.length)) continue;
      for (let k = 0; k < p.words.length; k++) tokens[i + k]!.used = true;
      found(p.layer, i);
      i += p.words.length - 1;
      break;
    }
  }
}

/**
 * Which normalized words belong to a layer phrase where they stand, so place extraction can skip measures: "park" in
 * "park access" and "lead" in "lead exposure", but not "Alaska" (only part of "Alaska Native") or "White" in "White County".
 */
export function layerPhraseWords(words: string[]): boolean[] {
  const tokens = words.map((norm) => ({ raw: norm, norm, used: false }));
  matchLayerPhrases(tokens, () => {});
  return tokens.map((t) => t.used);
}

export function parseLocally(text: string, resolver: Resolver): Intent {
  const tokens = tokenize(text);
  const norm = tokens.map((t) => t.norm).join(" ");
  if (CLEAR_PHRASES.includes(norm)) return { action: "clear", layers: [], places: [] };

  const layers: { id: string; at: number }[] = [];
  const addLayer = (id: string, at: number) => {
    if (!layers.some((l) => l.id === id)) layers.push({ id, at });
  };

  // 1. Exact layer phrases.
  matchLayerPhrases(tokens, addLayer);

  // 2. Exact places over windows of each run, longest window first.
  const places: { query: PlaceQuery; at: number; school: boolean }[] = [];
  const addPlace = (words: Token[], at: number) => {
    const query: PlaceQuery = { query: words.map((t) => t.raw).join(" "), kind: placeKindFor(words) };
    const [best] = resolver.resolve(query, { fuzzy: false });
    if (!best) return false;
    for (const t of words) t.used = true;
    places.push({ query, at, school: best.kind === "school" });
    return true;
  };
  // School names may contain filler words ("... High School for Science and Technology"), so they get windows
  // over the whole unused sequence first, up to MAX_SCHOOL_WINDOW words, starting and ending on non-filler words.
  for (let i = 0; i < tokens.length; i++) {
    for (let size = Math.min(MAX_SCHOOL_WINDOW, tokens.length - i); size > MAX_WINDOW; size--) {
      const words = tokens.slice(i, i + size);
      if (words.some((t) => t.used) || !words.some((t) => SCHOOL_WORDS.has(t.norm))) continue;
      if (FILLER.has(words[0]!.norm) || FILLER.has(words[size - 1]!.norm)) continue;
      if (addPlace(words, i)) break;
    }
  }
  for (const run of runs(tokens)) {
    for (let i = 0; i < run.length;) {
      let size = Math.min(MAX_WINDOW, run.length - i);
      while (size > 0 && !addPlace(run.slice(i, i + size), tokens.indexOf(run[i]!))) size--;
      i += Math.max(size, 1);
    }
  }

  // 3. Fuzzy layer names for leftover words.
  for (const [i, t] of tokens.entries()) {
    if (t.used || t.norm.length < 5 || FILLER.has(t.norm) || beforeCountyWord(tokens, i + 1)) continue;
    const [hit] = getLayerFuse().search(t.norm, { limit: 1 });
    if (hit && (hit.score ?? 1) <= 0.25) {
      t.used = true;
      addLayer(hit.item.layer, i);
    }
  }

  // 4. Fuzzy places for leftover runs, strict so stray words do not become places. Fuse matches a run of one or two
  // letters ("s" from "what's", "as") inside almost any name, so those never count.
  for (const run of runs(tokens)) {
    if (run.map((t) => t.norm).join("").length < MIN_FUZZY_PLACE_CHARS) continue;
    const query: PlaceQuery = { query: run.map((t) => t.raw).join(" "), kind: placeKindFor(run) };
    const [best] = resolver.resolve(query);
    if (best && best.score <= LOCAL_FUZZY_PLACE - (query.kind === "unknown" ? 0 : 0.2)) {
      for (const t of run) t.used = true;
      places.push({ query, at: tokens.indexOf(run[0]!), school: best.kind === "school" });
    }
  }

  layers.sort((a, b) => a.at - b.at);
  places.sort((a, b) => a.at - b.at);
  const chosenPlaces = places.slice(0, 2);
  const display: Display | undefined = tokens.some((t) => PCT_WORDS.has(t.norm)) ? "pct" : undefined;
  // "Texas vs Oklahoma" compares places; "violent crime versus incarceration in Florida" compares two layers in one.
  const compareWord = tokens.some((t) => COMPARE_WORDS.has(t.norm));
  const compare = chosenPlaces.length === 2 || (compareWord && chosenPlaces.length === 1 && layers.length < 2);

  const intent: Intent = {
    action:
      compare && chosenPlaces.length > 0
        ? "compare"
        : chosenPlaces.length === 1 && chosenPlaces[0]!.school
          ? "profile"
          : "explore",
    layers: layers.slice(0, 2).map((l) => l.id),
    places: chosenPlaces.map((p) => p.query),
  };
  if (display) intent.display = display;
  return intent;
}
