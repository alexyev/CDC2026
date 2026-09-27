// Based on shadcn/ui (MIT) component source added by the shadcn CLI, adapted with Claude Code
// (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
