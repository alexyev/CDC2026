// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Drawers and dialogs that are not part of the first paint (SPEC.md 10.1 step 2): each loads the first time it opens,
// or once the map has painted and the browser is idle, whichever comes first, so opening one never waits on the
// network. Once loaded it stays mounted, so its exit animation plays when it closes.

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { afterFirstPaint } from "@/lib/firstPaint";
import { useStore } from "@/store/useStore";
import { useAboutKey, useFavoritesKeys } from "./appShortcuts";

const importers = {
  profile: () => import("./ProfileDrawer"),
  favorites: () => import("./FavoritesPanel"),
  about: () => import("./AboutDialog"),
  tour: () => import("./GuidedTour"),
};

const ProfileDrawer = lazy(() => importers.profile().then((m) => ({ default: m.ProfileDrawer })));
const FavoritesPanel = lazy(() => importers.favorites().then((m) => ({ default: m.FavoritesPanel })));
const AboutDialog = lazy(() => importers.about().then((m) => ({ default: m.AboutDialog })));
const GuidedTour = lazy(() => importers.tour().then((m) => ({ default: m.GuidedTour })));

/** Renders `children` from the first time `when` is true on. */
function Deferred({ when, children }: { when: boolean; children: ReactNode }) {
  const [needed, setNeeded] = useState(when);
  if (when && !needed) setNeeded(true);
  return needed ? <Suspense fallback={null}>{children}</Suspense> : null;
}

export function LazyPanels() {
  const profile = useStore((s) => s.profile !== undefined);
  const favorites = useStore((s) => s.favoritesPanel);
  const about = useStore((s) => s.about);
  const tour = useStore((s) => s.guide === "tour");
  useFavoritesKeys();
  useAboutKey();

  useEffect(
    () =>
      afterFirstPaint(() => {
        for (const load of Object.values(importers)) void load().catch(() => {});
      }, 3000),
    [],
  );

  return (
    <>
      <Deferred when={profile}>
        <ProfileDrawer />
      </Deferred>
      <Deferred when={favorites}>
        <FavoritesPanel />
      </Deferred>
      <Deferred when={about}>
        <AboutDialog />
      </Deferred>
      <Deferred when={tour}>
        <GuidedTour />
      </Deferred>
    </>
  );
}
