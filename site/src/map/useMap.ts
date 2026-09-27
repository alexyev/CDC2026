// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { useContext } from "react";
import { MapContext, type MapContextValue } from "./mapContext";

export function useMap(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMap must be used inside <MapProvider>");
  return ctx;
}
