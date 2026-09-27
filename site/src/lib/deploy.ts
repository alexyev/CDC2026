// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Picking up a new deploy in a tab that is already open (SPEC.md 3.15). The app is one page that never reloads, so a
// tab opened before a deploy keeps running the code it loaded (a guided tour from before the panels opened step by step,
// say) until something reloads it. The page checks whether the deployed index.html names built files it never loaded
// when the window regains focus and whenever the landing opens, and reloads into the landing: the one place a reload
// loses nothing, since the landing holds no state and the view lives in the URL.

import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { LANDING_AFTER_RELOAD_KEY } from "./guide";

/** The build a reload was made for, so a CDN still serving two builds cannot make the page reload in a loop. */
const RELOADED_FOR_KEY = "schoolscape.reloadedFor.v1";

const ASSET = /\b(?:src|href)="(\/assets\/[^"?#]+)"/g;

/** The built files (under /assets/) an index.html names, in order. */
export function builtAssets(html: string): string[] {
  return [...html.matchAll(ASSET)].map((m) => m[1]!);
}

/**
 * Whether a freshly fetched index.html is a newer deploy than the running page: it names a built file the page never
 * loaded. The page loads more files than its index.html names (lazy chunks), so only the other direction counts. A
 * dev server's index.html names none, so it never counts as newer.
 */
export function isNewerBuild(html: string, loaded: ReadonlySet<string>): boolean {
  return builtAssets(html).some((asset) => !loaded.has(asset));
}

/** The built files the running page has loaded or preloaded: script and link URLs under /assets/ on this origin. */
function loadedAssets(): Set<string> {
  const out = new Set<string>();
  for (const el of document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[href]")) {
    const url = new URL(el instanceof HTMLScriptElement ? el.src : el.href, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/assets/")) out.add(url.pathname);
  }
  return out;
}

/** The deployed index.html's built files, joined, when they are a newer build than the running page's; else null. */
async function newerBuild(): Promise<string | null> {
  try {
    const response = await fetch("/", { cache: "no-store" });
    if (!response.ok) return null;
    const html = await response.text();
    return isNewerBuild(html, loadedAssets()) ? builtAssets(html).join(" ") : null;
  } catch {
    // Offline or blocked: keep running what is loaded.
    return null;
  }
}

/** Reloads the page onto the landing for `build`, unless a reload was already made for it or storage is blocked. */
function reloadIntoLanding(build: string): void {
  try {
    if (window.sessionStorage.getItem(RELOADED_FOR_KEY) === build) return;
    window.sessionStorage.setItem(RELOADED_FOR_KEY, build);
    window.sessionStorage.setItem(LANDING_AFTER_RELOAD_KEY, "1");
  } catch {
    // Without storage the landing could not come back after the reload, and nothing would stop a loop.
    return;
  }
  window.location.reload();
}

/** Watches for a newer deploy and reloads into it the next time the landing shows (mounted once by App). */
export function useNewDeploy(): void {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let build: string | null = null;
    let checking: Promise<void> | undefined;
    const check = () => {
      checking ??= newerBuild().then((found) => {
        build = found ?? build;
        checking = undefined;
      });
      return checking;
    };
    const reloadOnLanding = () => {
      if (build && useStore.getState().guide === "primer") reloadIntoLanding(build);
    };
    const onFocus = () => void check().then(reloadOnLanding);
    const onVisible = () => document.visibilityState === "visible" && onFocus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.guide === "primer" && prev.guide !== "primer") onFocus();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, []);
}
