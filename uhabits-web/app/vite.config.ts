import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; set BASE_PATH there.
  base: process.env.BASE_PATH ?? "/",
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Loop Habit Tracker",
        short_name: "Habits",
        description: "Loop Habit Tracker, ported from Android",
        display: "standalone",
        background_color: "#f4f4f4",
        theme_color: "#f4f4f4",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,ttf,png}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { "habits-core": path("../build/dist/js/productionLibrary/habits-core.mjs") },
    // The Kotlin output lives outside this folder; resolve its npm imports from here.
    dedupe: ["sprintf-js"],
  },
  server: {
    fs: { allow: [path("../.."), path(".")] },
  },
});
