import type { AppState } from "./appStore";

export type ScreenDescriptor =
  | { readonly id: "home"; readonly mode: "archive" }
  | { readonly id: "home"; readonly mode: "checkpoint" };

const ARCHIVE_SCREEN: ScreenDescriptor = Object.freeze({
  id: "home",
  mode: "archive",
});
const CHECKPOINT_SCREEN: ScreenDescriptor = Object.freeze({
  id: "home",
  mode: "checkpoint",
});

/** Derive the implemented screen only from validated application state. */
export function deriveScreen(state: AppState): ScreenDescriptor {
  return state.loadStatus === "ready" &&
    state.livingRun !== null &&
    state.launchMode === "checkpoint"
    ? CHECKPOINT_SCREEN
    : ARCHIVE_SCREEN;
}
