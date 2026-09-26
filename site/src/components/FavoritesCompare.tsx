import { X } from "lucide-react";
import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { compareGroups, formatValue, ordinal, type CompareRow, type FavoriteSchool } from "@/lib/favorites";
import type { LayerDef } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Opaque twin of the drawer surface (--surface-strong over --bg-0), so rows scrolling under the sticky header stay hidden. */
const HEAD_CELL = "border-b border-border bg-[color-mix(in_srgb,rgb(18_21_28)_88%,var(--bg-0))]";

const COUNTY_BADGE_TIP = "This measure is only available per county. Every school in a county shares the same value.";

interface FavoritesCompareProps {
  /** The schools to compare, at most six, in star order. */
  schools: FavoriteSchool[];
  onFocusSchool: (school: FavoriteSchool) => void;
  onRemove: (id: string) => void;
}

/** `Compare starred` (SPEC.md 3.12): one column per school, one row per measure. */
export function FavoritesCompare({ schools, onFocusSchool, onRemove }: FavoritesCompareProps) {
  const groups = useMemo(() => compareGroups(schools), [schools]);

  return (
    <table data-testid="favorites-compare" className="w-full table-fixed border-separate border-spacing-0 text-body">
      <colgroup>
        <col className="w-[152px]" />
        {schools.map((s) => (
          <col key={s.id} />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-10">
        <tr>
          <th scope="col" className={cn(HEAD_CELL, "pr-2 pb-2.5 align-bottom")}>
            <span className="sr-only">Measure</span>
          </th>
          {schools.map((s) => (
            <th
              key={s.id}
              scope="col"
              className={cn(HEAD_CELL, "group/col relative px-1.5 pb-2.5 text-left align-bottom font-normal")}
            >
              <button
                type="button"
                disabled={!s.found}
                onClick={() => onFocusSchool(s)}
                className="block w-full cursor-pointer rounded-md pr-3 text-left disabled:cursor-default"
                title={s.found ? `${s.name}, ${s.city}, ${s.st}` : s.id}
              >
                <span className="line-clamp-3 text-caption leading-tight font-medium break-words text-text-1 hyphens-auto">
                  {s.found ? s.name : "Unknown school"}
                </span>
                <span className="mt-1 block truncate text-badge text-text-3">
                  {s.found ? `${s.city}, ${s.st}` : s.id}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${s.found ? s.name : s.id} from favorites`}
                onClick={() => onRemove(s.id)}
                className="absolute top-0 right-0 grid size-5 cursor-pointer place-items-center rounded-md text-text-3 opacity-0 transition-opacity duration-(--dur-hover) group-hover/col:opacity-100 hover:bg-white/6 hover:text-text-1 focus-visible:opacity-100"
              >
                <X className="size-3" />
              </button>
            </th>
          ))}
        </tr>
      </thead>
      {groups.map((g) => (
        <tbody key={g.id}>
          <tr>
            <th
              scope="colgroup"
              colSpan={schools.length + 1}
              className="pt-4 pb-1.5 pl-1 text-left text-badge font-medium tracking-[0.06em] text-text-3 uppercase"
            >
              {g.title}
              {g.note && <span className="ml-2 tracking-normal normal-case">{g.note}</span>}
            </th>
          </tr>
          {g.rows.map((row) => (
            <MeasureRow key={row.layer.id} row={row} />
          ))}
        </tbody>
      ))}
    </table>
  );
}

function MeasureRow({ row }: { row: CompareRow }) {
  const { layer } = row;
  return (
    <tr data-layer={layer.id} className="group/row">
      <th
        scope="row"
        className="rounded-l-md py-1.5 pr-2 pl-1 text-left align-middle font-normal group-hover/row:bg-white/3"
        title={layer.subtitle}
      >
        <span className="text-text-2">{layer.label}</span>
        {layer.resolution === "county" && <CountyBadge />}
      </th>
      {row.values.map((v, i) => {
        const highest = row.highest.includes(i);
        return (
          <td
            key={i}
            data-highest={highest || undefined}
            className="p-0.5 align-middle tabular group-hover/row:bg-white/3 last:rounded-r-md"
          >
            <div
              className={cn(
                "rounded-md px-1.5 py-1 text-right",
                highest &&
                  "bg-[color-mix(in_srgb,var(--u5)_24%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--u5)_45%,transparent)]",
              )}
            >
              <Cell layer={layer} value={v} pct={row.pcts?.[i] ?? null} highest={highest} />
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function Cell({
  layer,
  value,
  pct,
  highest,
}: {
  layer: LayerDef;
  value: number | null;
  pct: number | null;
  highest: boolean;
}) {
  if (value === null) return <NoData />;
  return (
    <span className="inline-flex items-baseline justify-end gap-1.5">
      <span className={cn("font-medium", highest ? "text-text-1" : "text-text-1/90")}>{formatValue(layer, value)}</span>
      {pct !== null && (
        <span
          className="rounded-[4px] bg-white/6 px-1 text-badge leading-4 text-text-2"
          title={`National percentile ${ordinal(pct)}`}
        >
          {ordinal(pct)}
        </span>
      )}
      {highest && <span className="sr-only">(highest stress)</span>}
    </span>
  );
}

/** Missing value: a hatched swatch, never a number (SPEC.md 7). */
export function NoData() {
  return (
    <span className="inline-flex items-center justify-end" title="No data">
      <span
        aria-hidden
        data-nodata
        className="inline-block size-3 rounded-[3px] border border-(--nodata-hatch) bg-[repeating-linear-gradient(135deg,var(--nodata-hatch)_0_1px,transparent_1px_4px)]"
      />
      <span className="sr-only">No data</span>
    </span>
  );
}

function CountyBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-county-badge
          tabIndex={0}
          className="ml-1.5 inline-block rounded-[4px] border border-border-strong px-1 align-[1px] text-badge leading-3.5 font-medium tracking-[0.06em] text-text-3 uppercase"
        >
          county
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-60">
        {COUNTY_BADGE_TIP}
      </TooltipContent>
    </Tooltip>
  );
}
