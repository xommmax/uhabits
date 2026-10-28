// Unit tests (test/unit, a simulated DOM, a fake core) and bridge tests (test/bridge, the real Kotlin core
// on sql.js in Node). See ../tests/README.md.
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [preact()],
  define: { __BUILD_INFO__: JSON.stringify({ version: "9.9.9", commit: "abc1234", time: "2026-10-28T10:00:00.000Z" }) },
  resolve: { dedupe: ["sprintf-js", "jszip"] },
  server: { fs: { allow: [path("../.."), path(".")] } },
  test: {
    projects: [
      {
        extends: true,
        // Unit tests never load the Kotlin build, so they run without it
        resolve: { alias: { "habits-core": path("test/unit/habits-core-stub.ts") } },
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.{ts,tsx}"],
          environment: "happy-dom",
          setupFiles: ["test/unit/setup.ts"],
          restoreMocks: true,
        },
      },
      {
        extends: true,
        resolve: { alias: { "habits-core": path("../build/dist/js/productionLibrary/habits-core.mjs") } },
        test: {
          name: "bridge",
          include: ["test/bridge/**/*.test.ts"],
          environment: "node",
          setupFiles: ["test/bridge/setup.ts"],
          // Each file opens its own cores; the Kotlin module keeps global state (today, first weekday)
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/globals.d.ts", "src/types.ts"],
      reporter: ["text-summary", "text"],
    },
  },
});
