const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The command bar shortcut as this platform writes it (SPEC.md 3.14). */
export const COMMAND_SHORTCUT = isMac ? "⌘K" : "Ctrl K";
