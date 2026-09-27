// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BreaksFile } from "@/lib/dataTypes";
import { load } from "@/lib/loaders";
import { classRanges, formatValue, resolveScale, type ColorScale, type ScaleAxis } from "@/lib/scales";
import type { Display, LayerDef, Level } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LOCAL_LEVEL_ZOOM } from "@/map/levels";
import { HALO_WIDTH, NO_DATA_MARKER, noDataMarker, pinRadius } from "@/map/pinStyle";
import { useLevel } from "@/map/useLevel";
import { useStore } from "@/store/useStore";
import { MinimizeButton, Minimizable } from "./Minimizable";

// Univariate and bivariate legends (SPEC.md 5.2, 7, 9.2, 9.3). Colors come from the same `resolveScale` the map
// uses, so a swatch is always the color of the units it describes.

const LEVEL_UNITS: Record<Level, string> = { nation: "State means", state: "County means", local: "Schools" };
const TERCILE_NAMES = ["low", "middle", "high"] as const;
const COUNTY_NOTE = "This measure is only available per county. Every school in a county shares the same value.";
const STRESS_NOTE =
  "Stress means adverse social and economic conditions in the community around each school, measured from census, health, and crime data. It describes the community, not the school or its students.";
const TOOLTIP_CLASS =
  "max-w-[240px] rounded-card border border-border bg-surface-strong px-3 py-2.5 text-caption text-text-1 shadow-panel [&>span]:hidden";

type BreaksState = { status: "loading" } | { status: "ready"; breaks: BreaksFile } | { status: "failed" };

function useBreaks(): [BreaksState, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BreaksState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    load("breaks").then(
      (breaks) => live && setState({ status: "ready", breaks }),
      () => live && setState({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };
  return [state, retry];
}

export function Legend() {
  const layers = useStore((s) => s.layers);
  const display = useStore((s) => s.display);
  const level = useLevel();
  const [breaks, retry] = useBreaks();
  const scale = breaks.status === "ready" ? resolveScale(layers, level, display, breaks.breaks) : null;

  let body;
  if (layers.length === 0) body = <p className="pr-7 text-caption text-text-2">Pick a layer to color the map.</p>;
  else if (breaks.status === "loading") body = <LegendSkeleton />;
  else if (!scale) body = <LegendUnavailable onRetry={breaks.status === "failed" ? retry : undefined} />;
  else if (scale.kind === "univariate") body = <UnivariateLegend scale={scale} />;
  else body = <BivariateLegend scale={scale} />;

  return (
    <Minimizable panel="legend" corner="bottom-right" restoreLabel="Show legend" chip={<LegendChip scale={scale} />}>
      <section
        aria-label="Map legend"
        data-testid="slot-legend"
        className="glass relative flex w-[264px] flex-col gap-3 p-4 text-body tabular"
      >
        <MinimizeButton panel="legend" label="legend" className="absolute top-3.5 right-3" />
        {body}
        <DataStateKey level={level} />
      </section>
    </Minimizable>
  );
}

/** The minimized legend: a thumbnail of the ramp or the 3x3 grid, so the colors still read at a glance. */
function LegendChip({ scale }: { scale: ColorScale | null }) {
  let swatch = null;
  if (scale?.kind === "univariate")
    swatch = (
      <span aria-hidden className="flex h-2.5 gap-px overflow-hidden rounded-[3px]">
        {classRanges(scale.a).map((r) => (
          <span key={r.index} className="w-2.5" style={{ backgroundColor: scale.colors[r.index] }} />
        ))}
      </span>
    );
  else if (scale?.kind === "bivariate")
    swatch = (
      <span aria-hidden className="grid size-4 grid-cols-3 gap-px overflow-hidden rounded-[3px]">
        {[2, 1, 0].flatMap((ca) =>
          [0, 1, 2].map((cb) => <span key={3 * ca + cb} style={{ backgroundColor: scale.colors[3 * ca + cb] }} />),
        )}
      </span>
    );
  return (
    <>
      {swatch}
      Legend
    </>
  );
}

/** What an axis's values are, when that is not plain score means: context shares or percentile ranks. */
function axisNote(axis: ScaleAxis, level: Level, display: Display): string | null {
  if (axis.layer.group === "context") return "Share of population";
  if (axis.mode === "pct") return "national percentile";
  if (display === "pct" && axis.layer.pctColumn && level !== "local") return "scores";
  return null;
}

function levelCaption(axis: ScaleAxis, level: Level, display: Display): string {
  const note = axisNote(axis, level, display);
  if (note === null) return LEVEL_UNITS[level];
  return note === "Share of population" ? `${note} · ${LEVEL_UNITS[level]}` : `${LEVEL_UNITS[level]} · ${note}`;
}

function CountyBadge({ layer }: { layer: LayerDef }) {
  if (layer.resolution !== "county") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`county-level measure. ${COUNTY_NOTE}`}
          className="shrink-0 cursor-default rounded-full border border-border-strong px-1.5 py-px text-badge leading-4 tracking-[0.06em] text-text-2 uppercase"
        >
          county
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className={TOOLTIP_CLASS}>
        {COUNTY_NOTE}
      </TooltipContent>
    </Tooltip>
  );
}

function UnivariateLegend({ scale }: { scale: Extract<ColorScale, { kind: "univariate" }> }) {
  const { a, level } = scale;
  const display = useStore((s) => s.display);
  const ranges = classRanges(a);
  const neutral = a.layer.polarity === "neutral";
  return (
    <div className="flex flex-col gap-2">
      <header className="flex flex-col gap-0.5 pr-7">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 truncate text-body font-semibold text-text-1" title={a.layer.label}>
            {a.layer.label}
          </h2>
          <CountyBadge layer={a.layer} />
        </div>
        <p className="text-caption text-text-3" data-testid="legend-level">
          {levelCaption(a, level, display)}
        </p>
      </header>

      <div className="flex flex-col gap-1">
        <ul className="flex h-3 gap-0.5" aria-label={`${a.layer.label} classes`}>
          {ranges.map((r) => (
            <li
              key={r.index}
              role="img"
              aria-label={`${a.layer.label}: ${r.label}`}
              title={r.label}
              className={cn(
                "flex-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-[background-color,opacity] duration-(--dur-toggle) ease-ui first:rounded-l-[4px] last:rounded-r-[4px]",
                r.empty && "opacity-40",
              )}
              style={{ backgroundColor: scale.colors[r.index] }}
            />
          ))}
        </ul>
        <div className="relative h-4 text-caption text-text-2" aria-hidden>
          {a.breaks.map((b, i) => (
            <span
              key={i}
              className="absolute top-0 -translate-x-1/2 leading-4"
              style={{ left: `${((i + 1) / ranges.length) * 100}%` }}
            >
              {formatValue(b, a)}
            </span>
          ))}
        </div>
        {neutral ? (
          <div className="flex justify-between text-badge tracking-[0.06em] text-text-3 uppercase" aria-hidden>
            <span>Lower share</span>
            <span>Higher share</span>
          </div>
        ) : (
          <StressScale />
        )}
      </div>
    </div>
  );
}

/** The stress ends of the ramp, with what "stress" means one hover away for viewers who skipped the primer. */
function StressScale() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          aria-label={`Lower stress to higher stress. ${STRESS_NOTE}`}
          data-testid="legend-stress"
          className="group flex cursor-help items-center justify-between rounded-[4px] text-badge tracking-[0.06em] text-text-3 uppercase"
        >
          <span>Lower stress</span>
          <Info
            aria-hidden
            className="size-3 text-text-3 transition-colors duration-(--dur-hover) group-hover:text-text-1"
          />
          <span>Higher stress</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={24} className={TOOLTIP_CLASS}>
        {STRESS_NOTE}
      </TooltipContent>
    </Tooltip>
  );
}

function AxisLabel({ which, axis, note }: { which: "A" | "B"; axis: ScaleAxis; note: string | null }) {
  return (
    <div className="flex items-start gap-1.5" data-testid={`legend-axis-${which.toLowerCase()}`}>
      <span
        aria-hidden
        className="grid size-4 shrink-0 place-items-center rounded-[4px] text-badge leading-none font-semibold text-bg-0"
        style={{ backgroundColor: which === "A" ? "var(--u5)" : "var(--bv2)" }}
      >
        {which}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption leading-4 font-medium text-text-1">
          <span>
            {axis.layer.label}
            <span aria-hidden className="ml-1 text-text-3">
              {which === "A" ? "↑" : "→"}
            </span>
          </span>
          <CountyBadge layer={axis.layer} />
        </span>
        {note && <span className="text-caption leading-4 text-text-3">{note}</span>}
      </div>
    </div>
  );
}

const CELL = 40;
const GAP = 2;
const GRID = CELL * 3 + GAP * 2;

function BivariateLegend({ scale }: { scale: Extract<ColorScale, { kind: "bivariate" }> }) {
  const { a, b, level } = scale;
  const display = useStore((s) => s.display);
  const rangesA = classRanges(a);
  const rangesB = classRanges(b);
  const cellLabel = (ca: number, cb: number) =>
    `${a.layer.label} ${TERCILE_NAMES[ca]} (${rangesA[ca]!.label}), ${b.layer.label} ${TERCILE_NAMES[cb]} (${rangesB[cb]!.label})`;

  return (
    <div className="flex flex-col gap-2">
      <header className="flex flex-col gap-0.5 pr-7">
        <h2 className="text-body font-semibold text-text-1">Two layers</h2>
        <p className="text-caption text-text-3" data-testid="legend-level">
          {LEVEL_UNITS[level]} · split into thirds
        </p>
      </header>

      <AxisLabel which="A" axis={a} note={axisNote(a, level, display)} />

      <div className="flex gap-1.5">
        {/* A ticks sit on the row boundaries, highest class on top. */}
        <div className="relative w-9 shrink-0 text-caption text-text-2" style={{ height: GRID }} aria-hidden>
          {a.breaks.map((v, i) => (
            <span
              key={i}
              className="absolute right-0 -translate-y-1/2 leading-4"
              style={{ top: GRID - (i + 1) * (CELL + GAP) + GAP / 2 }}
            >
              {formatValue(v, a)}
            </span>
          ))}
        </div>
        <div className="flex flex-col">
          <div
            role="list"
            aria-label={`${a.layer.label} (rows) by ${b.layer.label} (columns)`}
            className="grid grid-cols-3"
            style={{ gap: GAP, width: GRID, height: GRID }}
            data-testid="legend-grid"
          >
            {[2, 1, 0].flatMap((ca) =>
              [0, 1, 2].map((cb) => {
                const k = 3 * ca + cb;
                return (
                  <div
                    key={k}
                    role="listitem"
                    data-class={k}
                    className={cn(
                      "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-colors duration-(--dur-toggle) ease-ui",
                      k === 6 && "rounded-tl-[4px]",
                      k === 8 && "rounded-tr-[4px]",
                      k === 0 && "rounded-bl-[4px]",
                      k === 2 && "rounded-br-[4px]",
                    )}
                    style={{ backgroundColor: scale.colors[k] }}
                  >
                    <span
                      role="img"
                      aria-label={cellLabel(ca, cb)}
                      title={cellLabel(ca, cb)}
                      className="block size-full"
                    />
                  </div>
                );
              }),
            )}
          </div>
          {/* B ticks sit on the column boundaries. */}
          <div className="relative h-4 text-caption text-text-2" style={{ width: GRID }} aria-hidden>
            {b.breaks.map((v, i) => (
              <span
                key={i}
                className="absolute top-0.5 -translate-x-1/2 leading-4"
                style={{ left: (i + 1) * (CELL + GAP) - GAP / 2 }}
              >
                {formatValue(v, b)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <AxisLabel which="B" axis={b} note={axisNote(b, level, display)} />
    </div>
  );
}

/** "No data" and "Few schools" swatches, always shown under the ramp (SPEC.md 7). */
function DataStateKey({ level }: { level: Level }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 text-caption whitespace-nowrap text-text-2">
      <li className="flex items-center gap-1.5">
        {level === "local" ? (
          <NoDataPinSwatch />
        ) : (
          <span
            role="img"
            aria-label="No data: hatched area"
            className="h-2.5 w-3.5 shrink-0 rounded-[2px]"
            style={{
              backgroundColor: "var(--nodata-fill)",
              backgroundImage:
                "repeating-linear-gradient(-45deg, var(--nodata-hatch) 0 1px, transparent 1px 4px), linear-gradient(var(--nodata-fill), var(--nodata-fill))",
              boxShadow: "inset 0 0 0 1px var(--border)",
            }}
          />
        )}
        No data
      </li>
      <li className="flex items-center gap-1.5">
        <span
          role="img"
          aria-label="Few schools: dotted outline"
          className="h-2.5 w-3.5 shrink-0 rounded-[2px] border border-dotted border-(--thin-outline)"
          style={{ backgroundColor: "var(--u2)" }}
        />
        Few schools (under 3)
      </li>
    </ul>
  );
}

/** The map's no-data pin (pinStyle.ts NO_DATA_MARKER): light dashes over a dark ring, no fill, at a z9 pin's size. */
function NoDataPinSwatch() {
  const { ring } = noDataMarker(pinRadius(LOCAL_LEVEL_ZOOM + 1));
  const { dashes, dashWidth } = NO_DATA_MARKER;
  const circle = { cx: 6, cy: 6, r: ring, fill: "none" };
  return (
    <svg role="img" aria-label="No data: dashed ring pin" viewBox="0 0 12 12" className="size-3 shrink-0">
      <circle {...circle} stroke="rgba(10,12,16,0.85)" strokeWidth={dashWidth + 2 * HALO_WIDTH} />
      <circle
        {...circle}
        stroke="var(--text-2)"
        strokeWidth={dashWidth}
        pathLength={2 * dashes}
        strokeDasharray="1 1"
        // Dashes sit symmetrically about the vertical axis, as on the map.
        transform={`rotate(${-90 - 180 / (2 * dashes)} 6 6)`}
      />
    </svg>
  );
}

function LegendSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading legend">
      <div className="h-3.5 w-32 animate-pulse rounded-full bg-highlight" />
      <div className="h-3 w-20 animate-pulse rounded-full bg-highlight" />
      <div className="mt-1 h-3 w-full animate-pulse rounded-[4px] bg-highlight" />
      <div className="h-4" />
    </div>
  );
}

function LegendUnavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 pr-7 text-caption text-text-2">
      <span>Legend unavailable.</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-chip px-2 py-1 text-accent-brand transition-colors duration-(--dur-hover) hover:bg-accent-dim"
        >
          Retry
        </button>
      )}
    </div>
  );
}
