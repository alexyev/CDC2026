// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { useId } from "react";
import type { Histogram } from "@/lib/types";

// One-layer distribution strip (SPEC.md 6.4): 20 bins over the layer's national range with the national median ruled.

const RAMP = ["var(--u1)", "var(--u2)", "var(--u3)", "var(--u4)", "var(--u5)"];

interface DistributionProps {
  hist: Histogram;
  /** The layer's national range: [0, 100], or [0, 1] for Gini. */
  domain: [number, number];
  /** Fixed national quintile breaks at this level; bars take the ramp color of their class (SPEC.md 5.2). */
  quint?: readonly number[];
  /** National median, drawn as a vertical rule. */
  median: number | null;
  /** Accessible summary, e.g. "Composite Score across 8 states". */
  label: string;
  /** Formats axis and median values. */
  format: (v: number) => string;
  height?: number;
}

/** Normalizes the worker's bins (edges, or left edges) into [lo, hi] pairs aligned with counts. */
function binRanges(hist: Histogram, domain: [number, number]): [number, number][] {
  const { bins, counts } = hist;
  if (bins.length === counts.length + 1) return counts.map((_, i) => [bins[i], bins[i + 1]]);
  const width = bins.length > 1 ? bins[1] - bins[0] : (domain[1] - domain[0]) / Math.max(counts.length, 1);
  return counts.map((_, i) => [bins[i] ?? domain[0] + i * width, (bins[i] ?? domain[0] + i * width) + width]);
}

function rampColor(v: number, quint?: readonly number[]): string {
  if (!quint) return RAMP[3];
  let c = 0;
  while (c < quint.length && v >= quint[c]) c++;
  return RAMP[c];
}

const VIEW_W = 348;
const PAD_X = 1;
const AXIS_H = 14;

export function Distribution({ hist, domain, quint, median, label, format, height = 64 }: DistributionProps) {
  const titleId = useId();
  const plotH = height - AXIS_H;
  const [lo, hi] = domain;
  const x = (v: number) => PAD_X + ((v - lo) / (hi - lo)) * (VIEW_W - 2 * PAD_X);
  const ranges = binRanges(hist, domain);
  const max = Math.max(1, ...hist.counts);
  const total = hist.counts.reduce((a, b) => a + b, 0);
  const medianX = median === null ? null : x(Math.min(hi, Math.max(lo, median)));
  const ticks = [lo, lo + (hi - lo) / 4, lo + (hi - lo) / 2, lo + (3 * (hi - lo)) / 4, hi];

  return (
    <figure className="m-0" data-testid="distribution">
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block overflow-visible"
      >
        <title id={titleId}>
          {`${label}: ${total.toLocaleString("en-US")} values${median === null ? "" : `, national median ${format(median)}`}`}
        </title>
        <line x1={0} x2={VIEW_W} y1={plotH + 0.5} y2={plotH + 0.5} stroke="var(--border-strong)" />
        {ranges.map(([a, b], i) => {
          const count = hist.counts[i];
          if (!count) return null;
          const h = Math.max(1.5, (count / max) * (plotH - 4));
          const x0 = x(a) + 0.75;
          const w = Math.max(1, x(b) - x(a) - 1.5);
          return (
            <rect
              key={i}
              x={x0}
              y={plotH - h}
              width={w}
              height={h}
              rx={1.5}
              fill={rampColor((a + b) / 2, quint)}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {medianX !== null && (
          <line
            data-testid="national-median"
            x1={medianX}
            x2={medianX}
            y1={0}
            y2={plotH}
            stroke="var(--text-1)"
            strokeOpacity={0.85}
            strokeWidth={1}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="relative mt-0.5 h-3 text-badge text-text-3 tabular">
        {ticks.map((t, i) => (
          <span
            key={t}
            className="absolute top-0"
            style={{
              left: `${(i / (ticks.length - 1)) * 100}%`,
              transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {format(t)}
          </span>
        ))}
      </div>
    </figure>
  );
}
