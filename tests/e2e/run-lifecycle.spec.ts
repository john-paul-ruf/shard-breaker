import {
  expect,
  test as base,
} from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  deleteShardbreakDatabase,
  readShardbreakState,
} from "./indexedDb";
import type {
  StoredLifecycleState,
  StoredLivingRunRecord,
} from "./indexedDb";

interface AppFixtures {
  readonly appPage: Page;
}

const test = base.extend<AppFixtures>({
  appPage: async ({ page, baseURL }, provide) => {
    if (baseURL === undefined) {
      throw new Error("The Playwright base URL is required for browser acceptance");
    }

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const externalRequests: string[] = [];
    const allowedOrigin = new URL(baseURL).origin;

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text().slice(0, 240));
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message.slice(0, 240));
    });
    page.on("request", (request) => {
      const requestURL = new URL(request.url());
      if (
        (requestURL.protocol === "http:" || requestURL.protocol === "https:") &&
        requestURL.origin !== allowedOrigin
      ) {
        externalRequests.push(`${request.method()} ${requestURL.origin}`.slice(0, 240));
      }
    });

    const resetPath = "/__shardbreak_e2e_reset__";
    await page.route(`**${resetPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>SHARDBREAK test reset</title>",
      });
    });
    await page.goto(resetPath);
    await deleteShardbreakDatabase(page);
    await page.unroute(`**${resetPath}`);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Choose your signal." }),
    ).toBeVisible();

    await provide(page);

    expect(consoleErrors, "browser console errors").toEqual([]);
    expect(pageErrors, "uncaught browser page errors").toEqual([]);
    expect(externalRequests, "runtime requests must remain local").toEqual([]);
  },
});

function requireProfile(state: StoredLifecycleState) {
  expect(state.profileKeys).toEqual(["current"]);
  expect(state.profile).toBeDefined();
  if (state.profile === undefined) {
    throw new Error("Expected profile[current] in IndexedDB");
  }
  return state.profile;
}

function requireLivingRun(state: StoredLifecycleState): StoredLivingRunRecord {
  expect(state.livingRunKeys).toEqual(["current"]);
  expect(state.livingRun).toBeDefined();
  if (state.livingRun === undefined) {
    throw new Error("Expected livingRun[current] in IndexedDB");
  }
  return state.livingRun;
}

async function startCircuitRogue(page: Page): Promise<StoredLivingRunRecord> {
  await page.getByRole("button", { name: "Start new run" }).click();
  await expect(
    page.getByRole("heading", { name: "Checkpoint restored" }),
  ).toBeVisible();

  const state = await readShardbreakState(page);
  requireProfile(state);
  return requireLivingRun(state);
}

async function returnToArchive(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Return to Launch Archive" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose your signal." }),
  ).toBeVisible();
}

async function expectMinimumTarget(locator: Locator): Promise<void> {
  const bounds = await locator.boundingBox();
  expect(bounds, "action must have rendered bounds").not.toBeNull();
  expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
}

test.describe("run lifecycle", () => {
  test("fresh boot creates one default profile and exposes exact class rules", async ({
    appPage,
  }) => {
    const state = await readShardbreakState(appPage);
    const profile = requireProfile(state);

    expect(state.livingRunKeys).toEqual([]);
    expect(state.livingRun).toBeUndefined();
    expect(profile).toMatchObject({
      recordKey: "current",
      saveSchemaVersion: 1,
      contentVersion: "content-1",
      revision: 0,
      shards: 0,
      records: {
        highestReachedDepth: 0,
        highestBossDepth: 0,
        bossesDefeated: 0,
      },
      unlocks: {
        classIds: ["class-circuit-rogue", "class-glitch-knight"],
      },
    });

    const classes = appPage.getByRole("radiogroup", { name: "Starting class" });
    await expect(classes.getByRole("radio")).toHaveCount(3);

    const circuitRogue = classes.getByRole("radio", { name: /Circuit Rogue/ });
    const glitchKnight = classes.getByRole("radio", { name: /Glitch Knight/ });
    const neonMage = classes.getByRole("radio", { name: /Neon Mage/ });
    await expect(circuitRogue).toContainText("03 INT");
    await expect(circuitRogue).toHaveAttribute("aria-checked", "true");
    await expect(glitchKnight).toContainText("04 INT");
    await expect(neonMage).toContainText("02 INT");
    await expect(neonMage).toContainText("LOCKED");
    await expect(neonMage).toHaveAttribute("aria-disabled", "true");

    await neonMage.click({ force: true });
    expect((await readShardbreakState(appPage)).livingRun).toBeUndefined();
  });

  test("starting Circuit Rogue publishes only the committed depth-one run", async ({
    appPage,
  }) => {
    const run = await startCircuitRogue(appPage);

    expect(run).toMatchObject({
      recordKey: "current",
      saveSchemaVersion: 1,
      contentVersion: "content-1",
      revision: 0,
      phase: "route",
      depth: 1,
      cycle: 1,
      classId: "class-circuit-rogue",
      integrityCurrent: 3,
      integrityMax: 3,
      routeState: {
        offers: [],
        selectedOfferId: null,
        committed: false,
      },
    });
    expect(run.runId).not.toBe("");
    expect(run.seed).not.toBe("");
    expect(run.routeState?.eventKey).toBe(
      `route:content-1:${run.runId}:1`,
    );
    await expect(
      appPage.getByRole("status").filter({ hasText: "Saved:" }),
    ).toContainText("New Circuit Rogue run saved at Depth 1");
    await expect(
      appPage.getByRole("img", { name: "3 of 3 Integrity" }),
    ).toBeVisible();
  });

  test("reload returns to archive and Resume performs no durable write", async ({
    appPage,
  }) => {
    const started = await startCircuitRogue(appPage);
    const committedBeforeReload = await readShardbreakState(appPage);

    await appPage.reload();
    await expect(
      appPage.getByRole("heading", { name: "Living run detected" }),
    ).toBeVisible();
    await expect(appPage.getByText(/Circuit Rogue · Depth 01/)).toBeVisible();
    await expect(
      appPage.getByRole("img", { name: "3 of 3 Living run Integrity" }),
    ).toBeVisible();

    const afterReload = await readShardbreakState(appPage);
    expect(afterReload).toEqual(committedBeforeReload);
    expect(afterReload.livingRun?.seed).toBe(started.seed);

    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: "Checkpoint restored" }),
    ).toBeVisible();
    await expect(
      appPage.getByRole("status").filter({ hasText: "Saved:" }),
    ).toContainText("Restored Circuit Rogue at Depth 1");

    expect(await readShardbreakState(appPage)).toEqual(committedBeforeReload);
  });

  test("the three-action guard preserves the run on first click, Cancel, Escape, and Resume", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);
    await returnToArchive(appPage);
    const committedRun = await readShardbreakState(appPage);
    const startButton = appPage.getByRole("button", { name: "Start new run" });

    await startButton.click();
    const dialog = appPage.getByRole("dialog", { name: "Living run detected" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button")).toHaveCount(3);
    expect(await readShardbreakState(appPage)).toEqual(committedRun);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(startButton).toBeFocused();
    expect(await readShardbreakState(appPage)).toEqual(committedRun);

    await startButton.click();
    await expect(
      dialog.getByRole("button", { name: "Resume living run" }),
    ).toBeFocused();
    await appPage.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(startButton).toBeFocused();
    expect(await readShardbreakState(appPage)).toEqual(committedRun);

    await startButton.click();
    await dialog.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: "Checkpoint restored" }),
    ).toBeVisible();
    expect(await readShardbreakState(appPage)).toEqual(committedRun);
  });

  test("explicit abandonment replaces Circuit Rogue with one Glitch Knight run", async ({
    appPage,
  }) => {
    const priorRun = await startCircuitRogue(appPage);
    await returnToArchive(appPage);

    const glitchKnight = appPage.getByRole("radio", { name: /Glitch Knight/ });
    await glitchKnight.click();
    await expect(glitchKnight).toHaveAttribute("aria-checked", "true");
    await appPage.getByRole("button", { name: "Start new run" }).click();

    const dialog = appPage.getByRole("dialog", { name: "Living run detected" });
    await expect(dialog).toBeVisible();
    expect(requireLivingRun(await readShardbreakState(appPage))).toEqual(priorRun);
    await dialog.getByRole("button", { name: "Abandon & start" }).click();

    await expect(
      appPage.getByRole("heading", { name: "Checkpoint restored" }),
    ).toBeVisible();
    const replacementState = await readShardbreakState(appPage);
    const replacement = requireLivingRun(replacementState);
    expect(replacementState.livingRunKeys).toEqual(["current"]);
    expect(replacement).toMatchObject({
      classId: "class-glitch-knight",
      revision: 0,
      depth: 1,
      cycle: 1,
      integrityCurrent: 4,
      integrityMax: 4,
    });
    expect(replacement.runId).not.toBe(priorRun.runId);
    expect(replacement.seed).not.toBe(priorRun.seed);
    await expect(
      appPage.getByRole("status").filter({ hasText: "Saved:" }),
    ).toContainText("Replacement Glitch Knight run saved at Depth 1");
  });

  test("rapid double activation commits only one fresh run", async ({
    appPage,
  }) => {
    const startButton = appPage.getByRole("button", { name: "Start new run" });
    await startButton.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });

    await expect(
      appPage.getByRole("heading", { name: "Checkpoint restored" }),
    ).toBeVisible();
    const state = await readShardbreakState(appPage);
    const run = requireLivingRun(state);
    expect(run.revision).toBe(0);
    expect(run.lastCommitId).not.toBe("");
    expect(state.livingRunKeys).toEqual(["current"]);
  });

  test("keyboard selection, activation, guard focus, and named save feedback work", async ({
    appPage,
  }, testInfo) => {
    const circuitRogue = appPage.getByRole("radio", { name: /Circuit Rogue/ });
    const glitchKnight = appPage.getByRole("radio", { name: /Glitch Knight/ });
    await circuitRogue.focus();

    await appPage.keyboard.press("ArrowDown");
    await expect(glitchKnight).toBeFocused();
    await expect(glitchKnight).toHaveAttribute("aria-checked", "true");
    await appPage.keyboard.press(
      testInfo.project.name === "webkit" ? "Alt+Tab" : "Tab",
    );

    const startButton = appPage.getByRole("button", { name: "Start new run" });
    await expect(startButton).toBeFocused();
    await appPage.keyboard.press("Enter");
    await expect(
      appPage.getByRole("heading", { name: "Checkpoint restored" }),
    ).toBeVisible();
    await expect(
      appPage.getByRole("status").filter({ hasText: "Saved:" }),
    ).toContainText("New Glitch Knight run saved at Depth 1");

    await returnToArchive(appPage);
    await startButton.focus();
    await appPage.keyboard.press("Enter");
    const resume = appPage
      .getByRole("dialog", { name: "Living run detected" })
      .getByRole("button", { name: "Resume living run" });
    await expect(resume).toBeFocused();
    await appPage.keyboard.press("Escape");
    await expect(startButton).toBeFocused();
  });

  test("320px and portrait-phone layouts keep urgent actions usable without overflow", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);
    await returnToArchive(appPage);

    for (const viewport of [
      { width: 320, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await appPage.setViewportSize(viewport);
      await expect
        .poll(() =>
          appPage.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);

      const livingRun = appPage.getByRole("heading", {
        name: "Living run detected",
      });
      const classSelector = appPage.getByRole("radiogroup", {
        name: "Starting class",
      });
      const livingBounds = await livingRun.boundingBox();
      const selectorBounds = await classSelector.boundingBox();
      expect(livingBounds?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
        selectorBounds?.y ?? Number.NEGATIVE_INFINITY,
      );

      const resume = appPage.getByRole("button", { name: "Resume living run" });
      const start = appPage.getByRole("button", { name: "Start new run" });
      await expectMinimumTarget(resume);
      await expectMinimumTarget(start);

      await start.click();
      const dialog = appPage.getByRole("dialog", { name: "Living run detected" });
      await expect(dialog).toBeVisible();
      const dialogBounds = await dialog.boundingBox();
      expect(dialogBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(
        viewport.width,
      );
      for (const name of ["Resume living run", "Abandon & start", "Cancel"]) {
        await expectMinimumTarget(dialog.getByRole("button", { name }));
      }
      await dialog.getByRole("button", { name: "Cancel" }).click();
    }
  });

  test("reduced motion preserves selection, lock, guard, Integrity, and save state", async ({
    appPage,
  }) => {
    await appPage.emulateMedia({ reducedMotion: "reduce" });
    const glitchKnight = appPage.getByRole("radio", { name: /Glitch Knight/ });
    const neonMage = appPage.getByRole("radio", { name: /Neon Mage/ });
    await glitchKnight.click();
    await expect(glitchKnight).toHaveAttribute("aria-checked", "true");
    await expect(glitchKnight).toContainText("SELECTED");
    await expect(neonMage).toContainText("LOCKED");
    expect(
      await appPage.evaluate(
        () => getComputedStyle(document.body, "::after").display,
      ),
    ).toBe("none");

    await appPage.getByRole("button", { name: "Start new run" }).click();
    await expect(
      appPage.getByRole("heading", { name: "Checkpoint restored" }),
    ).toBeVisible();
    await expect(
      appPage.getByRole("img", { name: "4 of 4 Integrity" }),
    ).toBeVisible();
    await expect(
      appPage.getByRole("status").filter({ hasText: "Saved:" }),
    ).toBeVisible();

    await returnToArchive(appPage);
    await appPage.getByRole("button", { name: "Start new run" }).click();
    await expect(
      appPage.getByRole("dialog", { name: "Living run detected" }),
    ).toBeVisible();
  });
});
