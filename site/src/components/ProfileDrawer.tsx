// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { ArrowUpRight, Crosshair, Star, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SchoolsFile } from "@/lib/dataTypes";
import { load } from "@/lib/loaders";
import type { Display, LayerDef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LOCAL_LEVEL_ZOOM, MAP_PADDING } from "@/map/levels";
import { useMap } from "@/map/useMap";
import { useStore } from "@/store/useStore";
import {
  buildProfile,
  COUNTY_BADGE_TIP,
  CT_NOTE,
  formatMean,
  formatValue,
  layerMax,
  ncesUrl,
  ordinal,
  tooltipLines,
  type Benchmarks,
  type ProfileRow,
  type ProfileSection,
  type ProfileSources,
  type RowBadge,
  type SchoolProfile,
} from "./profileData";

/** Zoom a school is centered at when the map is above the local level (SPEC.md 3.11, 3.12). */
const SCHOOL_ZOOM = 12;
const EASE_UI = [0.2, 0.8, 0.2, 1] as const;

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; sources: ProfileSources };

/** Loads the files a profile needs; all are cached by dataCache, so reopening never refetches. */
function useProfileSources(): { state: LoadState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; state: LoadState }>({
    attempt: -1,
    state: { status: "loading" },
  });

  useEffect(() => {
    let live = true;
    Promise.all([load("schools"), load("counties"), load("states"), load("national")]).then(
      ([schools, counties, states, national]) => {
        if (live) setResult({ attempt, state: { status: "ready", sources: { schools, counties, states, national } } });
      },
      () => {
        if (live) setResult({ attempt, state: { status: "error" } });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const state: LoadState = result.attempt === attempt ? result.state : { status: "loading" };
  return { state, retry: () => setAttempt((a) => a + 1) };
}

/**
 * The school profile drawer (SPEC.md 3.2, 3.5, 7, U5): a 420 px glass drawer that slides in from the right over the
 * insight panel while the URL has s=<NCESSCH>, with every score and indicator compared to the school's county,
 * state, and nation.
 */
export function ProfileDrawer() {
  const profile = useStore((s) => s.profile);
  const closeProfile = useStore((s) => s.closeProfile);
  const reduceMotion = useReducedMotion();

  // Escape closes the drawer before anything else handles it (SPEC.md 3.4), unless a text field has focus.
  useEffect(() => {
    if (!profile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeProfile();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [profile, closeProfile]);

  return (
    <AnimatePresence>
      {profile && (
        <motion.aside
          key="profile-drawer"
          data-testid="profile-drawer"
          aria-label="School profile"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE_UI }}
          className="glass glass-strong absolute top-[72px] right-4 bottom-4 z-30 flex w-[420px] flex-col overflow-hidden"
        >
          <DrawerBody id={profile} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({ id }: { id: string }) {
  const { state, retry } = useProfileSources();
  const profile = useMemo(() => (state.status === "ready" ? buildProfile(state.sources, id) : null), [state, id]);

  if (state.status === "loading") return <DrawerSkeleton />;
  if (state.status === "error") {
    return (
      <DrawerMessage title="Couldn't load school data">
        <button
          type="button"
          onClick={retry}
          className="mt-3 rounded-chip border border-border-strong px-3 py-1.5 text-chip text-text-1 transition-colors duration-(--dur-hover) hover:bg-white/6"
        >
          Retry
        </button>
      </DrawerMessage>
    );
  }
  if (!profile) {
    return (
      <DrawerMessage title="School not found">
        <p className="mt-1 text-body text-text-2">
          No high school with NCES id <span className="font-mono text-text-1">{id}</span> is in the ODIS data.
        </p>
      </DrawerMessage>
    );
  }
  return <ProfileCard profile={profile} />;
}

function ProfileCard({ profile }: { profile: SchoolProfile }) {
  const display = useStore((s) => s.display);
  return (
    <>
      <ProfileHeader profile={profile} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-5 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]">
        {profile.ctFilled && <ConnecticutNote />}
        <CompositeHero row={profile.composite} display={display} />
        <TickLegend />
        {profile.domains.map((section) => (
          <DomainGroup key={section.id} section={section} display={display} />
        ))}
        <ContextGroup section={profile.context} />
      </div>
    </>
  );
}

function ProfileHeader({ profile }: { profile: SchoolProfile }) {
  const starred = useStore((s) => s.favorites.includes(profile.id));
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const closeProfile = useStore((s) => s.closeProfile);
  const place = [profile.city && `${profile.city}, ${profile.st}`, profile.countyName].filter(Boolean).join(" · ");

  return (
    <header className="border-b border-border px-4 pt-4 pb-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-badge font-medium tracking-[0.06em] text-text-3 uppercase">
            Public high school · {profile.stateName || profile.st}
          </p>
          <h2 className="mt-1 text-title leading-snug font-semibold text-balance text-text-1">{profile.name}</h2>
          {profile.district && (
            <p className="mt-0.5 truncate text-body text-text-2" title={profile.district}>
              {profile.district}
            </p>
          )}
          {place && <p className="truncate text-caption text-text-3">{place}</p>}
        </div>
        <div className="-mt-1 -mr-1 flex shrink-0 items-center">
          <IconButton
            label={starred ? "Remove from favorites" : "Add to favorites"}
            pressed={starred}
            onClick={() => toggleFavorite(profile.id)}
            className={starred ? "text-mark-a hover:text-mark-a" : undefined}
          >
            <Star className={cn("size-[18px]", starred && "fill-current")} />
          </IconButton>
          <IconButton label="Close profile" onClick={closeProfile}>
            <X className="size-[18px]" />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <CenterOnMapButton profile={profile} />
        <a
          href={ncesUrl(profile.id)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-border px-2.5 text-caption text-text-2 transition-colors duration-(--dur-hover) hover:border-border-strong hover:text-text-1"
        >
          NCES profile
          <ArrowUpRight className="size-3.5" />
        </a>
        <span className="ml-auto font-mono text-badge text-text-3 tabular" title="NCES school id">
          {profile.id}
        </span>
      </div>
    </header>
  );
}

function IconButton({
  label,
  pressed,
  onClick,
  className,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-chip text-text-2 transition-colors duration-(--dur-hover) hover:bg-white/6 hover:text-text-1",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Centers the map on the school: keeps the zoom at the local level, else flies to z12 (SPEC.md 3.12). */
function CenterOnMapButton({ profile }: { profile: SchoolProfile }) {
  const { map } = useMap();
  const reduceMotion = useReducedMotion();
  const onClick = () => {
    if (!map) return;
    const center: [number, number] = [profile.lon, profile.lat];
    const zoom = map.getZoom() >= LOCAL_LEVEL_ZOOM ? map.getZoom() : SCHOOL_ZOOM;
    if (reduceMotion) map.jumpTo({ center, zoom, padding: MAP_PADDING });
    else map.flyTo({ center, zoom, padding: MAP_PADDING, duration: 1200, curve: 1.42, speed: 1.2 });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!map}
      className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-border px-2.5 text-caption text-text-2 transition-colors duration-(--dur-hover) hover:border-border-strong hover:text-text-1 disabled:opacity-50"
    >
      <Crosshair className="size-3.5" />
      Center on map
    </button>
  );
}

function ConnecticutNote() {
  const setAbout = useStore((s) => s.setAbout);
  return (
    <p className="mb-3 rounded-card border border-border bg-white/3 px-3 py-2 text-caption text-text-2">
      {CT_NOTE}{" "}
      <button
        type="button"
        onClick={() => setAbout(true)}
        className="text-accent-strong underline-offset-2 hover:underline"
      >
        About the Connecticut fill
      </button>
    </p>
  );
}

function CompositeHero({ row, display }: { row: ProfileRow; display: Display }) {
  const showPct = display === "pct" && row.pct !== null;
  return (
    <section aria-label="Composite Score" className="rounded-card border border-border bg-white/3 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-caption text-text-2">{row.layer.label}</p>
          <p className="mt-1 flex items-baseline gap-1.5 leading-[1.1] tabular">
            {row.value === null ? (
              <span className="text-headline text-text-3">no data</span>
            ) : showPct ? (
              <>
                <span className="text-score font-semibold text-text-1">{ordinal(row.pct!)}</span>
                <span className="text-caption text-text-3">national percentile</span>
              </>
            ) : (
              <>
                <span className="text-score font-semibold text-text-1">{formatValue(row.layer, row.value)}</span>
                <span className="text-caption text-text-3">/ 100</span>
              </>
            )}
          </p>
        </div>
        {row.value !== null && row.pct !== null && (
          <span className="rounded-pill bg-white/6 px-2 py-0.5 text-caption text-text-2 tabular">
            {showPct ? `score ${formatValue(row.layer, row.value)}` : `${ordinal(row.pct)} pct`}
          </span>
        )}
      </div>
      <p className="mt-1 text-caption text-text-3">Higher means more community stress around the school.</p>
      <BenchTrack row={row} className="mt-3" />
      <BenchCaption layer={row.layer} bench={row.bench} />
    </section>
  );
}

function TickLegend() {
  return (
    <div aria-hidden className="mt-3 flex items-center gap-3 text-badge text-text-3">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-text-1" /> School
      </span>
      <span className="flex items-center gap-1.5">
        <TickGlyph kind="county" /> County
      </span>
      <span className="flex items-center gap-1.5">
        <TickGlyph kind="state" /> State
      </span>
      <span className="flex items-center gap-1.5">
        <TickGlyph kind="nation" /> National mean
      </span>
    </div>
  );
}

function TickGlyph({ kind }: { kind: keyof Benchmarks }) {
  return (
    <span className="relative inline-block h-4 w-2">
      <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
      <span className={cn("absolute left-1/2 -translate-x-1/2", TICK_CLASS[kind])} />
    </span>
  );
}

/** County ticks rise above the track, state ticks drop below it, and the national tick crosses it. */
const TICK_CLASS: Record<keyof Benchmarks, string> = {
  county: "top-0 h-[7px] w-[2px] rounded-full bg-white/90",
  state: "bottom-0 h-[7px] w-[2px] rounded-full bg-white/50",
  nation: "inset-y-0 w-px bg-white/35",
};

/** The stress ramp across the whole track; the fill bar reveals it up to the school's value. */
const RAMP_GRADIENT = "linear-gradient(to right, var(--u2), var(--u3) 40%, var(--u4) 70%, var(--u5))";

function BenchTrack({ row, className }: { row: ProfileRow; className?: string }) {
  const max = layerMax(row.layer);
  const frac = (v: number) => Math.min(1, Math.max(0, v / max));
  const at = (v: number) => `${frac(v) * 100}%`;
  const ticks = (Object.keys(TICK_CLASS) as (keyof Benchmarks)[]).filter((k) => row.bench[k] !== null);
  const fill = row.value === null ? 0 : frac(row.value);
  return (
    <div aria-hidden className={cn("relative h-4", className)}>
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/7" />
      {fill > 0 && (
        <div
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full"
          style={{ width: `${fill * 100}%`, backgroundImage: RAMP_GRADIENT, backgroundSize: `${100 / fill}% 100%` }}
        />
      )}
      {ticks.map((k) => (
        <span key={k} className={cn("absolute -translate-x-1/2", TICK_CLASS[k])} style={{ left: at(row.bench[k]!) }} />
      ))}
      {row.value !== null && (
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-1 shadow-[0_0_0_2px_rgba(10,12,16,0.85)]"
          style={{ left: at(row.value) }}
        />
      )}
    </div>
  );
}

function BenchCaption({ layer, bench }: { layer: LayerDef; bench: Benchmarks }) {
  return (
    <p className="mt-1 flex gap-3 text-badge text-text-3 tabular">
      <span>County {formatMean(layer, bench.county)}</span>
      <span>State {formatMean(layer, bench.state)}</span>
      <span>US {formatMean(layer, bench.nation)}</span>
    </p>
  );
}

function DomainGroup({ section, display }: { section: ProfileSection; display: Display }) {
  return (
    <section aria-label={section.title} className="mt-5">
      {section.score && <MeasureRow row={section.score} display={display} heading={section.title} />}
      {section.rows.length > 0 && (
        <div className="mt-2 flex flex-col gap-2.5 border-l border-border pl-3">
          {section.rows.map((row) => (
            <MeasureRow key={row.layer.id} row={row} display={display} />
          ))}
        </div>
      )}
    </section>
  );
}

function ContextGroup({ section }: { section: ProfileSection }) {
  return (
    <section aria-label={section.title} className="mt-6 border-t border-border pt-4">
      <h3 className="text-badge font-medium tracking-[0.06em] text-text-2 uppercase">{section.title}</h3>
      {section.note && <p className="mt-1 text-caption text-text-3">{section.note}</p>}
      <div className="mt-3 flex flex-col gap-2.5">
        {section.rows.map((row) => (
          <MeasureRow key={row.layer.id} row={row} display="score" />
        ))}
      </div>
    </section>
  );
}

/** One measure: label and badges, the school value, a track with county/state/nation ticks, and the benchmarks. */
function MeasureRow({ row, display, heading }: { row: ProfileRow; display: Display; heading?: string }) {
  const { layer, value, pct } = row;
  const showPct = display === "pct" && pct !== null && value !== null;
  const summary =
    value === null
      ? `${layer.label}: no data`
      : `${layer.label}: ${formatValue(layer, value)}${pct !== null ? `, ${ordinal(pct)} national percentile` : ""}`;
  return (
    <div role="group" aria-label={summary} title={layer.subtitle}>
      <div className="flex items-baseline gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {heading ? (
            <h3 className="truncate text-chip font-medium text-text-1">{heading}</h3>
          ) : (
            <span className="truncate text-body text-text-2">{layer.label}</span>
          )}
          {row.badges.map((b) => (
            <RowBadgeChip key={b} badge={b} />
          ))}
        </div>
        <span className="flex shrink-0 items-baseline gap-1.5 tabular">
          {value === null ? (
            <span className="text-caption text-text-3">no data</span>
          ) : (
            <>
              {pct !== null && (
                <span className="text-badge text-text-3">
                  {showPct ? `score ${formatValue(layer, value)}` : `${ordinal(pct)} pct`}
                </span>
              )}
              <span className={cn("font-semibold text-text-1", heading ? "text-title" : "text-chip")}>
                {showPct ? ordinal(pct) : formatValue(layer, value)}
              </span>
            </>
          )}
        </span>
      </div>
      <BenchTrack row={row} className="mt-1" />
      {value === null && row.missingReason ? (
        <p className="mt-0.5 text-badge text-text-3">{row.missingReason}</p>
      ) : (
        <BenchCaption layer={layer} bench={row.bench} />
      )}
    </div>
  );
}

const BADGE_TEXT: Record<RowBadge, { label: string; tip: string }> = {
  county: { label: "county", tip: COUNTY_BADGE_TIP },
  approx: {
    label: "approx.",
    tip: "Recomputed from ACS 2019-2023 for Connecticut; an approximation of the ODIS index.",
  },
  proxy: { label: "proxy", tip: "County Health Rankings 2025 park access, one value per Connecticut planning region." },
};

function RowBadgeChip({ badge }: { badge: RowBadge }) {
  const { label, tip } = BADGE_TEXT[badge];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "shrink-0 cursor-help rounded-[5px] border px-1 py-px text-[10px] leading-none font-medium tracking-[0.06em] uppercase",
            badge === "county" ? "border-border-strong text-text-2" : "border-mark-a/40 text-mark-a",
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[260px] rounded-card border border-border-strong bg-bg-1 text-left text-pretty px-3 py-2 text-caption text-text-2 shadow-panel [&_svg]:hidden!"
      >
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function DrawerSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-3 p-4" data-testid="profile-loading">
      <div className="h-3 w-32 animate-pulse rounded bg-white/6" />
      <div className="h-5 w-64 animate-pulse rounded bg-white/8" />
      <div className="h-3 w-40 animate-pulse rounded bg-white/6" />
      <div className="mt-3 h-28 animate-pulse rounded-card bg-white/5" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-white/4" />
      ))}
      <span className="sr-only">Loading school profile</span>
    </div>
  );
}

function DrawerMessage({ title, children }: { title: string; children?: ReactNode }) {
  const closeProfile = useStore((s) => s.closeProfile);
  return (
    <div className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-title font-semibold text-text-1">{title}</h2>
        <IconButton label="Close profile" onClick={closeProfile}>
          <X className="size-[18px]" />
        </IconButton>
      </div>
      {children}
    </div>
  );
}

/**
 * Pin tooltip content (SPEC.md 3.5): school name, district, city and state, and each active layer's value with its
 * national percentile in parentheses. The star is the only control a tooltip may hold. M2 renders it on pin hover.
 */
export function SchoolTooltip({
  schools,
  index,
  layers,
  starred,
  onToggleStar,
}: {
  schools: SchoolsFile;
  index: number;
  layers: readonly string[];
  starred: boolean;
  onToggleStar?: () => void;
}) {
  const lines = tooltipLines(schools, index, layers);
  return (
    <div className="max-w-[320px] rounded-card border border-border bg-surface-strong px-3 py-2.5 shadow-panel">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-chip leading-snug font-medium text-text-1">{schools.name[index]}</p>
          <p className="truncate text-caption text-text-2">{schools.district[index]}</p>
          <p className="text-caption text-text-3">
            {schools.city[index]}, {schools.st[index]}
          </p>
        </div>
        {onToggleStar && (
          <button
            type="button"
            aria-label={starred ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={starred}
            onClick={onToggleStar}
            className={cn(
              "-mt-0.5 -mr-1 grid size-7 shrink-0 place-items-center rounded-chip transition-colors duration-(--dur-hover) hover:bg-white/6",
              starred ? "text-mark-a" : "text-text-3 hover:text-text-1",
            )}
          >
            <Star className={cn("size-4", starred && "fill-current")} />
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <dl className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {lines.map((l) => (
            <div key={l.layer.id} className="flex items-baseline gap-2 text-caption">
              <dt className="flex min-w-0 flex-1 items-center gap-1.5 text-text-2">
                <span className="truncate">{l.layer.label}</span>
                {l.county && (
                  <span className="rounded-[5px] border border-border-strong px-1 py-px text-[10px] leading-none tracking-[0.06em] text-text-3 uppercase">
                    county
                  </span>
                )}
              </dt>
              <dd className={cn("shrink-0 tabular", l.missing ? "text-text-3" : "text-text-1")}>
                {l.missing ? "No data" : l.value}
                {l.pct && <span className="text-text-3"> ({l.pct})</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
