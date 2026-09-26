import { beforeEach, describe, expect, it } from "vitest";
import { PANELS_KEY, parsePanels, restorePanel, serializePanels, usePanels } from "./panels";

const NONE = { layers: false, command: false, insight: false, search: false, legend: false };

beforeEach(() => {
  localStorage.clear();
  usePanels.setState({ minimized: { ...NONE } });
});

describe("parsePanels", () => {
  it("reads a list of minimized ids", () => {
    expect(parsePanels('["legend","search"]')).toEqual({ ...NONE, legend: true, search: true });
  });

  it("ignores unknown ids and falls back to all open on missing or corrupt values", () => {
    expect(parsePanels('["legend","favorites",3]')).toEqual({ ...NONE, legend: true });
    expect(parsePanels(null)).toEqual(NONE);
    expect(parsePanels("{not json")).toEqual(NONE);
    expect(parsePanels('{"legend":true}')).toEqual(NONE);
  });

  it("round-trips through serializePanels", () => {
    const layout = { ...NONE, layers: true, insight: true };
    expect(parsePanels(serializePanels(layout))).toEqual(layout);
  });
});

describe("usePanels", () => {
  it("persists every change to localStorage", () => {
    usePanels.getState().setMinimized("insight", true);
    expect(localStorage.getItem(PANELS_KEY)).toBe('["insight"]');
    usePanels.getState().setMinimized("insight", false);
    expect(localStorage.getItem(PANELS_KEY)).toBe("[]");
  });

  it("restorePanel opens a minimized panel and leaves open ones alone", () => {
    usePanels.getState().setMinimized("command", true);
    restorePanel("command");
    expect(usePanels.getState().minimized.command).toBe(false);
    restorePanel("search");
    expect(usePanels.getState().minimized.search).toBe(false);
  });
});
