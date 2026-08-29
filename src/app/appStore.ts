import type { ContentCatalog, ContentId } from "../domain/content/catalog";
import type { LivingRun, Profile, RunState } from "../domain/run/model";
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

/** Construct the sole serialized application orchestration boundary. */
export function createAppStore(dependencies: AppStoreDependencies): AppStore {
  let state = INITIAL_STATE;
  let queue: Promise<void> = Promise.resolve();
  let initializationPromise: Promise<void> | null = null;
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

  async function dispatchCoreCommand(command: AppCommand): Promise<void> {
    if (
      state.loadStatus !== "ready" ||
      state.profile === null ||
      state.isBusy ||
      command.type !== "home/select-class"
    ) {
      return;
    }
    if (
      isUnlockedClass(
        dependencies.catalog,
        state.profile,
        command.classId,
      )
    ) {
      publish({ selectedClassId: command.classId });
    }
  }

  const store: AppStore = {
    initialize: () => {
      initializationPromise ??= enqueue(initializeStore);
      return initializationPromise;
    },
    dispatch: (command) => enqueue(() => dispatchCoreCommand(command)),
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
