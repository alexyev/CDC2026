import { ArrowRight, Footprints, Info, type LucideIcon, Scale, Search, Shapes, Sparkles } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { markPrimerSeen } from "@/lib/guide";
import { useStore } from "@/store/useStore";

// The primer (SPEC.md 3.15): a one-minute guide shown over the map on a first visit, before the map is used.
// Every number in it comes from the shipped data (national.json, breaks.json) or SPEC.md section 2.

const DOMAINS = ["Economic", "Education", "Health", "Housing", "Crime"] as const;

/** The primer's action buttons, shared with the guided tour so both read as one guide. */
export const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-chip bg-accent-brand px-4 text-chip font-semibold text-bg-0 transition-colors duration-(--dur-hover) ease-ui hover:bg-accent-strong [&_svg]:size-4";
export const SECONDARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-chip border border-border-strong bg-white/[0.04] px-4 text-chip font-medium text-text-1 transition-colors duration-(--dur-hover) ease-ui hover:bg-white/[0.08] [&_svg]:size-4 [&_svg]:text-accent-brand";

export function Primer() {
  const open = useStore((s) => s.guide === "primer");
  const setGuide = useStore((s) => s.setGuide);

  const close = (next: "tour" | null) => {
    markPrimerSeen();
    setGuide(next);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && close(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="primer-overlay"
          className="fixed inset-0 z-50 bg-bg-0/60 backdrop-blur-[3px] duration-[280ms] ease-ui data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        />
        <DialogPrimitive.Content
          data-testid="primer"
          aria-describedby="primer-stress"
          onOpenAutoFocus={(event) => {
            // Focus the guide itself, not its first button, so no focus ring greets a first-time visitor.
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
          }}
          className="glass glass-strong fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[min(1000px,calc(100vw-64px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none duration-[280ms] ease-ui data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-bottom-2 motion-reduce:animate-none"
        >
          <div className="min-h-0 overflow-y-auto overscroll-contain px-8 pt-6 pb-6 [scrollbar-width:thin]">
            <header className="flex flex-col gap-3">
              <p className="text-badge font-medium tracking-[0.06em] text-text-3 uppercase">
                Schoolscape · how to read the map
              </p>
              <DialogPrimitive.Title className="max-w-[760px] text-score leading-[1.15] font-semibold tracking-tight text-balance text-text-1">
                Community stress around 23,595 US public high schools
              </DialogPrimitive.Title>
              <div
                id="primer-stress"
                className="rounded-card border border-accent-brand/25 bg-accent-dim/50 px-4 py-3 text-chip leading-[1.5] text-text-2"
              >
                <strong className="font-semibold text-text-1">What “stress” means.</strong> The Open Data Index for
                Schools (ODIS) measures adverse social and economic conditions in the neighborhood around each school:
                economic hardship, lower adult education, health risks, housing strain, and crime, from census, health,
                and crime data. It is not psychological stress, and it does not measure the school or its students.{" "}
                <strong className="font-semibold text-text-1">Higher always means more adverse conditions.</strong>
              </div>
            </header>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Card icon={Shapes} title="What the layers measure">
                <Points>
                  <li>
                    <B>Composite Score</B> is the weighted average of five domain scores, each 0 to 100:{" "}
                    {DOMAINS.join(", ")}.
                  </li>
                  <li>
                    <B>Gini index</B> is income inequality, from 0 (equal incomes) to 1. It is not part of the
                    Composite, and most schools sit between 0.43 and 0.48, so small differences matter.
                  </li>
                  <li>
                    <Badge>county</Badge> marks 8 measures, including Crime and Gini, that exist only per county: every
                    school in a county shares its value.
                  </li>
                </Points>
              </Card>

              <Card icon={Search} title="Reading one layer">
                <div className="flex flex-col gap-1">
                  <div className="flex h-2.5 gap-0.5" aria-hidden>
                    {[1, 2, 3, 4, 5].map((k) => (
                      <span
                        key={k}
                        className="flex-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] first:rounded-l-[3px] last:rounded-r-[3px]"
                        style={{ background: `var(--u${k})` }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-badge tracking-[0.06em] text-text-3 uppercase">
                    <span>Lower stress</span>
                    <span>Higher stress</span>
                  </div>
                </div>
                <Points>
                  <li>
                    <B>Brighter means more stress.</B> The colors are fixed national fifths, never rescaled to your
                    view, so a color means the same thing everywhere.
                  </li>
                  <li>
                    Zoomed out, each state shows the average of its schools; from zoom 5, counties; from zoom 8, every
                    school as a pin.
                  </li>
                  <li>
                    <NoDataSwatch /> <B>No data</B> is hatched, never colored. <FewSchoolsSwatch /> A dotted outline
                    means <B>fewer than 3 schools</B>.
                  </li>
                </Points>
              </Card>

              <Card icon={Scale} title="Reading two layers">
                <div className="flex items-center gap-4">
                  <MiniBivariate />
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-caption leading-4 text-text-2">
                    <Key color="var(--bv8)">High on both</Key>
                    <Key color="var(--bv0)" ring>
                      Low on both
                    </Key>
                    <Key color="var(--bv6)">High A only</Key>
                    <Key color="var(--bv2)">High B only</Key>
                  </ul>
                </div>
                <Points>
                  <li>
                    The insight panel gives <B>ρ</B> (Spearman), −1 to +1: above 0 the layers rise together. <B>n</B> is
                    the units used; under 10 it says “too few”.
                  </li>
                  <li>
                    <B>The level changes the answer:</B> Crime and Education give ρ = 0.17 across states, 0.40 across
                    counties, and 0.24 across schools.
                  </li>
                  <li>
                    <B>Correlation is not causation:</B> rising together does not mean one drives the other.
                  </li>
                </Points>
              </Card>

              <Card icon={Sparkles} title="Finding patterns">
                <Points>
                  <li>
                    <B>Clusters:</B> neighbors sharing a color, like the bright South on the Composite Score.
                  </li>
                  <li>
                    <B>Outliers:</B> an area whose color breaks from its neighbors. Hover it for its values.
                  </li>
                  <li>
                    <B>Compare:</B> pin two states or counties in the insight panel to set them side by side.
                  </li>
                  <li>
                    <B>Stories:</B> the chips under the layers open ready-made views.
                  </li>
                </Points>
                <p className="text-caption leading-[1.45] text-text-3">
                  ODIS is one snapshot in time, so these patterns are about place, not change over time.
                </p>
              </Card>
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-border px-8 py-4">
            <p className="flex items-center gap-1 text-caption text-text-3">
              Reopen this guide from the <Info aria-label="About" className="size-3.5 text-text-2" /> button at top
              right.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className={SECONDARY_BUTTON} onClick={() => close("tour")}>
                <Footprints aria-hidden />
                Walk me through an example
              </button>
              <button type="button" className={PRIMARY_BUTTON} onClick={() => close(null)}>
                Explore the map
                <ArrowRight aria-hidden />
              </button>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Card({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-white/[0.02] p-4">
      <h2 className="flex items-center gap-2 text-title font-semibold tracking-tight text-text-1">
        <Icon aria-hidden className="size-4 text-accent-brand" strokeWidth={2} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Points({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col gap-1.5 text-body leading-[1.5] text-text-2 [&>li]:relative [&>li]:pl-3.5 [&>li]:before:absolute [&>li]:before:top-[0.62em] [&>li]:before:left-0.5 [&>li]:before:size-1 [&>li]:before:rounded-full [&>li]:before:bg-text-3">
      {children}
    </ul>
  );
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-text-1">{children}</strong>;
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="mr-0.5 inline-block rounded-full border border-border-strong px-1.5 align-[1px] text-badge leading-4 tracking-[0.06em] text-text-2 uppercase">
      {children}
    </span>
  );
}

function NoDataSwatch() {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-3.5 rounded-[2px] align-[-1px]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(-45deg, var(--nodata-hatch) 0 1px, transparent 1px 4px), linear-gradient(var(--nodata-fill), var(--nodata-fill))",
        boxShadow: "inset 0 0 0 1px var(--border-strong)",
      }}
    />
  );
}

function FewSchoolsSwatch() {
  return (
    <span
      aria-hidden
      className="ml-1 inline-block h-2.5 w-3.5 rounded-[2px] border border-dotted border-(--thin-outline) align-[-1px]"
      style={{ backgroundColor: "var(--u2)" }}
    />
  );
}

function Key({ color, ring, children }: { color: string; ring?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className={`size-2.5 shrink-0 rounded-[3px] ${ring ? "ring-1 ring-border-strong" : ""}`}
        style={{ background: color }}
      />
      {children}
    </li>
  );
}

/** A small 3x3 key: A (magenta) up the side, B (teal) along the bottom, class index 3 * a + b (SPEC.md 9.2). */
function MiniBivariate() {
  return (
    <div className="grid grid-cols-[auto_auto] items-center gap-1.5" role="img" aria-label="Bivariate color key">
      <span className="text-badge leading-none font-semibold text-u5">A ↑</span>
      <div className="grid grid-cols-3 gap-[2px]">
        {[2, 1, 0].flatMap((a) =>
          [0, 1, 2].map((b) => (
            <span key={`${a}${b}`} className="size-4 rounded-[3px]" style={{ background: `var(--bv${3 * a + b})` }} />
          )),
        )}
      </div>
      <span />
      <span className="text-badge leading-none font-semibold text-bv2">B →</span>
    </div>
  );
}
