// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";

export interface ScatterCloud {
  key: string;
  label: string;
  /** Literal CSS color; canvas cannot read tokens. */
  color: string;
  ids: string[];
  x: (number | null)[];
  y: (number | null)[];
  /** Background clouds (viewport or nation) are drawn first, smaller, and are not hoverable. */
  background?: boolean;
}

interface CompareScatterProps {
  clouds: ScatterCloud[];
  xLabel: string;
  yLabel: string;
  xRange: [number, number];
  yRange: [number, number];
  /** Resolves a hovered school id to its display name. */
  nameOf: (id: string) => string;
  height?: number;
}

const PAD = { top: 10, right: 10, bottom: 26, left: 30 };
const TEXT_3 = "#6f7889";
const GRID = "rgba(255, 255, 255, 0.06)";
const HOVER_RADIUS_PX = 8;

interface Point {
  id: string;
  px: number;
  py: number;
  x: number;
  y: number;
  cloud: number;
}

// Method: Ordinary least squares (Kutner et al. 2005); see CITATIONS.md, section 3.
/** Least-squares fit y = a + b x, or null when x has no spread. */
function ols(points: Point[]): { a: number; b: number } | null {
  const n = points.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

const fmtTick = (v: number, range: [number, number]) => (range[1] <= 1 ? v.toFixed(1) : String(Math.round(v)));

/**
 * Compare scatter (SPEC.md 6.4): x = layer A, y = layer B over the layers' national ranges, pinned areas in their
 * pin colors over the viewport or nation in text-3 gray, a thin OLS line per cloud. Hovering a pinned-area point
 * names the school and highlights it through the store's hovered unit.
 */
export function CompareScatter({ clouds, xLabel, yLabel, xRange, yRange, nameOf, height = 176 }: CompareScatterProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(348);
  const [hover, setHover] = useState<Point | null>(null);
  const hoverUnit = useStore((s) => s.hoverUnit);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const points = useMemo(() => {
    const sx = (v: number) => PAD.left + ((v - xRange[0]) / (xRange[1] - xRange[0])) * plotW;
    const sy = (v: number) => PAD.top + plotH - ((v - yRange[0]) / (yRange[1] - yRange[0])) * plotH;
    return clouds.map((c, ci) => {
      const out: Point[] = [];
      for (let i = 0; i < c.x.length; i++) {
        const x = c.x[i];
        const y = c.y[i];
        if (x === null || x === undefined || y === null || y === undefined) continue;
        out.push({ id: c.ids[i]!, x, y, px: sx(x), py: sy(y), cloud: ci });
      }
      return out;
    });
  }, [clouds, xRange, yRange, plotW, plotH]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Grid and tick labels at the range ends and middle.
    ctx.font = "11px 'Inter Variable', ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = TEXT_3;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (const t of [0, 0.5, 1]) {
      const gx = Math.round(PAD.left + t * plotW) + 0.5;
      const gy = Math.round(PAD.top + (1 - t) * plotH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, PAD.top);
      ctx.lineTo(gx, PAD.top + plotH);
      ctx.moveTo(PAD.left, gy);
      ctx.lineTo(PAD.left + plotW, gy);
      ctx.stroke();
      ctx.textAlign = t === 0 ? "left" : t === 1 ? "right" : "center";
      ctx.textBaseline = "top";
      ctx.fillText(fmtTick(xRange[0] + t * (xRange[1] - xRange[0]), xRange), gx, PAD.top + plotH + 5);
      ctx.textAlign = "right";
      ctx.textBaseline = t === 1 ? "top" : t === 0 ? "bottom" : "middle";
      ctx.fillText(fmtTick(yRange[0] + t * (yRange[1] - yRange[0]), yRange), PAD.left - 6, gy);
    }

    const total = points.reduce((s, p) => s + p.length, 0);
    const dense = total > 3000;
    points.forEach((pts, ci) => {
      const cloud = clouds[ci]!;
      const r = cloud.background ? 1.3 : dense ? 1.5 : 2.4;
      ctx.globalAlpha = cloud.background ? 0.28 : dense ? 0.5 : 0.8;
      ctx.fillStyle = cloud.color;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const fit = ols(pts);
      if (fit) {
        // Draw the fit over the cloud's own x extent only; extrapolating across the axis overstates it.
        let x0 = Infinity;
        let x1 = -Infinity;
        for (const p of pts) {
          x0 = Math.min(x0, p.x);
          x1 = Math.max(x1, p.x);
        }
        const clampY = (v: number) => Math.min(yRange[1], Math.max(yRange[0], v));
        const toPx = (x: number, y: number) =>
          [
            PAD.left + ((x - xRange[0]) / (xRange[1] - xRange[0])) * plotW,
            PAD.top + plotH - ((clampY(y) - yRange[0]) / (yRange[1] - yRange[0])) * plotH,
          ] as const;
        const [ax, ay] = toPx(x0, fit.a + fit.b * x0);
        const [bx, by] = toPx(x1, fit.a + fit.b * x1);
        ctx.save();
        ctx.beginPath();
        ctx.rect(PAD.left, PAD.top, plotW, plotH);
        ctx.clip();
        ctx.globalAlpha = cloud.background ? 0.55 : 0.95;
        ctx.strokeStyle = cloud.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.restore();
      }
    });
    ctx.globalAlpha = 1;

    if (hover) {
      ctx.beginPath();
      ctx.arc(hover.px, hover.py, 4, 0, Math.PI * 2);
      ctx.fillStyle = clouds[hover.cloud]?.color ?? "#fff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  }, [points, clouds, hover, width, height, plotW, plotH, xRange, yRange]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: Point | null = null;
    let bestD = HOVER_RADIUS_PX ** 2;
    points.forEach((pts, ci) => {
      if (clouds[ci]?.background) return;
      for (const p of pts) {
        const d = (p.px - mx) ** 2 + (p.py - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    });
    const next = best as Point | null;
    if (next?.id !== hover?.id) {
      setHover(next);
      hoverUnit(next ? next.id : null);
    }
  };

  const onLeave = () => {
    if (hover) hoverUnit(null);
    setHover(null);
  };

  const fmt = (v: number, range: [number, number]) => (range[1] <= 1 ? v.toFixed(2) : String(v));

  return (
    <figure className="m-0">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-caption text-text-3">
        <span className="min-w-0 truncate">
          <span aria-hidden>↑ </span>
          {yLabel}
        </span>
        <span className="min-w-0 truncate text-right">
          {xLabel}
          <span aria-hidden> →</span>
        </span>
      </div>
      <div ref={wrapRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Scatter of ${yLabel} against ${xLabel}: ${clouds.map((c) => c.label).join(", ")}`}
          style={{ width: "100%", height }}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        />
        {hover ? (
          <div
            data-testid="compare-scatter-hover"
            className="pointer-events-none absolute z-10 max-w-[220px] -translate-x-1/2 -translate-y-full rounded-chip border border-border bg-surface-strong px-2 py-1 text-caption text-text-1 shadow-panel tabular"
            style={{
              top: hover.py - 8,
              left: Math.min(Math.max(hover.px, 110), width - 110),
            }}
          >
            <div className="truncate font-medium">{nameOf(hover.id)}</div>
            <div className="text-text-2">
              {fmt(hover.x, xRange)} · {fmt(hover.y, yRange)}
            </div>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
