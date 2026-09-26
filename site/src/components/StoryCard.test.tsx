import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import presetsFixture from "@/test/fixtures/presets.json";
import { load } from "@/lib/loaders";
import { mapPadding } from "@/map/camera";
import { MAP_PADDING } from "@/map/levels";
import { DEFAULT_VIEW, useStore } from "@/store/useStore";
import { openPreset } from "@/lib/urlSync";
import { StoryCard } from "./StoryCard";

vi.mock("@/lib/loaders", () => ({
  load: vi.fn(async (key: string) => {
    if (key === "presets") return presetsFixture;
    throw new Error(`unexpected load(${key})`);
  }),
}));

beforeEach(() => {
  useStore.getState().setView({ ...DEFAULT_VIEW, favorites: ["060000000001"] });
  useStore.getState().setGuide(null);
});
afterEach(cleanup);

const card = () => screen.queryByTestId("story-card");

async function openFirst() {
  const { presets } = await load("presets");
  act(() => openPreset(presets[0]!));
  return presets;
}

describe("StoryCard (SPEC.md 3.8)", () => {
  it("shows nothing until a story's view is live", async () => {
    render(<StoryCard />);
    await load("presets");
    expect(card()).toBeNull();
  });

  it("narrates the story with its place in the arc and a caveat", async () => {
    render(<StoryCard />);
    await openFirst();
    expect(await screen.findByRole("heading", { name: "Where stress concentrates" })).toBeTruthy();
    expect(card()!.textContent).toContain("Story 1 of 6");
    expect(card()!.textContent).toContain("The map");
    expect(screen.getByTestId("story-narration").textContent).toBe("The bright band is the South.");
    expect(card()!.textContent).toContain("ODIS measures neighborhoods, not students.");
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();
  });

  it("steps through the stories, applying each view and keeping favorites", async () => {
    render(<StoryCard />);
    const presets = await openFirst();
    fireEvent.click(await screen.findByRole("button", { name: /Next/ }));
    expect(useStore.getState().preset).toBe(presets[1]!.id);
    expect(useStore.getState().layers).toEqual(["broadband", "college_2yr_plus"]);
    expect(useStore.getState().favorites).toEqual(["060000000001"]);
    expect(card()!.textContent).toContain("Story 2 of 6");

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(useStore.getState().preset).toBe(presets[0]!.id);

    fireEvent.click(screen.getByRole("button", { name: `Story 6: ${presets[5]!.label}` }));
    expect(useStore.getState().preset).toBe(presets[5]!.id);
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Explore on your own" }));
    expect(useStore.getState().preset).toBeUndefined();
    expect(useStore.getState().layers).toEqual(["health"]);
  });

  it("ends when the viewer changes the layers or closes it", async () => {
    render(<StoryCard />);
    await openFirst();
    await screen.findByTestId("story-card");
    act(() => useStore.setState({ layers: ["crime"], preset: undefined }));
    // The card fades out before it unmounts.
    await waitFor(() => expect(card()).toBeNull());

    await openFirst();
    fireEvent.click(await screen.findByRole("button", { name: "Close the story" }));
    expect(useStore.getState().preset).toBeUndefined();
    expect(useStore.getState().layers).toEqual(["composite"]);
  });

  it("waits while the map guide is open", async () => {
    render(<StoryCard />);
    await openFirst();
    await screen.findByTestId("story-card");
    act(() => useStore.getState().setGuide("tour"));
    await waitFor(() => expect(card()).toBeNull());
  });

  it("keeps camera fits clear of the card while it is open", async () => {
    render(<StoryCard />);
    await openFirst();
    await screen.findByTestId("story-card");
    // jsdom has no layout, so the card measures 0 px tall and the inset is its margins alone.
    expect(mapPadding().bottom).toBe(MAP_PADDING.bottom);
    cleanup();
    expect(mapPadding()).toEqual({ ...MAP_PADDING });
  });
});
