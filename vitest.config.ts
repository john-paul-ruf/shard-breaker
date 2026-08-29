import { defineConfig } from "vitest/config";

// Pure domain tests run in the Node environment by default; component test
// files opt into `jsdom` with a per-file `@vitest-environment` annotation.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    restoreMocks: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    passWithNoTests: true,
  },
});
