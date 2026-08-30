import { defineConfig, devices } from "@playwright/test";

function parseAssignedPort(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`PLAYWRIGHT_PORT/PORT must be an integer: ${JSON.stringify(raw)}`);
  }

  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError(`PLAYWRIGHT_PORT/PORT is outside 1..65535: ${raw}`);
  }
  return port;
}

const assignedPort = process.env.PLAYWRIGHT_PORT ?? process.env.PORT;
const port = parseAssignedPort(assignedPort ?? "4173");
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "./test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${String(port)} --strictPort`,
    url: baseURL,
    reuseExistingServer: assignedPort === undefined,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1_280, height: 900 },
      },
    },
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        viewport: { width: 1_280, height: 900 },
      },
    },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
        viewport: { width: 1_280, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        browserName: "chromium",
      },
    },
  ],
});
