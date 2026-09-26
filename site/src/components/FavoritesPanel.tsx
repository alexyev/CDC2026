import { Star, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SchoolsFile } from "@/lib/dataTypes";
import {
  FAVORITE_FLY_ZOOM,
  favoriteSchools,
  formatValue,
  layerDef,
  MAX_COMPARE_SCHOOLS,
  ordinal,
  type FavoriteSchool,
} from "@/lib/favorites";
import { load } from "@/lib/loaders";
import { cn } from "@/lib/utils";
import { LOCAL_LEVEL_ZOOM, MAP_PADDING } from "@/map/levels";
import { useMap } from "@/map/useMap";
import { useStore } from "@/store/useStore";
import { FavoritesCompare } from "./FavoritesCompare";

const WIDTH = { list: 560, compare: 720 } as const;
type Tab = keyof typeof WIDTH;

const TAB =
  "rounded-md text-chip dark:data-[state=active]:border-border dark:data-[state=active]:bg-white/8 data-[state=active]:shadow-none";

const EASE_UI = [0.2, 0.8, 0.2, 1] as const;

/** Favorites drawer (SPEC.md 3.12): starred schools, `Compare starred`, and `Show only starred`. */
export function FavoritesPanel() {
  const open = useStore((s) => s.favoritesPanel);
  const reduceMotion = useReducedMotion();
  useFavoritesKeys();

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="favorites"
          data-testid="favorites-panel"
          aria-label="Favorites"
          className="glass glass-strong absolute top-[72px] right-4 bottom-4 z-40 flex flex-col overflow-hidden"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE_UI }}
        >
          <FavoritesDrawer />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function FavoritesDrawer() {
  const favorites = useStore((s) => s.favorites);
  const setFavoritesPanel = useStore((s) => s.setFavoritesPanel);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("list");
  const { schools, error, retry } = useSchoolsFile();
  const focusSchool = useFocusSchool();

  const rows = useMemo(() => (schools ? favoriteSchools(schools, favorites) : null), [schools, favorites]);
  const compared = useMemo(() => rows?.slice(0, MAX_COMPARE_SCHOOLS) ?? [], [rows]);

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col"
      initial={false}
      animate={{ width: WIDTH[tab] }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE_UI }}
    >
      <header className="flex items-start gap-3 px-4 pt-4">
        <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-chip bg-mark-a/12">
          <Star className="size-4 text-mark-a" fill="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-title leading-tight font-semibold text-text-1">Favorites</h2>
          <p className="mt-0.5 text-caption text-text-3">Starred schools stay on the map at every zoom.</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close favorites"
          className="-mt-1 -mr-1 text-text-3 hover:text-text-1"
          onClick={() => setFavoritesPanel(false)}
        >
          <X />
        </Button>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-4 flex min-h-0 flex-1 flex-col gap-0">
        <div className="px-4">
          <TabsList className="h-9 w-full rounded-chip bg-white/4 p-[3px]">
            <TabsTrigger value="list" className={TAB}>
              Starred
              <span className="text-text-3 tabular">{favorites.length}</span>
            </TabsTrigger>
            <TabsTrigger value="compare" className={TAB} disabled={favorites.length === 0}>
              Compare starred
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="list" className="mt-3 min-h-0 overflow-y-auto px-2 pb-2">
          {favorites.length === 0 ? (
            <EmptyState />
          ) : error ? (
            <LoadError onRetry={retry} />
          ) : rows ? (
            <ul className="flex flex-col gap-0.5" aria-label="Starred schools">
              {rows.map((s) => (
                <FavoriteRow key={s.id} school={s} onFocus={focusSchool} onRemove={toggleFavorite} />
              ))}
            </ul>
          ) : (
            <ListSkeleton count={favorites.length} />
          )}
        </TabsContent>

        <TabsContent value="compare" className="mt-1 min-h-0 overflow-y-auto px-4 pb-3">
          {error ? (
            <LoadError onRetry={retry} />
          ) : rows ? (
            <>
              <CompareHint total={favorites.length} />
              <FavoritesCompare schools={compared} onFocusSchool={focusSchool} onRemove={toggleFavorite} />
            </>
          ) : (
            <ListSkeleton count={6} />
          )}
        </TabsContent>
      </Tabs>

      <ShowOnlyStarred disabled={favorites.length === 0} />
    </motion.div>
  );
}

function FavoriteRow({
  school,
  onFocus,
  onRemove,
}: {
  school: FavoriteSchool;
  onFocus: (s: FavoriteSchool) => void;
  onRemove: (id: string) => void;
}) {
  const hoverUnit = useStore((s) => s.hoverUnit);
  const composite = layerDef("composite");
  const value = school.values.composite ?? null;
  const pct = school.values.composite_pct ?? null;
  const name = school.found ? school.name : "Unknown school";

  return (
    <li
      className="group flex items-center gap-1 rounded-card pr-2 transition-colors duration-(--dur-hover) hover:bg-white/4"
      onMouseEnter={() => school.found && hoverUnit(school.id)}
      onMouseLeave={() => school.found && hoverUnit(null)}
    >
      <button
        type="button"
        disabled={!school.found}
        onClick={() => onFocus(school)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-card px-2 py-2.5 text-left disabled:cursor-default"
      >
        <Star aria-hidden className="size-3.5 shrink-0 text-mark-a" fill="currentColor" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-chip text-text-1">{name}</span>
          <span className="mt-0.5 block truncate text-caption text-text-3">
            {school.found ? [`${school.city}, ${school.st}`, school.district].filter(Boolean).join(" · ") : school.id}
          </span>
        </span>
        {school.found && (
          <span className="flex shrink-0 flex-col items-end">
            <span className="text-title leading-tight font-semibold text-text-1 tabular">
              {formatValue(composite, value)}
            </span>
            <span className="text-badge text-text-3 tabular">Composite{pct !== null && ` · ${ordinal(pct)} pct`}</span>
          </span>
        )}
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${name} from favorites`}
        className="text-text-3 opacity-60 group-hover:opacity-100 hover:text-text-1 focus-visible:opacity-100"
        onClick={() => onRemove(school.id)}
      >
        <X />
      </Button>
    </li>
  );
}

function CompareHint({ total }: { total: number }) {
  if (total === 1) {
    return <p className="mb-2 text-caption text-text-3">Star another school to compare them side by side.</p>;
  }
  if (total <= MAX_COMPARE_SCHOOLS) return null;
  return (
    <p className="mb-2 rounded-chip bg-mark-a/8 px-3 py-2 text-caption text-text-2">
      Showing the first {MAX_COMPARE_SCHOOLS} of {total} starred schools. Remove some to compare the others.
    </p>
  );
}

function ShowOnlyStarred({ disabled }: { disabled: boolean }) {
  const on = useStore((s) => s.showOnlyStarred);
  const setShowOnlyStarred = useStore((s) => s.setShowOnlyStarred);
  return (
    <footer className="flex items-center gap-3 border-t border-border px-4 py-3">
      <Switch
        id="favorites-only-starred"
        checked={on}
        disabled={disabled}
        onCheckedChange={setShowOnlyStarred}
        aria-describedby="favorites-only-starred-note"
      />
      <label
        htmlFor="favorites-only-starred"
        className={cn("text-chip text-text-1", disabled ? "cursor-default opacity-50" : "cursor-pointer")}
      >
        Show only starred
      </label>
      <span id="favorites-only-starred-note" className="ml-auto text-caption text-text-3">
        Other pins dim to 25%
      </span>
    </footer>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-8 pt-10 pb-8 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-full border border-border-strong">
        <Star className="size-5 text-text-3" />
      </span>
      <p className="mt-4 text-chip font-medium text-text-1">No starred schools yet</p>
      <p className="mt-1.5 max-w-80 text-body text-text-3">
        Star a school from its pin, its profile, or search. Starred schools stay visible at every zoom and can be
        compared side by side.
      </p>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border px-3 py-3">
      <p className="text-body text-text-2">School data didn't load.</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ListSkeleton({ count }: { count: number }) {
  return (
    <div aria-busy aria-label="Loading schools" className="flex flex-col gap-2 px-2 py-1">
      {Array.from({ length: Math.min(count, 6) }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-card bg-white/4" />
      ))}
    </div>
  );
}

/** Loads schools/all.json (cached by the loader) for the panel. */
function useSchoolsFile() {
  const [schools, setSchools] = useState<SchoolsFile | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    load("schools").then(
      (data) => live && setSchools(data),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(false);
    setAttempt((n) => n + 1);
  }, []);

  return { schools, error, retry };
}

/**
 * Centers the map on a school: keeps the zoom at the local level, otherwise flies to z12 (SPEC.md 3.12).
 * Before the map exists the store camera moves instead.
 */
function useFocusSchool() {
  const { map } = useMap();
  const setCamera = useStore((s) => s.setCamera);
  const reduceMotion = useReducedMotion();

  return useCallback(
    (school: FavoriteSchool) => {
      if (!school.found) return;
      const current = map?.getZoom() ?? useStore.getState().camera.zoom;
      const zoom = current >= LOCAL_LEVEL_ZOOM ? current : FAVORITE_FLY_ZOOM;
      if (!map) {
        setCamera({ lon: school.lon, lat: school.lat, zoom });
        return;
      }
      const target = { center: [school.lon, school.lat] as [number, number], zoom, padding: MAP_PADDING };
      if (reduceMotion) map.jumpTo(target);
      else map.flyTo({ ...target, duration: 1200, curve: 1.42, speed: 1.2 });
    },
    [map, setCamera, reduceMotion],
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * `f` toggles the panel (SPEC.md 3.14). Escape closes it before anything else handles Escape (SPEC.md 3.4), so it
 * listens in the capture phase; it leaves Escape alone while the About dialog is open or an input has focus.
 */
function useFavoritesKeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const { favoritesPanel, about, setFavoritesPanel } = useStore.getState();
      if (e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        setFavoritesPanel(!favoritesPanel);
      } else if (e.key === "Escape" && favoritesPanel && !about) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setFavoritesPanel(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
