import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Normalize the GitHub Pages base path to exactly one leading and one trailing
 * slash. The local default is the site root so `vite dev` and unit builds do
 * not need the deployment prefix. Unsafe values are rejected rather than
 * silently rewritten, and the repository name is never hardcoded.
 */
function normalizeBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "" || trimmed === "/") {
    return "/";
  }
  if (
    /\s/.test(trimmed) ||
    trimmed.includes("..") ||
    trimmed.includes("://") ||
    trimmed.includes("\\")
  ) {
    throw new Error(`Unsafe VITE_BASE_PATH: ${JSON.stringify(raw)}`);
  }
  return `/${trimmed}/`.replace(/\/{2,}/g, "/");
}

// The HTML application entry is owned by a later session. Until it exists, Vite
// builds the immutable Genesis migration as a library smoke entry so every
// checkpoint stays buildable. Once `./index.html` exists, omitting the library
// options makes Vite perform its normal application build. This file never
// writes to the migration.
const hasApplicationEntry = existsSync(
  fileURLToPath(new URL("./index.html", import.meta.url)),
);

const scaffoldLibrary = hasApplicationEntry
  ? undefined
  : {
      lib: {
        entry: fileURLToPath(
          new URL("./src/migrations/001_initial.ts", import.meta.url),
        ),
        formats: ["es" as const],
        fileName: "schema-smoke",
      },
    };

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  // React is only needed for the real HTML application build; the scaffold
  // library build of the plain-TypeScript migration must not load it.
  plugins: hasApplicationEntry ? [react()] : [],
  ...(scaffoldLibrary ? { build: scaffoldLibrary } : {}),
});
