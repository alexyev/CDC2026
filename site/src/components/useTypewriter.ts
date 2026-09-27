// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { useEffect, useState } from "react";

/** Pacing for the typewriter placeholder, in milliseconds. */
export const TYPEWRITER_MS = { type: 45, delete: 22, hold: 2_200, gap: 450, still: 4_000 } as const;

export interface TypewriterState {
  /** Which example is on screen. */
  index: number;
  /** How many of its characters are shown. */
  length: number;
  deleting: boolean;
}

export const TYPEWRITER_START: TypewriterState = { index: 0, length: 0, deleting: false };

/** One tick of the cycle: type an example a character at a time, delete it, then move to the next. */
export function typewriterNext(state: TypewriterState, examples: readonly string[]): TypewriterState {
  const full = examples[state.index]?.length ?? 0;
  if (!state.deleting)
    return state.length < full ? { ...state, length: state.length + 1 } : { ...state, deleting: true };
  if (state.length > 0) return { ...state, length: state.length - 1 };
  return { index: (state.index + 1) % examples.length, length: 0, deleting: false };
}

/** How long `state` stays on screen: a hold once an example is fully typed, a gap once it is fully deleted. */
export function typewriterDwell(state: TypewriterState, examples: readonly string[]): number {
  if (!state.deleting)
    return state.length >= (examples[state.index]?.length ?? 0) ? TYPEWRITER_MS.hold : TYPEWRITER_MS.type;
  return state.length > 0 ? TYPEWRITER_MS.delete : TYPEWRITER_MS.gap;
}

/**
 * The example Tab accepts into the command input, or null to let Tab move focus as usual. Only a plain Tab on an
 * empty input with an example showing is taken; it accepts the whole example, however much of it has been typed.
 */
export function tabAcceptance(
  key: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
  text: string,
  example: string,
): string | null {
  if (key.key !== "Tab" || key.shiftKey || key.altKey || key.ctrlKey || key.metaKey) return null;
  return text === "" && example !== "" ? example : null;
}

/**
 * The text of an animated placeholder (`shown`) and the whole example it is typing that cycles through `examples`. While `active` is false the timers stop and
 * the cycle holds where it is. With reduced motion each example shows whole and swaps every few seconds. Timers
 * also pause while the tab is hidden.
 */
export function useTypewriter(
  examples: readonly string[],
  active: boolean,
  reducedMotion: boolean,
): { shown: string; example: string } {
  const [state, setState] = useState(TYPEWRITER_START);
  const [visible, setVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!active || !visible || examples.length === 0) return;
    // Each state change re-runs this effect, which schedules the tick after it.
    const timer = window.setTimeout(
      () =>
        setState((s) =>
          reducedMotion
            ? { index: (s.index + 1) % examples.length, length: 0, deleting: false }
            : typewriterNext(s, examples),
        ),
      reducedMotion ? TYPEWRITER_MS.still : typewriterDwell(state, examples),
    );
    return () => window.clearTimeout(timer);
  }, [active, visible, reducedMotion, examples, state]);

  const example = examples[state.index] ?? "";
  return { shown: reducedMotion ? example : example.slice(0, state.length), example };
}
