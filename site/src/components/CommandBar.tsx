import { Check, CornerDownLeft, Layers, LoaderCircle, MapPinned, SearchX, Sparkles, WifiOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ApplyTarget, CommandResult, Execution } from "@/command/apply";
import type { Engine } from "@/command/remote";
import type { Resolver } from "@/command/resolver";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MinimizeButton } from "./Minimizable";
import { restorePanel, useMinimized } from "@/lib/panels";
import { COMMAND_SHORTCUT } from "@/lib/shortcut";
import { cn } from "@/lib/utils";
import type { PlaceRef } from "@/lib/types";
import { useMap } from "@/map/useMap";
import { useStore } from "@/store/useStore";
import { tabAcceptance, useTypewriter } from "./useTypewriter";

// The command modules pull in fuse.js and the gazetteer, so they load on first focus, not with the app shell.
const loadCommand = () => Promise.all([import("@/command/apply"), import("@/command/resolver")]);

const PLACEHOLDER_PREFIX = "Ask the map: ";
/** Requests the bar handles today (src/command/utterances.fixture.ts), typed out in turn while it sits empty. */
const EXAMPLES = [
  "compare crime and education in LA County and California",
  "show me poverty in Texas",
  "where is housing stress worst in the Bay Area",
  "percentile view of composite in Cook County Illinois",
  "Albertville High School",
  "Harris County vs Wake County on economic",
  "broadband access in Hawaii County",
  "unemployment in North Carolina",
] as const;
const NO_MATCH = "I couldn't find a layer or place in that. Try: crime in Texas";
/** How long the result chip stays before it fades (SPEC.md 3.13: "a brief chip"). */
const CHIP_MS = { applied: 5_000, degraded: 6_000, "no-match": 7_000 } as const;

type Status =
  | { state: "idle" }
  | { state: "parsing" }
  | { state: "result"; execution: Execution; result: CommandResult; choices: Record<number, PlaceRef> }
  | { state: "error"; message: string };

/** Natural-language command bar (SPEC.md 3.13, 14.5): text -> intent -> view state. */
export function CommandBar() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const { map, level } = useMap();
  const reducedMotion = useReducedMotion() ?? false;
  const statusId = useId();
  const [focused, setFocused] = useState(false);
  const minimized = useMinimized("command");
  // The typewriter runs only while the bar is empty, unfocused, and shown; focus swaps it for
  // the whole current example as a plain placeholder.
  const idle = !text && !focused && !minimized;
  const typewriter = useTypewriter(EXAMPLES, idle, reducedMotion);

  const applyTarget = useMemo<ApplyTarget>(
    () => ({
      update: (patch) => useStore.setState(patch),
      move: (move) => {
        void loadCommand().then(([{ moveMap, cameraForMove }]) => {
          // Before M1's map exists, the store camera stands in so the URL still reflects the command.
          if (map) moveMap(map, move, reducedMotion);
          else useStore.getState().setCamera(cameraForMove(move, window.innerWidth, window.innerHeight));
        });
      },
    }),
    [map, reducedMotion],
  );

  const warm = useCallback(() => {
    void loadCommand().then(([, { getResolver }]) =>
      getResolver().then(
        (r) => (resolverRef.current = r),
        () => {},
      ),
    );
  }, []);

  // ⌘K / Ctrl+K focuses the bar from anywhere, including other inputs, and restores it when minimized (SPEC.md 3.14).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        restorePanel("command");
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Result chips are brief; choices stay until answered.
  useEffect(() => {
    if (status.state !== "result" || status.result.status === "needs-choice" || status.result.status === "needs-layer")
      return;
    const timer = window.setTimeout(() => setStatus({ state: "idle" }), CHIP_MS[status.result.status]);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function submit() {
    const query = text.trim();
    if (!query) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ state: "parsing" });
    try {
      const [{ executeCommand }, { getResolver, peekResolver }] = await loadCommand();
      const view = useStore.getState();
      const selected = view.selected && peekResolver()?.lookup(view.selected);
      const execution = await executeCommand(query, {
        context: {
          level,
          layers: [...view.layers],
          ...(selected ? { selected: peekResolver()!.label(selected) } : {}),
        },
        selected: view.selected,
        resolver: getResolver(),
        target: applyTarget,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setStatus({ state: "result", execution, result: execution.result, choices: execution.choices });
      if (execution.result.status === "applied" || execution.result.status === "degraded") inputRef.current?.blur();
    } catch {
      if (controller.signal.aborted) return;
      setStatus({ state: "error", message: "Place names didn't load. Check the connection and try again." });
    }
  }

  async function choose(index: number, ref: PlaceRef) {
    if (status.state !== "result") return;
    const [{ runPlan }, { getResolver }] = await loadCommand();
    const resolver = resolverRef.current ?? (await getResolver());
    const choices = { ...status.choices, [index]: ref };
    const result = runPlan(status.execution.intent, resolver, applyTarget, status.execution.degraded, choices);
    setStatus({ state: "result", execution: status.execution, result, choices });
  }

  async function chooseLayer(index: number, id: string) {
    if (status.state !== "result") return;
    const [{ runPlan, withLayer }, { getResolver }] = await loadCommand();
    const resolver = resolverRef.current ?? (await getResolver());
    const execution = { ...status.execution, intent: withLayer(status.execution.intent, index, id) };
    const result = runPlan(execution.intent, resolver, applyTarget, execution.degraded, status.choices);
    setStatus({ state: "result", execution, result, choices: status.choices });
  }

  function clear() {
    abortRef.current?.abort();
    setText("");
    setStatus({ state: "idle" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const accepted = tabAcceptance(e, text, typewriter.example);
    if (accepted !== null) {
      e.preventDefault();
      setText(accepted);
      // The value lands on the next render; put the caret after it.
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(accepted.length, accepted.length));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (text || status.state !== "idle") clear();
      else inputRef.current?.blur();
    }
  }

  const parsing = status.state === "parsing";

  return (
    <div className="relative w-full" data-testid="command-bar">
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-card px-3 transition-[background-color,box-shadow] duration-200 ease-ui",
          "focus-within:bg-highlight focus-within:shadow-[var(--focus-ring)]",
        )}
      >
        {parsing ? (
          <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-accent-brand" />
        ) : (
          <Sparkles aria-hidden className="size-4 shrink-0 text-accent-brand" />
        )}
        <div className="relative h-full min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (status.state === "result" || status.state === "error") setStatus({ state: "idle" });
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              warm();
            }}
            onBlur={() => setFocused(false)}
            placeholder={focused ? PLACEHOLDER_PREFIX + typewriter.example : undefined}
            name="ask-the-map"
            aria-label="Ask the map"
            aria-describedby={statusId}
            aria-busy={parsing}
            maxLength={300}
            spellCheck={false}
            autoComplete="off"
            className="h-full w-full bg-transparent text-chip text-ellipsis text-text-1 outline-none placeholder:text-body placeholder:text-text-3 focus-visible:shadow-none"
          />
          {idle && (
            <span
              aria-hidden
              data-testid="command-typewriter"
              className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-body whitespace-nowrap text-text-3"
            >
              <span className="min-w-0 truncate whitespace-pre">
                {PLACEHOLDER_PREFIX}
                {typewriter.shown}
              </span>
              {!reducedMotion && <span className="ml-px h-4 w-px shrink-0 animate-caret bg-text-3" />}
            </span>
          )}
        </div>
        {text && !parsing ? (
          <kbd className="flex h-6 shrink-0 items-center gap-1 rounded-chip border border-border-strong px-1.5 font-sans text-badge text-text-2">
            <CornerDownLeft aria-hidden className="size-3" />
            Enter
          </kbd>
        ) : focused && !parsing ? (
          <kbd
            data-testid="command-tab-hint"
            title="Tab fills in the example"
            className="flex h-6 shrink-0 items-center rounded-chip border border-border-strong px-1.5 font-sans text-badge text-text-3"
          >
            Tab
          </kbd>
        ) : (
          !parsing && (
            <kbd className="flex h-6 shrink-0 items-center rounded-chip border border-border-strong px-1.5 font-sans text-badge tracking-[0.06em] text-text-3">
              {COMMAND_SHORTCUT}
            </kbd>
          )
        )}
        <MinimizeButton panel="command" label="Ask the map" className="-mr-2 -ml-1" />
      </div>

      <div
        id={statusId}
        aria-live="polite"
        className="pointer-events-none absolute top-full left-1/2 mt-3 flex w-max max-w-[720px] -translate-x-1/2 justify-center [&>*]:pointer-events-auto"
      >
        <AnimatePresence mode="wait">
          {status.state === "result" && (
            <StatusChip
              key={JSON.stringify(status.result)}
              result={status.result}
              note={
                status.result.status === "applied" || status.result.status === "degraded"
                  ? status.result.note
                  : undefined
              }
              engine={status.execution.engine}
              reducedMotion={reducedMotion}
              onChoose={choose}
              onChooseLayer={chooseLayer}
            />
          )}
          {status.state === "error" && (
            <Chip key="error" reducedMotion={reducedMotion} icon={<SearchX className="size-3.5 text-mark-b" />}>
              {status.message}
            </Chip>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Chip({
  icon,
  children,
  reducedMotion,
  className,
}: {
  icon: ReactNode;
  children: ReactNode;
  reducedMotion: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        "glass glass-strong flex max-w-full items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2.5 text-body text-text-1 shadow-panel",
        className,
      )}
    >
      <span aria-hidden className="flex shrink-0">
        {icon}
      </span>
      {children}
    </motion.div>
  );
}

/** Which engine read the request; the local parser shows as "offline parse" instead. */
const ENGINE_NAMES: Record<Exclude<Engine, "local">, string> = { jev: "Jev", claude: "Claude" };

function EngineTag({ engine }: { engine: Exclude<Engine, "local"> }) {
  return (
    <span data-testid="command-engine" className="shrink-0 text-badge whitespace-nowrap text-text-3">
      powered by {ENGINE_NAMES[engine]}
    </span>
  );
}

function ChoiceButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-testid="command-choice"
      onClick={onClick}
      className="h-7 rounded-full border border-border-strong bg-highlight px-2.5 text-caption whitespace-nowrap text-text-1 transition-colors duration-200 ease-ui hover:border-accent-brand hover:bg-accent-dim"
    >
      {children}
    </button>
  );
}

function StatusChip({
  result,
  note,
  engine,
  reducedMotion,
  onChoose,
  onChooseLayer,
}: {
  result: CommandResult;
  note?: string;
  engine: Engine;
  reducedMotion: boolean;
  onChoose: (index: number, ref: PlaceRef) => void;
  onChooseLayer: (index: number, id: string) => void;
}) {
  switch (result.status) {
    case "applied":
    case "degraded": {
      const chip = (
        <Chip
          reducedMotion={reducedMotion}
          icon={
            result.status === "applied" ? (
              <Check className="size-3.5 text-accent-brand" />
            ) : (
              <WifiOff className="size-3.5 text-text-2" />
            )
          }
        >
          <span data-testid="command-summary" className="truncate tabular">
            {result.summary}
          </span>
          {result.status === "degraded" && (
            <span className="shrink-0 rounded-full border border-border-strong px-1.5 py-px text-badge tracking-[0.06em] text-text-2 uppercase">
              offline parse
            </span>
          )}
          {engine !== "local" && <EngineTag engine={engine} />}
        </Chip>
      );
      if (!note) return chip;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="max-w-full">{chip}</div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={6}
            className="max-w-[320px] rounded-card border border-border-strong bg-surface-strong px-3 py-2 text-caption text-text-1 [&_svg]:hidden"
          >
            {note}
          </TooltipContent>
        </Tooltip>
      );
    }
    case "needs-choice":
      return (
        <Chip reducedMotion={reducedMotion} icon={<MapPinned className="size-3.5 text-mark-a" />} className="pr-2.5">
          <span className="shrink-0 text-text-2">Which {result.place}?</span>
          <span className="flex items-center gap-1">
            {result.candidates.map((ref, i) => (
              <ChoiceButton key={`${ref.kind}:${ref.id}`} onClick={() => onChoose(result.placeIndex, ref)}>
                {result.labels[i]}
              </ChoiceButton>
            ))}
          </span>
          {engine !== "local" && <EngineTag engine={engine} />}
        </Chip>
      );
    case "needs-layer":
      return (
        <Chip reducedMotion={reducedMotion} icon={<Layers className="size-3.5 text-mark-a" />} className="pr-2.5">
          <span className="shrink-0 text-text-2">Which measure?</span>
          <span className="flex items-center gap-1">
            {result.layers.map((id, i) => (
              <ChoiceButton key={id} onClick={() => onChooseLayer(result.layerIndex, id)}>
                {result.labels[i]}
              </ChoiceButton>
            ))}
          </span>
          {engine !== "local" && <EngineTag engine={engine} />}
        </Chip>
      );
    case "no-match":
      return (
        <Chip reducedMotion={reducedMotion} icon={<SearchX className="size-3.5 text-mark-b" />}>
          <span data-testid="command-no-match">{NO_MATCH}</span>
        </Chip>
      );
  }
}
