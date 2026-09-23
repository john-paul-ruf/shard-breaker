import type { AppState } from "./appStore";

export type ScreenDescriptor =
  | { readonly id: "home"; readonly mode: "archive" }
  | { readonly id: "home"; readonly mode: "checkpoint" }
  | { readonly id: "route-map" }
  | { readonly id: "room" }
  | { readonly id: "reward" };

const ARCHIVE_SCREEN: ScreenDescriptor = Object.freeze({
  id: "home",
  mode: "archive",
});
const CHECKPOINT_SCREEN: ScreenDescriptor = Object.freeze({
  id: "home",
  mode: "checkpoint",
});
const ROUTE_MAP_SCREEN: ScreenDescriptor = Object.freeze({ id: "route-map" });
const ROOM_SCREEN: ScreenDescriptor = Object.freeze({ id: "room" });
const REWARD_SCREEN: ScreenDescriptor = Object.freeze({ id: "reward" });

/** Derive the implemented screen only from validated application state. */
export function deriveScreen(state: AppState): ScreenDescriptor {
  if (
    state.loadStatus === "ready" &&
    state.livingRun !== null &&
    state.launchMode === "checkpoint"
  ) {
    if (state.livingRun.phase === "route") {
      return ROUTE_MAP_SCREEN;
    }
    if (state.livingRun.phase === "room") {
      return ROOM_SCREEN;
    }
    if (state.livingRun.phase === "reward") {
      return REWARD_SCREEN;
    }
    return CHECKPOINT_SCREEN;
  }
  return ARCHIVE_SCREEN;
}