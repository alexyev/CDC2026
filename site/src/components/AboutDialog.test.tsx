// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/store/useStore";
import { AboutDialog } from "./AboutDialog";
import { useAboutKey } from "./appShortcuts";

/** App mounts the `?` shortcut once, apart from the dialog, which loads on first use. */
function AboutKey() {
  useAboutKey();
  return null;
}

beforeEach(() => {
  useStore.getState().setAbout(false);
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("AboutDialog", () => {
  it("renders nothing while the store's about flag is off", () => {
    render(<AboutDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from the store with the title and all six sections", () => {
    useStore.getState().setAbout(true);
    render(<AboutDialog />);
    const dialog = screen.getByRole("dialog", { name: "About Schoolscape" });
    expect(dialog).toBeTruthy();
    for (const name of ["What this is", "How to read it", "Data", "Method", "Known gaps", "Built with"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
    expect(screen.getByRole("heading", { level: 3, name: "Connecticut" }).id).toBe("about-connecticut");
    expect(screen.getByRole("img", { name: "Bivariate color key" }).children).toHaveLength(9);
  });

  it("marks the first section current while the dialog is unscrolled", () => {
    useStore.getState().setAbout(true);
    render(<AboutDialog />);
    // With a short first section, the second heading sits in the top third and used to take the mark at the top.
    expect(screen.getByRole("link", { name: "What this is" }).getAttribute("aria-current")).toBe("location");
    expect(screen.getByRole("link", { name: "How to read it" }).getAttribute("aria-current")).toBeNull();
  });

  it("opens external links in a new tab", () => {
    useStore.getState().setAbout(true);
    render(<AboutDialog />);
    const doi = screen.getAllByRole("link", { name: "https://doi.org/10.7281/T170WN53" })[0];
    expect(doi.getAttribute("href")).toBe("https://doi.org/10.7281/T170WN53");
    expect(doi.getAttribute("target")).toBe("_blank");
    expect(doi.getAttribute("rel")).toBe("noreferrer");
  });

  it("closes through the store from the close button and Escape", () => {
    useStore.getState().setAbout(true);
    render(<AboutDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useStore.getState().about).toBe(false);

    act(() => useStore.getState().setAbout(true));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(useStore.getState().about).toBe(false);
  });

  it("opens on the ? key unless an input has focus", () => {
    render(
      <>
        <input aria-label="search" />
        <AboutKey />
        <AboutDialog />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("search"), { key: "?" });
    expect(useStore.getState().about).toBe(false);
    fireEvent.keyDown(document.body, { key: "?" });
    expect(useStore.getState().about).toBe(true);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
