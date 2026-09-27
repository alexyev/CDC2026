/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
import { CRITICAL_FILES, DATA_FILES, DATA_VERSION } from "./src/data/paths.ts";

/** The basemap style MapCanvas fetches first (src/basemap/theme.ts BASEMAP_STYLE_URL). */
const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/**
 * Loading sequence step 1 (SPEC.md 10.1): index.html preloads the basemap style and the critical data files, so they
 * download alongside the app script instead of after it runs. Fixture builds read bundled data. The fonts are not
 * preloaded: measured at 10 Mbps, their bytes delayed the app script and so the first contentful paint by 50 ms.
 */
function preloadFirstPaint(): Plugin {
  const fetchTag = (href: string): HtmlTagDescriptor => ({
    tag: "link",
    attrs: { rel: "preload", as: "fetch", crossorigin: "anonymous", href },
    injectTo: "head",
  });
  return {
    name: "schoolscape:preload-first-paint",
    transformIndexHtml: {
      order: "post",
      handler() {
        const tags = [fetchTag(BASEMAP_STYLE_URL)];
        if (!process.env.VITE_USE_FIXTURES) {
          for (const key of CRITICAL_FILES) tags.push(fetchTag(`/data/${DATA_VERSION}/${DATA_FILES[key]}`));
        }
        return tags;
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFirstPaint()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // MapLibre's chunk is one library of about 1 MB minified that cannot be split further; the app's own chunks
    // stay well under the default 500 kB, and this still flags anything that grows past MapLibre.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Libraries that change far less often than the app get their own long-cached chunks, which also
          // download in parallel with the app code. Scripts only: MapLibre's stylesheet stays in the app's one
          // render-blocking stylesheet.
          groups: [
            { name: "maplibre", test: /node_modules[\\/]maplibre-gl[\\/].*\.m?js$/, priority: 2 },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
          ],
        },
      },
    },
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "api/**/*.test.ts"],
  },
});
