// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The command bar shortcut as this platform writes it (SPEC.md 3.14). */
export const COMMAND_SHORTCUT = isMac ? "⌘K" : "Ctrl K";
