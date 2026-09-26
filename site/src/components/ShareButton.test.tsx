import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/store/useStore";
import { ShareButton } from "./ShareButton";

// Radix measures the tooltip with ResizeObserver, which jsdom lacks.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderButton() {
  return render(
    <TooltipProvider>
      <ShareButton />
    </TooltipProvider>,
  );
}

describe("ShareButton", () => {
  it("copies the current view with starred schools appended as fav", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    window.history.replaceState(null, "", "/?l=crime,education");
    useStore.setState({ layers: ["crime", "education"], favorites: ["010000500871", "060000000001"] });

    renderButton();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link to this view" })));

    const url = new URL(writeText.mock.calls[0]![0]);
    expect(url.searchParams.get("l")).toBe("crime,education");
    expect(url.searchParams.get("fav")).toBe("010000500871,060000000001");
    expect(screen.getByRole("button", { name: "Link copied" })).toBeTruthy();
  });

  it("shows the link for a manual copy when the clipboard is unavailable", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    useStore.setState({ layers: ["health"], favorites: [] });

    renderButton();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link to this view" })));

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe(`${window.location.origin}/?l=health`);
  });
});
