// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { beforeEach, describe, expect, it } from "vitest";
import { encodeView } from "@/lib/urlCodec";
import { DEFAULT_VIEW, selectView, useStore } from "./useStore";

describe("profile drawer actions (SPEC.md 3.5)", () => {
  beforeEach(() => useStore.setState({ ...DEFAULT_VIEW }));

  it("opens and closes the drawer through the `s` URL parameter", () => {
    const s = () => useStore.getState();
    s().openProfile("010000500871");
    expect(s().profile).toBe("010000500871");
    expect(encodeView(selectView(s()))).toBe("s=010000500871");

    s().closeProfile();
    expect(s().profile).toBeUndefined();
    expect(encodeView(selectView(s()))).toBe("");
  });

  it("closes a drawer opened by a whole-view change, as Ask the map and the URL open it", () => {
    useStore
      .getState()
      .setView({ ...DEFAULT_VIEW, selected: { kind: "school", id: "010000500871" }, profile: "010000500871" });
    useStore.getState().closeProfile();
    expect(useStore.getState().profile).toBeUndefined();
    expect(useStore.getState().selected).toEqual({ kind: "school", id: "010000500871" });
  });
});
