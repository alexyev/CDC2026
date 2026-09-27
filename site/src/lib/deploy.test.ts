// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import { builtAssets, isNewerBuild } from "./deploy";

const INDEX = `<!doctype html>
<html><head>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<script type="module" crossorigin src="/assets/index-jsD_Dzga.js"></script>
<link rel="modulepreload" crossorigin href="/assets/react-CR5VJ85Q.js">
<link rel="stylesheet" crossorigin href="/assets/index-BtlA2rES.css">
</head><body><div id="root"></div></body></html>`;

describe("picking up a new deploy (SPEC.md 3.15)", () => {
  it("reads the built files an index.html names", () => {
    expect(builtAssets(INDEX)).toEqual([
      "/assets/index-jsD_Dzga.js",
      "/assets/react-CR5VJ85Q.js",
      "/assets/index-BtlA2rES.css",
    ]);
  });

  it("is the same build when the page loaded every file the index names, lazy chunks and all", () => {
    const loaded = new Set([...builtAssets(INDEX), "/assets/GuidedTour-a1b2c3.js"]);
    expect(isNewerBuild(INDEX, loaded)).toBe(false);
  });

  it("is a newer build when the index names a file the page never loaded", () => {
    const loaded = new Set(builtAssets(INDEX));
    expect(isNewerBuild(INDEX.replace("index-jsD_Dzga.js", "index-Zz99.js"), loaded)).toBe(true);
    expect(isNewerBuild(INDEX.replace("index-BtlA2rES.css", "index-Yy88.css"), loaded)).toBe(true);
  });

  it("never counts a dev server's index.html, which names no built files, as newer", () => {
    expect(isNewerBuild('<script type="module" src="/src/main.tsx"></script>', new Set())).toBe(false);
  });
});
