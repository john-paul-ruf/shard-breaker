import type { AppState } from "./appStore";
import type { RoomType } from "../domain/run/model";

export type ScreenDescriptor =
  | { readonly id: "home"; readonly mode: "archive" }
  | { readonly id: "home"; readonly mode: "checkpoint" }
  | { readonly id: "run-summary" }
  | { readonly id: "route-map" }
  | { readonly id: "room" }
  | { readonly id: "room-boss" }
  | { readonly id: "room-combat" }
  | { readonly id: "reward" };

const ARCHIVE_SCREEN: ScreenDescriptor = Object.freeze({
  id: "home",
  mode: "archive",
});
const CHECKPOINT_SCREEN: ScreenDescriptor = Object.freeze({
  id: "home",
  mode: "checkpoint",
});
const RUN_SUMMARY_SCREEN: ScreenDescriptor = Object.freeze({
  id: "run-summary",
});
const ROUTE_MAP_SCREEN: ScreenDescriptor = Object.freeze({ id: "route-map" });
const ROOM_SCREEN: ScreenDescriptor = Object.freeze({ id: "room" });
const ROOM_BOSS_SCREEN: ScreenDescriptor = Object.freeze({ id: "room-boss" });
const ROOM_COMBAT_SCREEN: ScreenDescriptor = Object.freeze({
  id: "room-combat",
});
const REWARD_SCREEN: ScreenDescriptor = Object.freeze({ id: "reward" });

const COMBAT_ROOM_TYPES: readonly RoomType[] = Object.freeze([
  "battle",
  "elite",
  "boss",
]);

function isCombatRoomType(roomType: RoomType): boolean {
  return COMBAT_ROOM_TYPES.includes(roomType);
}

/**
 * Whether the finalized profile still owes the player the terminal's one-time
 * carry-over choice. The persisted pending record IS the gate (durable across
 * reload, Design Decision 6): every death finalization emits it unresolved,
 * the resolve keeps it with `selectedId` set (the committed schema's
 * `selectedId ⟺ commitId` pairing), and the decline clears it — either way
 * the gate turns off and the archive takes over.
 */
function hasUnresolvedPendingRelicChoice(state: AppState): boolean {
  const pending = state.profile?.pendingRelicChoice;
  return pending !== null && pending !== undefined && pending.selectedId === null;
}

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
      const roomState = state.livingRun.roomState;
      if (roomState !== null && isCombatRoomType(roomState.roomType)) {
        // Boss rooms branch to their own screen before the generic combat
        // branch: the arena composition is shared, the boss rail is not.
        return roomState.roomType === "boss"
          ? ROOM_BOSS_SCREEN
          : ROOM_COMBAT_SCREEN;
      }
      return ROOM_SCREEN;
    }
    if (state.livingRun.phase === "reward") {
      return REWARD_SCREEN;
    }
    return CHECKPOINT_SCREEN;
  }
  if (state.loadStatus === "ready" && hasUnresolvedPendingRelicChoice(state)) {
    // The terminal gate sits after every living-run branch (a living run
    // must never show a terminal screen) and before the archive fallback.
    return RUN_SUMMARY_SCREEN;
  }
  return ARCHIVE_SCREEN;
}