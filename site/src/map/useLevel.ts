// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import type { Level } from "@/lib/types";
import { useMap } from "./useMap";

/** The current level: `nation` below z5, `state` from z5, `local` from z8 (SPEC.md 3.3). */
export function useLevel(): Level {
  return useMap().level;
}
