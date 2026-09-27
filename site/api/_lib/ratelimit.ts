// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Best-effort per-IP token bucket (SPEC.md section 14.3).
// State lives in one serverless instance's memory, so concurrent instances each keep their own
// buckets and a cold start resets them; it caps a single noisy client, not global spend.

export const CAPACITY = 30; // requests
export const WINDOW_MS = 60_000; // refill CAPACITY tokens per minute
const MAX_TRACKED = 10_000; // bound memory under many distinct IPs

interface Bucket {
  tokens: number;
  updated: number;
}

const buckets = new Map<string, Bucket>();

export function allow(ip: string, now: number = Date.now()): boolean {
  const bucket = buckets.get(ip) ?? { tokens: CAPACITY, updated: now };
  const refill = ((now - bucket.updated) / WINDOW_MS) * CAPACITY;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + Math.max(0, refill));
  bucket.updated = now;
  const allowed = bucket.tokens >= 1;
  if (allowed) bucket.tokens -= 1;
  buckets.delete(ip); // re-insert so Map order tracks recency
  buckets.set(ip, bucket);
  if (buckets.size > MAX_TRACKED) {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
  return allowed;
}

export function resetRateLimit(): void {
  buckets.clear();
}
