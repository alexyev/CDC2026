// Insight panel scope (SPEC.md 3.7): a selected state or county replaces what is on screen as the panel's subject.

import type { CountiesFile, StatesFile } from "@/lib/dataTypes";
import type { Level, PlaceRef } from "@/lib/types";

/** The selected area the panel describes; null means what is on screen. */
export interface InsightScope {
  kind: "state" | "county";
  id: string;
  /** "Texas", or "Cook County, IL". */
  name: string;
}

/**
 * The scope for a selection: a state or county when one is selected and known, else null (on screen). Schools, cities,
 * and districts keep the on-screen view. A county waits for counties.json, so it resolves to undefined meanwhile.
 */
export function insightScope(
  selected: PlaceRef | undefined,
  states: StatesFile | undefined,
  counties: CountiesFile | undefined,
): InsightScope | null | undefined {
  if (selected?.kind !== "state" && selected?.kind !== "county") return null;
  if (!states) return undefined;
  if (selected.kind === "state") {
    const i = states.ids.indexOf(selected.id);
    return i < 0 ? null : { kind: "state", id: selected.id, name: states.names[i] };
  }
  if (!counties) return undefined;
  const i = counties.ids.indexOf(selected.id);
  if (i < 0) return null;
  const s = states.ids.indexOf(counties.st[i]);
  const usps = s < 0 ? counties.st[i] : states.usps[s];
  return { kind: "county", id: selected.id, name: `${counties.names[i]}, ${usps}` };
}

/**
 * The level whose units describe the panel: a state scope is drawn by its counties (like the state level), a county
 * scope by its schools alone (like the local level; one county cannot be correlated), and on screen by the map level.
 */
export function unitLevel(scope: InsightScope | null | undefined, level: Level): Level {
  if (!scope) return level;
  return scope.kind === "state" ? "state" : "local";
}
