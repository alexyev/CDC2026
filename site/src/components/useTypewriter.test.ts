import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TYPEWRITER_MS,
  TYPEWRITER_START,
  typewriterDwell,
  typewriterNext,
  useTypewriter,
  type TypewriterState,
} from "./useTypewriter";

const EXAMPLES = ["ab", "xyz"];

function run(steps: number) {
  const seen: TypewriterState[] = [TYPEWRITER_START];
  for (let i = 0; i < steps; i++) seen.push(typewriterNext(seen.at(-1)!, EXAMPLES));
  return seen.map((s) => EXAMPLES[s.index]!.slice(0, s.length));
}

describe("typewriterNext", () => {
  it("types, deletes, then types the next example, and wraps around", () => {
    // "ab" types (2), flips to deleting, deletes (2), advances; "xyz" types (3), flips, deletes (3), wraps to "ab".
    expect(run(15)).toEqual(["", "a", "ab", "ab", "a", "", "", "x", "xy", "xyz", "xyz", "xy", "x", "", "", "a"]);
  });

  it("holds on a whole example and pauses on an empty one", () => {
    expect(typewriterDwell({ index: 0, length: 1, deleting: false }, EXAMPLES)).toBe(TYPEWRITER_MS.type);
    expect(typewriterDwell({ index: 0, length: 2, deleting: false }, EXAMPLES)).toBe(TYPEWRITER_MS.hold);
    expect(typewriterDwell({ index: 0, length: 1, deleting: true }, EXAMPLES)).toBe(TYPEWRITER_MS.delete);
    expect(typewriterDwell({ index: 0, length: 0, deleting: true }, EXAMPLES)).toBe(TYPEWRITER_MS.gap);
  });
});

describe("useTypewriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it("types an example out while active", () => {
    const { result } = renderHook(() => useTypewriter(EXAMPLES, true, false));
    expect(result.current).toEqual({ shown: "", example: "ab" });
    tick(TYPEWRITER_MS.type);
    expect(result.current.shown).toBe("a");
    tick(TYPEWRITER_MS.type);
    expect(result.current.shown).toBe("ab");
  });

  it("freezes while inactive and resumes where it stopped", () => {
    const { result, rerender } = renderHook(({ active }) => useTypewriter(EXAMPLES, active, false), {
      initialProps: { active: true },
    });
    tick(TYPEWRITER_MS.type);
    rerender({ active: false });
    tick(10_000);
    expect(result.current.shown).toBe("a");
    rerender({ active: true });
    tick(TYPEWRITER_MS.type);
    expect(result.current.shown).toBe("ab");
  });

  it("pauses while the tab is hidden", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { result } = renderHook(() => useTypewriter(EXAMPLES, true, false));
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    tick(10_000);
    expect(result.current.shown).toBe("");
    hidden.mockReturnValue(false);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    tick(TYPEWRITER_MS.type);
    expect(result.current.shown).toBe("a");
    hidden.mockRestore();
  });

  it("shows whole examples in turn under reduced motion", () => {
    const { result } = renderHook(() => useTypewriter(EXAMPLES, true, true));
    expect(result.current.shown).toBe("ab");
    tick(TYPEWRITER_MS.still);
    expect(result.current.shown).toBe("xyz");
  });
});
