// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { scaleLinear } from "d3-scale";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

// Scatter of layer A (x) against layer B (y), one point per unit, drawn on a canvas (SPEC.md 6.4).
// Points take their bivariate class color, a thin OLS line runs through the cloud, and hovering links to the map.

/** Fallbacks for the --bv0..--bv8 tokens (SPEC.md 9.2) when computed styles are unavailable. */
const BV_FALLBACK = ["#262a36", "#1e6b6b", "#22c2b0", "#742f7f", "#6b5d95", "#6fc6c9", "#e068c0", "#d58ad6", "#f2f0fa"];

/** Above this many points the radius drops to 1.5 px and opacity to 0.5 (SPEC.md 6.4). */
const DENSE = 3000;
const HIT_RADIUS = 8;
const M = { top: 8, right: 8, bottom: 20, left: 30 };

export interface ScatterProps {
  ids: string[];
  names: string[];
  x: (number | null)[];
  y: (number | null)[];
  /** The layers' national range, e.g. [0, 100]; the axes zoom to the data but never leave it. */
  rangeX: [number, number];
  rangeY: [number, number];
  /** Tercile breaks of A and B at this level, for the bivariate point colors (SPEC.md 5.2). */
  tercX?: readonly number[];
  tercY?: readonly number[];
  labelX: string;
  labelY: string;
  /** Plural unit noun for the accessible label, e.g. "counties". */
  unitNoun: string;
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  height?: number;
}

interface Pt {
  i: number;
  x: number;
  y: number;
}

function tercileClass(v: number, terc?: readonly number[]): number {
  if (!terc) return 1;
  let c = 0;
  while (c < terc.length && v >= terc[c]) c++;
  return c;
}

function readPalette(): string[] {
  if (typeof document === "undefined") return BV_FALLBACK;
  const style = getComputedStyle(document.documentElement);
  return BV_FALLBACK.map((fb, i) => style.getPropertyValue(`--bv${i}`).trim() || fb);
}

function domainOf(values: number[], range: [number, number]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return range;
  const pad = Math.max((hi - lo) * 0.06, (range[1] - range[0]) * 0.01);
  const [a, b] = scaleLinear()
    .domain([lo - pad, hi + pad])
    .nice(4)
    .domain();
  return [Math.max(range[0], a), Math.min(range[1], b)];
}

// Method: Ordinary least squares (Kutner et al. 2005); see CITATIONS.md, section 3.
/** Least-squares line y = a + b x, or null when x does not vary. */
function ols(pts: Pt[]): { a: number; b: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

export function Scatter({
  ids,
  names,
  x,
  y,
  rangeX,
  rangeY,
  tercX,
  tercY,
  labelX,
  labelY,
  unitNoun,
  formatX,
  formatY,
  hoveredId,
  onHover,
  height = 168,
}: ScatterProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(348);
  const [localHover, setLocalHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    for (let i = 0; i < ids.length; i++) {
      const xi = x[i];
      const yi = y[i];
      if (xi !== null && yi !== null && xi !== undefined && yi !== undefined) out.push({ i, x: xi, y: yi });
    }
    return out;
  }, [ids, x, y]);

  const scales = useMemo(() => {
    const dx = domainOf(
      pts.map((p) => p.x),
      rangeX,
    );
    const dy = domainOf(
      pts.map((p) => p.y),
      rangeY,
    );
    return {
      sx: scaleLinear()
        .domain(dx)
        .range([M.left, width - M.right]),
      sy: scaleLinear()
        .domain(dy)
        .range([height - M.bottom, M.top]),
    };
  }, [pts, rangeX, rangeY, width, height]);

  const dense = pts.length > DENSE;
  const radius = dense ? 1.5 : pts.length > 600 ? 2.25 : 3;

  // Base layer: grid, tercile guides, points, OLS line.
  useEffect(() => {
    const canvas = baseRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { sx, sy } = scales;
    const palette = readPalette();

    ctx.font = "11px 'Inter Variable', ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#6f7889";
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // A narrow domain (a layer that barely varies) can give ticks that format alike; draw each label once.
    const labelled = (ticks: number[], format: (v: number) => string) =>
      ticks.filter((t, i) => i === 0 || format(t) !== format(ticks[i - 1]));
    for (const t of labelled(sx.ticks(4), formatX)) {
      const px = Math.round(sx(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, M.top);
      ctx.lineTo(px, height - M.bottom);
      ctx.stroke();
      ctx.fillText(formatX(t), px, height - M.bottom + 5);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const t of labelled(sy.ticks(4), formatY)) {
      const py = Math.round(sy(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(M.left, py);
      ctx.lineTo(width - M.right, py);
      ctx.stroke();
      ctx.fillText(formatY(t), M.left - 6, py);
    }

    // Tercile guides: the bivariate grid the map is colored by.
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    const [x0, x1] = sx.domain();
    const [y0, y1] = sy.domain();
    for (const t of tercX ?? []) {
      if (t <= x0 || t >= x1) continue;
      const px = Math.round(sx(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, M.top);
      ctx.lineTo(px, height - M.bottom);
      ctx.stroke();
    }
    for (const t of tercY ?? []) {
      if (t <= y0 || t >= y1) continue;
      const py = Math.round(sy(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(M.left, py);
      ctx.lineTo(width - M.right, py);
      ctx.stroke();
    }
    ctx.restore();

    ctx.globalAlpha = dense ? 0.5 : 0.92;
    for (const p of pts) {
      const cls = 3 * tercileClass(p.x, tercX) + tercileClass(p.y, tercY);
      ctx.fillStyle = palette[cls];
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), radius, 0, Math.PI * 2);
      ctx.fill();
      if (!dense) {
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    const line = ols(pts);
    if (line) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(M.left, M.top, width - M.left - M.right, height - M.top - M.bottom);
      ctx.clip();
      ctx.strokeStyle = "rgba(242,244,248,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(x0), sy(line.a + line.b * x0));
      ctx.lineTo(sx(x1), sy(line.a + line.b * x1));
      ctx.stroke();
      ctx.restore();
    }
  }, [pts, scales, width, height, radius, dense, tercX, tercY, formatX, formatY]);

  // The highlighted point: hovered here, or hovered on the map (store `hovered`).
  const highlight = useMemo(() => {
    if (localHover !== null) return localHover;
    if (hoveredId === null) return null;
    const idx = ids.indexOf(hoveredId);
    return idx >= 0 && x[idx] !== null && y[idx] !== null ? idx : null;
  }, [localHover, hoveredId, ids, x, y]);

  useEffect(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (highlight === null) return;
    const px = scales.sx(x[highlight] as number);
    const py = scales.sy(y[highlight] as number);
    ctx.fillStyle = "rgba(46,230,197,0.22)";
    ctx.beginPath();
    ctx.arc(px, py, radius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, radius + 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }, [highlight, scales, x, y, width, height, radius]);

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: number | null = null;
    let bestD = HIT_RADIUS * HIT_RADIUS;
    for (const p of pts) {
      const dx = scales.sx(p.x) - mx;
      const dy = scales.sy(p.y) - my;
      const d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = p.i;
      }
    }
    if (best !== localHover) {
      setLocalHover(best);
      onHover(best === null ? null : ids[best]);
    }
  }

  function onPointerLeave() {
    if (localHover !== null) {
      setLocalHover(null);
      onHover(null);
    }
  }

  const tip =
    highlight === null
      ? null
      : {
          left: scales.sx(x[highlight] as number),
          top: scales.sy(y[highlight] as number),
          name: names[highlight],
          xv: x[highlight] as number,
          yv: y[highlight] as number,
        };

  return (
    <div data-testid="scatter" className="relative">
      <div className="mb-1 flex items-center justify-between text-badge font-medium tracking-[0.06em] text-text-3 uppercase">
        <span className="max-w-[60%] truncate" title={labelY}>
          ↑ {labelY}
        </span>
      </div>
      <div ref={wrapRef} className="relative" style={{ height }}>
        <canvas
          ref={baseRef}
          role="img"
          aria-label={`Scatter of ${pts.length.toLocaleString("en-US")} ${unitNoun}: ${labelX} across, ${labelY} up`}
          className="absolute inset-0 size-full"
          style={{ width, height }}
        />
        <canvas
          ref={overlayRef}
          data-testid="scatter-hit"
          aria-hidden
          className="absolute inset-0 size-full cursor-crosshair"
          style={{ width, height }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        />
        {tip && (
          <div
            data-testid="scatter-tip"
            className="pointer-events-none absolute z-10 max-w-[220px] rounded-chip border border-border-strong bg-surface-strong px-2 py-1 text-caption whitespace-nowrap text-text-1 shadow-panel"
            style={{
              left: tip.left,
              top: tip.top,
              transform: `translate(${tip.left > width * 0.6 ? "calc(-100% - 10px)" : "10px"}, ${tip.top < 40 ? "4px" : "calc(-100% - 6px)"})`,
            }}
          >
            <div className="truncate font-medium">{tip.name}</div>
            <div className="text-text-2 tabular">
              {formatX(tip.xv)} · {formatY(tip.yv)}
            </div>
          </div>
        )}
      </div>
      <div className="mt-0.5 text-right text-badge font-medium tracking-[0.06em] text-text-3 uppercase">
        <span className="inline-block max-w-[70%] truncate align-bottom" title={labelX}>
          {labelX} →
        </span>
      </div>
    </div>
  );
}
