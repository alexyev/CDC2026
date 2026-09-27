// Breadcrumb (SPEC.md 3.4): `Nation › {State} › {County}` for the selected chain. Clicking a crumb selects it and
// flies there; Escape closes an open drawer first, else goes up one level (SPEC.md 3.14).

import { ChevronRight } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { load } from "@/lib/loaders";
import type { PlaceRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { flyToNation, flyToPlace } from "@/map/camera";
import { levelForZoom } from "@/map/levels";
import { useMap } from "@/map/useMap";
import { useStore } from "@/store/useStore";

interface Crumb {
  label: string;
  /** null is the nation. */
  place: PlaceRef | null;
}

const NATION: Crumb = { label: "Nation", place: null };

async function stateCrumb(stfp: string): Promise<Crumb> {
  const states = await load("states");
  const i = states.ids.indexOf(stfp);
  return { label: i >= 0 ? states.names[i]! : stfp, place: { kind: "state", id: stfp } };
}

/** Nation first, then each enclosing place down to the selection. */
async function resolveChain(sel: PlaceRef | undefined): Promise<Crumb[]> {
  if (!sel) return [NATION];
  switch (sel.kind) {
    case "state":
      return [NATION, await stateCrumb(sel.id)];
    case "county": {
      const counties = await load("counties");
      const i = counties.ids.indexOf(sel.id);
      const state = await stateCrumb(counties.st[i] ?? sel.id.slice(0, 2));
      return [NATION, state, { label: i >= 0 ? counties.names[i]! : sel.id, place: sel }];
    }
    case "school": {
      const schools = await load("schools");
      const i = schools.ids.indexOf(sel.id);
      if (i < 0) return [NATION];
      const state = await stateCrumb(schools.stfp[i]!);
      const county: Crumb = { label: schools.countyName[i]!, place: { kind: "county", id: schools.county[i]! } };
      return [NATION, state, county, { label: schools.name[i]!, place: sel }];
    }
    case "city":
    case "district": {
      const states = await load("states");
      const usps = sel.id.slice(0, sel.id.indexOf(":"));
      const si = states.usps.indexOf(usps);
      const label = sel.id.slice(sel.id.indexOf(":") + 1);
      return si >= 0
        ? [NATION, await stateCrumb(states.ids[si]!), { label, place: sel }]
        : [NATION, { label, place: sel }];
    }
  }
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true']");

export function Breadcrumb() {
  const { map } = useMap();
  const selected = useStore((s) => s.selected);
  const [chain, setChain] = useState<Crumb[]>([NATION]);
  const chainRef = useRef(chain);

  const selKey = selected ? `${selected.kind}:${selected.id}` : "";
  useEffect(() => {
    let cancelled = false;
    resolveChain(useStore.getState().selected)
      .then((c) => {
        if (cancelled) return;
        chainRef.current = c;
        setChain(c);
      })
      .catch((err: unknown) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [selKey]);

  const go = (crumb: Crumb) => {
    const store = useStore.getState();
    if (!crumb.place) {
      store.clearSelection();
      if (map) flyToNation(map);
      return;
    }
    store.select(crumb.place);
    if (map) void flyToPlace(map, crumb.place);
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target)) return;
      const store = useStore.getState();
      // A drawer or dialog closes first; preventDefault keeps its own Escape handler from acting twice.
      if (store.profile) {
        e.preventDefault();
        store.closeProfile();
        return;
      }
      if (store.favoritesPanel) {
        e.preventDefault();
        store.setFavoritesPanel(false);
        return;
      }
      // A dialog (About, the data table, the landing) handles its own Escape after this capture listener, which runs
      // first because it sits on the window.
      if (store.about || document.querySelector('[role="dialog"]:not([data-state="closed"])')) return;
      const current = chainRef.current;
      if (current.length > 1) {
        goRef.current(current[current.length - 2]!);
      } else if (map && levelForZoom(map.getZoom()) !== "nation") {
        flyToNation(map);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [map]);

  return (
    <div data-testid="slot-breadcrumb" className="glass flex h-12 max-w-[560px] min-w-0 items-center px-1.5">
      <ol className="flex min-w-0 items-center" aria-label="Breadcrumb">
        {chain.map((crumb, i) => {
          const last = i === chain.length - 1;
          return (
            <Fragment key={crumb.place ? `${crumb.place.kind}:${crumb.place.id}` : "nation"}>
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-text-3" />}
              <li className={cn("min-w-0", last ? "shrink" : "shrink-0")}>
                <button
                  type="button"
                  aria-current={last ? "location" : undefined}
                  title={crumb.label}
                  onClick={() => go(crumb)}
                  className={cn(
                    "block h-9 max-w-[240px] truncate rounded-chip px-2.5 text-chip transition-colors duration-(--dur-hover) ease-(--ease-ui)",
                    last ? "font-medium text-text-1" : "text-text-2 hover:bg-highlight hover:text-text-1",
                  )}
                >
                  {crumb.label}
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
