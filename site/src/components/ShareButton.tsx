// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shareUrl } from "@/lib/urlSync";
import { cn } from "@/lib/utils";

const COPIED_MS = 1800;

/**
 * Copies a permalink to the current view, with starred schools appended as `fav` (SPEC.md 3.10, 3.12).
 * Where the clipboard is unavailable, the link opens selected in a popover for a manual copy.
 */
export function ShareButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const share = async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setFallbackUrl(url);
      return;
    }
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const label = copied ? "Link copied" : "Copy link to this view";

  return (
    <Popover open={fallbackUrl !== null} onOpenChange={(open) => !open && setFallbackUrl(null)}>
      <Tooltip open={copied || hovered} onOpenChange={setHovered}>
        <PopoverAnchor asChild>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "glass size-12 text-text-2 hover:text-text-1",
                copied && "text-accent-brand hover:text-accent-brand",
                className,
              )}
              aria-label={label}
              data-testid="share-button"
              onClick={() => void share()}
            >
              {copied ? <Check /> : <Link2 />}
            </Button>
          </TooltipTrigger>
        </PopoverAnchor>
        <TooltipContent
          side="bottom"
          sideOffset={8}
          className="rounded-chip border border-border bg-surface-strong px-2.5 py-1.5 text-caption text-text-1 [&>span]:hidden"
        >
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="glass glass-strong w-[360px] rounded-card p-3"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const input = (e.currentTarget as HTMLElement).querySelector("input");
          input?.focus();
          input?.select();
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-caption text-text-2">Copy this link to share the view</span>
          <input
            readOnly
            value={fallbackUrl ?? ""}
            className="h-9 rounded-chip border border-border-strong bg-bg-0/60 px-3 font-mono text-caption text-text-1 outline-none selection:bg-accent-dim selection:text-text-1"
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
