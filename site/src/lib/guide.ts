// The map guide (SPEC.md 3.15): a primer shown before the map on a first visit, and a guided tour on the live map.
// Neither is URL state; a shared view always opens straight on the map.

/** Which part of the guide is open, if any. */
export type Guide = "primer" | "tour" | null;

/**
 * How long the landing takes to give way to the map, in ms; the shell's .shell-map and .shell-panel transitions in
 * globals.css run for the same time, and the guided tour waits this long before it enters.
 */
export const LANDING_EXIT_MS = { full: 800, reduced: 300 } as const;

/** localStorage flag set once the primer has been closed, so it opens by itself only on the first visit. */
export const PRIMER_SEEN_KEY = "schoolscape.primerSeen.v1";

export function primerSeen(): boolean {
  try {
    return window.localStorage.getItem(PRIMER_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function markPrimerSeen(): void {
  try {
    window.localStorage.setItem(PRIMER_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the primer simply opens again next visit.
  }
}

/** The guide to open on load: the primer on a first visit to a URL without parameters, else nothing. */
export function initialGuide(search: string): Guide {
  const hasParams = [...new URLSearchParams(search).keys()].length > 0;
  return hasParams || primerSeen() ? null : "primer";
}
