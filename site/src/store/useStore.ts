// App store (SPEC.md Appendix A). The store is the source of truth for view state; lib/urlCodec.ts encodes it.
// Shape and action names are frozen by T0. Actions marked "owner:" are no-ops until that task implements them.

import { create } from "zustand";
import type { Guide } from "@/lib/guide";
import type { Camera, Display, Intent, PlaceRef, ViewState } from "@/lib/types";
import { createCompareActions } from "./compareSlice";

/**
 * Default camera, standing for the initial national view: when the store holds exactly this camera at load, MapCanvas
 * fits INITIAL_BOUNDS (map/levels.ts) with the standard padding instead, so the view adapts to the window size.
 */
export const DEFAULT_CAMERA: Camera = { lon: -96.5, lat: 38.5, zoom: 3.6 };

export const DEFAULT_VIEW: ViewState = {
  camera: DEFAULT_CAMERA,
  layers: ["composite"],
  display: "score",
  selected: undefined,
  compare: { armed: false, pins: [] },
  profile: undefined,
  favorites: [],
  favoritesPanel: false,
  showOnlyStarred: false,
  about: false,
  preset: undefined,
};

export interface StoreActions {
  setLayerA: (id: string) => void;
  setLayerB: (id: string) => void;
  clearLayerB: () => void;
  setDisplay: (display: Display) => void;
  setCamera: (camera: Camera) => void;
  select: (place: PlaceRef) => void;
  clearSelection: () => void;
  armCompare: (armed: boolean) => void;
  pinCompare: (place: PlaceRef) => void;
  unpinCompare: (place: PlaceRef) => void;
  openProfile: (ncessch: string) => void;
  closeProfile: () => void;
  toggleFavorite: (ncessch: string) => void;
  setFavoritesPanel: (open: boolean) => void;
  setShowOnlyStarred: (on: boolean) => void;
  setAbout: (open: boolean) => void;
  applyPreset: (presetId: string) => void;
  applyIntent: (intent: Intent) => void;
  /** Hovered unit id (state, county, or school) for scatter and map linking; null clears. */
  hoverUnit: (id: string | null) => void;
  /** Opens the primer or the guided tour, or closes the guide with null (SPEC.md 3.15). */
  setGuide: (guide: Guide) => void;
  /** Replaces the whole view state, e.g. from the URL on load. */
  setView: (view: ViewState) => void;
}

export interface StoreState extends ViewState {
  hovered: string | null;
  /** The open part of the map guide; not URL state. */
  guide: Guide;
  /** The part of the guide open before the current one, so the tour can wait for the landing to give way. */
  guideFrom: Guide;
}

export type Store = StoreState & StoreActions;

export const useStore = create<Store>()((set, get) => ({
  ...DEFAULT_VIEW,
  hovered: null,
  guide: null,
  guideFrom: null,

  // owner: U1 (layer selection model, SPEC.md 3.6)
  setLayerA: () => {},
  setLayerB: () => {},
  clearLayerB: () => {},
  setDisplay: (display) => set({ display }),

  setCamera: (camera) => set({ camera }),

  // owner: M1 (click-to-drill, breadcrumb)
  select: (place) => set({ selected: place }),
  clearSelection: () => set({ selected: undefined }),

  // owner: U4 (compare mode, SPEC.md 3.9)
  ...createCompareActions(set, get),

  // U5 (profile drawer, SPEC.md 3.5): the drawer is open exactly while `profile` holds a school id.
  openProfile: (profile) => set({ profile }),
  closeProfile: () => set({ profile: undefined }),

  // owner: U7 (favorites, SPEC.md 3.12)
  toggleFavorite: () => {},
  setFavoritesPanel: () => {},
  setShowOnlyStarred: () => {},

  // owner: U9 (About dialog)
  setAbout: (about) => set({ about }),

  // owner: U8 (presets)
  applyPreset: () => {},

  // owner: A1 (command bar)
  applyIntent: () => {},

  hoverUnit: (hovered) => set({ hovered }),

  setGuide: (guide) => set((s) => ({ guide, guideFrom: s.guide })),

  setView: (view) => set({ ...view }),
}));

/** Picks the ViewState fields out of the store, for URL encoding. */
export function selectView(s: StoreState): ViewState {
  return {
    camera: s.camera,
    layers: s.layers,
    display: s.display,
    selected: s.selected,
    compare: s.compare,
    profile: s.profile,
    favorites: s.favorites,
    favoritesPanel: s.favoritesPanel,
    showOnlyStarred: s.showOnlyStarred,
    about: s.about,
    preset: s.preset,
  };
}
