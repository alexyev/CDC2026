// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// The map's first paint and the background loads that wait for it (SPEC.md 10.1, loading sequence steps 3 and 4).
// Counties, schools with deck.gl, the gazetteer with fuse.js, and the rest start only once the state fills are on
// screen, so they never compete with the critical files and the basemap for the connection.

export const FIRST_PAINT_MARK = "schoolscape:first-paint";

/** Past this, the background loads start even if the map never paints (no WebGL, a failed critical file). */
export const FIRST_PAINT_FALLBACK_MS = 4000;

let gate: Promise<void> = Promise.resolve();
let release: (() => void) | undefined;

/**
 * Makes background loads wait for the map's first paint. main.tsx calls it once before rendering; without it (unit
 * tests render panels with no map) they start as soon as the browser is idle.
 */
export function holdUntilFirstPaint(fallbackMs = FIRST_PAINT_FALLBACK_MS): void {
  gate = new Promise((resolve) => {
    release = resolve;
    setTimeout(resolve, fallbackMs);
  });
}

/** Records the first-paint mark and releases the loads waiting for it. Later calls do nothing. */
export function markFirstPaint(): void {
  if (performance.getEntriesByName(FIRST_PAINT_MARK).length === 0) performance.mark(FIRST_PAINT_MARK);
  release?.();
}

/** Runs `fn` when the browser is idle, or after `timeout` ms at the latest; returns a cancel function. */
export function whenIdle(fn: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 300);
  return () => window.clearTimeout(id);
}

/** Runs `fn` once the first paint is on screen and the browser is idle; returns a cancel function. */
export function afterFirstPaint(fn: () => void, idleTimeout = 1000): () => void {
  let cancelled = false;
  let cancelIdle = () => {};
  void gate.then(() => {
    if (!cancelled) cancelIdle = whenIdle(fn, idleTimeout);
  });
  return () => {
    cancelled = true;
    cancelIdle();
  };
}
