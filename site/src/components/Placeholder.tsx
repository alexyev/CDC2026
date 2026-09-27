// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { cn } from "@/lib/utils";

interface PlaceholderProps {
  /** Panel name shown in the slot. */
  name: string;
  /** Task id that replaces this placeholder (SPEC.md 17.3). */
  owner: string;
  /** SPEC.md section the panel implements. */
  spec: string;
  /** Stable test id, rendered as data-testid="slot-{slot}". */
  slot: string;
  className?: string;
  /** Render as a bare dashed box instead of a glass panel (for slots inside another panel). */
  inline?: boolean;
}

/** Labeled stand-in for a panel that a wave-1 task builds. Replace the whole component file, not this one. */
export function Placeholder({ name, owner, spec, slot, className, inline }: PlaceholderProps) {
  return (
    <div
      data-testid={`slot-${slot}`}
      className={cn(inline ? "rounded-chip" : "glass p-4", "flex min-h-0 min-w-0 flex-col", className)}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 overflow-hidden rounded-card border border-dashed border-border-strong px-3 py-2 text-center",
          inline && "rounded-chip",
        )}
      >
        <span className="text-chip font-medium text-text-1">{name}</span>
        <span className="text-caption text-text-3 tabular">
          {owner} · SPEC {spec}
        </span>
      </div>
    </div>
  );
}
