import type { ContentVersion } from "../content/catalog";
import type { RouteState } from "./model";

/** A depth is playable only as a safe integer at or beyond the first floor. */
export function isValidDepth(depth: number): boolean {
  return Number.isSafeInteger(depth) && depth >= 1;
}

/**
 * Canonical cycle for a floor: `floor((depth - 1) / 3) + 1`. Depth is an
 * engine invariant, not player input, so an unsafe/zero/negative value is a
 * programming error and throws rather than returning a typed rejection.
 */
export function cycleForDepth(depth: number): number {
  if (!isValidDepth(depth)) {
    throw new RangeError(`depth must be a safe integer >= 1: ${String(depth)}`);
  }
  return Math.floor((depth - 1) / 3) + 1;
}

/** Every positive multiple of three is a mandatory boss floor. */
export function isBossDepth(depth: number): boolean {
  return isValidDepth(depth) && depth % 3 === 0;
}

/**
 * Stable event key for a route decision, derived only from the run ID, content
 * version, and depth so it is reproducible without reading time or random.
 */
export function routeEventKey(
  runId: string,
  contentVersion: ContentVersion,
  depth: number,
): string {
  return `route:${contentVersion}:${runId}:${String(depth)}`;
}

/**
 * The initial route checkpoint for a new run: a named event with no
 * materialized offers, no selection, and no commitment. Empty offers mean "not
 * materialized yet" for this lifecycle boundary; the next feature fills them.
 */
export function createInitialRouteState(
  runId: string,
  contentVersion: ContentVersion,
): RouteState {
  return {
    eventKey: routeEventKey(runId, contentVersion, 1),
    offers: [],
    selectedOfferId: null,
    committed: false,
  };
}
