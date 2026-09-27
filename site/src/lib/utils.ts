// Based on shadcn/ui (MIT) component source added by the shadcn CLI, adapted with Claude Code
// (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom type scale (globals.css), so a size like text-title does not drop a color like text-bg-0.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["badge", "caption", "body", "chip", "title", "headline", "score"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
