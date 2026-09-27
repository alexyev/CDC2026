// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { ArrowLeft, ArrowRight, Info, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type RefObject, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Preset } from "@/lib/dataTypes";
import { landingExitRemainingMs } from "@/lib/guide";
import { load } from "@/lib/loaders";
import { encodeCamera } from "@/lib/urlCodec";
import { openPreset } from "@/lib/urlSync";
import { cn } from "@/lib/utils";
import { flyToNation, setBottomInset } from "@/map/camera";
import { MapContext } from "@/map/mapContext";
import { DEFAULT_CAMERA, useStore } from "@/store/useStore";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./Primer";

// The story card (SPEC.md 3.8): while a story's view is live, its narration sits at the bottom of the map area with
// Back and Next, so the stories read as one walk through the data. Changing the layers or closing the card ends the
// story and leaves the view as it is. While the card is open, camera fits keep clear of it, so a story's place lands
// above the card rather than under it.

/** Left edge of the map area between the panels (SPEC.md 3.2, the map padding). */
const MAP_LEFT = 332;
const GAP = 12;
/** The card's distance from the bottom of the window. */
const BOTTOM = 16;

export function StoryCard() {
  const [stories, setStories] = useState<Preset[] | null>(null);
  const preset = useStore((s) => s.preset);
  const guideOpen = useStore((s) => s.guide !== null);

  useEffect(() => {
    let live = true;
    load("presets").then(
      (f) => live && setStories(f.presets),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const index = stories && preset ? stories.findIndex((p) => p.id === preset) : -1;
  const open = index >= 0 && !guideOpen;
  return <AnimatePresence>{open && <Card key="story" stories={stories!} index={index} />}</AnimatePresence>;
}

/** The right edge of the breadcrumb and quick-jump row, which grows as the viewer drills into a place. */
function usePlaceNavRight(): number {
  const [right, setRight] = useState(0);
  useLayoutEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Place"]');
    if (!nav) return;
    const measure = () => setRight(nav.getBoundingClientRect().right);
    measure();
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    ro?.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return right;
}

/** Keeps camera fits clear of the card while it is open (map/camera.ts). */
function useBottomInset(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBottomInset(BOTTOM + el.offsetHeight + GAP);
    measure();
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      setBottomInset(0);
    };
  }, [ref]);
}

function Card({ stories, index }: { stories: Preset[]; index: number }) {
  const story = stories[index]!;
  const last = index === stories.length - 1;
  const reduceMotion = useReducedMotion();
  const left = Math.max(MAP_LEFT, usePlaceNavRight() + GAP);
  const ref = useRef<HTMLElement>(null);
  const map = useContext(MapContext)?.map ?? null;
  useBottomInset(ref);

  // The national stories use the national view. It was framed before the card took its space, so frame it again
  // once, now that fits keep clear of the card; later stories fly with the card already in place.
  const framed = useRef(false);
  const national = (story.view.v ?? encodeCamera(DEFAULT_CAMERA)) === encodeCamera(DEFAULT_CAMERA);
  useEffect(() => {
    if (!map || framed.current) return;
    framed.current = true;
    if (national) flyToNation(map);
  }, [map, national]);

  const close = () => useStore.setState({ preset: undefined });
  // Opening from the primer's landing, the card enters once the landing has given way to the map (read at mount).
  const [delay] = useState(() => landingExitRemainingMs(reduceMotion ?? false) / 1000);
  const transition = { duration: reduceMotion ? 0 : 0.28, ease: [0.2, 0.8, 0.2, 1] as const, delay };

  return (
    <motion.section
      ref={ref}
      aria-labelledby="story-title"
      data-testid="story-card"
      data-story={story.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { ...transition, delay: 0 } }}
      transition={transition}
      style={{ left, bottom: BOTTOM }}
      className="glass glass-strong absolute z-20 flex w-[480px] flex-col gap-3 p-4"
    >
      <header className="flex items-center gap-2">
        <span className="text-badge font-medium tracking-[0.06em] text-text-3 uppercase tabular">
          Story {index + 1} of {stories.length}
        </span>
        <span aria-hidden className="text-text-3">
          ·
        </span>
        <span className="min-w-0 flex-1 truncate text-badge font-medium tracking-[0.06em] text-accent-brand uppercase">
          {story.chapter}
        </span>
        <button
          type="button"
          aria-label="Close the story"
          onClick={close}
          className="-my-1 -mr-1 grid size-7 place-items-center rounded-chip text-text-3 transition-colors duration-(--dur-hover) hover:bg-white/[0.06] hover:text-text-1"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-2" aria-live="polite">
        <h2 id="story-title" className="text-title font-semibold tracking-tight text-text-1">
          {story.label}
        </h2>
        <p data-testid="story-narration" className="text-body leading-[1.5] text-text-2">
          {story.narration}
        </p>
        <p className="flex gap-2 border-t border-border pt-2 text-caption leading-[1.45] text-text-3">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{story.caveat}</span>
        </p>
      </div>

      <footer className="flex items-center justify-between gap-2">
        <ol className="flex items-center gap-0.5" aria-label="Stories">
          {stories.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                aria-label={`Story ${i + 1}: ${s.label}`}
                aria-current={i === index ? "step" : undefined}
                onClick={() => openPreset(s)}
                className="group grid h-6 place-items-center px-[3px]"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all duration-(--dur-toggle) ease-ui",
                    i === index ? "w-4 bg-accent-brand" : "w-1.5 group-hover:bg-text-1",
                    i < index ? "bg-text-2" : i > index && "bg-white/15",
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              type="button"
              className={cn(SECONDARY_BUTTON, "h-9 px-3")}
              onClick={() => openPreset(stories[index - 1]!)}
            >
              <ArrowLeft aria-hidden />
              Back
            </button>
          )}
          {last ? (
            <button type="button" className={cn(PRIMARY_BUTTON, "h-9")} onClick={close}>
              Explore on your own
            </button>
          ) : (
            <button type="button" className={cn(PRIMARY_BUTTON, "h-9")} onClick={() => openPreset(stories[index + 1]!)}>
              Next
              <ArrowRight aria-hidden />
            </button>
          )}
        </div>
      </footer>
    </motion.section>
  );
}
