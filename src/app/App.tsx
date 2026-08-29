import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import type { AppCommand } from "./commands";
import type { ContentCatalog, ContentId } from "../domain/content/catalog";
import { HomeScreen } from "../ui/screens/HomeScreen";
import type { HomeScreenViewModel } from "../ui/screens/HomeScreen";
import type { AppState, AppStore } from "./appStore";
import { deriveScreen } from "./navigation";

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

function isUnlocked(
  profileClassIds: readonly ContentId[],
  classId: ContentId,
): boolean {
  return profileClassIds.includes(classId);
}

function createHomeModel(
  state: AppState,
  catalog: ContentCatalog,
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
      mode: deriveScreen(state).mode,
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

  const home = createHomeModel(state, catalog);
  return home.ok ? (
    <HomeScreen model={home.model} dispatch={dispatch} />
  ) : (
    <ErrorShell message={home.message} />
  );
}
