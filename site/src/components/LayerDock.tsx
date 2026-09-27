// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { clsx as cn } from "clsx";
import { ChevronRight, Layers as LayersIcon } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Preset } from "@/lib/dataTypes";
import { load } from "@/lib/loaders";
import { modalDialogOpen } from "@/lib/shortcut";
import { openPreset } from "@/lib/urlSync";
import type { Display, LayerDef } from "@/lib/types";
import { useStore } from "@/store/useStore";
import { MinimizeButton, Minimizable } from "./Minimizable";
import {
  CONTEXT_LAYERS,
  CONTEXT_NOTE,
  COUNTY_BADGE_NOTE,
  INDICATOR_DOMAINS,
  PRIMARY_LAYERS,
  type Layers,
  isPresetActive,
  isTypingTarget,
  layerKeyAction,
  setLayerA,
  setLayerB,
  toggleLayer,
} from "./layerDockModel";

type Slot = "A" | "B";

const INDICATOR_COUNT = INDICATOR_DOMAINS.reduce((n, d) => n + d.layers.length, 0);

// The primary layer owns the magenta axis and the secondary the teal axis (SPEC.md 9.2).
const SLOT_STYLE: Record<Slot, { mark: string; chip: string }> = {
  A: {
    mark: "bg-(--u5) text-bg-0",
    chip: "border-[color-mix(in_srgb,var(--u5)_70%,transparent)] bg-[color-mix(in_srgb,var(--u5)_14%,transparent)]",
  },
  B: {
    mark: "bg-(--bv2) text-bg-0",
    chip: "border-[color-mix(in_srgb,var(--bv2)_70%,transparent)] bg-[color-mix(in_srgb,var(--bv2)_14%,transparent)]",
  },
};

const TRANSITION = "transition-[background-color,border-color,color] duration-(--dur-toggle) ease-(--ease-ui)";

/** Writes a new layer pair. The view no longer matches a preset once the visitor changes layers. */
function commitLayers(next: Layers) {
  const { layers } = useStore.getState();
  if (next.join(",") === layers.join(",")) return;
  useStore.setState({ layers: next, preset: undefined });
}

function slotOf(layers: Layers, id: string): Slot | undefined {
  if (layers[0] === id) return "A";
  if (layers[1] === id) return "B";
  return undefined;
}

function SlotMark({ slot, className }: { slot: Slot; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot-mark={slot}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full text-[10px] leading-none font-bold",
        SLOT_STYLE[slot].mark,
        className,
      )}
    >
      {slot}
    </span>
  );
}

/** The `county` badge (SPEC.md 3.6) with its tooltip. Pointer-only; the note reaches assistive tech via aria-describedby. */
function CountyBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-hidden
          data-testid="county-badge"
          className="shrink-0 rounded-[5px] bg-(--border) px-1 py-px text-[10px] leading-3 font-medium text-text-2"
        >
          county
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[260px] rounded-card border border-border-strong bg-surface-strong px-3 py-2.5 leading-snug text-text-1 shadow-panel backdrop-blur-md [&>span]:hidden"
      >
        {COUNTY_BADGE_NOTE}
      </TooltipContent>
    </Tooltip>
  );
}

interface LayerButtonProps {
  layer: LayerDef;
  slot?: Slot;
  countyNoteId: string;
  onClick: () => void;
  className?: string;
}

/** A primary-tier chip: label, county badge, and the A/B mark as a corner notch. */
function PrimaryChip({ layer, slot, countyNoteId, onClick, hotkey, className }: LayerButtonProps & { hotkey: number }) {
  const county = layer.resolution === "county";
  return (
    <button
      type="button"
      data-layer={layer.id}
      aria-pressed={slot !== undefined}
      aria-keyshortcuts={`${hotkey} Shift+${hotkey}`}
      aria-describedby={county ? countyNoteId : undefined}
      onClick={onClick}
      className={cn(
        "relative flex h-9 min-w-0 items-center gap-1 rounded-chip border px-2 text-left text-chip font-medium",
        TRANSITION,
        className,
        slot
          ? cn(SLOT_STYLE[slot].chip, "text-text-1")
          : "border-border bg-highlight text-text-2 hover:border-border-strong hover:text-text-1",
      )}
    >
      <span className="min-w-0 truncate">{layer.label}</span>
      {county && <CountyBadge />}
      {slot && <span className="sr-only">{`, layer ${slot}`}</span>}
      {slot && <SlotMark slot={slot} className="absolute -top-1.5 -right-1.5 ring-2 ring-bg-1" />}
    </button>
  );
}

/** A row in the indicator and context lists: label and, unless compact, the plain-English subtitle. */
function LayerRow({ layer, slot, countyNoteId, onClick, compact }: LayerButtonProps & { compact?: boolean }) {
  const county = layer.resolution === "county";
  return (
    <button
      type="button"
      data-layer={layer.id}
      aria-pressed={slot !== undefined}
      aria-describedby={county ? countyNoteId : undefined}
      onClick={onClick}
      className={cn(
        "relative flex w-full gap-2 rounded-chip border px-2 text-left",
        compact ? "items-center py-1" : "items-start py-1.5",
        TRANSITION,
        slot ? SLOT_STYLE[slot].chip : "border-transparent hover:bg-highlight",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className={cn("text-body font-medium", slot ? "text-text-1" : "text-text-2")}>{layer.label}</span>
          {county && <CountyBadge />}
        </span>
        {!compact && <span className="text-caption leading-snug text-text-3">{layer.subtitle}</span>}
      </span>
      {slot ? (
        <SlotMark slot={slot} className={compact ? undefined : "mt-0.5"} />
      ) : (
        <span aria-hidden className="size-4" />
      )}
      {slot && <span className="sr-only">{`, layer ${slot}`}</span>}
    </button>
  );
}

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-badge font-medium tracking-[0.06em] text-text-3 uppercase", className)}>{children}</div>
  );
}

interface DisclosureProps {
  title: string;
  count: number;
  /** A/B marks of active layers inside, so a collapsed section still shows what it holds. */
  marks: Slot[];
  open: boolean;
  onToggle: () => void;
  /** A line shown under the heading whether or not the section is open. */
  note?: string;
  children: ReactNode;
}

function Disclosure({ title, count, marks, open, onToggle, note, children }: DisclosureProps) {
  const bodyId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-chip px-1.5 text-left text-body font-medium text-text-2 hover:bg-highlight hover:text-text-1",
          TRANSITION,
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-text-3 transition-transform duration-(--dur-toggle) ease-(--ease-ui)",
            open && "rotate-90",
          )}
        />
        <span className="flex-1">{title}</span>
        {marks.map((m) => (
          <SlotMark key={m} slot={m} />
        ))}
        <span className="text-caption text-text-3 tabular">{count}</span>
      </button>
      {note && <p className="px-2 pt-0.5 pb-1.5 pl-7 text-caption leading-snug text-text-3">{note}</p>}
      <div
        id={bodyId}
        className={cn(
          "grid transition-[grid-template-rows] duration-(--dur-panel) ease-(--ease-ui)",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          {children}
        </div>
      </div>
    </div>
  );
}

function DisplayToggle({ layers }: { layers: Layers }) {
  const display = useStore((s) => s.display);
  const setDisplay = useStore((s) => s.setDisplay);
  const options: { value: Display; label: string }[] = [
    { value: "score", label: "Score" },
    { value: "pct", label: "National percentile" },
  ];
  const applies = layers.some((id) => PRIMARY_LAYERS.find((l) => l.id === id)?.pctColumn);
  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label="Display" className="grid grid-cols-[2fr_3fr] rounded-chip bg-highlight p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={display === o.value}
            onClick={() => setDisplay(o.value)}
            className={cn(
              "h-7 rounded-[6px] px-3 text-caption font-medium",
              TRANSITION,
              display === o.value
                ? "bg-(--border-strong) text-text-1 shadow-[inset_0_1px_0_var(--highlight)]"
                : "text-text-3 hover:text-text-2",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {display === "pct" && !applies && (
        <p className="text-caption text-text-3">Percentiles apply to the six scores; this layer shows its value.</p>
      )}
    </div>
  );
}

function Presets() {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [failed, setFailed] = useState(false);
  const layers = useStore((s) => s.layers);
  const preset = useStore((s) => s.preset);

  useEffect(() => {
    let live = true;
    load("presets").then(
      (f) => live && setPresets(f.presets),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (failed) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Stories, in order</SectionLabel>
      <ol className="flex flex-col gap-0.5" aria-busy={presets === null}>
        {presets === null
          ? [180, 236, 172, 210, 200, 196].map((w) => (
              <li key={w} className="h-7 animate-pulse rounded-chip bg-highlight" style={{ width: w }} />
            ))
          : presets.map((p, i) => {
              const active = isPresetActive(p, { preset, layers });
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    data-preset={p.id}
                    aria-pressed={active}
                    onClick={() => openPreset(p)}
                    className={cn(
                      "flex h-7 w-full items-center gap-2 rounded-chip border px-1.5 text-left text-caption font-medium",
                      TRANSITION,
                      active
                        ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-accent-dim text-text-1"
                        : "border-transparent text-text-2 hover:bg-highlight hover:text-text-1",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full text-[10px] leading-none font-semibold tabular",
                        active ? "bg-accent-brand text-bg-0" : "bg-(--border) text-text-2",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 truncate">{p.label}</span>
                  </button>
                </li>
              );
            })}
      </ol>
    </div>
  );
}

/** Keyboard `1`..`7` set layer A to the nth primary chip, `Shift` variants set layer B (SPEC.md 3.14). */
function useLayerKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || isTypingTarget(e.target) || modalDialogOpen()) return;
      const action = layerKeyAction(e);
      if (!action) return;
      e.preventDefault();
      const { layers } = useStore.getState();
      commitLayers(action.slot === "A" ? setLayerA(layers, action.id) : setLayerB(layers, action.id));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * Layer dock (SPEC.md 3.6): seven primary chips, indicators grouped by domain, context shares, the display toggle,
 * and the story presets. The first click sets layer A, a click on another layer sets B (bivariate mode), clicking B
 * removes it, and clicking A while B exists promotes B.
 */
export function LayerDock() {
  const layers = useStore((s) => s.layers);
  const countyNoteId = useId();
  const titleId = useId();
  const [indicatorsOpen, setIndicatorsOpen] = useState(() =>
    layers.some((id) => INDICATOR_DOMAINS.some((d) => d.layers.some((l) => l.id === id))),
  );
  const [contextOpen, setContextOpen] = useState(() => layers.some((id) => CONTEXT_LAYERS.some((l) => l.id === id)));
  useLayerKeys();

  const click = (id: string) => commitLayers(toggleLayer(layers, id));
  const marksIn = (defs: LayerDef[]) => (["A", "B"] as const).filter((_, i) => defs.some((l) => l.id === layers[i]));
  const indicatorLayers = INDICATOR_DOMAINS.flatMap((d) => d.layers);

  return (
    <Minimizable panel="layers" corner="top-left" restoreLabel="Show layers" chip={<LayersChip layers={layers} />}>
      <section
        data-testid="slot-layer-dock"
        aria-labelledby={titleId}
        className="glass relative flex max-h-[calc(100vh-72px-88px)] min-h-0 flex-col"
      >
        <span id={countyNoteId} className="sr-only">
          {COUNTY_BADGE_NOTE}
        </span>

        <header className="flex items-center justify-between gap-2 pt-4 pr-3 pb-3 pl-4">
          <h2 id={titleId} className="text-title font-semibold tracking-tight text-text-1">
            Layers
          </h2>
          <span className="ml-auto text-caption text-text-3" aria-live="polite">
            {layers.length === 2 ? "Two layers · bivariate" : "Pick a second to compare"}
          </span>
          <MinimizeButton panel="layers" label="layers" />
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)] [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]">
          {/* Composite sums up the other domains, so it takes a full row and its whole label fits. */}
          <div className="grid grid-cols-2 gap-1.5 pt-1.5">
            {PRIMARY_LAYERS.map((layer, i) => (
              <PrimaryChip
                key={layer.id}
                layer={layer}
                hotkey={i + 1}
                className={i === 0 ? "col-span-2" : undefined}
                slot={slotOf(layers, layer.id)}
                countyNoteId={countyNoteId}
                onClick={() => click(layer.id)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-0.5 border-t border-border pt-2">
            <Disclosure
              title="Indicators"
              count={INDICATOR_COUNT}
              marks={marksIn(indicatorLayers)}
              open={indicatorsOpen}
              onToggle={() => setIndicatorsOpen((o) => !o)}
            >
              <div className="flex flex-col gap-3 pt-1 pb-2">
                {INDICATOR_DOMAINS.map((d) => (
                  <div
                    key={d.domain}
                    role="group"
                    aria-label={`${d.label} indicators`}
                    className="flex flex-col gap-0.5"
                  >
                    <SectionLabel className="px-2 pb-0.5">{d.label}</SectionLabel>
                    {d.layers.map((layer) => (
                      <LayerRow
                        key={layer.id}
                        layer={layer}
                        slot={slotOf(layers, layer.id)}
                        countyNoteId={countyNoteId}
                        onClick={() => click(layer.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </Disclosure>

            <Disclosure
              title="Context (not in the index)"
              count={CONTEXT_LAYERS.length}
              marks={marksIn(CONTEXT_LAYERS)}
              open={contextOpen}
              onToggle={() => setContextOpen((o) => !o)}
              note={CONTEXT_NOTE}
            >
              <div className="flex flex-col gap-0.5 pt-1 pb-2">
                {CONTEXT_LAYERS.map((layer) => (
                  <LayerRow
                    compact
                    key={layer.id}
                    layer={layer}
                    slot={slotOf(layers, layer.id)}
                    countyNoteId={countyNoteId}
                    onClick={() => click(layer.id)}
                  />
                ))}
              </div>
            </Disclosure>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <DisplayToggle layers={layers} />
            <Presets />
          </div>
        </div>
      </section>
    </Minimizable>
  );
}

const LAYER_BY_ID = new Map(
  [...PRIMARY_LAYERS, ...INDICATOR_DOMAINS.flatMap((d) => d.layers), ...CONTEXT_LAYERS].map((l) => [l.id, l]),
);

/** The minimized dock: which layers color the map, each with its A/B mark. */
function LayersChip({ layers }: { layers: Layers }) {
  const active = layers.flatMap((id, i) => {
    const layer = LAYER_BY_ID.get(id);
    return layer ? [{ layer, slot: (i === 0 ? "A" : "B") as Slot }] : [];
  });
  return (
    <>
      <LayersIcon aria-hidden />
      <span className={cn(active.length > 0 && "sr-only")}>Layers</span>
      {active.map(({ layer, slot }) => (
        <span key={slot} className="flex min-w-0 items-center gap-1.5 text-text-1">
          <SlotMark slot={slot} />
          <span className="max-w-[140px] truncate">{layer.label}</span>
        </span>
      ))}
    </>
  );
}
