// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { Star } from "lucide-react";
import type { MouseEvent } from "react";
// Installs the favorites store actions this button calls.
import "@/lib/favorites";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";

interface StarButtonProps {
  /** NCESSCH of the school. */
  id: string;
  /** School name for the accessible label. */
  name?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Star toggle for a school (SPEC.md 3.12). Shared by pin tooltips, the profile drawer header, search results, and the
 * favorites panel. The click never bubbles, so it can sit inside a clickable row or tooltip.
 */
export function StarButton({ id, name, size = "md", className }: StarButtonProps) {
  const starred = useStore((s) => s.favorites.includes(id));
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const label = `${starred ? "Remove" : "Add"} ${name ?? "school"} ${starred ? "from" : "to"} favorites`;

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(id);
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={starred}
      title={starred ? "Starred" : "Star"}
      onClick={onClick}
      className={cn(
        "inline-grid shrink-0 cursor-pointer place-items-center rounded-chip transition-colors duration-(--dur-hover) ease-ui",
        size === "sm" ? "size-7" : "size-8",
        starred ? "text-mark-a hover:bg-mark-a/10" : "text-text-3 hover:bg-white/6 hover:text-text-1",
        className,
      )}
    >
      <Star className={size === "sm" ? "size-3.5" : "size-4"} fill={starred ? "currentColor" : "none"} />
    </button>
  );
}
