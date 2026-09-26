// Polygon hover card (SPEC.md 3.5): the overview of the state or county under the cursor, built from the loaded
// states.json and counties.json. The card content only rebuilds when the hovered area or the view changes; cursor
// moves just re-place it.

import { useMemo } from "react";
import type { CountiesFile, StatesFile } from "@/lib/dataTypes";
import type { Display } from "@/lib/types";
import { useStore } from "@/store/useStore";
import type { AreaKind } from "./choropleth";
import { areaCard } from "./overview";
import { OverviewCard } from "./OverviewCard";

export interface HoverInfo {
  kind: AreaKind;
  id: string;
  name: string;
  /** Cursor position in map container pixels. */
  x: number;
  y: number;
}

interface AreaTooltipProps {
  hover: HoverInfo;
  layers: readonly string[];
  display: Display;
  states: StatesFile;
  counties?: CountiesFile;
}

export function AreaTooltip({ hover, layers, display, states, counties }: AreaTooltipProps) {
  const compareArmed = useStore((s) => s.compare.armed);
  const { kind, id } = hover;
  const card = useMemo(
    () => areaCard(kind, id, layers, { states, counties }, { display, compareArmed }),
    [kind, id, layers, display, compareArmed, states, counties],
  );
  if (!card) return null;
  return <OverviewCard card={card} x={hover.x} y={hover.y} testId="area-tooltip" className="pointer-events-none" />;
}
