// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// App-wide shortcuts for drawers that load on first use (SPEC.md 3.14). They live apart from the drawers so the keys
// work before a drawer's code has loaded; App mounts them once.

import { useEffect } from "react";
import { modalDialogOpen } from "@/lib/shortcut";
import { useStore } from "@/store/useStore";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * `f` toggles the favorites panel (SPEC.md 3.12). Escape closes it before anything else handles Escape (SPEC.md 3.4),
 * so it listens in the capture phase; both keys are left alone while a modal dialog is open or an input has focus.
 */
export function useFavoritesKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || modalDialogOpen()) return;
      const { favoritesPanel, setFavoritesPanel } = useStore.getState();
      if (e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        setFavoritesPanel(!favoritesPanel);
      } else if (e.key === "Escape" && favoritesPanel) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setFavoritesPanel(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}

/** `?` opens About and data (SPEC.md 15). */
export function useAboutKey(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.defaultPrevented || isTyping(event.target) || modalDialogOpen()) return;
      event.preventDefault();
      useStore.getState().setAbout(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
