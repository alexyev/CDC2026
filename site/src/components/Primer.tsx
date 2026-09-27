import { ArrowRight, BookOpen, Footprints, Info, type LucideIcon, Scale, Search, Shapes, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { BASEMAP_COLORS } from "@/basemap/theme";
import { LANDING_EXIT_MS, markPrimerSeen, noteLandingExit } from "@/lib/guide";
import { load } from "@/lib/loaders";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";

// The primer (SPEC.md 3.15): a one-minute landing page shown before the map on a first visit, which then gives way
// to the map on the same page. Every number in it comes from the shipped data (national.json, breaks.json) or
// SPEC.md section 2.

const EASE = [0.2, 0.8, 0.2, 1] as const;

const DOMAINS = ["Economic", "Education", "Health", "Housing", "Crime"] as const;

/** The primer's action buttons, shared with the guided tour so both read as one guide. */
export const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-chip bg-accent-brand px-4 text-chip font-semibold text-bg-0 transition-colors duration-(--dur-hover) ease-ui hover:bg-accent-strong [&_svg]:size-4";
export const SECONDARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-chip border border-border-strong bg-white/[0.04] px-4 text-chip font-medium text-text-1 transition-colors duration-(--dur-hover) ease-ui hover:bg-white/[0.08] [&_svg]:size-4 [&_svg]:text-accent-brand";

export function Primer() {
  const open = useStore((s) => s.guide === "primer");
  const setGuide = useStore((s) => s.setGuide);
  const reduceMotion = useReducedMotion() ?? false;

  const close = (next: "tour" | null) => {
    markPrimerSeen();
    noteLandingExit();
    setGuide(next);
  };

  // The same transition into the map, then the first story; its card steps through the rest (SPEC.md 3.8).
  const startStory = () => {
    close(null);
    load("presets").then(
      (f) => f.presets[0] && useStore.getState().applyPreset(f.presets[0].id),
      () => {},
    );
  };

  // The page opens on the landing without an entrance; reopening it from About fades it back over the map.
  const page: Variants = {
    shown: { opacity: 1, transition: { duration: reduceMotion ? 0.3 : 0.4, ease: EASE } },
    gone: {
      opacity: 0,
      transition: reduceMotion
        ? { duration: LANDING_EXIT_MS.reduced / 1000, ease: EASE }
        : { duration: 0.6, delay: 0.2, ease: EASE },
    },
  };
  const content: Variants = {
    shown: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.4, ease: EASE } },
    gone: { opacity: 0, y: reduceMotion ? 0 : -24, transition: { duration: reduceMotion ? 0 : 0.4, ease: EASE } },
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && close(null)}>
      <AnimatePresence initial={false}>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Content
              asChild
              forceMount
              aria-describedby="primer-stress"
              onOpenAutoFocus={(event) => {
                // Focus the page itself, not its first button, so no focus ring greets a first-time visitor.
                event.preventDefault();
                (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
              }}
            >
              <motion.div
                data-testid="primer"
                variants={page}
                initial="gone"
                animate="shown"
                exit="gone"
                className="fixed inset-0 z-50 overflow-y-auto overscroll-contain outline-none [scrollbar-width:thin]"
              >
                <Backdrop />
                <motion.div variants={content} className="relative flex min-h-full flex-col px-4 pb-8">
                  {/* The brand sits exactly where the top bar's brand lands, so it stays put through the transition. */}
                  <div
                    className="mt-[19px] flex h-[50px] w-fit shrink-0 items-center rounded-panel border border-border px-4 shadow-panel"
                    style={{ backgroundColor: BASEMAP_COLORS.background }}
                  >
                    <span className="text-title font-semibold tracking-tight text-text-1">Schoolscape</span>
                  </div>

                  <div className="mx-auto my-auto flex w-full max-w-[1440px] flex-col gap-7 px-8 pt-8">
                    <header className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-x-12 gap-y-4">
                      <div className="flex flex-col gap-4">
                        <p className="flex items-center gap-2 text-badge font-medium tracking-[0.08em] text-accent-brand uppercase">
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full bg-accent-brand shadow-[0_0_10px_var(--accent)]"
                          />
                          How to read the map
                        </p>
                        <DialogPrimitive.Title className="text-[clamp(40px,3vw,56px)] leading-[1.08] font-semibold tracking-[-0.02em] text-balance text-text-1">
                          Community stress around 23,595 US public high schools
                        </DialogPrimitive.Title>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            className={cn(PRIMARY_BUTTON, "h-11 px-5 text-title")}
                            onClick={() => close(null)}
                          >
                            Take me there
                            <ArrowRight aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={cn(SECONDARY_BUTTON, "h-11 px-5")}
                            onClick={() => close("tour")}
                          >
                            <Footprints aria-hidden />
                            Walk me through an example
                          </button>
                          <button type="button" className={cn(SECONDARY_BUTTON, "h-11 px-5")} onClick={startStory}>
                            <BookOpen aria-hidden />
                            Tell me the story
                          </button>
                        </div>
                      </div>
                      <div
                        id="primer-stress"
                        className="flex flex-col gap-2.5 rounded-card border border-accent-brand/25 bg-accent-dim/40 px-5 py-4 text-chip leading-[1.55] text-text-2"
                      >
                        <p>
                          <strong className="font-semibold text-text-1">What “stress” means.</strong> The Open Data
                          Index for Schools (ODIS) measures adverse social and economic conditions in the neighborhood
                          around each school: hardship, adult education, health, housing, and crime. It is not
                          psychological stress, and it does not measure the school or its students.
                        </p>
                        <p>
                          <strong className="font-semibold text-text-1">
                            Higher means more stress, for every domain and the Composite. A percentile is the share of
                            places with less stress:
                          </strong>{" "}
                          the 13th on Education means less than 87% of counties (among the least challenged), the 90th
                          more than 90% (among the most). Gini is the exception: higher means more inequality.
                        </p>
                      </div>
                    </header>

                    <div className="grid grid-cols-4 gap-3">
                      <Card icon={Shapes} title="What the layers measure">
                        <Points>
                          <li>
                            <B>Composite Score</B> is the weighted average of five 0 to 100 domain scores:{" "}
                            {DOMAINS.join(", ")}.
                          </li>
                          <li>
                            <B>Gini index</B> is income inequality, from 0 (equal incomes) to 1, and not part of the
                            Composite. Most schools sit between 0.43 and 0.48.
                          </li>
                          <li>
                            <Badge>county</Badge> marks 8 measures, like Crime and Gini, known only per county.
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
                            <B>Brighter means more stress,</B> on fixed national fifths that mean the same everywhere.
                          </li>
                          <li>States when zoomed out, counties from zoom 5, school pins from zoom 8.</li>
                          <li>
                            <NoDataSwatch /> <B>No data</B> is hatched, never colored.{" "}
                            <span className="whitespace-nowrap">
                              <FewSchoolsSwatch /> A dotted
                            </span>{" "}
                            outline means <B>fewer than 3 schools</B>.
                          </li>
                        </Points>
                      </Card>

                      <Card icon={Scale} title="Reading two layers">
                        <div className="flex items-center gap-4">
                          <MiniBivariate />
                          <ul className="flex flex-col gap-1.5 text-caption leading-4 text-text-2">
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
                            <B>ρ</B> (Spearman, −1 to +1) above 0 means the layers rise together, not that one drives
                            the other. <B>n</B> under 10 is “too few”.
                          </li>
                          <li>
                            <B>Level matters:</B> Crime and Education give ρ = 0.17 by state, 0.40 by county, 0.24 by
                            school.
                          </li>
                        </Points>
                      </Card>

                      <Card icon={Sparkles} title="Finding patterns">
                        <Points>
                          <li>
                            <B>Clusters:</B> neighbors sharing a color, like the bright South on the Composite.
                          </li>
                          <li>
                            <B>Outliers:</B> an area whose color breaks from its neighbors.
                          </li>
                          <li>
                            <B>Compare:</B> pin two states or counties in the insight panel.
                          </li>
                          <li>
                            <B>Stories:</B> the narrated views under the layers walk through what the data says, from
                            the nation down to its regions.
                          </li>
                        </Points>
                        <p className="text-caption leading-[1.45] text-text-3">
                          ODIS is one snapshot in time, so these patterns are about place, not change over time.
                        </p>
                      </Card>
                    </div>

                    <p className="flex items-center gap-1 text-caption text-text-3">
                      Reopen this guide from the Schoolscape name at top left or the{" "}
                      <Info aria-label="About" className="size-3.5 text-text-2" /> button at top right.
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/** The landing's own backdrop: the map, blurred and dimmed underneath (see .shell-map), under a brand-lit vignette. */
function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        background: [
          "radial-gradient(900px 560px at 12% 0%, rgba(46, 230, 197, 0.10), transparent 70%)",
          "radial-gradient(960px 640px at 92% 100%, rgba(224, 104, 192, 0.10), transparent 70%)",
          "linear-gradient(rgba(10, 12, 16, 0.78), rgba(10, 12, 16, 0.9))",
        ].join(", "),
      }}
    />
  );
}

function Card({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-border bg-white/[0.02] px-4 py-3.5">
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
      className="inline-block h-2.5 w-3.5 rounded-[2px] border border-dotted border-(--thin-outline) align-[-1px]"
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
