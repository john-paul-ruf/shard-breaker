import type { ContentCatalog, ContentId } from "../domain/content/catalog";
import type { RunRejection } from "../domain/run/commands";
import type { LivingRun, Profile, RunState } from "../domain/run/model";
import { runReducer } from "../domain/run/reducer";
import type { RunLifecycleRepository } from "../persistence/envelopes";
import type { AppCommand } from "./commands";

export type LoadStatus = "idle" | "loading" | "ready" | "failed";
export type LaunchMode = "archive" | "checkpoint";

export type SaveSignalView =
  | { readonly tone: "saved"; readonly message: string }
  | { readonly tone: "warning"; readonly message: string }
  | { readonly tone: "rejected"; readonly message: string }
  | null;

export interface AppState {
  readonly loadStatus: LoadStatus;
  readonly profile: Profile | null;
  readonly livingRun: LivingRun | null;
  readonly selectedClassId: ContentId | null;
  readonly launchMode: LaunchMode;
  readonly isReplacementGuardOpen: boolean;
  readonly isBusy: boolean;
  readonly saveSignal: SaveSignalView;
  readonly fatalMessage: string | null;
}

export interface AppStore {
  initialize(): Promise<void>;
  dispatch(command: AppCommand): Promise<void>;
  getSnapshot(): AppState;
  subscribe(listener: () => void): () => void;
}

export interface AppStoreDependencies {
  readonly catalog: ContentCatalog;
  readonly repository: RunLifecycleRepository;
  readonly clock: () => number;
  readonly createId: () => string;
  readonly createSeed: () => string;
}

const INITIAL_STATE: AppState = Object.freeze({
  loadStatus: "idle",
  profile: null,
  livingRun: null,
  selectedClassId: null,
  launchMode: "archive",
  isReplacementGuardOpen: false,
  isBusy: false,
  saveSignal: null,
  fatalMessage: null,
});

function firstUnlockedClassId(
  catalog: ContentCatalog,
  profile: Profile,
): ContentId | null {
  return (
    catalog
      .listClasses()
      .find((definition) => profile.unlocks.classIds.includes(definition.id))
      ?.id ?? null
  );
}

function isUnlockedClass(
  catalog: ContentCatalog,
  profile: Profile,
  classId: ContentId | null,
): classId is ContentId {
  return (
    classId !== null &&
    catalog.hasClass(classId) &&
    profile.unlocks.classIds.includes(classId)
  );
}

function initializationFailureMessage(message: string): string {
  const boundedMessage = message.trim().slice(0, 240);
  return `${boundedMessage || "The local archive could not be opened."} Existing local data was not reset.`;
}

function boundedAdapterMessage(message: string): string {
  return message.trim().slice(0, 200) || "The local save was rejected.";
}

function runRejectionMessage(error: RunRejection): string {
  switch (error.code) {
    case "living-run-exists":
      return "A living run already exists and was not overwritten.";
    case "no-living-run":
      return "No living run is available for that action.";
    case "unknown-class":
      return "The selected class is not part of this content version.";
    case "class-locked":
      return "The selected class is still locked in the local profile.";
    case "stale-profile-revision":
    case "stale-run":
    case "stale-run-revision":
      return "The saved archive changed before the action completed. No newer data was overwritten.";
    case "invalid-metadata":
      return "The run identity could not be created safely. No saved data was changed.";
    case "invalid-state":
      return "The current archive state is invalid. No saved data was changed.";
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled application command: ${JSON.stringify(value)}`);
}

function isDurableCommand(command: AppCommand): boolean {
  return (
    command.type === "run/request-start" ||
    command.type === "run/confirm-abandon-and-start"
  );
}

/** Construct the sole serialized application orchestration boundary. */
export function createAppStore(dependencies: AppStoreDependencies): AppStore {
  let state = INITIAL_STATE;
  let queue: Promise<void> = Promise.resolve();
  let initializationPromise: Promise<void> | null = null;
  let hasPendingDurableCommand = false;
  const listeners = new Set<() => void>();

  function publish(patch: Partial<AppState>): void {
    const entries = Object.entries(patch) as Array<
      [keyof AppState, AppState[keyof AppState]]
    >;
    if (entries.every(([key, value]) => Object.is(state[key], value))) {
      return;
    }

    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      listener();
    }
  }

  function enqueue(task: () => Promise<void> | void): Promise<void> {
    const execution = queue.then(task);
    queue = execution.catch(() => undefined);
    return execution;
  }

  function publishInitializationFailure(message: string): void {
    publish({
      loadStatus: "failed",
      profile: null,
      livingRun: null,
      selectedClassId: null,
      launchMode: "archive",
      isReplacementGuardOpen: false,
      isBusy: false,
      saveSignal: null,
      fatalMessage: initializationFailureMessage(message),
    });
  }

  async function loadInitializedState(): Promise<RunState | null> {
    const initialLoad = await dependencies.repository.loadState();
    if (initialLoad.ok) {
      return initialLoad.value;
    }
    if (initialLoad.error.code !== "profile-missing") {
      publishInitializationFailure(initialLoad.error.message);
      return null;
    }

    const bootstrap = await dependencies.repository.bootstrapProfile({
      profileId: dependencies.createId(),
      now: dependencies.clock(),
      commitId: dependencies.createId(),
    });
    if (!bootstrap.ok) {
      publishInitializationFailure(bootstrap.error.message);
      return null;
    }

    const loaded = await dependencies.repository.loadState();
    if (!loaded.ok) {
      publishInitializationFailure(loaded.error.message);
      return null;
    }
    return loaded.value;
  }

  async function initializeStore(): Promise<void> {
    publish({
      loadStatus: "loading",
      fatalMessage: null,
      saveSignal: null,
    });

    try {
      const loaded = await loadInitializedState();
      if (loaded === null) {
        return;
      }
      const selectedClassId = isUnlockedClass(
        dependencies.catalog,
        loaded.profile,
        state.selectedClassId,
      )
        ? state.selectedClassId
        : firstUnlockedClassId(dependencies.catalog, loaded.profile);
      if (selectedClassId === null) {
        publishInitializationFailure(
          "The local profile has no available starting class.",
        );
        return;
      }

      publish({
        loadStatus: "ready",
        profile: loaded.profile,
        livingRun: loaded.livingRun,
        selectedClassId,
        launchMode: "archive",
        isReplacementGuardOpen: false,
        isBusy: false,
        saveSignal: null,
        fatalMessage: null,
      });
    } catch {
      publishInitializationFailure("The local archive could not be opened.");
    }
  }

  function currentRunState(): RunState | null {
    if (state.loadStatus !== "ready" || state.profile === null) {
      return null;
    }
    return { profile: state.profile, livingRun: state.livingRun };
  }

  function classDisplayName(classId: ContentId): string | null {
    const result = dependencies.catalog.getClass(classId);
    return result.ok ? result.value.displayName : null;
  }

  function rejectCommand(message: string): void {
    publish({
      isBusy: false,
      saveSignal: { tone: "rejected", message },
    });
  }

  function handleSelectClass(classId: ContentId): void {
    if (state.profile === null || state.isBusy) {
      return;
    }
    if (
      isUnlockedClass(
        dependencies.catalog,
        state.profile,
        classId,
      )
    ) {
      publish({ selectedClassId: classId });
    }
  }

  async function handleRequestStart(): Promise<void> {
    const runState = currentRunState();
    if (runState === null || state.isBusy) {
      return;
    }
    if (runState.livingRun !== null) {
      publish({ isReplacementGuardOpen: true });
      return;
    }

    const selectedClassId = state.selectedClassId;
    if (
      !isUnlockedClass(
        dependencies.catalog,
        runState.profile,
        selectedClassId,
      )
    ) {
      rejectCommand("Select an unlocked class before starting a run.");
      return;
    }

    publish({ isBusy: true, saveSignal: null });
    try {
      const transition = runReducer(
        runState,
        {
          type: "StartRun",
          classId: selectedClassId,
          runId: dependencies.createId(),
          seed: dependencies.createSeed(),
          now: dependencies.clock(),
          commitId: dependencies.createId(),
          expectedProfileRevision: runState.profile.revision,
        },
        dependencies.catalog,
      );
      if (!transition.ok) {
        rejectCommand(runRejectionMessage(transition.error));
        return;
      }
      if (
        transition.persistence.kind !== "start-run" ||
        transition.state.livingRun === null
      ) {
        rejectCommand("The new run could not be prepared safely.");
        return;
      }

      const committed = await dependencies.repository.startRun({
        ...transition.persistence,
        proposedRun: transition.state.livingRun,
      });
      if (!committed.ok) {
        rejectCommand(
          `The new run was not saved. ${boundedAdapterMessage(committed.error.message)}`,
        );
        return;
      }
      if (committed.value.livingRun === null) {
        rejectCommand("The new run was not present after the save completed.");
        return;
      }

      const className = classDisplayName(committed.value.livingRun.classId);
      publish({
        profile: committed.value.profile,
        livingRun: committed.value.livingRun,
        launchMode: "checkpoint",
        isReplacementGuardOpen: false,
        isBusy: false,
        saveSignal: {
          tone: "saved",
          message: `New ${className ?? "selected class"} run saved at Depth ${String(committed.value.livingRun.depth)}.`,
        },
      });
    } catch {
      rejectCommand(
        "The new run could not be saved. The prior archive remains unchanged.",
      );
    }
  }

  function handleResume(): void {
    const livingRun = state.livingRun;
    if (livingRun === null) {
      rejectCommand("No living run is available to resume.");
      return;
    }
    const className = classDisplayName(livingRun.classId);
    if (className === null) {
      rejectCommand("The saved run references an unknown class.");
      return;
    }
    publish({
      launchMode: "checkpoint",
      isReplacementGuardOpen: false,
      saveSignal: {
        tone: "saved",
        message: `Restored ${className} at Depth ${String(livingRun.depth)}.`,
      },
    });
  }

  function handleCancelReplacement(): void {
    publish({ isReplacementGuardOpen: false });
  }

  function handleReturnToArchive(): void {
    publish({ launchMode: "archive" });
  }

  async function handleConfirmAbandonAndStart(): Promise<void> {
    const beforeAbandon = currentRunState();
    const selectedClassId = state.selectedClassId;
    if (
      beforeAbandon === null ||
      !state.isReplacementGuardOpen ||
      beforeAbandon.livingRun === null ||
      !isUnlockedClass(
        dependencies.catalog,
        beforeAbandon.profile,
        selectedClassId,
      )
    ) {
      rejectCommand(
        "The replacement request is no longer valid. No saved run was changed.",
      );
      return;
    }

    publish({ isBusy: true, saveSignal: null });
    let abandonedState: RunState;
    try {
      const abandonTransition = runReducer(
        beforeAbandon,
        {
          type: "AbandonRun",
          runId: beforeAbandon.livingRun.runId,
          expectedRevision: beforeAbandon.livingRun.revision,
          commitId: dependencies.createId(),
        },
        dependencies.catalog,
      );
      if (!abandonTransition.ok) {
        rejectCommand(runRejectionMessage(abandonTransition.error));
        return;
      }
      if (abandonTransition.persistence.kind !== "abandon-run") {
        rejectCommand("The living run could not be prepared for abandonment.");
        return;
      }

      const abandoned = await dependencies.repository.abandonRun(
        abandonTransition.persistence,
      );
      if (!abandoned.ok) {
        rejectCommand(
          `The living run was not abandoned. ${boundedAdapterMessage(abandoned.error.message)}`,
        );
        return;
      }
      if (abandoned.value.livingRun !== null) {
        publish({
          profile: abandoned.value.profile,
          livingRun: abandoned.value.livingRun,
          isBusy: false,
          saveSignal: {
            tone: "rejected",
            message: "The repository did not confirm abandonment. No replacement was started.",
          },
        });
        return;
      }
      abandonedState = abandoned.value;
    } catch {
      rejectCommand(
        "The living run could not be abandoned. The prior archive remains available.",
      );
      return;
    }

    publish({
      profile: abandonedState.profile,
      livingRun: null,
      launchMode: "archive",
      isReplacementGuardOpen: false,
      isBusy: true,
      saveSignal: {
        tone: "saved",
        message: "Living run abandoned. Starting the replacement run.",
      },
    });

    try {
      const startTransition = runReducer(
        abandonedState,
        {
          type: "StartRun",
          classId: selectedClassId,
          runId: dependencies.createId(),
          seed: dependencies.createSeed(),
          now: dependencies.clock(),
          commitId: dependencies.createId(),
          expectedProfileRevision: abandonedState.profile.revision,
        },
        dependencies.catalog,
      );
      if (
        !startTransition.ok ||
        startTransition.persistence.kind !== "start-run" ||
        startTransition.state.livingRun === null
      ) {
        const detail = startTransition.ok
          ? "The replacement state could not be prepared."
          : runRejectionMessage(startTransition.error);
        publishReplacementWarning(detail);
        return;
      }

      const replacement = await dependencies.repository.startRun({
        ...startTransition.persistence,
        proposedRun: startTransition.state.livingRun,
      });
      if (!replacement.ok) {
        publishReplacementWarning(boundedAdapterMessage(replacement.error.message));
        return;
      }
      if (replacement.value.livingRun === null) {
        publishReplacementWarning(
          "The replacement run was not present after the save completed.",
        );
        return;
      }

      const className = classDisplayName(replacement.value.livingRun.classId);
      publish({
        profile: replacement.value.profile,
        livingRun: replacement.value.livingRun,
        launchMode: "checkpoint",
        isReplacementGuardOpen: false,
        isBusy: false,
        saveSignal: {
          tone: "saved",
          message: `Replacement ${className ?? "selected class"} run saved at Depth ${String(replacement.value.livingRun.depth)}.`,
        },
      });
    } catch {
      publishReplacementWarning("The replacement save could not be completed.");
    }
  }

  function publishReplacementWarning(detail: string): void {
    publish({
      launchMode: "archive",
      isReplacementGuardOpen: false,
      isBusy: false,
      saveSignal: {
        tone: "warning",
        message: `The previous run was abandoned, but the replacement run could not be started. ${detail}`,
      },
    });
  }

  async function handleCommand(command: AppCommand): Promise<void> {
    if (state.loadStatus !== "ready" || state.profile === null || state.isBusy) {
      return;
    }

    switch (command.type) {
      case "home/select-class":
        handleSelectClass(command.classId);
        return;
      case "run/request-start":
        await handleRequestStart();
        return;
      case "run/resume":
        handleResume();
        return;
      case "run/cancel-replacement":
        handleCancelReplacement();
        return;
      case "run/confirm-abandon-and-start":
        await handleConfirmAbandonAndStart();
        return;
      case "run/return-to-archive":
        handleReturnToArchive();
        return;
    }
    assertNever(command);
  }

  async function dispatchCommand(command: AppCommand): Promise<void> {
    try {
      await handleCommand(command);
    } catch {
      if (state.loadStatus === "ready") {
        rejectCommand(
          "The action could not be completed. The last committed archive remains available.",
        );
      }
    }
  }

  const store: AppStore = {
    initialize: () => {
      initializationPromise ??= enqueue(initializeStore);
      return initializationPromise;
    },
    dispatch: (command) => {
      if (hasPendingDurableCommand || state.isBusy) {
        return Promise.resolve();
      }
      const isDurable = isDurableCommand(command);
      if (isDurable) {
        hasPendingDurableCommand = true;
      }
      const execution = enqueue(() => dispatchCommand(command));
      return isDurable
        ? execution.finally(() => {
            hasPendingDurableCommand = false;
          })
        : execution;
    },
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      let isSubscribed = true;
      return () => {
        if (isSubscribed) {
          isSubscribed = false;
          listeners.delete(listener);
        }
      };
    },
  };

  return Object.freeze(store);
}
