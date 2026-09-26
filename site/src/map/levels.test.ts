import { describe, expect, it } from "vitest";
import { levelForZoom } from "./levels";

describe("levelForZoom", () => {
  it.each([
    [0, "nation"],
    [3.6, "nation"],
    [4.99, "nation"],
    [5, "state"],
    [7.99, "state"],
    [8, "local"],
    [14, "local"],
  ])("z%s -> %s", (zoom, level) => {
    expect(levelForZoom(zoom)).toBe(level);
  });
});
