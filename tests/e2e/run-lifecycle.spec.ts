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
    page.getByRole("heading", { name: "Pick the next pressure point." }),
  ).toBeVisible();

  const state = await readShardbreakState(page);
  requireProfile(state);
  return requireLivingRun(state);
}

async function returnToArchive(page: Page): Promise<void> {
  // The store drops every command while a durable save is in flight
  // (serialized-command contract): the auto-materialize window can close
  // between the aria-busy poll and the click, so the poll alone does not
  // guarantee the click survives. Prove the outcome instead: retry once
  // after each busy window until the archive is visibly back — a dropped
  // dispatch performs no durable write and simply leaves the route open.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect
      .poll(async () => page.locator('[aria-busy="true"]').count())
      .toBe(0);
    await page
      .getByRole("button", { name: "Return to archive" })
      .click();
    try {
      await expect(
        page.getByRole("heading", { name: "Choose your signal." }),
      ).toBeVisible({ timeout: 2_000 });
      return;
    } catch {
      // The next pass waits out the current busy window before retrying.
    }
  }
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
        relicIds: [],
      },
      relicState: {
        equippedForNextRunId: null,
      },
      pendingRelicChoice: null,
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
      phase: "route",
      depth: 1,
      cycle: 1,
      classId: "class-circuit-rogue",
      integrityCurrent: 3,
      integrityMax: 3,
      routeState: {
        selectedOfferId: null,
        committed: false,
      },
    });
    expect(run.runId).not.toBe("");
    expect(run.seed).not.toBe("");
    expect(run.routeState?.eventKey).toBe(
      `route:content-1:${run.runId}:1`,
    );
    // The run-start save signal or the auto-materialize save signal is visible.
    await expect(
      appPage.getByRole("status").filter({ hasText: "Saved:" }),
    ).toBeVisible();
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
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
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
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeVisible();
    expect(await readShardbreakState(appPage)).toEqual(committedRun);
  });

  test("explicit abandonment replaces Circuit Rogue with one Glitch Knight run", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);
    await returnToArchive(appPage);
    const priorRun = requireLivingRun(await readShardbreakState(appPage));

    const glitchKnight = appPage.getByRole("radio", { name: /Glitch Knight/ });
    await glitchKnight.click();
    await expect(glitchKnight).toHaveAttribute("aria-checked", "true");
    await appPage.getByRole("button", { name: "Start new run" }).click();

    const dialog = appPage.getByRole("dialog", { name: "Living run detected" });
    await expect(dialog).toBeVisible();
    expect(requireLivingRun(await readShardbreakState(appPage))).toEqual(priorRun);
    await dialog.getByRole("button", { name: "Abandon & start" }).click();

    await expect(
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
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
    ).toContainText(/(?:Replacement Glitch Knight run saved at Depth 1|Route offers saved at Depth 1)/);
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
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
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
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
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
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
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

test.describe("route drafting", () => {
  test("materializes four route cards and reload preserves the same offers", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);

    // Wait for the route cards to materialize.
    const routeGroup = appPage.getByRole("radiogroup", {
      name: "Room route choices",
    });
    await expect(routeGroup.getByRole("radio")).toHaveCount(4);
    await expect(
      routeGroup.getByRole("radio", { name: "battle // Glassway" }),
    ).toBeVisible();

    const beforeReload = requireLivingRun(await readShardbreakState(appPage));
    expect(beforeReload.routeState?.offers).toHaveLength(4);
    const offerIds = beforeReload.routeState?.offers?.map(
      (offer) => (offer as { readonly offerId: string }).offerId,
    );

    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeVisible();
    await expect(routeGroup.getByRole("radio")).toHaveCount(4);

    const afterReload = requireLivingRun(await readShardbreakState(appPage));
    expect(afterReload.routeState?.offers).toHaveLength(4);
    const reloadedOfferIds = afterReload.routeState?.offers?.map(
      (offer) => (offer as { readonly offerId: string }).offerId,
    );
    expect(reloadedOfferIds).toEqual(offerIds);
  });

  test("selecting a Battle card persists across reload", async ({ appPage }) => {
    await startCircuitRogue(appPage);

    const routeGroup = appPage.getByRole("radiogroup", {
      name: "Room route choices",
    });
    await expect(routeGroup.getByRole("radio")).toHaveCount(4);

    const battleCard = routeGroup.getByRole("radio", {
      name: "battle // Glassway",
    });
    await battleCard.click();
    await expect(battleCard).toHaveAttribute("aria-checked", "true");

    const beforeReload = requireLivingRun(await readShardbreakState(appPage));
    expect(beforeReload.routeState?.selectedOfferId).not.toBeNull();

    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeVisible();
    await expect(
      appPage.getByRole("radio", { name: "battle // Glassway" }),
    ).toHaveAttribute("aria-checked", "true");

    const afterReload = requireLivingRun(await readShardbreakState(appPage));
    expect(afterReload.routeState?.selectedOfferId).toBe(
      beforeReload.routeState?.selectedOfferId,
    );
  });

  test("committing the selected route transitions to room phase with populated roomState", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);

    const routeGroup = appPage.getByRole("radiogroup", {
      name: "Room route choices",
    });
    await expect(routeGroup.getByRole("radio")).toHaveCount(4);

    const battleCard = routeGroup.getByRole("radio", {
      name: "battle // Glassway",
    });
    await battleCard.click();
    await expect(battleCard).toHaveAttribute("aria-checked", "true");

    const enterButton = appPage.getByRole("button", {
      name: "Enter selected room",
    });
    await expect(enterButton).not.toBeDisabled();
    await enterButton.click();

    // After commit, the living run transitions to room phase.
    const committed = requireLivingRun(await readShardbreakState(appPage));
    expect(committed.phase).toBe("room");
    expect(committed.routeState).toBeNull();
    expect(committed.roomState).not.toBeNull();
    expect(committed.roomState?.roomType).toBe("battle");
    expect(committed.roomState?.status).toBe("ready");
    expect(committed.roomState?.threatProfile).not.toBeNull();

    // Reload preserves the committed room.
    await appPage.reload();
    const afterReload = requireLivingRun(await readShardbreakState(appPage));
    expect(afterReload.phase).toBe("room");
    expect(afterReload.routeState).toBeNull();
    expect(afterReload.roomState?.roomType).toBe("battle");
    expect(afterReload.roomState?.status).toBe("ready");
  });
});

test.describe("room resolution", () => {
  async function commitRouteByCardName(
    appPage: Page,
    cardName: string,
  ): Promise<void> {
    const routeGroup = appPage.getByRole("radiogroup", {
      name: "Room route choices",
    });
    await expect(routeGroup.getByRole("radio")).toHaveCount(4);
    const card = routeGroup.getByRole("radio", { name: cardName });
    await card.click();
    await expect(card).toHaveAttribute("aria-checked", "true");
    await appPage.getByRole("button", { name: "Enter selected room" }).click();
    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.livingRun?.phase;
      })
      .toBe("room");
  }

  async function resolveThroughRewardDraft(appPage: Page): Promise<void> {
    await appPage
      .getByRole("button", { name: "Advance to reward draft" })
      .click();
    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.livingRun?.phase;
      })
      .toBe("reward");
  }

  test("recovery journey: commit recovery, resolve, draft, confirm, depth 2 survives reload", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);
    await commitRouteByCardName(appPage, "recovery // Soft Reset");

    // Room screen renders the committed recovery room with its offer.
    await expect(
      appPage.getByRole("heading", { name: /Soft Reset \/\/ Recovery/ }),
    ).toBeVisible();
    await expect(
      appPage.getByText("Restore 1 Integrity, never above the run maximum."),
    ).toBeVisible();

    // Integrity starts at max, so the commit clamps at the maximum.
    await appPage.getByRole("button", { name: "Commit recovery" }).click();
    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.livingRun?.integrityCurrent;
      })
      .toBe(3);
    const committed = requireLivingRun(await readShardbreakState(appPage));
    expect(committed.integrityCurrent).toBe(3);
    expect(committed.integrityMax).toBe(3);

    // Resolve into the reward phase: exactly three cards.
    await resolveThroughRewardDraft(appPage);
    const rewardGroup = appPage.getByRole("radiogroup", {
      name: "Three reward cards",
    });
    await expect(rewardGroup.getByRole("radio")).toHaveCount(3);

    const resolved = requireLivingRun(await readShardbreakState(appPage));
    expect(resolved.phase).toBe("reward");
    expect(resolved.roomState).toBeNull();
    expect(resolved.rewardState?.cards).toHaveLength(3);
    expect(resolved.rewardState?.status).toBe("offered");

    // Confirm the first card; the single durable command applies it.
    const firstCard = rewardGroup.getByRole("radio").first();
    const firstCardId = await firstCard.getAttribute("aria-label");
    expect(firstCardId).not.toBeNull();
    await firstCard.click();
    await expect(firstCard).toHaveAttribute("aria-checked", "true");

    const confirm = appPage.getByRole("button", { name: "Confirm draft" });
    await expect(confirm).not.toBeDisabled();
    await confirm.click();

    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.livingRun?.phase;
      })
      .toBe("route");

    const advanced = requireLivingRun(await readShardbreakState(appPage));
    expect(advanced.depth).toBe(2);
    expect(advanced.rewardState).toBeNull();
    expect(advanced.routeState?.offers).toHaveLength(4);
    const buildIds = [
      ...(advanced.build?.activeSkillIds ?? []),
      ...(advanced.build?.passiveEquipmentIds ?? []),
    ];
    expect(buildIds.length).toBe(1);

    await expect(
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeVisible();
    await expect(appPage.getByText(/Depth 02 · Circuit Rogue/)).toBeVisible();

    // Reload determinism: the advanced state is returned exactly, and the
    // route offers for depth 2 never reroll.
    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeVisible();

    const reloaded = requireLivingRun(await readShardbreakState(appPage));
    expect(reloaded.depth).toBe(2);
    expect(reloaded.rewardState).toBeNull();
    expect(reloaded.routeState?.offers).toEqual(advanced.routeState?.offers);
    expect([
      ...(reloaded.build?.activeSkillIds ?? []),
      ...(reloaded.build?.passiveEquipmentIds ?? []),
    ]).toEqual(buildIds);
    expect(reloaded.integrityCurrent).toBe(committed.integrityCurrent);
  });

  test("shop journey proves the visible unaffordable contract and depth advance", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);
    await commitRouteByCardName(appPage, "shop // Patchbay");

    // The finite inventory with names and prices is visible.
    await expect(
      appPage.getByRole("heading", { name: /Patchbay \/\/ Shop/ }),
    ).toBeVisible();
    await expect(appPage.getByText("Integrity Patch")).toBeVisible();
    await expect(appPage.getByText("Integrity Overhaul")).toBeVisible();
    const shop = appPage.locator(".room-shop");
    await expect(shop.locator(".shop-item__reason")).toHaveCount(2);

    // Fresh runs start at 0 room shards, so every buy is disabled with the
    // explicit insufficient-currency reason. The helpers never seed a wallet.
    const buys = shop.getByRole("button", { name: "Buy" });
    await expect(buys).toHaveCount(2);
    for (const buy of await buys.all()) {
      await expect(buy).toBeDisabled();
    }
    await expect(shop.getByText("Not enough room shards")).toHaveCount(2);

    // Resolving the shop room still advances to the reward draft.
    await resolveThroughRewardDraft(appPage);
    const resolved = requireLivingRun(await readShardbreakState(appPage));
    expect(resolved.phase).toBe("reward");
    expect(resolved.roomState).toBeNull();
    expect(resolved.rewardState?.cards).toHaveLength(3);
    expect(resolved.runCurrency).toBe(0);

    const rewardGroup = appPage.getByRole("radiogroup", {
      name: "Three reward cards",
    });
    await expect(rewardGroup.getByRole("radio")).toHaveCount(3);

    const firstCard = rewardGroup.getByRole("radio").first();
    await firstCard.click();
    await expect(firstCard).toHaveAttribute("aria-checked", "true");
    await appPage.getByRole("button", { name: "Confirm draft" }).click();

    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.livingRun?.phase;
      })
      .toBe("route");
    expect(requireLivingRun(await readShardbreakState(appPage)).depth).toBe(2);

    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeVisible();
    expect(requireLivingRun(await readShardbreakState(appPage)).depth).toBe(2);
  });

  test("reward phase records three offered cards and selection nulls them at depth 2", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);
    await commitRouteByCardName(appPage, "recovery // Soft Reset");
    await resolveThroughRewardDraft(appPage);

    // IndexedDB contract: phase reward with a persisted 3-card offered draft.
    const offered = requireLivingRun(await readShardbreakState(appPage));
    expect(offered.phase).toBe("reward");
    expect(offered.roomState).toBeNull();
    expect(offered.rewardState?.cards).toHaveLength(3);
    expect(offered.rewardState?.selectedCardId).toBeNull();
    expect(offered.rewardState?.status).toBe("offered");
    const offeredCardIds = offered.rewardState?.cards.map(
      (card) => card.cardId,
    );
    expect(new Set(offeredCardIds).size).toBe(3);

    const rewardGroup = appPage.getByRole("radiogroup", {
      name: "Three reward cards",
    });
    await expect(rewardGroup.getByRole("radio")).toHaveCount(3);
    await rewardGroup.getByRole("radio").first().click();
    await appPage.getByRole("button", { name: "Confirm draft" }).click();

    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.livingRun?.phase;
      })
      .toBe("route");

    // IndexedDB contract: applied draft is consumed; depth and route advance.
    const applied = requireLivingRun(await readShardbreakState(appPage));
    expect(applied.phase).toBe("route");
    expect(applied.rewardState).toBeNull();
    expect(applied.depth).toBe(2);
    expect(applied.routeState?.offers).toHaveLength(4);
    expect(applied.routeState?.eventKey).toContain(
      ":2",
    );

    // The applied build contains exactly the confirmed draft card's base.
    const appliedBaseIds = [
      ...(applied.build?.activeSkillIds ?? []),
      ...(applied.build?.passiveEquipmentIds ?? []),
    ];
    expect(appliedBaseIds).toHaveLength(1);
    expect(
      offered.rewardState?.cards
        .map((card) => card.baseRewardId)
        .includes(appliedBaseIds[0] ?? ""),
    ).toBe(true);
  });
});
test.describe("combat rooms", () => {
  /** Commit the depth-1 battle card and land on the CombatScreen. */
  async function commitBattleRoom(appPage: Page): Promise<void> {
    const routeGroup = appPage.getByRole("radiogroup", {
      name: "Room route choices",
    });
    await expect(routeGroup.getByRole("radio")).toHaveCount(4);
    const card = routeGroup.getByRole("radio", { name: "battle // Glassway" });
    await card.click();
    await expect(card).toHaveAttribute("aria-checked", "true");
    await appPage.getByRole("button", { name: "Enter selected room" }).click();
    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.livingRun?.phase;
      })
      .toBe("room");
    await expect(
      appPage.getByRole("heading", { name: /Glassway \/\/ Battle/ }),
    ).toBeVisible();
  }

  /**
   * One explicit launch through the real bridge: pointer aims, the launch
   * control dispatches combat/launch, and the arena session runs the volley
   * to its deterministic loss.
   */
  async function launchOneVolley(appPage: Page): Promise<void> {
    // After a loss the arena re-enables the launch control while the ended
    // volley is still mounted; the restored checkpoint publish flips the
    // status line back to "Aim ready". Waiting for it makes the next
    // launch deterministic instead of racing the reconcile.
    await expect
      .poll(async () => {
        const status = appPage.locator(".arena-status");
        return (await status.getAttribute("data-status")) ?? "";
      })
      .toBe("aim-ready");
    const canvas = appPage.getByRole("img", { name: /Glassway arena/ });
    await canvas.hover({ position: { x: 300, y: 300 } });
    const launch = appPage.getByRole("button", { name: /Launch ball/ });
    await expect(launch).toBeEnabled();
    await launch.click();
    // The room flips to in_progress on the durable launch commit.
    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.livingRun?.roomState?.status;
      })
      .toBe("in_progress");
  }

  /** Wait until the room's loss ledger has recorded exactly the given count. */
  async function waitForLossLedger(appPage: Page, count: number): Promise<void> {
    await expect
      .poll(
        async () => {
          const state = await readShardbreakState(appPage);
          return (
            state.livingRun?.roomState?.processedOutcomeIds.filter((outcomeId) =>
              outcomeId.includes(":outcome:loss_of_ball:"),
            ).length ?? 0
          );
        },
        { timeout: 20_000 },
      )
      .toBe(count);
  }

  test("loss checkpoint: one explicit launch decrements integrity once and reload restores the durable checkpoint", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);
    await commitBattleRoom(appPage);

    const ready = requireLivingRun(await readShardbreakState(appPage));
    expect(ready.integrityCurrent).toBe(3);
    expect(ready.roomState?.combatCheckpoint).toMatchObject({
      kind: "pre_launch",
    });

    await launchOneVolley(appPage);
    await waitForLossLedger(appPage, 1);

    // CA-04/CA-15: the loss committed exactly one decrement and the room
    // carries the loss-kind durable checkpoint for the next assault.
    const afterLoss = requireLivingRun(await readShardbreakState(appPage));
    expect(afterLoss.integrityCurrent).toBe(2);
    expect(afterLoss.roomState?.status).toBe("in_progress");
    expect(afterLoss.roomState?.combatCheckpoint).toMatchObject({
      kind: "loss_of_ball",
    });
    expect(afterLoss.roomState?.processedOutcomeIds).toEqual([
      expect.stringContaining(":outcome:loss_of_ball:0"),
    ]);

    // CA-15: reload + resume reconstructs the run from IndexedDB — the same
    // checkpoint, no fabricated live volley, integrity decremented once only.
    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: /Glassway \/\/ Battle/ }),
    ).toBeVisible();
    const resumed = requireLivingRun(await readShardbreakState(appPage));
    expect(resumed.integrityCurrent).toBe(2);
    expect(resumed.roomState?.combatCheckpoint).toEqual(
      afterLoss.roomState?.combatCheckpoint,
    );
    expect(resumed.roomState?.processedOutcomeIds).toEqual(
      afterLoss.roomState?.processedOutcomeIds,
    );
    expect(resumed.roomState?.status).toBe("in_progress");
    await expect(appPage.getByRole("button", { name: /Launch ball/ })).toBeEnabled();
  });

  test("death journey: reload-checkpoint losses finalize the run into the terminal summary", async ({
    appPage,
  }) => {
    await startCircuitRogue(appPage);
    // CA-16's once-only observation starts from a zero-Shards profile.
    expect((await readShardbreakState(appPage)).profile?.shards).toBe(0);
    await commitBattleRoom(appPage);

    // CA-15's journey contract: each loss is followed by reload + resume so
    // every checkpoint crosses the durable reconstruction boundary.
    await launchOneVolley(appPage);
    await waitForLossLedger(appPage, 1);
    const atTwoState = await readShardbreakState(appPage);
    const atTwo = requireLivingRun(atTwoState);
    expect(atTwo.integrityCurrent).toBe(2);
    // No terminal award surfaces mid-run: the Shards land only at
    // finalization (CA-16 rides the finalize transaction, not the losses).
    expect(requireProfile(atTwoState).shards).toBe(0);

    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: /Glassway \/\/ Battle/ }),
    ).toBeVisible();

    await launchOneVolley(appPage);
    await waitForLossLedger(appPage, 2);
    const atOne = requireLivingRun(await readShardbreakState(appPage));
    expect(atOne.integrityCurrent).toBe(1);

    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: /Glassway \/\/ Battle/ }),
    ).toBeVisible();

    // The final assault: the third loss crosses CA-14's death boundary.
    await launchOneVolley(appPage);
    await expect
      .poll(
        async () => {
          const state = await readShardbreakState(appPage);
          return state.livingRunKeys.length;
        },
        { timeout: 30_000 },
      )
      .toBe(0);

    // IndexedDB truth: no living run; the profile carries the +20 terminal
    // award (CA-16: depth-1/0-boss death = 20, surfaced exactly once — 0
    // across every loss, 20 after the one finalization), the terminal
    // summary with the truthful zero boss counters (CA-17: no boss was
    // reached or defeated on this depth-1 path), the committed floor-entry
    // record, the finalization ID, and the unresolved carry-over choice.
    const state = await readShardbreakState(appPage);
    const profile = requireProfile(state);
    expect(profile.shards).toBe(20);
    expect(profile.lastRunSummary?.terminalReason).toBe("death");
    expect(profile.lastRunSummary?.runId).toBe(atOne.runId);
    expect(profile.lastRunSummary?.classId).toBe("class-circuit-rogue");
    expect(profile.lastRunSummary?.reachedDepth).toBe(1);
    expect(profile.lastRunSummary?.bossesReached).toBe(0);
    expect(profile.lastRunSummary?.bossesDefeated).toBe(0);
    expect(profile.lastRunSummary?.shardsEarned).toBe(20);
    expect(profile.lastRunSummary?.completedAt).toBeGreaterThan(0);
    expect(profile.records.highestReachedDepth).toBe(1);
    expect(profile.lastFinalizedRunId).toBe(atOne.runId);
    expect(profile.pendingRelicChoice).toMatchObject({
      sourceRunId: atOne.runId,
      options: [
        "relic-backfeed-cell",
        "relic-quiet-prism",
        "relic-spare-vector",
      ],
      selectedId: null,
      commitId: null,
    });
    expect(state.livingRun).toBeUndefined();

    // The durable gate lands the run summary (CA-19): the persisted truth
    // renders against IndexedDB — +20 Shards, the zero boss counters — with
    // the transient NEW record marker and the unresolved relic strip.
    await expect(
      appPage.getByRole("heading", { name: "Run terminated." }),
    ).toBeVisible();
    const metrics = appPage.locator('[aria-label="Run summary metrics"]');
    await expect(
      metrics.locator(".run-summary__metric", { hasText: "Reached depth" }),
    ).toContainText("01");
    await expect(
      metrics.locator(".run-summary__metric", { hasText: "Shards earned" }),
    ).toContainText("+20");
    await expect(
      metrics.locator(".run-summary__metric", { hasText: "Bosses cleared" }),
    ).toContainText("00");
    await expect(
      appPage.getByText("Run lost. +20 shards banked to the archive."),
    ).toBeVisible();
    await expect(appPage.locator(".run-summary__record")).toHaveAttribute(
      "data-record",
      "new",
    );
    await expect(
      appPage
        .getByRole("radiogroup", { name: "Carry-over relic choice" })
        .getByRole("radio"),
    ).toHaveCount(3);

    // The busy-window mitigation before the next boundary: the store drops
    // every command while a durable save is in flight.
    await expect
      .poll(async () => appPage.locator('[aria-busy="true"]').count())
      .toBe(0);

    // The gate is durable (Design Decision 6): after a reload the terminal
    // summary is still the landing, and the transient NEW marker is not —
    // the cleared record projection renders honestly.
    await appPage.reload();
    await expect(
      appPage.getByRole("heading", { name: "Run terminated." }),
    ).toBeVisible();
    await expect(appPage.locator('[data-record="new"]')).toHaveCount(0);
    const reloaded = await readShardbreakState(appPage);
    expect(reloaded.livingRunKeys).toEqual([]);
    expect(reloaded.profile?.shards).toBe(20);
    expect(reloaded.profile?.lastRunSummary?.terminalReason).toBe("death");

    // Try again while the choice is unresolved dispatches the decline; the
    // gate clears and the archive takes over with the recorded summary —
    // the Shards and records untouched by the decline.
    await expect
      .poll(async () => appPage.locator('[aria-busy="true"]').count())
      .toBe(0);
    await appPage.getByRole("button", { name: /Try again/ }).click();
    await expect(
      appPage.getByRole("heading", { name: "Choose your signal." }),
    ).toBeVisible();
    const declined = await readShardbreakState(appPage);
    expect(declined.profile?.pendingRelicChoice).toBeNull();
    expect(declined.profile?.shards).toBe(20);
    expect(declined.profile?.relicState?.equippedForNextRunId).toBeNull();
    expect(declined.profile?.unlocks?.relicIds).toEqual([]);
    await expect(appPage.getByText(/Depth 01 · local only/)).toBeVisible();
    await expect(
      appPage.getByRole("status").filter({ hasText: "Relic choice declined." }),
    ).toBeVisible();
  });

  test("terminal journey: choose Backfeed Cell resolves once and the next run carries it", async ({
    appPage,
  }) => {
    // Same loss pattern as the death journey: three reload-separated losses
    // cross CA-14's death boundary into the terminal summary.
    await startCircuitRogue(appPage);
    expect(requireProfile(await readShardbreakState(appPage)).shards).toBe(0);
    await commitBattleRoom(appPage);

    await launchOneVolley(appPage);
    await waitForLossLedger(appPage, 1);
    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: /Glassway \/\/ Battle/ }),
    ).toBeVisible();

    await launchOneVolley(appPage);
    await waitForLossLedger(appPage, 2);
    const atOne = requireLivingRun(await readShardbreakState(appPage));
    await appPage.reload();
    await appPage.getByRole("button", { name: "Resume living run" }).click();
    await expect(
      appPage.getByRole("heading", { name: /Glassway \/\/ Battle/ }),
    ).toBeVisible();

    await launchOneVolley(appPage);
    await expect
      .poll(
        async () => {
          const state = await readShardbreakState(appPage);
          return state.livingRunKeys.length;
        },
        { timeout: 30_000 },
      )
      .toBe(0);

    // The durable gate lands the terminal summary with the choice open.
    await expect(
      appPage.getByRole("heading", { name: "Run terminated." }),
    ).toBeVisible();
    const terminal = requireProfile(await readShardbreakState(appPage));
    expect(terminal.shards).toBe(20);
    expect(terminal.pendingRelicChoice).toMatchObject({
      sourceRunId: atOne.runId,
      selectedId: null,
      commitId: null,
    });

    // The busy-window mitigation before dispatching the resolve: the store
    // drops every command while a durable save is in flight.
    await expect
      .poll(async () => appPage.locator('[aria-busy="true"]').count())
      .toBe(0);

    // Selection IS the commit (CA-18 immediate-on-select): the radiogroup's
    // Backfeed Cell dispatches terminal/resolve-relic durably.
    await appPage
      .getByRole("radiogroup", { name: "Carry-over relic choice" })
      .getByRole("radio", { name: /Backfeed Cell/ })
      .click();

    // F1's landed shape: the RESOLVE keeps the pending record with
    // selectedId + commitId set; the unlock and the equip land in the same
    // profile mutation (CA-18's three durable facts, asserted on storage).
    await expect
      .poll(async () => {
        const state = await readShardbreakState(appPage);
        return state.profile?.pendingRelicChoice?.selectedId ?? null;
      })
      .toBe("relic-backfeed-cell");
    const resolved = requireProfile(await readShardbreakState(appPage));
    expect(resolved.pendingRelicChoice).toMatchObject({
      sourceRunId: atOne.runId,
      options: [
        "relic-backfeed-cell",
        "relic-quiet-prism",
        "relic-spare-vector",
      ],
      selectedId: "relic-backfeed-cell",
    });
    expect(resolved.pendingRelicChoice?.commitId).not.toBeNull();
    expect(resolved.pendingRelicChoice?.commitId).not.toBe("");
    expect(resolved.unlocks?.relicIds).toEqual(["relic-backfeed-cell"]);
    expect(resolved.relicState?.equippedForNextRunId).toBe(
      "relic-backfeed-cell",
    );
    expect(resolved.shards).toBe(20);

    // The choice resolved exactly once: the gate cleared and the archive
    // took over with the named save signal.
    await expect(
      appPage.getByRole("heading", { name: "Choose your signal." }),
    ).toBeVisible();
    await expect(
      appPage
        .getByRole("status")
        .filter({ hasText: "Backfeed Cell equipped for the next run." }),
    ).toBeVisible();

    // CA-19 durability: the resolved terminal is past-choice across a
    // reload — no gate, no radiogroup, storage unchanged.
    await appPage.reload();
    await expect(
      appPage.getByRole("heading", { name: "Choose your signal." }),
    ).toBeVisible();
    await expect(
      appPage.getByRole("radiogroup", { name: "Carry-over relic choice" }),
    ).toHaveCount(0);
    const afterReload = await readShardbreakState(appPage);
    expect(afterReload.livingRunKeys).toEqual([]);
    expect(requireProfile(afterReload)).toEqual(resolved);

    // A real start consumes the equip: the next run's build carries the
    // relic (the committed createInitialLivingRun boundary).
    const nextRun = await startCircuitRogue(appPage);
    expect(nextRun.build?.carryOverRelicId).toBe("relic-backfeed-cell");
  });
});
