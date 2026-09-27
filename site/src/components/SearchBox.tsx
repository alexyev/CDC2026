// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import {
  Building2,
  CornerDownLeft,
  Landmark,
  LoaderCircle,
  Map as MapIcon,
  MapPinned,
  School,
  Search,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { SearchHit, SearchIndex } from "@/lib/search";
import { afterFirstPaint, whenIdle } from "@/lib/firstPaint";
import { load } from "@/lib/loaders";
import { restorePanel } from "@/lib/panels";
import { modalDialogOpen } from "@/lib/shortcut";
import type { PlaceKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { drillZoom, flyToBBox } from "@/map/camera";
import { MAP_PADDING } from "@/map/levels";
import { useMap } from "@/map/useMap";
import { useStore } from "@/store/useStore";

/** Schools and small places land at this zoom (SPEC.md 3.11: a school centers the map at z12). */
const PLACE_MAX_ZOOM = 12;
/** The typo-tolerant tier runs once typing pauses this long; exact and prefix tiers run on every keystroke. */
const FUZZY_DELAY_MS = 180;
/** Fly-to duration and curve (SPEC.md 9.6). */
const FLY = { duration: 1200, curve: 1.42 } as const;

const KIND_ICON: Record<PlaceKind, LucideIcon> = {
  state: MapIcon,
  county: MapPinned,
  city: Building2,
  district: Landmark,
  school: School,
};

// Group headings; lib/search.ts has the same labels, but importing its values would pull fuse.js into the main bundle.
const KIND_LABEL: Record<PlaceKind, string> = {
  state: "States",
  county: "Counties",
  city: "Cities",
  district: "School districts",
  school: "Schools",
};

type IndexStatus = "idle" | "loading" | "ready" | "error";

interface IndexState {
  status: IndexStatus;
  index: SearchIndex | null;
  /** schools/all.json: loading, loaded into the index, or failed. */
  schools: "loading" | "ready" | "error";
}

/**
 * Loads fuse.js, the gazetteer, and the school names off the critical path (SPEC.md 10.1 step 4), or at once when
 * the user reaches for search first. The gazetteer is searchable before schools land.
 */
function useSearchIndex() {
  const [state, setState] = useState<IndexState>({ status: "idle", index: null, schools: "loading" });
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState((s) => ({ ...s, status: s.index ? "ready" : "loading", schools: "loading" }));
    const failed = (part: "status" | "schools") => {
      // A retry reloads whatever failed; dataCache evicts failed files.
      started.current = false;
      setState((s) => ({ ...s, [part]: "error" }));
    };
    const moduleP = import("@/lib/search");
    const gazetteerP = load("gazetteer");
    Promise.all([moduleP, gazetteerP]).then(
      ([mod, gazetteer]) =>
        // Schools may have landed first; never replace the fuller index with the places-only one.
        setState((s) => ({ ...s, status: "ready", index: s.index ?? new mod.SearchIndex(gazetteer) })),
      () => failed("status"),
    );
    Promise.all([moduleP, gazetteerP, load("schools")]).then(
      ([mod, gazetteer, schools]) => {
        const index = new mod.SearchIndex(gazetteer, schools);
        setState((s) => ({ ...s, status: "ready", index, schools: "ready" }));
        whenIdle(() => index.warm(), 2000);
      },
      () => failed("schools"),
    );
  }, []);

  useEffect(() => afterFirstPaint(start, 2000), [start]);

  return { ...state, start };
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function hitKey(hit: SearchHit): string {
  return `${hit.doc.kind}:${hit.doc.id}`;
}

/** Top-bar search over states, counties, cities, districts, and schools (SPEC.md 3.11). `/` focuses it. */
export function SearchBox() {
  const { map } = useMap();
  const select = useStore((s) => s.select);
  const openProfile = useStore((s) => s.openProfile);
  const setCamera = useStore((s) => s.setCamera);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);

  const search = useSearchIndex();
  const [query, setQuery] = useState("");
  const [fuzzyQuery, setFuzzyQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // `/` focuses search unless another input has focus, and restores it when minimized (SPEC.md 3.14).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target) || modalDialogOpen()) return;
      e.preventDefault();
      restorePanel("search");
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setFuzzyQuery(query), FUZZY_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  const trimmed = query.trim();
  const fuzzyDone = fuzzyQuery === query;
  const { index } = search;
  const hits = useMemo(
    () => (index && trimmed ? index.search(trimmed, { fuzzy: fuzzyDone }) : []),
    [index, trimmed, fuzzyDone],
  );

  const activeIndex = Math.max(
    0,
    hits.findIndex((h) => hitKey(h) === activeKey),
  );
  const active = hits[activeIndex];
  const showPanel = open && trimmed !== "";

  const close = useCallback(() => {
    setOpen(false);
    setActiveKey(null);
  }, []);

  const choose = useCallback(
    (hit: SearchHit) => {
      const { kind, id, bbox, lonLat } = hit.doc;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      select({ kind, id });
      if (kind === "school" && lonLat) {
        openProfile(id);
        if (map) map.flyTo({ center: lonLat, zoom: PLACE_MAX_ZOOM, padding: MAP_PADDING, ...FLY });
        else
          void import("@/lib/search").then(({ cameraForBBox }) =>
            setCamera(cameraForBBox([...lonLat, ...lonLat], viewport, MAP_PADDING, PLACE_MAX_ZOOM)),
          );
      } else if (bbox) {
        // States and counties fit their outline; cities and districts fit their schools, which can be one point.
        if (map) flyToBBox(map, bbox, { ...drillZoom(kind), maxZoom: PLACE_MAX_ZOOM });
        else
          void import("@/lib/search").then(({ cameraForBBox }) =>
            setCamera(cameraForBBox(bbox, viewport, MAP_PADDING, PLACE_MAX_ZOOM)),
          );
      }
      setQuery("");
      setFuzzyQuery("");
      close();
      inputRef.current?.blur();
    },
    [close, map, openProfile, select, setCamera],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!showPanel) {
          setOpen(true);
          return;
        }
        if (hits.length === 0) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActiveKey(hitKey(hits[(activeIndex + step + hits.length) % hits.length]));
        return;
      }
      case "Home":
      case "End":
        if (!showPanel || hits.length === 0) return;
        e.preventDefault();
        setActiveKey(hitKey(hits[e.key === "Home" ? 0 : hits.length - 1]));
        return;
      case "Enter":
        e.preventDefault();
        if (active && showPanel) choose(active);
        return;
      case "Escape":
        // Handled here so the app-level Escape (go up one level) does not also fire.
        e.preventDefault();
        e.stopPropagation();
        if (query) {
          setQuery("");
          close();
        } else {
          inputRef.current?.blur();
        }
        return;
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const groups = useMemo(() => {
    const out: { kind: PlaceKind; hits: { hit: SearchHit; i: number }[] }[] = [];
    hits.forEach((hit, i) => {
      const last = out[out.length - 1];
      if (last?.kind === hit.doc.kind) last.hits.push({ hit, i });
      else out.push({ kind: hit.doc.kind, hits: [{ hit, i }] });
    });
    return out;
  }, [hits]);

  const status = statusLine(search.status, search.schools, hits.length, fuzzyDone, trimmed);

  return (
    <PopoverPrimitive.Root open={showPanel} onOpenChange={(o) => !o && close()}>
      <PopoverPrimitive.Anchor asChild>
        <div ref={anchorRef} data-testid="slot-search" className="group relative h-10 w-[200px]">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3 transition-colors duration-200 group-focus-within:text-text-2"
          />
          <input
            ref={inputRef}
            type="text"
            name="place-search"
            role="combobox"
            aria-label="Search places and schools"
            aria-expanded={showPanel}
            aria-controls={showPanel ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={showPanel && active ? optionId(activeIndex) : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search places"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveKey(null);
              setOpen(true);
            }}
            onFocus={() => {
              search.start();
              setOpen(true);
            }}
            onBlur={close}
            onKeyDown={onKeyDown}
            className="h-full w-full rounded-card bg-transparent pr-9 pl-9 text-chip text-text-1 transition-colors duration-200 outline-none placeholder:text-text-3 hover:bg-white/[0.03] focus:bg-white/[0.05]"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("");
                setActiveKey(null);
                inputRef.current?.focus();
              }}
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-chip text-text-3 transition-colors duration-200 hover:bg-white/[0.06] hover:text-text-1"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 grid h-5 min-w-5 -translate-y-1/2 place-items-center rounded-[5px] border border-border-strong px-1 font-mono text-badge text-text-3 transition-opacity duration-200 group-focus-within:opacity-0"
            >
              /
            </kbd>
          )}
        </div>
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={13}
          alignOffset={-5}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          // Keep focus in the input when the pointer lands on the panel.
          onMouseDown={(e) => e.preventDefault()}
          className="glass glass-strong z-50 flex max-h-[calc(100vh-96px)] w-[400px] flex-col overflow-hidden p-0 text-text-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200 motion-reduce:animate-none"
        >
          <div
            id={listId}
            role="listbox"
            aria-label="Search results"
            className={cn("min-h-0 overflow-y-auto", hits.length > 0 && "p-2")}
          >
            {groups.map((group) => (
              <div key={group.kind} role="group" aria-labelledby={`${listId}-${group.kind}`} className="pb-1">
                <div
                  id={`${listId}-${group.kind}`}
                  role="presentation"
                  className="px-2 pt-2 pb-1.5 text-badge font-medium tracking-[0.06em] text-text-3 uppercase"
                >
                  {KIND_LABEL[group.kind]}
                </div>
                {group.hits.map(({ hit, i }) => (
                  <ResultRow
                    key={hitKey(hit)}
                    id={optionId(i)}
                    hit={hit}
                    active={i === activeIndex}
                    starred={hit.doc.kind === "school" && favorites.includes(hit.doc.id)}
                    onHover={() => setActiveKey(hitKey(hit))}
                    onChoose={() => choose(hit)}
                    onToggleStar={() => toggleFavorite(hit.doc.id)}
                  />
                ))}
              </div>
            ))}
          </div>
          {status && (
            <div
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-caption text-text-3",
                hits.length > 0 && "border-t border-border",
              )}
            >
              {status.busy && <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />}
              <span className="min-w-0 flex-1">{status.text}</span>
              {status.retry && (
                <button
                  type="button"
                  onClick={search.start}
                  className="rounded-chip px-2 py-0.5 font-medium text-accent-brand transition-colors duration-200 hover:bg-accent-dim"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {hits.length > 0 && (
            <div
              aria-hidden
              className="flex items-center gap-4 border-t border-border px-4 py-2 text-badge text-text-3 tabular"
            >
              <span>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span>
                <Kbd>↵</Kbd> go
              </span>
              <span>
                <Kbd>esc</Kbd> close
              </span>
            </div>
          )}
          <div className="sr-only" aria-live="polite">
            {showPanel && fuzzyDone ? `${hits.length} ${hits.length === 1 ? "result" : "results"}` : ""}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function statusLine(
  status: IndexStatus,
  schools: IndexState["schools"],
  count: number,
  fuzzyDone: boolean,
  query: string,
): { text: string; busy?: boolean; retry?: boolean } | null {
  if (status === "error") return { text: "Search data could not load.", retry: true };
  if (status !== "ready") return { text: "Loading places…", busy: true };
  if (count === 0 && !fuzzyDone) return { text: "Searching…", busy: true };
  if (schools === "loading") return { text: "Loading schools…", busy: true };
  if (schools === "error") return { text: "Schools could not load; showing places only.", retry: true };
  if (count === 0) return { text: `No places or schools match “${query}”.` };
  return null;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="mr-1 inline-grid h-4 min-w-4 place-items-center rounded-[4px] border border-border-strong px-1 font-sans text-[10px] leading-none text-text-2">
      {children}
    </kbd>
  );
}

interface ResultRowProps {
  id: string;
  hit: SearchHit;
  active: boolean;
  starred: boolean;
  onHover: () => void;
  onChoose: () => void;
  onToggleStar: () => void;
}

function ResultRow({ id, hit, active, starred, onHover, onChoose, onToggleStar }: ResultRowProps) {
  const { doc } = hit;
  const Icon = KIND_ICON[doc.kind];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  return (
    <div
      ref={ref}
      id={id}
      role="option"
      aria-selected={active}
      data-kind={doc.kind}
      onMouseMove={active ? undefined : onHover}
      onClick={onChoose}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-card px-2 py-1.5 transition-colors duration-100",
        active && "bg-white/[0.06]",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-chip border border-border bg-white/[0.03] transition-colors duration-100",
          active ? "text-accent-brand" : "text-text-3",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-chip leading-5 text-text-2">
          <Highlighted text={doc.name} ranges={hit.ranges} />
        </span>
        <span className="block truncate text-caption leading-4 text-text-3">{doc.sub}</span>
      </span>
      {doc.kind === "state" && (
        <span className="shrink-0 rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-badge text-text-3">
          {doc.st}
        </span>
      )}
      {doc.kind === "school" && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={starred ? `Unstar ${doc.name}` : `Star ${doc.name}`}
          aria-pressed={starred}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-chip transition-colors duration-200 hover:bg-white/[0.08]",
            starred ? "text-mark-a" : "text-text-3 hover:text-text-1",
          )}
        >
          <Star className={cn("size-4", starred && "fill-current")} />
        </button>
      )}
      <CornerDownLeft
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 text-text-3 transition-opacity duration-100",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return <span className="text-text-1">{text}</span>;
  const parts: { text: string; match: boolean }[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s > at) parts.push({ text: text.slice(at, s), match: false });
    parts.push({ text: text.slice(s, e), match: true });
    at = e;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p.match ? <span className="font-semibold text-text-1">{p.text}</span> : p.text}</Fragment>
      ))}
    </>
  );
}
