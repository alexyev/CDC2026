/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
import { CRITICAL_FILES, DATA_FILES, DATA_VERSION } from "./src/data/paths";

/** The basemap style MapCanvas fetches first (src/basemap/theme.ts BASEMAP_STYLE_URL). */
const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
/** The Latin variable fonts every first paint draws with; other subsets load on demand by unicode-range. */
const FIRST_PAINT_FONTS = /^assets\/(inter|jetbrains-mono)-latin-wght-normal-[\w-]+\.woff2$/;

/**
 * Loading sequence step 1 (SPEC.md 10.1): index.html preloads the basemap style, the critical data files, and the
 * fonts, so they download alongside the app script instead of after it runs. Fixture builds read bundled data.
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
      handler(_html, ctx) {
        const tags = [fetchTag(BASEMAP_STYLE_URL)];
        if (!process.env.VITE_USE_FIXTURES) {
          for (const key of CRITICAL_FILES) tags.push(fetchTag(`/data/${DATA_VERSION}/${DATA_FILES[key]}`));
        }
        for (const file of Object.keys(ctx.bundle ?? {}).filter((f) => FIRST_PAINT_FONTS.test(f))) {
          tags.push({
            tag: "link",
            attrs: { rel: "preload", as: "font", type: "font/woff2", crossorigin: "anonymous", href: `/${file}` },
            injectTo: "head",
          });
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
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Libraries that change far less often than the app get their own long-cached chunks, which also
          // download in parallel with the app code.
          groups: [
            { name: "maplibre", test: /node_modules[\\/]maplibre-gl[\\/]/, priority: 2 },
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
