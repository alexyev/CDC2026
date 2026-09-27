// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { GitCompareArrows, Info, RotateCw, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import catalog from "../../data/catalog.json";
import {
  areaKindForLevel,
  areaName,
  areaNoun,
  distribution,
  flatLayer,
  layerRange,
  nationalSpearman,
  pairCount,
  schoolsInArea,
  valuePairs,
  viewportPairs,
  type Distribution,
  type ValuePairs,
} from "@/lib/compareData";
import { requestCompareStats } from "@/lib/compareStats";
import type { CountiesFile, NationalFile, SchoolsFile, StatesFile } from "@/lib/dataTypes";
import { boundsToBBox } from "@/lib/geo";
import { load } from "@/lib/loaders";
import { modalDialogOpen } from "@/lib/shortcut";
import type { BBox, InsightResult, LayerDef, Level, PairStats, PlaceRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { COMPARE_COLORS } from "@/map/compareOutlines";
import { useLevel } from "@/map/useLevel";
import { MapContext } from "@/map/mapContext";
import { isAreaPlace, useCompareToast } from "@/store/compareSlice";
import { useStore } from "@/store/useStore";
import { CompareScatter, type ScatterCloud } from "./CompareScatter";

const LAYERS = new Map((catalog.layers as LayerDef[]).map((l) => [l.id, l]));
const GRAY = "#6f7889";
const TOAST_MS = 3200;

type ColumnSlot = "a" | "b" | "view" | "nation";

interface Column {
  key: string;
  slot: ColumnSlot;
  badge: string;
  name: string;
  color: string;
  place?: PlaceRef;
  pairs: ValuePairs;
}

interface CompareFiles {
  schools: SchoolsFile;
  states: StatesFile;
  counties: CountiesFile;
  national: NationalFile;
}

const fmtN = (n: number) => n.toLocaleString("en-US");
/** ρ to two decimals with a typographic minus; values that round to zero never read "−0.00". */
const fmtR = (r: number) => `${r < 0 && r.toFixed(2) !== "-0.00" ? "−" : ""}${Math.abs(r).toFixed(2)}`;
const fmtValue = (v: number, def: LayerDef | undefined) => (def?.unit === "gini" ? v.toFixed(2) : v.toFixed(1));

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** `c` toggles compare mode (SPEC.md 3.14); ignored while an input has focus. */
function useCompareHotkey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "c" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      if (modalDialogOpen()) return;
      const { compare, armCompare } = useStore.getState();
      armCompare(!compare.armed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function useCompareFiles(active: boolean) {
  const [files, setFiles] = useState<CompareFiles | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || files) return;
    let cancelled = false;
    Promise.all([load("schools"), load("states"), load("counties"), load("national")])
      .then(([schools, states, counties, national]) => {
        if (!cancelled) setFiles({ schools, states, counties, national });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, files, attempt]);
  const retry = () => {
    setFailed(false);
    setAttempt((a) => a + 1);
  };
  return { files, failed, retry };
}

/** Map bounds, refreshed 150 ms after each move (SPEC.md 3.7); null without a map, meaning "everything". */
function useViewportBounds(): BBox | null {
  const map = useContext(MapContext)?.map ?? null;
  const [bounds, setBounds] = useState<BBox | null>(null);
  useEffect(() => {
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      setBounds(boundsToBBox(map.getBounds()));
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(read, ms);
    };
    schedule(0);
    const onMoveEnd = () => schedule(150);
    map.on("moveend", onMoveEnd);
    return () => {
      clearTimeout(timer);
      map.off("moveend", onMoveEnd);
    };
  }, [map]);
  return map ? bounds : null;
}

/** A short fingerprint of a list of school ids, so a stats result is only shown for the columns it was computed for. */
function fingerprint(ids: readonly string[]): string {
  let h = 0;
  for (const id of ids) for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `${ids.length}.${h}`;
}

/**
 * Compare mode (SPEC.md 3.9): the Compare toggle and pin hint, and once an area is pinned, one column per pinned
 * area (or A vs the viewport) plus the national baseline, the overlaid scatter, and per-layer distribution strips.
 * Rendered at the bottom of the insight panel; I1 hides the panel's own content while compare has pins.
 */
export function ComparePanel() {
  const armed = useStore((s) => s.compare.armed);
  const pins = useStore((s) => s.compare.pins);
  const armCompare = useStore((s) => s.armCompare);
  const level = useLevel();
  const areaPins = useMemo(() => pins.filter(isAreaPlace), [pins]);
  const kind = areaKindForLevel(level);
  useCompareHotkey();

  const hint =
    areaPins.length === 0
      ? `Click up to two ${areaNoun(kind)} to pin them.`
      : areaPins.length === 1
        ? `Click another ${kind} to pin B.`
        : null;

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
      <section aria-label="Compare" data-testid="compare-panel" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-pressed={armed}
            aria-keyshortcuts="c"
            onClick={() => armCompare(!armed)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-chip border px-3 text-chip font-medium transition-colors duration-200 ease-ui",
              armed
                ? "border-accent-brand/50 bg-accent-dim text-text-1"
                : "border-border-strong bg-white/[0.03] text-text-2 hover:bg-white/[0.06] hover:text-text-1",
            )}
          >
            <GitCompareArrows className={cn("size-4", armed ? "text-accent-strong" : "text-text-3")} aria-hidden />
            Compare
            <kbd className="ml-0.5 rounded-[4px] border border-border px-1 font-mono text-[10px] leading-4 text-text-3">
              C
            </kbd>
          </button>
          <div className="flex min-w-0 items-center gap-1.5" aria-label="Compare pins">
            <SlotDot slot="a" filled={areaPins.length > 0} />
            <SlotDot slot="b" filled={areaPins.length > 1} />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {armed && hint ? (
            <motion.p
              key="hint"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="status"
              className="m-0 rounded-chip border border-accent-brand/20 bg-accent-dim/60 px-3 py-2 text-caption text-text-2"
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>

        {armed && areaPins.length > 0 ? <CompareBody pins={areaPins} level={level} /> : null}
      </section>
      <CompareToast />
    </MotionConfig>
  );
}

function SlotDot({ slot, filled }: { slot: "a" | "b"; filled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full border text-badge font-semibold uppercase transition-colors duration-200",
        filled ? "border-transparent text-bg-0" : "border-border-strong text-text-3",
      )}
      style={filled ? { background: COMPARE_COLORS[slot] } : undefined}
      aria-label={`Pin ${slot.toUpperCase()} ${filled ? "set" : "empty"}`}
    >
      {slot.toUpperCase()}
    </span>
  );
}

interface CompareBodyProps {
  pins: PlaceRef[];
  /** The level being drawn; the viewport column gathers its units. */
  level: Level;
  removable?: boolean;
}

/**
 * The compare columns, scatter, and distribution strips for one or two pinned areas. `removable` puts a remove
 * button on each pinned column; hosts that show their own pin chips with remove buttons turn it off.
 */
export function CompareBody({ pins, level, removable = true }: CompareBodyProps) {
  const layers = useStore((s) => s.layers);
  const unpinCompare = useStore((s) => s.unpinCompare);
  const bounds = useViewportBounds();
  const { files, failed, retry } = useCompareFiles(true);
  const [layerA, layerB] = layers;
  const defA = layerA ? LAYERS.get(layerA) : undefined;
  const defB = layerB ? LAYERS.get(layerB) : undefined;

  const columns = useMemo<Column[] | null>(() => {
    if (!files || !layerA) return null;
    const { schools, states, counties } = files;
    const cols: Column[] = pins.map((place, i) => {
      const idx = schoolsInArea(schools, place);
      return {
        key: `${place.kind}:${place.id}`,
        slot: i === 0 ? "a" : "b",
        badge: i === 0 ? "A" : "B",
        name: areaName(place, states, counties),
        color: i === 0 ? COMPARE_COLORS.a : COMPARE_COLORS.b,
        place,
        pairs: valuePairs(schools, idx, layerA, layerB),
      };
    });
    if (cols.length === 1) {
      const pairs = viewportPairs(level, bounds, files, layerA, layerB);
      cols.push({
        key: `view:${fingerprint(pairs.ids)}`,
        slot: "view",
        badge: "View",
        name: "Viewport",
        color: GRAY,
        pairs,
      });
    }
    return cols;
  }, [files, pins, layerA, layerB, bounds, level]);

  const nation = useMemo<Column | null>(() => {
    if (!files || !layerA) return null;
    const all = files.schools.ids.map((_, i) => i);
    return {
      key: "nation",
      slot: "nation",
      badge: "US",
      name: "Nation",
      color: GRAY,
      pairs: valuePairs(files.schools, all, layerA, layerB),
    };
  }, [files, layerA, layerB]);

  const statsKey = columns && layerB ? `${layerA}|${layerB}|${columns[0]!.key}|${columns[1]!.key}` : null;
  const [stats, setStats] = useState<{ key: string; result: InsightResult } | null>(null);
  useEffect(() => {
    if (!statsKey || !columns || !layerA) return;
    let cancelled = false;
    requestCompareStats(layerA, layerB, columns[0]!.pairs, columns[1]!.pairs)
      .then((result) => {
        if (!cancelled && result) setStats({ key: statsKey, result });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // statsKey fingerprints the columns, so the columns array itself is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsKey]);

  if (failed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-border px-3 py-2.5 text-body text-text-2">
        Could not load school data.
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-chip text-accent-strong hover:bg-accent-dim"
        >
          <RotateCw className="size-3.5" aria-hidden /> Retry
        </button>
      </div>
    );
  }
  if (!layerA) {
    return <p className="m-0 text-body text-text-2">Pick a layer to compare these areas.</p>;
  }
  if (!columns || !nation || !files) return <CompareSkeleton />;

  const result = stats && stats.key === statsKey ? stats.result : null;
  const pairStats: (PairStats | null | undefined)[] = [result?.areas?.spearman, result?.schools.spearman];
  const nationalR = layerB ? nationalSpearman(files.national, layerA, layerB) : null;
  const all = [...columns, nation];

  const rangeA = layerRange(defA);
  const rangeB = layerRange(defB);
  const nameIndex = new Map(files.schools.ids.map((id, i) => [id, i]));
  const nameOf = (id: string) => files.schools.name[nameIndex.get(id) ?? -1] ?? id;

  const clouds: ScatterCloud[] = [];
  if (layerB) {
    const bg = columns[1]!.slot === "view" ? columns[1]! : nation;
    clouds.push(cloudOf(bg, true));
    for (const c of [...columns].reverse()) if (c.slot === "a" || c.slot === "b") clouds.push(cloudOf(c, false));
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="m-0 truncate text-body font-semibold text-text-1">
          {defA?.label ?? layerA}
          {defB ? <span className="font-normal text-text-3"> × </span> : null}
          {defB?.label}
        </h3>
        <span className="text-caption text-text-3">
          {layerB ? "Spearman ρ and 95% interval, schools inside each area" : "Mean of the schools inside each area"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2" data-testid="compare-columns">
        {all.map((col, i) => (
          <CompareCard
            key={col.slot}
            column={col}
            twoLayers={Boolean(layerB)}
            pair={i < 2 ? pairStats[i] : undefined}
            pending={Boolean(layerB) && i < 2 && !result}
            nationalR={col.slot === "nation" ? nationalR : undefined}
            def={defA}
            defB={defB}
            onRemove={removable && col.place ? () => unpinCompare(col.place!) : undefined}
          />
        ))}
      </div>

      {layerB ? (
        <CompareScatter
          clouds={clouds}
          xLabel={defA?.label ?? layerA}
          yLabel={defB?.label ?? layerB}
          xRange={rangeA}
          yRange={rangeB}
          nameOf={nameOf}
        />
      ) : null}

      <div className="flex flex-col gap-3" data-testid="compare-strips">
        {[layerA, layerB].map((id, li) =>
          id ? (
            <DistributionStrips
              key={id}
              def={LAYERS.get(id)}
              layerId={id}
              columns={all}
              pick={(c) => (li === 0 ? c.pairs.x : (c.pairs.y ?? []))}
            />
          ) : null,
        )}
      </div>
    </motion.div>
  );
}

function cloudOf(c: Column, background: boolean): ScatterCloud {
  return { key: c.key, label: c.name, color: c.color, ids: c.pairs.ids, x: c.pairs.x, y: c.pairs.y ?? [], background };
}

function CompareSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading compare data">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[112px] animate-pulse rounded-card bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-card bg-white/[0.03]" />
    </div>
  );
}

interface CompareCardProps {
  column: Column;
  twoLayers: boolean;
  pair: PairStats | null | undefined;
  pending: boolean;
  nationalR?: number | null;
  def: LayerDef | undefined;
  defB?: LayerDef | undefined;
  onRemove?: () => void;
}

function CompareCard({ column, twoLayers, pair, pending, nationalR, def, defB, onRemove }: CompareCardProps) {
  const isNation = column.slot === "nation";
  const n = pairCount(column.pairs);
  const dist = useMemo(() => distribution(column.pairs.x, layerRange(def)), [column.pairs.x, def]);
  const unit = "schools";

  let headline: React.ReactNode;
  let detail: React.ReactNode;
  if (!twoLayers) {
    headline = dist.mean === null ? <NoData /> : <Num>{fmtValue(dist.mean, def)}</Num>;
    detail = dist.median === null ? "no values" : `median ${fmtValue(dist.median, def)}`;
  } else if (isNation) {
    headline = nationalR === null || nationalR === undefined ? <NoData /> : <Rho r={nationalR} />;
    detail = "nationwide";
  } else if (n < 10) {
    headline = <span className="text-body font-medium text-text-2">Too few</span>;
    detail = `to correlate`;
  } else if (pending) {
    headline = <span className="my-[5px] block h-4 w-14 animate-pulse rounded bg-white/[0.08]" />;
    detail = <span className="block h-3 w-16 animate-pulse rounded bg-white/[0.05]" />;
  } else if (!pair || pair.r === null) {
    const flat = flatLayer(column.pairs);
    const flatDef = flat === "a" ? def : flat === "b" ? defB : undefined;
    if (flatDef) {
      // Every school here shares one value of this layer (a county-level layer inside one county): no ranking.
      headline = <span className="text-body font-medium text-text-2">No ρ</span>;
      detail = (
        <span title={`${flatDef.label} has one value for every school here, so there is no ranking to correlate.`}>
          {flatDef.label} is flat
        </span>
      );
    } else {
      headline = <NoData />;
      detail = "not computed";
    }
  } else {
    headline = <Rho r={pair.r} />;
    detail = pair.ci ? (
      <span title={`95% interval${pair.ciMethod === "approx" ? " (approx.)" : " (bootstrap)"}`}>
        {fmtR(pair.ci[0])} to {fmtR(pair.ci[1])}
      </span>
    ) : (
      "no interval"
    );
  }

  return (
    <article
      data-testid={`compare-card-${column.slot}`}
      aria-label={`${column.badge}: ${column.name}`}
      className="relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-card border border-border bg-white/[0.025] px-2.5 pt-2.5 pb-2"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: column.color }} />
      <div className="flex h-5 items-center justify-between gap-1">
        <span
          className={cn(
            "inline-flex h-4 items-center rounded-[4px] px-1 text-badge font-semibold tracking-[0.06em] uppercase",
            column.slot === "a" || column.slot === "b" ? "text-bg-0" : "bg-white/[0.08] text-text-2",
          )}
          style={column.slot === "a" || column.slot === "b" ? { background: column.color } : undefined}
        >
          {column.badge}
        </span>
        {twoLayers && !isNation && n >= 10 && n < 30 ? (
          <span
            title="Small sample (under 30 schools)"
            className="mr-auto rounded-[4px] bg-white/[0.07] px-1 text-[10px] leading-4 font-semibold tracking-[0.06em] text-text-2 uppercase"
          >
            small
          </span>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${column.name}`}
            className="-mr-1 inline-flex size-5 items-center justify-center rounded-[4px] text-text-3 transition-colors hover:bg-white/[0.08] hover:text-text-1"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <p
        className="m-0 line-clamp-2 min-h-[2lh] text-caption leading-[1.3] font-medium text-text-1"
        title={column.name}
      >
        {column.name}
      </p>
      <div className="mt-0.5 flex h-7 items-center">{headline}</div>
      <div className="min-h-4 truncate text-caption text-text-2 tabular">{detail}</div>
      <div className="truncate text-badge text-text-3 tabular">
        {fmtN(n)} {n === 1 ? "school" : unit}
      </div>
    </article>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="text-headline leading-[1.1] font-semibold text-text-1 tabular">{children}</span>;
}

function Rho({ r }: { r: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-body text-text-3">ρ</span>
      <Num>{fmtR(r)}</Num>
    </span>
  );
}

function NoData() {
  return <span className="text-body text-text-3">No data</span>;
}

interface DistributionStripsProps {
  def: LayerDef | undefined;
  layerId: string;
  columns: Column[];
  pick: (c: Column) => (number | null)[];
}

/** Per-layer distribution strips (SPEC.md 3.9): 20 bins over the national range, one row per column, median tick. */
function DistributionStrips({ def, layerId, columns, pick }: DistributionStripsProps) {
  const range = layerRange(def);
  const rows = useMemo(
    () => columns.map((c) => ({ column: c, dist: distribution(pick(c), range) })),
    // pick is derived from the column list and the layer, which the key of this component carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, range[0], range[1]],
  );
  const lo = range[0];
  const hi = range[1];
  const fmtEnd = (v: number) => (hi <= 1 ? v.toFixed(1) : String(v));

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-caption font-medium text-text-2">{def?.label ?? layerId}</span>
        <span className="shrink-0 text-badge tracking-[0.06em] text-text-3 uppercase">median</span>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map(({ column, dist }) => (
          <StripRow key={column.slot} column={column} dist={dist} lo={lo} hi={hi} def={def} />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-[36px_1fr_44px] gap-2 text-badge text-text-3 tabular">
        <span />
        <span className="flex justify-between">
          <span>{fmtEnd(lo)}</span>
          <span>{fmtEnd(hi)}</span>
        </span>
        <span />
      </div>
    </div>
  );
}

function StripRow({
  column,
  dist,
  lo,
  hi,
  def,
}: {
  column: Column;
  dist: Distribution;
  lo: number;
  hi: number;
  def: LayerDef | undefined;
}) {
  const max = Math.max(1, ...dist.counts);
  const medianPct = dist.median === null ? null : ((dist.median - lo) / (hi - lo)) * 100;
  const label = `${column.name}: ${dist.median === null ? "no data" : `median ${fmtValue(dist.median, def)}`}, n = ${fmtN(dist.n)}`;
  return (
    <div className="grid grid-cols-[36px_1fr_44px] items-center gap-2" role="img" aria-label={label}>
      <span className="flex items-center gap-1.5 text-badge font-semibold tracking-[0.06em] text-text-2 uppercase">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: column.color }} />
        {column.badge}
      </span>
      <div className="relative flex h-3 overflow-hidden rounded-[3px] bg-white/[0.03]">
        {dist.counts.map((count, i) => (
          <span
            key={i}
            className="h-full flex-1"
            style={{ background: column.color, opacity: count === 0 ? 0 : 0.14 + 0.86 * (count / max) }}
          />
        ))}
        {medianPct !== null ? (
          <span
            aria-hidden
            className="absolute inset-y-[-1px] w-[2px] -translate-x-1/2 rounded-full bg-text-1 shadow-[0_0_0_1px_rgba(10,12,16,0.7)]"
            style={{ left: `${Math.min(100, Math.max(0, medianPct))}%` }}
          />
        ) : null}
      </div>
      <span className="text-right text-caption text-text-1 tabular">
        {dist.median === null ? <span className="text-text-3">n/a</span> : fmtValue(dist.median, def)}
      </span>
    </div>
  );
}

/** The `c` hotkey and the pin reset toast, for hosts that show CompareBody without ComparePanel's toggle. */
export function CompareShortcuts() {
  useCompareHotkey();
  return <CompareToast />;
}

/** "Compare pins reset to {level}" (SPEC.md 3.9), bottom center above the breadcrumb row, auto-dismissed. */
function CompareToast() {
  const message = useCompareToast((s) => s.message);
  const seq = useCompareToast((s) => s.seq);
  const dismiss = useCompareToast((s) => s.dismiss);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(dismiss, TOAST_MS);
    return () => clearTimeout(t);
  }, [message, seq, dismiss]);

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-50 flex justify-center">
      <AnimatePresence>
        {message ? (
          <motion.div
            key={seq}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass glass-strong pointer-events-auto flex items-center gap-2.5 rounded-full py-2 pr-2 pl-3.5 text-body text-text-1"
          >
            <Info className="size-4 text-accent-strong" aria-hidden />
            {message}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="inline-flex size-6 items-center justify-center rounded-full text-text-3 hover:bg-white/[0.08] hover:text-text-1"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
