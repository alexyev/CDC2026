// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Footprints,
  Info,
  type LucideIcon,
  Scale,
  Search,
  Shapes,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useRef, useState } from "react";
import { BASEMAP_COLORS } from "@/basemap/theme";
import { LANDING_EXIT_MS, noteLandingExit } from "@/lib/guide";
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
  "inline-flex h-10 items-center gap-2 rounded-chip whitespace-nowrap bg-accent-brand px-4 text-chip font-semibold text-bg-0 transition-colors duration-(--dur-hover) ease-ui hover:bg-accent-strong [&_svg]:size-4";
export const SECONDARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-chip border border-border-strong whitespace-nowrap bg-white/[0.04] px-4 text-chip font-medium text-text-1 transition-colors duration-(--dur-hover) ease-ui hover:bg-white/[0.08] [&_svg]:size-4 [&_svg]:text-accent-brand";

// The landing takes its accent from the map's magenta ramp (--u5, hover --bv7) rather than the teal UI accent.
const LANDING_PRIMARY = "bg-u5 hover:bg-bv7";
const LANDING_SECONDARY = "[&_svg]:text-u5";

export function Primer() {
  const open = useStore((s) => s.guide === "primer");
  const setGuide = useStore((s) => s.setGuide);
  const reduceMotion = useReducedMotion() ?? false;
  // The guide to reading the map waits behind a disclosure, so the landing opens on one idea and its three actions.
  const [guideOpen, setGuideOpen] = useState(false);
  const guideRef = useRef<HTMLDivElement>(null);

  const close = (next: "tour" | null) => {
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
                className="fixed inset-0 z-50 overflow-y-auto overscroll-contain outline-none [scrollbar-width:thin] [--focus-ring:0_0_0_2px_rgba(224,104,192,0.7)]"
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

                  <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col px-8 pt-[clamp(48px,14vh,160px)]">
                    <header className="flex max-w-[800px] flex-col">
                      <DialogPrimitive.Title className="text-[clamp(40px,3.4vw,56px)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-text-1">
                        Community stress around 23,595 US public high schools
                      </DialogPrimitive.Title>
                      <p
                        id="primer-stress"
                        className="mt-6 max-w-[720px] text-[17px] leading-[1.6] text-pretty text-text-2"
                      >
                        Stress measures the conditions in the neighborhood around each school: economic hardship, adult
                        education, health, housing, and crime, from the Open Data Index for Schools (ODIS). It describes
                        the community, not the school or its students.
                      </p>
                      <p className="mt-3 text-chip leading-[1.6] text-text-3">
                        Higher means more stress. A percentile is the share of places with less stress.
                      </p>
                      <div className="mt-9 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={cn(PRIMARY_BUTTON, LANDING_PRIMARY, "h-11 px-5 text-title")}
                          onClick={() => close(null)}
                        >
                          Take me there
                          <ArrowRight aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={cn(SECONDARY_BUTTON, LANDING_SECONDARY, "h-11 px-5")}
                          onClick={() => close("tour")}
                        >
                          <Footprints aria-hidden />
                          Walk me through an example
                        </button>
                        <button
                          type="button"
                          className={cn(SECONDARY_BUTTON, LANDING_SECONDARY, "h-11 px-5")}
                          onClick={startStory}
                        >
                          <BookOpen aria-hidden />
                          Tell me the story
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-expanded={guideOpen}
                        aria-controls="primer-guide"
                        onClick={() => setGuideOpen((o) => !o)}
                        className="-mx-2 mt-10 inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-1 text-chip font-medium text-text-2 transition-colors duration-(--dur-hover) ease-ui hover:text-text-1"
                      >
                        How to read the map
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            "size-4 text-text-3 transition-transform duration-(--dur-hover) ease-ui",
                            guideOpen && "rotate-180",
                          )}
                        />
                      </button>
                    </header>

                    <AnimatePresence initial={false}>
                      {guideOpen && (
                        <motion.div
                          ref={guideRef}
                          id="primer-guide"
                          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                          animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } }}
                          exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
                          onAnimationStart={(definition) => {
                            if (definition === "exit") return;
                            guideRef.current?.scrollIntoView?.({
                              behavior: reduceMotion ? "auto" : "smooth",
                              block: "nearest",
                            });
                          }}
                          className="mt-8 grid scroll-mb-8 grid-cols-2 gap-x-14 gap-y-10 border-t border-border pt-10"
                        >
                          <Section icon={Shapes} title="What the layers measure">
                            <Points>
                              <li>
                                <B>Composite Score:</B> the weighted average of five 0 to 100 domains,{" "}
                                {DOMAINS.join(", ")}. On each, higher means more stress.
                              </li>
                              <li>
                                <B>Percentiles:</B> the 13th on Education has less stress than 87% of counties, the 90th
                                more than 90%.
                              </li>
                              <li>
                                <B>Gini index:</B> income inequality from 0 (equal) to 1, outside the Composite. Here
                                higher means more inequality; most schools sit between{" "}
                                <span className="whitespace-nowrap">0.43 and 0.48.</span>
                              </li>
                              <li>
                                <Badge>county</Badge> marks 8 measures, like Crime and Gini, known only per county.
                              </li>
                            </Points>
                          </Section>

                          <Section icon={Search} title="Reading one layer">
                            <div className="flex max-w-[280px] flex-col gap-1">
                              <div className="flex h-2 gap-0.5" aria-hidden>
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
                                <B>Brighter means more stress,</B> on fixed national fifths.
                              </li>
                              <li>
                                States when zoomed out, counties from zoom 5, school pins from{" "}
                                <span className="whitespace-nowrap">zoom 8.</span>
                              </li>
                              <li>
                                <NoDataSwatch /> Hatched means <B>no data</B>;{" "}
                                <span className="whitespace-nowrap">
                                  <FewSchoolsSwatch /> a dotted
                                </span>{" "}
                                outline means <B>fewer than 3 schools</B>.
                              </li>
                            </Points>
                          </Section>

                          <Section icon={Scale} title="Reading two layers">
                            <div className="flex items-center gap-5">
                              <MiniBivariate />
                              <ul className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-caption leading-4 text-text-2">
                                <Key color="var(--bv8)">High on both</Key>
                                <Key color="var(--bv6)">High A only</Key>
                                <Key color="var(--bv0)" ring>
                                  Low on both
                                </Key>
                                <Key color="var(--bv2)">High B only</Key>
                              </ul>
                            </div>
                            <Points>
                              <li>
                                <B>ρ</B> (Spearman, −1 to +1) above 0 means the layers rise together, not that one
                                drives the other. <B>n</B> under 10 is “too few”.
                              </li>
                              <li>
                                <B>Level matters:</B> Crime and Education give ρ = 0.17 by state, 0.40 by county, 0.24
                                by school.
                              </li>
                            </Points>
                          </Section>

                          <Section icon={Sparkles} title="Finding patterns">
                            <Points>
                              <li>
                                <B>Clusters</B> of neighbors sharing a color, like the bright South on the Composite,
                                and <B>outliers</B> that break from their neighbors.
                              </li>
                              <li>
                                <B>Compare</B> two states or counties by pinning them in the insight panel.
                              </li>
                              <li>
                                <B>Stories</B> under the layers narrate what the data says, from the nation to its
                                regions.
                              </li>
                              <li>ODIS is one snapshot in time, so patterns are about place, not change.</li>
                            </Points>
                          </Section>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <p className="mt-auto flex items-center gap-1 pt-12 text-caption text-text-3">
                      Reopen this page from the Schoolscape name at top left or the{" "}
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
          "radial-gradient(900px 560px at 12% 0%, rgba(169, 58, 156, 0.12), transparent 70%)",
          "radial-gradient(960px 640px at 92% 100%, rgba(224, 104, 192, 0.10), transparent 70%)",
          "linear-gradient(rgba(10, 12, 16, 0.78), rgba(10, 12, 16, 0.9))",
        ].join(", "),
      }}
    />
  );
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-title font-semibold tracking-tight text-text-1">
        <Icon aria-hidden className="size-4 text-u5" strokeWidth={2} />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Points({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col gap-2 text-body leading-[1.55] text-pretty text-text-2 [&>li]:relative [&>li]:pl-3.5 [&>li]:before:absolute [&>li]:before:top-[0.62em] [&>li]:before:left-0.5 [&>li]:before:size-1 [&>li]:before:rounded-full [&>li]:before:bg-text-3">
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
