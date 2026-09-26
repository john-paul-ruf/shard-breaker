import type { ContentId } from "./catalog";

/**
 * One authored carry-over relic. `cappedDescription` is the display-only
 * contract the terminal screen renders; gameplay effects are deferred with
 * named swap points (CA-18), so the UI renders authored copy and never
 * claims an effect fired.
 */
export interface RelicDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  readonly cappedDescription: string;
}

const asContentId = (value: string): ContentId => value as ContentId;

/**
 * The authored carry-over relics, in authored registry order — the order the
 * terminal's pending choice offers and every display enumeration keeps. Copy
 * is the run-summary mock's, verbatim.
 */
export const RELIC_DEFINITIONS: readonly RelicDefinition[] = Object.freeze([
  Object.freeze({
    id: asContentId("relic-backfeed-cell"),
    displayName: "Backfeed Cell",
    cappedDescription: "First room starts with +1 charge.",
  }),
  Object.freeze({
    id: asContentId("relic-quiet-prism"),
    displayName: "Quiet Prism",
    cappedDescription: "One telegraph arrives earlier.",
  }),
  Object.freeze({
    id: asContentId("relic-spare-vector"),
    displayName: "Spare Vector",
    cappedDescription: "One route preview reveals risk.",
  }),
]);