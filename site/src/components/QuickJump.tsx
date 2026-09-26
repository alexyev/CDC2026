// Quick-jump chips (SPEC.md 3.4): Alaska, Hawaii, and Puerto Rico sit far from the initial view, so these fly to
// their bboxes instead of drawing insets.

import { useEffect, useState } from "react";
import { load } from "@/lib/loaders";
import type { BBox } from "@/lib/types";
import { flyToBBox } from "@/map/camera";
import { useMap } from "@/map/useMap";

const JUMPS: { usps: string; stfp: string; name: string; bbox: BBox }[] = [
  { usps: "AK", stfp: "02", name: "Alaska", bbox: [-179.9, 51.2, -129.9, 71.4] },
  { usps: "HI", stfp: "15", name: "Hawaii", bbox: [-160.3, 18.9, -154.8, 22.3] },
  { usps: "PR", stfp: "72", name: "Puerto Rico", bbox: [-67.95, 17.88, -65.22, 18.52] },
];

export function QuickJump() {
  const { map } = useMap();
  const [bboxes, setBboxes] = useState<Record<string, BBox>>({});

  // Prefer the pipeline's bboxes; the constants cover the fixtures and a failed load.
  useEffect(() => {
    let cancelled = false;
    load("states")
      .then((states) => {
        if (cancelled) return;
        const found: Record<string, BBox> = {};
        for (const j of JUMPS) {
          const i = states.ids.indexOf(j.stfp);
          if (i >= 0) found[j.stfp] = states.bbox[i]!;
        }
        setBboxes(found);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-testid="slot-quick-jump"
      role="group"
      aria-label="Jump to"
      className="glass flex h-12 items-center gap-1 px-1.5"
    >
      {JUMPS.map((j) => (
        <button
          key={j.usps}
          type="button"
          title={`Fly to ${j.name}`}
          aria-label={`Fly to ${j.name}`}
          disabled={!map}
          onClick={() => map && flyToBBox(map, bboxes[j.stfp] ?? j.bbox)}
          className="h-9 rounded-chip px-2.5 text-caption font-semibold tracking-[0.06em] text-text-2 transition-colors duration-(--dur-hover) ease-(--ease-ui) hover:bg-highlight hover:text-text-1 disabled:opacity-50"
        >
          {j.usps}
        </button>
      ))}
    </div>
  );
}
