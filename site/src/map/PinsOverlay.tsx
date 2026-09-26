// The pin overlay's DOM: the hover tooltip anchored to a pin (SPEC.md 3.5, 9.5) and the "loading schools" chip
// (SPEC.md 10.1 step 5). Rendered by PinsController into a host element inside the map container.

import { Star } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import type { LayerDef } from "@/lib/types";
import { useStore } from "@/store/useStore";
import { catalogLayer } from "@/lib/scales";
import { tooltipModel, tooltipSummary, type TooltipModel } from "./pinFormat";
import type { PinsController, PinTip } from "./pins";

/** Gap between the pin and the tooltip's nearest corner. */
const OFFSET = 14;

export function PinsOverlay({ controller }: { controller: PinsController }) {
  const { status, tip } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return (
    <>
      {tip && controller.schools && <PinTooltip controller={controller} tip={tip} />}
      {status !== "ready" && <LoadingChip status={status} onRetry={controller.retry} />}
    </>
  );
}

function PinTooltip({ controller, tip }: { controller: PinsController; tip: PinTip }) {
  const layerIds = useStore((s) => s.layers);
  const display = useStore((s) => s.display);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const schools = controller.schools!;

  const model = useMemo<TooltipModel>(() => {
    const layers = layerIds.map(catalogLayer).filter((l): l is LayerDef => l !== undefined);
    return tooltipModel(schools, tip.index, layers, display);
  }, [schools, tip.index, layerIds, display]);

  const starred = favorites.includes(model.id);
  const container = controller.map.getContainer();
  // Open toward the middle of the map so the tooltip stays clear of the edges and the side panels.
  const right = tip.x > container.clientWidth / 2;
  const below = tip.y < container.clientHeight / 2;
  const style = {
    left: right ? undefined : tip.x + OFFSET,
    right: right ? container.clientWidth - tip.x + OFFSET : undefined,
    top: below ? tip.y + OFFSET : undefined,
    bottom: below ? undefined : container.clientHeight - tip.y + OFFSET,
  };

  return (
    <div
      role="tooltip"
      data-testid="pin-tooltip"
      style={style}
      className={cn(
        "pointer-events-auto absolute w-max max-w-[320px] min-w-[220px] rounded-card border border-border-strong px-3 py-2.5",
        "bg-surface-strong shadow-panel",
        "animate-in duration-[120ms] fade-in-0 zoom-in-95 motion-reduce:animate-none",
      )}
      onPointerEnter={() => controller.setPointerInTip(true)}
      onPointerLeave={() => controller.setPointerInTip(false)}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-chip leading-tight font-semibold text-text-1">{model.name}</div>
          {model.place && <div className="mt-0.5 text-caption leading-snug text-text-3">{model.place}</div>}
        </div>
        <button
          type="button"
          aria-label={starred ? `Unstar ${model.name}` : `Star ${model.name}`}
          aria-pressed={starred}
          onClick={() => toggleFavorite(model.id)}
          className={cn(
            "-mt-0.5 -mr-1 grid size-7 shrink-0 place-items-center rounded-chip transition-colors duration-200",
            "hover:bg-secondary",
            starred ? "text-mark-a" : "text-text-3 hover:text-text-1",
          )}
        >
          <Star className="size-4" fill={starred ? "currentColor" : "none"} strokeWidth={1.75} />
        </button>
      </div>

      {model.rows.length > 0 && (
        <dl className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {model.rows.map((row, k) => (
            <div key={row.id} className="flex items-baseline gap-3">
              <dt className="flex min-w-0 flex-1 items-baseline gap-1.5 text-body text-text-2">
                {model.rows.length > 1 && (
                  <span aria-hidden className="w-2 shrink-0 font-mono text-badge text-text-3">
                    {k === 0 ? "A" : "B"}
                  </span>
                )}
                <span className="truncate">{row.label}</span>
                {row.countyLevel && (
                  <span
                    title="This measure is only available per county. Every school in a county shares the same value."
                    className="shrink-0 rounded-[4px] border border-border-strong px-1 text-[10px] leading-[14px] tracking-[0.06em] text-text-3 uppercase"
                  >
                    county
                  </span>
                )}
              </dt>
              <dd className="text-right text-body whitespace-nowrap tabular">
                {row.value === null ? (
                  <span className="text-text-3">No data</span>
                ) : (
                  <>
                    <span className="font-semibold text-text-1">{row.value}</span>
                    {row.aside && <span className="ml-1 text-text-3">({row.aside})</span>}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-2 text-badge tracking-[0.06em] text-text-3 uppercase">Click pin for full profile</div>
      <span className="sr-only" aria-live="polite">
        {tooltipSummary(model)}
      </span>
    </div>
  );
}

function LoadingChip({ status, onRetry }: { status: "loading" | "error"; onRetry: () => void }) {
  return (
    <div
      data-testid="pins-status"
      className="glass pointer-events-auto absolute bottom-4 left-1/2 flex h-8 -translate-x-1/2 items-center gap-2 rounded-full px-3 text-caption text-text-2"
    >
      {status === "loading" ? (
        <>
          <span
            aria-hidden
            className="size-1.5 animate-pulse rounded-full bg-accent-brand motion-reduce:animate-none"
          />
          <span role="status">Loading schools</span>
        </>
      ) : (
        <>
          <span aria-hidden className="size-1.5 rounded-full bg-mark-b" />
          <span role="alert">Schools could not load</span>
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 rounded-full px-2 py-0.5 font-medium text-accent-brand hover:bg-accent-dim"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
