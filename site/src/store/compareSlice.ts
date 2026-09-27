// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Compare mode actions (SPEC.md 3.9); useStore.ts spreads `createCompareActions(set, get)` into the store.

import { create } from "zustand";
import type { PlaceKind, PlaceRef, ViewState } from "@/lib/types";
import type { Store, StoreActions } from "./useStore";

type Compare = ViewState["compare"];
type CompareActions = Pick<StoreActions, "armCompare" | "pinCompare" | "unpinCompare">;

/** Only areas drawn as polygons can be compare pins. */
export type AreaKind = Extract<PlaceKind, "state" | "county">;

export const MAX_COMPARE_PINS = 2;

export function isAreaPlace(place: PlaceRef): place is PlaceRef & { kind: AreaKind } {
  return place.kind === "state" || place.kind === "county";
}

const samePlace = (a: PlaceRef, b: PlaceRef) => a.kind === b.kind && a.id === b.id;

/** Toast shown when pinning at a different level replaces the pins (SPEC.md 3.9). */
export function resetToastText(kind: AreaKind): string {
  return `Compare pins reset to ${kind} level`;
}

/** Turning compare on keeps pins; turning it off clears them. */
export function armCompareState(compare: Compare, armed: boolean): Compare {
  if (armed) return compare.armed ? compare : { armed: true, pins: compare.pins };
  return { armed: false, pins: [] };
}

export interface PinResult {
  compare: Compare;
  /** Set when the pin replaced pins of another level; the caller shows the toast. */
  resetTo?: AreaKind;
}

/**
 * Pins an area: the first pin is A, the second B, and a third replaces B so A stays the anchor.
 * Pinning an area that is already pinned unpins it. A pin of another level replaces all pins.
 * Pinning arms compare mode, so the command bar and presets can pin without arming first.
 */
export function pinCompareState(compare: Compare, place: PlaceRef): PinResult {
  if (!isAreaPlace(place)) return { compare };
  const pins = compare.pins.filter(isAreaPlace);
  if (pins.some((p) => samePlace(p, place))) return { compare: unpinCompareState(compare, place) };
  const pinned: PlaceRef = { kind: place.kind, id: place.id };
  if (pins.length > 0 && pins[0]!.kind !== place.kind) {
    return { compare: { armed: true, pins: [pinned] }, resetTo: place.kind };
  }
  const next = pins.length < MAX_COMPARE_PINS ? [...pins, pinned] : [pins[0]!, pinned];
  return { compare: { armed: true, pins: next } };
}

/** Removes a pin; when A is removed, B becomes A. Compare stays armed. */
export function unpinCompareState(compare: Compare, place: PlaceRef): Compare {
  const pins = compare.pins.filter((p) => !samePlace(p, place));
  return pins.length === compare.pins.length ? compare : { armed: compare.armed, pins };
}

interface CompareToastState {
  message: string | null;
  /** Increments on every toast so the same message shown twice restarts its timer. */
  seq: number;
  show: (message: string) => void;
  dismiss: () => void;
}

/** Transient toast state; lives outside the URL-backed store because it is not view state. */
export const useCompareToast = create<CompareToastState>()((set) => ({
  message: null,
  seq: 0,
  show: (message) => set((s) => ({ message, seq: s.seq + 1 })),
  dismiss: () => set({ message: null }),
}));

type Set = (partial: Partial<Store>) => void;
type Get = () => Store;

export function createCompareActions(set: Set, get: Get): CompareActions {
  return {
    armCompare: (armed) => {
      const compare = armCompareState(get().compare, armed);
      if (compare !== get().compare) set({ compare });
    },
    pinCompare: (place) => {
      const { compare, resetTo } = pinCompareState(get().compare, place);
      if (compare !== get().compare) set({ compare });
      if (resetTo) useCompareToast.getState().show(resetToastText(resetTo));
    },
    unpinCompare: (place) => {
      const compare = unpinCompareState(get().compare, place);
      if (compare !== get().compare) set({ compare });
    },
  };
}
