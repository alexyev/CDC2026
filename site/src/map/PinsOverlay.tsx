// The pin overlay's DOM: the hover overview card anchored to a pin (SPEC.md 3.5, 9.5) and the "loading schools" chip
// (SPEC.md 10.1 step 5). Rendered by PinsController into a host element inside the map container.

import { Star } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { schoolCard } from "./overview";
import { OverviewCard } from "./OverviewCard";
import type { PinsController, PinTip } from "./pins";

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

  const card = useMemo(
    () => schoolCard(schools, tip.index, layerIds, { display }),
    [schools, tip.index, layerIds, display],
  );
  const starred = favorites.includes(card.id);

  return (
    <OverviewCard
      card={card}
      x={tip.x}
      y={tip.y}
      testId="pin-tooltip"
      className="pointer-events-auto animate-in duration-[120ms] fade-in-0 motion-reduce:animate-none"
      onPointerEnter={() => controller.setPointerInTip(true)}
      onPointerLeave={() => controller.setPointerInTip(false)}
      action={
        <button
          type="button"
          aria-label={starred ? `Unstar ${card.title}` : `Star ${card.title}`}
          aria-pressed={starred}
          onClick={() => toggleFavorite(card.id)}
          className={cn(
            "-mt-0.5 -mr-1 grid size-7 shrink-0 place-items-center rounded-chip transition-colors duration-200",
            "hover:bg-secondary",
            starred ? "text-mark-a" : "text-text-3 hover:text-text-1",
          )}
        >
          <Star className="size-4" fill={starred ? "currentColor" : "none"} strokeWidth={1.75} />
        </button>
      }
    />
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
