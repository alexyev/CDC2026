// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// The map guide (SPEC.md 3.15): a primer shown before the map on every visit to the bare URL, and a guided tour on the live map.
// Neither is URL state; a shared view always opens straight on the map.

/** Which part of the guide is open, if any. */
export type Guide = "primer" | "tour" | null;

/**
 * How long the landing takes to give way to the map, in ms; the shell's .shell-map and .shell-panel transitions in
 * globals.css run for the same time, and the guided tour waits this long before it enters.
 */
export const LANDING_EXIT_MS = { full: 800, reduced: 300 } as const;

/** When the landing last started giving way to the map (performance.now()), if it has. */
let landingExitStart: number | undefined;

export function noteLandingExit(): void {
  landingExitStart = performance.now();
}

/** How much of the landing's exit is still to run, in ms; 0 once it has finished or if it never ran. */
export function landingExitRemainingMs(reducedMotion: boolean): number {
  if (landingExitStart === undefined) return 0;
  const total = reducedMotion ? LANDING_EXIT_MS.reduced : LANDING_EXIT_MS.full;
  return Math.max(0, total - (performance.now() - landingExitStart));
}

/**
 * The guide to open on load: the primer on every visit to a URL without parameters, since a bare URL may be anyone's
 * first look; any parameter is a shared view or a reload of the live map (which always carries `v`), so nothing.
 */
export function initialGuide(search: string): Guide {
  const hasParams = [...new URLSearchParams(search).keys()].length > 0;
  return hasParams ? null : "primer";
}
