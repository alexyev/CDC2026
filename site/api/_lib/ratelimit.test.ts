// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { allow, CAPACITY, resetRateLimit, WINDOW_MS } from "./ratelimit.js";

describe("allow", () => {
  beforeEach(resetRateLimit);

  it("allows a burst of 30 then blocks", () => {
    for (let i = 0; i < CAPACITY; i++) expect(allow("a", 0)).toBe(true);
    expect(allow("a", 0)).toBe(false);
  });

  it("refills one token every two seconds", () => {
    for (let i = 0; i < CAPACITY; i++) allow("a", 0);
    expect(allow("a", WINDOW_MS / CAPACITY - 1)).toBe(false);
    expect(allow("a", WINDOW_MS / CAPACITY)).toBe(true);
    expect(allow("a", WINDOW_MS / CAPACITY)).toBe(false);
  });

  it("never refills above capacity", () => {
    allow("a", 0);
    const later = 10 * WINDOW_MS;
    for (let i = 0; i < CAPACITY; i++) expect(allow("a", later)).toBe(true);
    expect(allow("a", later)).toBe(false);
  });

  it("keeps IPs independent", () => {
    for (let i = 0; i < CAPACITY; i++) allow("a", 0);
    expect(allow("a", 0)).toBe(false);
    expect(allow("b", 0)).toBe(true);
  });
});
