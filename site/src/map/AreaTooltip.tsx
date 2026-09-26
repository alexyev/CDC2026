// Polygon hover tooltip (SPEC.md 3.5): area name and parent, then per active layer its mean, n, and the county-level
// badge; "No data" and "Few schools" lines; rank among peers in percentile display (SPEC.md 3.6).

import type { CountiesFile, StatesFile } from "@/lib/dataTypes";
import type { Display } from "@/lib/types";
import { layerDef, type AreaKind } from "./choropleth";

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

const fmt = new Intl.NumberFormat("en-US");
const OFFSET = 14;
const MAX_WIDTH = 320;

/** 1-based rank of `value` among the non-null means, highest stress first. */
function rankOf(means: readonly (number | null)[], value: number): { rank: number; of: number } {
  let of = 0;
  let above = 0;
  for (const m of means) {
    if (m == null) continue;
    of++;
    if (m > value) above++;
  }
  return { rank: above + 1, of };
}

export function AreaTooltip({ hover, layers, display, states, counties }: AreaTooltipProps) {
  const file = hover.kind === "state" ? states : counties;
  const i = file ? file.ids.indexOf(hover.id) : -1;
  const name = i >= 0 ? file!.names[i]! : hover.name;
  const parent =
    hover.kind === "state"
      ? "United States"
      : (() => {
          const st = counties?.st[i] ?? hover.id.slice(0, 2);
          const si = states.ids.indexOf(st);
          return si >= 0 ? states.names[si] : undefined;
        })();
  const peers = hover.kind === "state" ? "states" : "counties";

  const flipX = hover.x + OFFSET + MAX_WIDTH > window.innerWidth - 16;
  const style = {
    left: flipX ? undefined : hover.x + OFFSET,
    right: flipX ? window.innerWidth - hover.x + OFFSET : undefined,
    top: Math.min(hover.y + OFFSET, window.innerHeight - 160),
  };

  return (
    <div
      role="tooltip"
      data-testid="area-tooltip"
      style={style}
      className="pointer-events-none absolute z-30 max-w-[320px] min-w-[200px] rounded-card border border-border bg-surface-strong px-3 py-2.5 shadow-panel"
    >
      <div className="text-chip leading-tight font-semibold text-text-1">{name}</div>
      {parent && <div className="mt-0.5 text-caption text-text-3">{parent}</div>}
      <div className="mt-2 flex flex-col gap-1.5">
        {layers.map((id, li) => {
          const def = layerDef(id);
          const m = i >= 0 ? file?.measures[id] : undefined;
          const mean = m?.mean[i] ?? null;
          const n = m?.n[i] ?? 0;
          const county = def?.resolution === "county";
          const rank = display === "pct" && mean != null && m ? rankOf(m.mean, mean) : null;
          return (
            <div key={id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                {layers.length === 2 && (
                  <span className="text-badge font-semibold tracking-[0.06em] text-text-3">{li === 0 ? "A" : "B"}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-body text-text-2">{def?.label ?? id}</span>
                {county && (
                  <span className="rounded-[4px] border border-border-strong px-1 text-badge tracking-[0.06em] text-text-3 uppercase">
                    county
                  </span>
                )}
                <span className="text-chip font-semibold text-text-1 tabular">
                  {mean == null ? "No data" : mean.toFixed(def?.unit === "gini" ? 2 : 1)}
                </span>
              </div>
              <div className="flex items-baseline gap-2 text-caption text-text-3 tabular">
                <span>n = {fmt.format(n)}</span>
                {rank && (
                  <span>
                    · rank {fmt.format(rank.rank)} of {fmt.format(rank.of)} {peers}
                  </span>
                )}
                {n > 0 && n < 3 && <span className="text-text-2">· Few schools (n = {n})</span>}
              </div>
              {county && hover.kind === "state" && mean != null && (
                <div className="text-caption text-text-3">county-level measure, school-weighted mean</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
