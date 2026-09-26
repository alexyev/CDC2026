import { Minus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMinimized, usePanels, type PanelId } from "@/lib/panels";
import { cn } from "@/lib/utils";

// Minimize and restore for the floating panels (SPEC.md 3.2). A minimized panel stays mounted but hidden, so its
// shortcuts, typed text, and open sections survive, and a compact glass chip in the same corner brings it back.

type Corner = "top-left" | "top-right" | "top-center" | "bottom-right";

const ORIGIN: Record<Corner, string> = {
  "top-left": "origin-top-left",
  "top-right": "origin-top-right",
  "top-center": "origin-top",
  "bottom-right": "origin-bottom-right",
};

const ENTER = "animate-in fade-in-0 zoom-in-95 duration-(--dur-toggle) ease-(--ease-ui)";

export const TIP_CLASS =
  "rounded-card border border-border-strong bg-surface-strong px-2.5 py-1.5 text-caption text-text-1 shadow-panel [&>span]:hidden";

interface MinimizableProps {
  panel: PanelId;
  /** Where the panel sits; the chip takes the same corner and the animations grow from it. */
  corner: Corner;
  /** Accessible name of the restore chip, e.g. "Show layers". */
  restoreLabel: string;
  /** Chip contents: an icon and a short label, plus any live summary of the panel. */
  chip: ReactNode;
  /** Replaces the default chip shape, e.g. a square icon button that matches its neighbors. */
  chipClassName?: string;
  className?: string;
  children: ReactNode;
}

export function Minimizable({
  panel,
  corner,
  restoreLabel,
  chip,
  chipClassName,
  className,
  children,
}: MinimizableProps) {
  const minimized = useMinimized(panel);
  const setMinimized = usePanels((s) => s.setMinimized);
  const contentRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  // Animate only after a toggle, never on the first paint.
  const [toggled, setToggled] = useState(false);
  const shown = useRef(minimized);
  const keyboardRestore = useRef(false);

  useEffect(() => {
    if (shown.current === minimized) return;
    shown.current = minimized;
    setToggled(true);
    // Focus follows the control that vanished; a shortcut that already focused something keeps its focus. A focused
    // element that was just hidden still reads as active until the browser's next focus fixup, so it counts as lost.
    // A pointer restore leaves focus alone so the minimize button's tooltip does not pop up under the cursor.
    const active = document.activeElement;
    const lost = !active || active === document.body || (minimized && contentRef.current?.contains(active));
    if (!lost) return;
    if (minimized) chipRef.current?.focus();
    else if (keyboardRestore.current)
      contentRef.current?.querySelector<HTMLElement>(`[data-minimize="${panel}"]`)?.focus();
  }, [minimized, panel]);

  const right = corner === "top-right" || corner === "bottom-right";
  return (
    <div
      data-panel={panel}
      data-minimized={minimized || undefined}
      className={cn(
        "pointer-events-none flex flex-col [&>*]:pointer-events-auto",
        right ? "items-end" : corner === "top-left" && "items-start",
        corner === "top-center" && "items-center",
        className,
      )}
    >
      <div ref={contentRef} hidden={minimized} className={cn("w-full", toggled && cn(ENTER, ORIGIN[corner]))}>
        {children}
      </div>
      {minimized && (
        <button
          ref={chipRef}
          type="button"
          data-restore={panel}
          aria-label={restoreLabel}
          onClick={(e) => {
            // Enter and Space fire a click with no pointer detail.
            keyboardRestore.current = e.detail === 0;
            setMinimized(panel, false);
          }}
          className={cn(
            "glass flex h-12 max-w-full items-center gap-2 px-4 text-chip font-medium text-text-2 transition-colors duration-(--dur-hover) ease-ui hover:text-text-1 [&_svg]:size-4 [&_svg]:shrink-0",
            ENTER,
            ORIGIN[corner],
            chipClassName,
          )}
        >
          {chip}
        </button>
      )}
    </div>
  );
}

/** The small minus button in a panel's header that folds it into its chip. */
export function MinimizeButton({ panel, label, className }: { panel: PanelId; label: string; className?: string }) {
  const setMinimized = usePanels((s) => s.setMinimized);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-minimize={panel}
          aria-label={`Minimize ${label}`}
          onClick={() => setMinimized(panel, true)}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-chip text-text-3 transition-colors duration-(--dur-hover) ease-ui hover:bg-highlight hover:text-text-1",
            className,
          )}
        >
          <Minus aria-hidden className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className={TIP_CLASS}>
        Minimize
      </TooltipContent>
    </Tooltip>
  );
}
