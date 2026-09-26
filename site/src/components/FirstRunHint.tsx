import { Layers, Mouse, MousePointerClick, X, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LANDING_EXIT_MS } from "@/lib/guide";
import { useStore } from "@/store/useStore";

/** localStorage flag set once the hint has been dismissed, so it shows only on the first visit. */
const SEEN_KEY = "schoolscape.firstRunSeen.v1";

/** Captured at import, before the URL sync rewrites the address bar. */
const INITIAL_SEARCH = typeof window === "undefined" ? "" : window.location.search;

const INTERACTIONS = ["pointerdown", "wheel", "keydown", "touchstart"] as const;

function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage blocked: the hint simply shows again next visit.
  }
}

function Step({ icon: Icon, lead, rest }: { icon: LucideIcon; lead: string; rest: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <Icon aria-hidden className="size-3.5 text-accent-brand" strokeWidth={2} />
      <span>
        <span className="font-medium text-text-1">{lead}</span> {rest}
      </span>
    </span>
  );
}

/**
 * First-run hint (SPEC.md 3.15): shown when the page opens with no URL parameters and no localStorage flag,
 * dismissed by the close button or by the first interaction anywhere (pointer, wheel, key, touch).
 * It waits while the map guide (primer or tour) is open, so it greets the viewer on the map afterwards.
 */
export function FirstRunHint({ initialSearch = INITIAL_SEARCH }: { initialSearch?: string }) {
  const [pending, setPending] = useState(() => [...new URLSearchParams(initialSearch).keys()].length === 0 && !seen());
  const guideOpen = useStore((s) => s.guide !== null);
  // After the primer's landing, the hint waits for it to give way to the map.
  const afterLanding = useStore((s) => s.guideFrom === "primer");
  const visible = pending && !guideOpen;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      markSeen();
      setPending(false);
    };
    for (const type of INTERACTIONS) window.addEventListener(type, dismiss, { capture: true, passive: true });
    return () => {
      for (const type of INTERACTIONS) window.removeEventListener(type, dismiss, { capture: true });
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          data-testid="first-run-hint"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: reduceMotion ? 0 : 0.28, ease: [0.2, 0.8, 0.2, 1] } }}
          transition={{
            duration: reduceMotion ? 0 : 0.28,
            ease: [0.2, 0.8, 0.2, 1],
            delay: afterLanding ? (reduceMotion ? LANDING_EXIT_MS.reduced : LANDING_EXIT_MS.full) / 1000 : 0,
          }}
          className="glass flex h-10 items-center gap-3 rounded-full pr-1 pl-4 text-body text-text-2"
        >
          <Step icon={Mouse} lead="Scroll" rest="to zoom." />{" "}
          <Step icon={MousePointerClick} lead="Click a state" rest="to dive in." />{" "}
          <Step icon={Layers} lead="Pick two layers" rest="to see how they relate." />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss hint"
            className="-ml-1 size-8 rounded-full text-text-3 hover:bg-white/8 hover:text-text-1"
          >
            <X />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
