// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { ArrowLeft, ArrowRight, Eye, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cameraOff, NATION_BBOX, PANEL_SLOTS, stepView, TOUR_STEPS } from "@/content/tour";
import { LANDING_EXIT_MS } from "@/lib/guide";
import { usePanels } from "@/lib/panels";
import { encodeView } from "@/lib/urlCodec";
import { cn } from "@/lib/utils";
import { cameraForBBox, flyToCamera } from "@/map/camera";
import { MapContext } from "@/map/mapContext";
import { selectView, useStore } from "@/store/useStore";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./Primer";

// The guided tour (SPEC.md 3.15): a short walk through one real two-layer view on the live map; the steps and their
// sources are in content/tour.ts.

export function GuidedTour() {
  const open = useStore((s) => s.guide === "tour");
  return <AnimatePresence>{open && <Tour key="tour" />}</AnimatePresence>;
}

function Tour() {
  const [index, setIndex] = useState(0);
  const setGuide = useStore((s) => s.setGuide);
  const map = useContext(MapContext)?.map ?? null;
  const reduceMotion = useReducedMotion();
  // Started from the primer, the tour waits for its landing to give way, so the ring lands on panels at rest.
  const [ready, setReady] = useState(() => useStore.getState().guideFrom !== "primer");
  const cardRef = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;
  const close = () => setGuide(null);

  // Each step shows its own layers over the national view, so what the card says is what the map shows.
  useEffect(() => {
    const s = useStore.getState();
    const current = selectView(s);
    const view = stepView(step, current);
    if (encodeView(view) !== encodeView(current)) s.setView(view);
    // A step must show the panel it talks about, even if the viewer folded it into a chip.
    if (step.target) usePanels.getState().setMinimized(step.target, false);
    if (!map) return;
    const nation = cameraForBBox(map, NATION_BBOX);
    const center = map.getCenter().wrap();
    if (nation && cameraOff(nation, { lon: center.lng, lat: center.lat, zoom: map.getZoom() })) {
      flyToCamera(map, nation);
    }
  }, [step, map]);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(
      () => setReady(true),
      reduceMotion ? LANDING_EXIT_MS.reduced : LANDING_EXIT_MS.full,
    );
    return () => window.clearTimeout(timer);
  }, [ready, reduceMotion]);

  useEffect(() => {
    if (ready) cardRef.current?.focus({ preventScroll: true });
  }, [ready]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGuide(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setGuide]);

  const transition = { duration: reduceMotion ? 0 : 0.28, ease: [0.2, 0.8, 0.2, 1] as const };

  if (!ready) return null;
  return (
    <>
      <Spotlight target={step.target && PANEL_SLOTS[step.target]} />
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal={false}
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        data-testid="guided-tour"
        data-step={index}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={transition}
        className="glass glass-strong fixed bottom-4 left-[332px] z-30 flex w-[420px] flex-col gap-3 p-4 outline-none"
      >
        <header className="flex items-center gap-2">
          <span className="text-badge font-medium tracking-[0.06em] text-text-3 uppercase tabular">
            Step {index + 1} of {TOUR_STEPS.length}
          </span>
          <span aria-hidden className="text-text-3">
            ·
          </span>
          <span className="min-w-0 flex-1 truncate text-badge font-medium tracking-[0.06em] text-accent-brand uppercase">
            {step.where}
          </span>
          <button
            type="button"
            aria-label="End the tour"
            onClick={close}
            className="-my-1 -mr-1 grid size-7 place-items-center rounded-chip text-text-3 transition-colors duration-(--dur-hover) hover:bg-white/[0.06] hover:text-text-1"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-col gap-2">
          <h2 id="tour-title" className="text-title font-semibold tracking-tight text-text-1">
            {step.title}
          </h2>
          <p id="tour-body" className="text-body leading-[1.5] text-text-2">
            {step.body}
          </p>
          <p className="flex gap-2 rounded-card border border-accent-brand/20 bg-accent-dim/50 px-3 py-2 text-body leading-[1.5] text-text-1">
            <Eye aria-hidden className="mt-[3px] size-3.5 shrink-0 text-accent-brand" />
            <span>{step.notice}</span>
          </p>
        </div>

        <footer className="flex items-center justify-between gap-2">
          <ol className="flex items-center gap-1.5" aria-label="Tour progress">
            {TOUR_STEPS.map((s, i) => (
              <li
                key={s.title}
                aria-current={i === index ? "step" : undefined}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-(--dur-toggle) ease-ui",
                  i === index ? "w-4 bg-accent-brand" : i < index ? "w-1.5 bg-text-2" : "w-1.5 bg-white/15",
                )}
              >
                <span className="sr-only">{s.title}</span>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button type="button" className={cn(SECONDARY_BUTTON, "h-9 px-3")} onClick={() => setIndex(index - 1)}>
                <ArrowLeft aria-hidden />
                Back
              </button>
            )}
            {last ? (
              <button type="button" className={cn(PRIMARY_BUTTON, "h-9")} onClick={close}>
                Start exploring
              </button>
            ) : (
              <button type="button" className={cn(PRIMARY_BUTTON, "h-9")} onClick={() => setIndex(index + 1)}>
                Next
                <ArrowRight aria-hidden />
              </button>
            )}
          </div>
        </footer>
      </motion.div>
    </>
  );
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const RING_GAP = 4;

/** An accent ring around the panel a step talks about, following it as it resizes. */
function Spotlight({ target }: { target?: string }) {
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    const el = target ? document.querySelector<HTMLElement>(`[data-testid="${target}"]`) : null;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // A minimized panel is display: none until the step restores it.
      setBox(r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [target]);

  if (!target || !box) return null;
  return (
    <div
      aria-hidden
      data-testid="tour-spotlight"
      className="pointer-events-none fixed z-30 rounded-[20px] shadow-[0_0_0_2px_var(--accent),0_0_28px_rgba(46,230,197,0.35)] transition-[top,left,width,height] duration-(--dur-panel) ease-ui"
      style={{
        top: box.top - RING_GAP,
        left: box.left - RING_GAP,
        width: box.width + 2 * RING_GAP,
        height: box.height + 2 * RING_GAP,
      }}
    />
  );
}
