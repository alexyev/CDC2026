// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// The hover overview card (SPEC.md 3.5, 9.5) shared by areas and pins: title block, the active layers then the
// composite and five domains with a percentile bar each, card-level notes, and the click hint. It places itself
// next to its anchor inside its offset parent (placeCard), measured before paint so it never lands off screen.

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COUNTY_BADGE_TIP } from "@/components/profileData";
import { cardSummary, pctLabel, placeCard, type CardRow, type OverviewCard as Card } from "./overview";

interface OverviewCardProps {
  card: Card;
  /** Anchor (cursor or pin) in the offset parent's pixels. */
  x: number;
  y: number;
  /** Top-right control; only the pin star lives here (SPEC.md 3.5). */
  action?: ReactNode;
  className?: string;
  testId: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export function OverviewCard({
  card,
  x,
  y,
  action,
  className,
  testId,
  onPointerEnter,
  onPointerLeave,
}: OverviewCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const { left, top } = placeCard(x, y, el.offsetWidth, el.offsetHeight, parent.clientWidth, parent.clientHeight);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.visibility = "visible";
  });

  const lead = card.rows.filter((r) => r.slot !== null);
  const rest = card.rows.filter((r) => r.slot === null);

  return (
    <div
      ref={ref}
      role="tooltip"
      data-testid={testId}
      data-kind={card.kind}
      style={{ visibility: "hidden" }}
      className={cn(
        "glass glass-strong absolute z-[45] w-[320px] rounded-card border-border-strong px-3 py-2.5",
        className,
      )}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-chip leading-tight font-semibold text-text-1">{card.title}</div>
          {(card.subtitle || card.count) && (
            <div className="mt-0.5 text-caption leading-snug text-text-3">
              {card.subtitle}
              {card.subtitle && card.count && " · "}
              {card.count && <span className="tabular">{card.count}</span>}
            </div>
          )}
        </div>
        {action}
      </div>

      <div className="mt-2 border-t border-border pt-1.5">
        <div className="flex items-baseline gap-2 text-[10px] leading-[14px] tracking-[0.06em] text-text-3 uppercase">
          <span className="flex-1">{card.pctHeading}</span>
          <span className="w-11 text-right">{card.valueHeading}</span>
          <span className="w-9 text-right">Pct</span>
        </div>
        <dl className="mt-1 flex flex-col gap-[3px]">
          {lead.map((row) => (
            <Row key={row.id} row={row} lead={card.lead} />
          ))}
          {lead.length > 0 && rest.length > 0 && <div aria-hidden className="my-[3px] h-px bg-border" />}
          {rest.map((row) => (
            <Row key={row.id} row={row} lead={card.lead} />
          ))}
        </dl>
      </div>

      {card.flags.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-caption leading-snug text-text-2">
          {card.flags.map((f) => (
            <li key={f} className="flex gap-1.5">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-text-3" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 text-badge tracking-[0.06em] text-text-3 uppercase">{card.hint}</div>
      <span className="sr-only" aria-live="polite">
        {cardSummary(card)}
      </span>
    </div>
  );
}

const BAR_FILL = { A: "bg-u5", B: "bg-bv2" } as const;

function Row({ row, lead }: { row: CardRow; lead: Card["lead"] }) {
  const active = row.slot !== null;
  return (
    <div>
      <div className="flex h-[18px] items-center gap-2">
        <dt
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-body leading-none",
            active ? "text-text-1" : "text-text-2",
          )}
        >
          {active && (
            <span aria-hidden className="w-2 shrink-0 font-mono text-badge text-text-3">
              {row.slot}
            </span>
          )}
          <span className="truncate" title={row.label}>
            {row.label}
          </span>
          {row.countyLevel && <Badge title={COUNTY_BADGE_TIP}>county</Badge>}
          {row.badge && <Badge>{row.badge}</Badge>}
        </dt>
        <dd className="flex shrink-0 items-center gap-2 text-body leading-none tabular">
          {row.value === null ? (
            <span className="w-[144px] text-right text-text-3">No data</span>
          ) : (
            <>
              {row.pct !== null && (
                <span aria-hidden className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.08]">
                  <span
                    className={cn("block h-full rounded-full", row.slot ? BAR_FILL[row.slot] : "bg-text-3")}
                    style={{ width: `${Math.max(4, Math.min(100, row.pct))}%` }}
                  />
                </span>
              )}
              <span className={cn("w-11 text-right", lead === "value" ? "font-semibold text-text-1" : "text-text-2")}>
                {row.value}
              </span>
              <span className={cn("w-9 text-right", lead === "pct" ? "font-semibold text-text-1" : "text-text-3")}>
                {pctLabel(row.pct)}
              </span>
            </>
          )}
        </dd>
      </div>
      {row.note && (
        <div className={cn("mb-0.5 text-caption leading-snug text-text-3", active && "pl-3.5")}>{row.note}</div>
      )}
    </div>
  );
}

function Badge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="shrink-0 rounded-[4px] border border-border-strong px-1 text-[10px] leading-[14px] tracking-[0.06em] text-text-3 uppercase"
    >
      {children}
    </span>
  );
}
