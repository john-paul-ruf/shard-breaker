import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import type { AppCommand } from "./commands";
import type { ContentCatalog, ContentId } from "../domain/content/catalog";
import type {
  RecoveryState,
  RoomState,
  ShopState,
} from "../domain/run/model";
import type { CombatCheckpoint } from "../domain/run/model";
import { ROUTE_SUPPORT_DEFINITIONS } from "../domain/content/rooms";
import { fromCombatCheckpoint } from "../domain/combat/layout";
import { resolveVolleyEffects } from "../domain/combat/effects";
import { createBossCombatState } from "../domain/combat/bossState";
import type { BossCombatRuntime } from "../domain/combat/bossState";
import { CombatScreen } from "../ui/screens/CombatScreen";
import type { CombatScreenViewModel } from "../ui/screens/CombatScreen";
import { BossScreen } from "../ui/screens/BossScreen";
import type { BossScreenViewModel } from "../ui/screens/BossScreen";
import { HomeScreen } from "../ui/screens/HomeScreen";
import type { HomeScreenViewModel } from "../ui/screens/HomeScreen";
import { RunSummaryScreen } from "../ui/screens/RunSummaryScreen";
import type { RunSummaryScreenViewModel } from "../ui/screens/RunSummaryScreen";
import { RewardsScreen } from "../ui/screens/RewardsScreen";
import type { RewardsScreenViewModel } from "../ui/screens/RewardsScreen";
import { RoomScreen } from "../ui/screens/RoomScreen";
import type { RoomScreenViewModel } from "../ui/screens/RoomScreen";
import { RouteMapScreen } from "../ui/screens/RouteMapScreen";
import { createRouteMapScreenModel } from "../ui/screens/RouteMapScreen";
import type { RouteMapScreenViewModel } from "../ui/screens/RouteMapScreen";
import type { AppState, AppStore } from "./appStore";
import { deriveScreen } from "./navigation";
import type { ScreenDescriptor } from "./navigation";

export interface AppProps {
  readonly store: AppStore;
  readonly catalog: ContentCatalog;
}

function boundedFatalMessage(message: string | null): string {
  return (
    message?.trim().slice(0, 320) ||
    "The local archive could not be opened. Existing local data was not reset."
  );
}

function ErrorShell({ message }: { readonly message: string }) {
  return (
    <main className="app-shell">
      <section className="surface-panel" aria-labelledby="archive-error-title">
        <p className="signal-eyebrow" data-tone="danger">
          Local data · action required
        </p>
        <h1 id="archive-error-title">Local archive unavailable</h1>
        <p role="alert">{boundedFatalMessage(message)}</p>
        <p>
          Check this browser&apos;s storage permissions, then reload the page. Do
          not clear site data unless you intend to erase the local archive.
        </p>
      </section>
    </main>
  );
}

function LoadingShell() {
  return (
    <main className="app-shell" aria-busy="true">
      <section className="surface-panel" aria-labelledby="archive-loading-title">
        <p className="signal-eyebrow">Local archive</p>
        <h1 id="archive-loading-title">Opening local archive</h1>
        <p role="status" aria-live="polite">
          Validating the last committed profile and living-run checkpoint.
        </p>
      </section>
    </main>
  );
}

type HomeModelResult =
  | { readonly ok: true; readonly model: HomeScreenViewModel }
  | { readonly ok: false; readonly message: string };

type RunSummaryModelResult =
  | { readonly ok: true; readonly model: RunSummaryScreenViewModel }
  | { readonly ok: false; readonly message: string };

type RouteMapModelResult =
  | { readonly ok: true; readonly model: RouteMapScreenViewModel }
  | { readonly ok: false; readonly message: string };

type RoomModelResult =
  | { readonly ok: true; readonly model: RoomScreenViewModel }
  | { readonly ok: false; readonly message: string };

type CombatModelResult =
  | { readonly ok: true; readonly model: CombatScreenViewModel }
  | { readonly ok: false; readonly message: string };

type BossModelResult =
  | { readonly ok: true; readonly model: BossScreenViewModel }
  | { readonly ok: false; readonly message: string };

type RewardsModelResult =
  | { readonly ok: true; readonly model: RewardsScreenViewModel }
  | { readonly ok: false; readonly message: string };

function isUnlocked(
  profileClassIds: readonly ContentId[],
  classId: ContentId,
): boolean {
  return profileClassIds.includes(classId);
}

function createHomeModel(
  state: AppState,
  catalog: ContentCatalog,
  screen: Extract<ScreenDescriptor, { id: "home" }>,
): HomeModelResult {
  const profile = state.profile;
  if (state.loadStatus !== "ready" || profile === null) {
    return {
      ok: false,
      message: "The local profile was not available after archive validation.",
    };
  }

  const classes = catalog.listClasses().map((definition) => ({
    id: definition.id,
    name: definition.displayName,
    startingIntegrity: definition.startingIntegrity,
    tradeoff: definition.tradeoff,
    isUnlocked: isUnlocked(profile.unlocks.classIds, definition.id),
  }));
  const selectedClassId = state.selectedClassId;
  if (
    selectedClassId === null ||
    !classes.some(
      (definition) =>
        definition.id === selectedClassId && definition.isUnlocked,
    )
  ) {
    return {
      ok: false,
      message: "The local profile has no valid selected starting class.",
    };
  }

  let livingRun: HomeScreenViewModel["livingRun"] = null;
  if (state.livingRun !== null) {
    const classResult = catalog.getClass(state.livingRun.classId);
    if (!classResult.ok) {
      return {
        ok: false,
        message: "The saved living run references an unknown class.",
      };
    }
    livingRun = {
      runId: state.livingRun.runId,
      classId: state.livingRun.classId,
      className: classResult.value.displayName,
      depth: state.livingRun.depth,
      integrityCurrent: state.livingRun.integrityCurrent,
      integrityMaximum: state.livingRun.integrityMax,
      bossesDefeated: state.livingRun.progress.bossesDefeated,
    };
  }

  return {
    ok: true,
    model: {
      mode: screen.mode,
      loadState: "ready",
      shards: profile.shards,
      highestReachedDepth: profile.records.highestReachedDepth,
      classes,
      selectedClassId,
      livingRun,
      isReplacementGuardOpen: state.isReplacementGuardOpen,
      isBusy: state.isBusy,
      saveSignal: state.saveSignal,
    },
  };
}

function createRouteMapModel(
  state: AppState,
  catalog: ContentCatalog,
): RouteMapModelResult {
  const livingRun = state.livingRun;
  const profile = state.profile;
  if (state.loadStatus !== "ready" || profile === null || livingRun === null) {
    return {
      ok: false,
      message: "The route map is not available without a living run.",
    };
  }

  const classResult = catalog.getClass(livingRun.classId);
  if (!classResult.ok) {
    return {
      ok: false,
      message: "The saved living run references an unknown class.",
    };
  }

  return {
    ok: true,
    model: createRouteMapScreenModel(
      livingRun,
      classResult.value.displayName,
      catalog,
      state.isBusy,
      state.saveSignal,
    ),
  };
}

function roomDisplayName(
  catalog: ContentCatalog,
  roomType: RoomState["roomType"],
): string {
  const room = catalog
    .listRooms()
    .find((definition) => definition.roomType === roomType);
  return room === undefined ? roomType : room.displayName;
}

function roomSummary(
  catalog: ContentCatalog,
  roomType: RoomState["roomType"],
): string {
  const room = catalog
    .listRooms()
    .find((definition) => definition.roomType === roomType);
  return room === undefined ? "" : room.summary;
}

function objectiveNamesFor(
  roomState: RoomState,
): readonly string[] {
  return roomState.objectiveIds.map((objectiveId) => {
    const support = ROUTE_SUPPORT_DEFINITIONS.find(
      (definition) => definition.id === objectiveId,
    );
    return support === undefined ? objectiveId : support.displayName;
  });
}

function createRoomModel(
  state: AppState,
  catalog: ContentCatalog,
): RoomModelResult {
  const livingRun = state.livingRun;
  if (state.loadStatus !== "ready" || livingRun === null) {
    return {
      ok: false,
      message: "The room screen is not available without a living run.",
    };
  }

  const classResult = catalog.getClass(livingRun.classId);
  if (!classResult.ok) {
    return {
      ok: false,
      message: "The saved living run references an unknown class.",
    };
  }

  const roomState: RoomState | null = livingRun.roomState;
  if (roomState === null) {
    return {
      ok: false,
      message: "The saved living run has no committed room to display.",
    };
  }

  let shop: RoomScreenViewModel["shop"] = null;
  const shopState: ShopState | null = roomState.shop;
  if (shopState !== null) {
    const items = shopState.inventory.map((item) => {
      const serviceResult = catalog.getShopService(item.itemId);
      return {
        itemId: item.itemId,
        displayName: serviceResult.ok
          ? serviceResult.value.displayName
          : item.itemId,
        price: item.price,
        isPurchased: shopState.purchasedItemIds.includes(item.itemId),
        isAffordable: livingRun.runCurrency >= item.price,
      };
    });
    shop = { items, hasItems: items.length > 0 };
  }

  const recovery: RecoveryState | null = roomState.recovery;

  return {
    ok: true,
    model: {
      runId: livingRun.runId,
      className: classResult.value.displayName,
      depth: livingRun.depth,
      cycle: livingRun.cycle,
      roomType: roomState.roomType,
      roomName: roomDisplayName(catalog, roomState.roomType),
      roomSummary: roomSummary(catalog, roomState.roomType),
      objectiveNames: objectiveNamesFor(roomState),
      integrityCurrent: livingRun.integrityCurrent,
      integrityMaximum: livingRun.integrityMax,
      runCurrency: livingRun.runCurrency,
      shop,
      recovery:
        recovery === null
          ? null
          : {
              restoreAmount: recovery.restoreAmount,
              isCommitted: recovery.committed,
            },
      roomStatus: roomState.status,
      isBusy: state.isBusy,
      saveSignal: state.saveSignal,
    },
  };
}

/**
 * Build the combat room's display model: catalog-resolved skill charges from
 * the durable checkpoint, passive summary, the clear-outcome gate, and the
 * two closures the Arena host needs — checkpoint→state reconstruction
 * (CA-03) and the per-volley effect resolver against the freshest published
 * checkpoint.
 */
function createCombatModel(
  state: AppState,
  catalog: ContentCatalog,
): CombatModelResult {
  const livingRun = state.livingRun;
  if (state.loadStatus !== "ready" || livingRun === null) {
    return {
      ok: false,
      message: "The combat room is not available without a living run.",
    };
  }

  const classResult = catalog.getClass(livingRun.classId);
  if (!classResult.ok) {
    return {
      ok: false,
      message: "The saved living run references an unknown class.",
    };
  }

  const roomState: RoomState | null = livingRun.roomState;
  if (roomState === null) {
    return {
      ok: false,
      message: "The saved living run has no committed room to display.",
    };
  }
  const checkpoint: CombatCheckpoint | null = roomState.combatCheckpoint;
  if (checkpoint === null) {
    return {
      ok: false,
      message: "The combat room has no saved arena state to display.",
    };
  }

  const skillDisplay = checkpoint.skillCharges.flatMap((charge) => {
    const skillResult = catalog.getSkill(charge.skillId);
    if (!skillResult.ok) {
      return [];
    }
    return [
      {
        skillId: charge.skillId,
        name: skillResult.value.displayName,
        description: skillResult.value.description,
        charges: charge.remaining,
        maximum: charge.maximum,
      },
    ];
  });

  const passiveSummary = livingRun.build.passiveEquipmentIds
    .map((equipmentId) => {
      const result = catalog.getEquipment(equipmentId);
      return result.ok ? result.value.displayName : null;
    })
    .filter((name): name is string => name !== null)
    .join(" · ");

  const initContext = {
    seed: livingRun.seed,
    contentVersion: livingRun.contentVersion,
    roomId: roomState.roomId,
    eventKey: roomState.eventKey,
    formationId: roomState.threatProfile.formationId,
    density: roomState.threatProfile.density,
    durabilityFactor: roomState.threatProfile.durabilityFactor,
    lossCount: roomState.processedOutcomeIds.filter((outcomeId) =>
      outcomeId.startsWith(roomState.eventKey + ":outcome:loss_of_ball:"),
    ).length,
    hazardIds: roomState.threatProfile.hazardIds,
  };

  const pendingHazard = checkpoint.hazards.find(
    (hazard) => hazard.state !== "resolved",
  );

  return {
    ok: true,
    model: {
      runId: livingRun.runId,
      className: classResult.value.displayName,
      depth: livingRun.depth,
      cycle: livingRun.cycle,
      roomType: roomState.roomType,
      roomName: roomDisplayName(catalog, roomState.roomType),
      roomSummary: roomSummary(catalog, roomState.roomType),
      objectiveNames: objectiveNamesFor(roomState),
      integrityCurrent: livingRun.integrityCurrent,
      integrityMaximum: livingRun.integrityMax,
      runCurrency: livingRun.runCurrency,
      skillDisplay,
      passiveCount: livingRun.build.passiveEquipmentIds.length,
      passiveSummary:
        passiveSummary === "" ? "none equipped yet" : passiveSummary,
      hasClearOutcome: roomState.processedOutcomeIds.includes(
        roomState.eventKey + ":outcome:clear:0",
      ),
      isBusy: state.isBusy,
      saveSignal: state.saveSignal,
      telegraph:
        pendingHazard === undefined
          ? null
          : {
              title: "Telegraph // hazard lane",
              detail:
                "Hazard lane pending in this room. Static hatch marks and this text remain when motion is reduced.",
              tone:
                pendingHazard.state === "telegraphed"
                  ? ("incoming" as const)
                  : ("active" as const),
            },
      createInitialState: () =>
        fromCombatCheckpoint(checkpoint, initContext, catalog),
      resolveVolleyEffects: () =>
        resolveVolleyEffects(
          catalog,
          livingRun.build,
          [],
          checkpoint.skillCharges,
        ),
    },
  };
}

/**
 * Build the boss room's display model (CAP-09): the routed archetype's
 * catalog definition resolves the boss anatomy through the deterministic
 * boss-layout stream, and the room's selected modifier IDs apply through the
 * fail-closed registry. The Arena's two closures mirror the CombatScreen
 * contract; the durable checkpoint stays S01's formation snapshot
 * (`bossState: null`), so the boss runtime recomposes App-side on every
 * publish and each loss restore re-derives the same anatomy.
 */
function createBossModel(
  state: AppState,
  catalog: ContentCatalog,
): BossModelResult {
  const livingRun = state.livingRun;
  if (state.loadStatus !== "ready" || livingRun === null) {
    return {
      ok: false,
      message: "The boss room is not available without a living run.",
    };
  }

  const classResult = catalog.getClass(livingRun.classId);
  if (!classResult.ok) {
    return {
      ok: false,
      message: "The saved living run references an unknown class.",
    };
  }

  const roomState: RoomState | null = livingRun.roomState;
  if (roomState === null) {
    return {
      ok: false,
      message: "The saved living run has no committed room to display.",
    };
  }
  if (roomState.roomType !== "boss") {
    return {
      ok: false,
      message: "The boss screen is only available in a boss room.",
    };
  }
  const boss = roomState.boss;
  if (boss === null) {
    return {
      ok: false,
      message: "The boss room has no routed boss identity to display.",
    };
  }
  const checkpoint = roomState.combatCheckpoint;
  if (checkpoint === null) {
    return {
      ok: false,
      message: "The boss room has no saved arena state to display.",
    };
  }

  const skillDisplay = checkpoint.skillCharges.flatMap((charge) => {
    const skillResult = catalog.getSkill(charge.skillId);
    if (!skillResult.ok) {
      return [];
    }
    return [
      {
        skillId: charge.skillId,
        name: skillResult.value.displayName,
        description: skillResult.value.description,
        charges: charge.remaining,
        maximum: charge.maximum,
      },
    ];
  });

  const passiveSummary = livingRun.build.passiveEquipmentIds
    .map((equipmentId) => {
      const result = catalog.getEquipment(equipmentId);
      return result.ok ? result.value.displayName : null;
    })
    .filter((name): name is string => name !== null)
    .join(" · ");

  const initContext = {
    seed: livingRun.seed,
    contentVersion: livingRun.contentVersion,
    roomId: roomState.roomId,
    eventKey: roomState.eventKey,
    formationId: roomState.threatProfile.formationId,
    density: roomState.threatProfile.density,
    durabilityFactor: roomState.threatProfile.durabilityFactor,
    lossCount: roomState.processedOutcomeIds.filter((outcomeId) =>
      outcomeId.startsWith(roomState.eventKey + ":outcome:loss_of_ball:"),
    ).length,
    hazardIds: roomState.threatProfile.hazardIds,
  };
  const bossInitContext = {
    ...initContext,
    archetypeId: boss.archetypeId,
    modifierIds: boss.modifierIds,
  };

  let bossRuntime: BossCombatRuntime;
  try {
    bossRuntime = createBossCombatState(catalog, bossInitContext);
  } catch {
    return {
      ok: false,
      message:
        "The routed boss identity could not be composed for this room's arena.",
    };
  }

  const modifierChips = bossRuntime.definition.compatibleModifiers.map(
    (entry) => ({
      modifierId: entry.id,
      displayName: entry.displayName,
      isApplied: boss.modifierIds.includes(entry.id),
      cappedDescription: entry.cappedDescription,
    }),
  );

  return {
    ok: true,
    model: {
      runId: livingRun.runId,
      className: classResult.value.displayName,
      depth: livingRun.depth,
      cycle: livingRun.cycle,
      roomType: roomState.roomType,
      roomName: roomDisplayName(catalog, roomState.roomType),
      roomSummary: roomSummary(catalog, roomState.roomType),
      objectiveNames: objectiveNamesFor(roomState),
      integrityCurrent: livingRun.integrityCurrent,
      integrityMaximum: livingRun.integrityMax,
      runCurrency: livingRun.runCurrency,
      skillDisplay,
      passiveCount: livingRun.build.passiveEquipmentIds.length,
      passiveSummary:
        passiveSummary === "" ? "none equipped yet" : passiveSummary,
      hasClearOutcome: roomState.processedOutcomeIds.includes(
        roomState.eventKey + ":outcome:clear:0",
      ),
      isBusy: state.isBusy,
      saveSignal: state.saveSignal,
      boss: bossRuntime,
      modifierChips,
      // Breach begins the room's assault at the checkpoint's committed aim —
      // the pre-launch snapshot always carries the legal zero aim — while the
      // arena's own launch control remains the explicit in-volley launcher.
      breachAim: checkpoint.aimAngle,
      canBreach: roomState.status !== "resolved",
      createInitialState: () =>
        fromCombatCheckpoint(checkpoint, initContext, catalog),
      resolveVolleyEffects: () =>
        resolveVolleyEffects(
          catalog,
          livingRun.build,
          [],
          checkpoint.skillCharges,
        ),
    },
  };
}

function createRewardsModel(
  state: AppState,
  catalog: ContentCatalog,
): RewardsModelResult {
  const livingRun = state.livingRun;
  if (state.loadStatus !== "ready" || livingRun === null) {
    return {
      ok: false,
      message: "The reward draft is not available without a living run.",
    };
  }

  const classResult = catalog.getClass(livingRun.classId);
  if (!classResult.ok) {
    return {
      ok: false,
      message: "The saved living run references an unknown class.",
    };
  }

  if (livingRun.rewardState === null) {
    return {
      ok: false,
      message: "The saved living run has no reward draft to display.",
    };
  }

  return {
    ok: true,
    model: {
      runId: livingRun.runId,
      className: classResult.value.displayName,
      depth: livingRun.depth,
      cycle: livingRun.cycle,
      rewardCards: livingRun.rewardState.cards,
      build: livingRun.build,
      isBusy: state.isBusy,
      saveSignal: state.saveSignal,
      catalog,
    },
  };
}

/**
 * Build the run terminal's display model (CA-19): fail closed on a terminal
 * profile missing either half of its required pair (the summary or the
 * pending choice), resolve build and relic copy through the catalog with the
 * unknown-ID fallthrough, and pass the transient record projection through.
 */
function createRunSummaryModel(
  state: AppState,
  catalog: ContentCatalog,
): RunSummaryModelResult {
  const profile = state.profile;
  if (state.loadStatus !== "ready" || profile === null) {
    return {
      ok: false,
      message: "The local profile was not available after archive validation.",
    };
  }
  const summary = profile.lastRunSummary;
  if (summary === null) {
    return {
      ok: false,
      message: "The saved profile has no finalized run summary to display.",
    };
  }
  const pending = profile.pendingRelicChoice;
  if (pending === null) {
    return {
      ok: false,
      message: "The saved profile has no carry-over relic choice to display.",
    };
  }

  const classResult = catalog.getClass(summary.classId);
  if (!classResult.ok) {
    return {
      ok: false,
      message: "The saved run summary references an unknown class.",
    };
  }

  const activeSkillNames = summary.activeSkillIds.map((skillId) => {
    const result = catalog.getSkill(skillId);
    return result.ok ? result.value.displayName : skillId;
  });
  const passiveEquipmentNames = summary.passiveEquipmentIds.map((itemId) => {
    const result = catalog.getEquipment(itemId);
    return result.ok ? result.value.displayName : itemId;
  });
  const pendingRelicChoice: RunSummaryScreenViewModel["pendingRelicChoice"] = {
    options: pending.options.map((relicId) => {
      const result = catalog.getRelic(relicId);
      return {
        id: relicId,
        name: result.ok ? result.value.displayName : relicId,
        cappedDescription: result.ok
          ? result.value.cappedDescription
          : "Unknown relic.",
      };
    }),
  };

  return {
    ok: true,
    model: {
      summary: {
        runId: summary.runId,
        className: classResult.value.displayName,
        reachedDepth: summary.reachedDepth,
        bossesReached: summary.bossesReached,
        bossesDefeated: summary.bossesDefeated,
        activeSkillNames,
        passiveEquipmentNames,
        shardsEarned: summary.shardsEarned,
        terminalReason: summary.terminalReason,
      },
      record: state.terminalRecord,
      pendingRelicChoice,
      isBusy: state.isBusy,
      saveSignal: state.saveSignal,
    },
  };
}

/** Bind the external application store to the implemented launch screen. */
export function App({ store, catalog }: AppProps) {
  const initializedStoreRef = useRef<AppStore | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (initializedStoreRef.current === store) {
      return;
    }
    initializedStoreRef.current = store;
    void store.initialize().catch(() => undefined);
  }, [store]);

  const dispatch = useCallback(
    (command: AppCommand) => {
      void store.dispatch(command);
    },
    [store],
  );

  if (state.loadStatus === "idle" || state.loadStatus === "loading") {
    return <LoadingShell />;
  }
  if (state.loadStatus === "failed") {
    return <ErrorShell message={boundedFatalMessage(state.fatalMessage)} />;
  }

  const screen = deriveScreen(state);

  if (screen.id === "room-boss") {
    const bossModel = createBossModel(state, catalog);
    return bossModel.ok ? (
      <BossScreen model={bossModel.model} dispatch={dispatch} />
    ) : (
      <ErrorShell message={bossModel.message} />
    );
  }

  if (screen.id === "room-combat") {
    const combatModel = createCombatModel(state, catalog);
    return combatModel.ok ? (
      <CombatScreen model={combatModel.model} dispatch={dispatch} />
    ) : (
      <ErrorShell message={combatModel.message} />
    );
  }

  if (screen.id === "room") {
    const roomModel = createRoomModel(state, catalog);
    return roomModel.ok ? (
      <RoomScreen model={roomModel.model} dispatch={dispatch} />
    ) : (
      <ErrorShell message={roomModel.message} />
    );
  }

  if (screen.id === "reward") {
    const rewardsModel = createRewardsModel(state, catalog);
    return rewardsModel.ok ? (
      <RewardsScreen model={rewardsModel.model} dispatch={dispatch} />
    ) : (
      <ErrorShell message={rewardsModel.message} />
    );
  }

  if (screen.id === "route-map") {
    const routeModel = createRouteMapModel(state, catalog);
    return routeModel.ok ? (
      <RouteMapScreen model={routeModel.model} dispatch={dispatch} />
    ) : (
      <ErrorShell message={routeModel.message} />
    );
  }

  if (screen.id === "run-summary") {
    const runSummaryModel = createRunSummaryModel(state, catalog);
    return runSummaryModel.ok ? (
      <RunSummaryScreen model={runSummaryModel.model} dispatch={dispatch} />
    ) : (
      <ErrorShell message={runSummaryModel.message} />
    );
  }

  const home = createHomeModel(state, catalog, screen);
  return home.ok ? (
    <HomeScreen model={home.model} dispatch={dispatch} />
  ) : (
    <ErrorShell message={home.message} />
  );
}