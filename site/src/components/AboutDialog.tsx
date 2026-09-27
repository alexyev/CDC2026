import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Compass, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ABOUT_ID_PREFIX as ID_PREFIX, aboutContent as content } from "@/content/about";
import { type Block, type Inline } from "@/content/markdown";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scrolls the dialog's content so the element with `id` sits just below the top edge. */
function scrollToSection(root: HTMLElement | null, id: string, smooth: boolean) {
  const el = document.getElementById(id);
  if (!root || !el) return;
  const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 24;
  root.scrollTo({ top, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
}

/**
 * About and Data (SPEC.md 15): a modal on the same URL, open while the store's `about` flag is set
 * (the URL's `about=1`), opened by the top bar's About button or the `?` key (SPEC.md 3.14, appShortcuts.ts).
 */
export function AboutDialog() {
  const open = useStore((s) => s.about);
  const setAbout = useStore((s) => s.setAbout);
  const setGuide = useStore((s) => s.setGuide);
  // State, not a ref: the portal mounts the scroll area after this component's first effects run.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState<string | undefined>(content.sections[0]?.id);

  // Scroll spy: the active section is the last one whose heading has passed the top third of the scroll area.
  useEffect(() => {
    const root = scrollEl;
    if (!root) return;
    const onScroll = () => {
      const limit = root.getBoundingClientRect().top + root.clientHeight / 3;
      let current: string | undefined = content.sections[0]?.id;
      for (const section of content.sections) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= limit) current = section.id;
      }
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) current = content.sections.at(-1)?.id;
      setActive(current);
    };
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [scrollEl]);

  // Deep link: opening with `#about-connecticut` in the URL lands on that section (SPEC.md 7, Connecticut profiles).
  useEffect(() => {
    if (!scrollEl) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash.startsWith(ID_PREFIX)) scrollToSection(scrollEl, hash, false);
  }, [scrollEl]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setAbout}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="about-overlay"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] duration-[280ms] ease-ui data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        />
        <DialogPrimitive.Content
          data-testid="slot-about-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Focus the text, not the close button, so arrow keys and space scroll it right away.
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)
              ?.querySelector<HTMLElement>("[data-testid=about-scroll]")
              ?.focus({ preventScroll: true });
          }}
          className="glass glass-strong fixed top-1/2 left-1/2 z-50 flex h-[min(720px,calc(100vh-96px))] w-[min(880px,calc(100vw-64px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none duration-[280ms] ease-ui data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:slide-in-from-bottom-2 motion-reduce:animate-none"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
            <span aria-hidden className="size-2.5 rounded-full bg-accent-brand shadow-[0_0_12px_var(--accent)]" />
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-title font-semibold tracking-tight text-text-1">
                {content.title}
              </DialogPrimitive.Title>
              <p className="text-caption text-text-3">About the map, the data, and the method</p>
            </div>
            <button
              type="button"
              data-testid="open-primer"
              onClick={() => {
                setAbout(false);
                setGuide("primer");
              }}
              className="inline-flex h-9 items-center gap-2 rounded-chip border border-border-strong bg-white/[0.04] px-3 text-body font-medium text-text-1 transition-colors duration-[120ms] hover:bg-white/[0.08]"
            >
              <Compass aria-hidden className="size-4 text-accent-brand" />
              How to read the map
            </button>
            <DialogPrimitive.Close
              aria-label="Close"
              className="grid size-9 place-items-center rounded-chip text-text-2 transition-colors duration-[120ms] hover:bg-white/6 hover:text-text-1"
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr]">
            <nav aria-label="About sections" className="border-r border-border px-3 py-5">
              <ul className="flex flex-col gap-0.5">
                {content.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      aria-current={active === section.id ? "location" : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        scrollToSection(scrollEl, section.id, true);
                      }}
                      className={cn(
                        "relative block rounded-chip px-3 py-1.5 text-body transition-colors duration-[120ms]",
                        active === section.id
                          ? "bg-white/5 text-text-1 before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent-brand"
                          : "text-text-2 hover:bg-white/[0.03] hover:text-text-1",
                      )}
                    >
                      {renderInline(section.title)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div
              ref={setScrollEl}
              tabIndex={-1}
              data-testid="about-scroll"
              className="min-h-0 overflow-y-auto overscroll-contain outline-none focus-visible:shadow-none"
            >
              <article className="max-w-[600px] px-8 pt-5 pb-10">
                {content.intro.map((block, i) => renderBlock(block, i))}
                {content.sections.map((section, i) => (
                  <section
                    key={section.id}
                    aria-labelledby={section.id}
                    className={cn("flex flex-col gap-3", i > 0 && "mt-7 border-t border-border pt-6")}
                  >
                    <h2 id={section.id} className="text-title font-semibold tracking-tight text-text-1">
                      {renderInline(section.title)}
                    </h2>
                    {section.blocks.map((block, j) => renderBlock(block, j))}
                  </section>
                ))}
              </article>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case "heading":
      return (
        <h3
          key={key}
          id={ID_PREFIX + block.id}
          className="mt-2 text-badge font-semibold tracking-[0.06em] text-text-3 uppercase"
        >
          {renderInline(block.children)}
        </h3>
      );
    case "paragraph":
      return (
        <p key={key} className="text-body leading-[1.55] text-text-2">
          {renderInline(block.children)}
        </p>
      );
    case "list":
      return (
        <ul key={key} className="flex flex-col gap-1.5">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="relative pl-4 text-body leading-[1.55] text-text-2 before:absolute before:top-[0.6em] before:left-0.5 before:size-1 before:rounded-full before:bg-text-3"
            >
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    case "directive":
      return block.name === "bivariate-legend" ? <BivariateKey key={key} /> : null;
  }
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Fragment key={i}>{node.value}</Fragment>;
      case "strong":
        return (
          <strong key={i} className="font-semibold text-text-1">
            {renderInline(node.children)}
          </strong>
        );
      case "em":
        return <em key={i}>{renderInline(node.children)}</em>;
      case "code":
        return (
          <span
            key={i}
            className="mx-0.5 inline-block rounded-[4px] border border-border-strong px-1 align-[1px] text-badge leading-[1.4] font-medium tracking-[0.06em] text-text-2 uppercase"
          >
            {node.value}
          </span>
        );
      case "link": {
        const external = /^https?:/.test(node.href);
        return (
          <a
            key={i}
            href={node.href}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="text-accent-brand underline decoration-accent-brand/35 underline-offset-2 transition-colors duration-[120ms] hover:text-accent-strong hover:decoration-accent-strong"
          >
            {renderInline(node.children)}
          </a>
        );
      }
    }
  });
}

/** The 3x3 bivariate key (SPEC.md 9.2): A up the vertical axis, B across the horizontal, class index 3 * a + b. */
function BivariateKey() {
  const rows = [2, 1, 0];
  const cols = [0, 1, 2];
  const names = ["low", "mid", "high"];
  return (
    <figure className="my-1 flex items-center gap-5 rounded-card border border-border bg-white/[0.02] px-5 py-4">
      <div className="flex items-stretch gap-2">
        <span className="rotate-180 text-center text-badge font-medium tracking-[0.06em] text-u5 uppercase [writing-mode:vertical-rl]">
          A · primary →
        </span>
        <div className="flex flex-col gap-1.5">
          <div role="img" aria-label="Bivariate color key" className="grid grid-cols-3 gap-[3px]">
            {rows.flatMap((a) =>
              cols.map((b) => (
                <span
                  key={`${a}${b}`}
                  title={`A ${names[a]}, B ${names[b]}`}
                  className="size-7 rounded-[4px]"
                  style={{ background: `var(--bv${3 * a + b})` }}
                />
              )),
            )}
          </div>
          <span className="text-badge font-medium tracking-[0.06em] text-bv2 uppercase">B · secondary →</span>
        </div>
      </div>
      <figcaption className="flex flex-col gap-1.5 text-caption leading-[1.45] text-text-2">
        <span>
          <span className="inline-block size-2.5 translate-y-px rounded-[3px] bg-bv6" /> High A, low B
        </span>
        <span>
          <span className="inline-block size-2.5 translate-y-px rounded-[3px] bg-bv2" /> Low A, high B
        </span>
        <span>
          <span className="inline-block size-2.5 translate-y-px rounded-[3px] bg-bv8" /> High on both
        </span>
        <span>
          <span className="inline-block size-2.5 translate-y-px rounded-[3px] bg-bv0 ring-1 ring-border-strong" /> Low
          on both
        </span>
      </figcaption>
    </figure>
  );
}
