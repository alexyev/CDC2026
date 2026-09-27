// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The command bar shortcut as this platform writes it (SPEC.md 3.14). */
export const COMMAND_SHORTCUT = isMac ? "⌘K" : "Ctrl K";

/**
 * True while a modal dialog (the landing, About, the data table) is open. Map shortcuts must not act behind it, and
 * Escape belongs to the dialog, not to a drawer under it (SPEC.md 3.14).
 */
export function modalDialogOpen(doc: Document = document): boolean {
  return doc.querySelector('[role="dialog"][aria-modal="true"]:not([data-state="closed"])') !== null;
}
