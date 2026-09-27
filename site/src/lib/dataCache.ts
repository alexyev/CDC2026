// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Module-level cache of parsed data files, keyed by path, so re-entering a level never refetches (SPEC.md 10.2).

const cache = new Map<string, Promise<unknown>>();

export type Fetcher = (path: string) => Promise<unknown>;

/** Returns the cached parse of `path`, running `fetcher` once. A failed load is evicted so it can be retried. */
export function cached<T>(path: string, fetcher: Fetcher): Promise<T> {
  let entry = cache.get(path);
  if (!entry) {
    entry = fetcher(path).catch((err: unknown) => {
      cache.delete(path);
      throw err;
    });
    cache.set(path, entry);
  }
  return entry as Promise<T>;
}

export function isCached(path: string): boolean {
  return cache.has(path);
}

export function clearDataCache(): void {
  cache.clear();
}
