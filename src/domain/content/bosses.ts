import type { ContentId } from "./catalog";

/** Stable boss identity used by routing before boss combat rules are authored. */
export interface BossRoutingIdentity {
  readonly id: ContentId;
  readonly displayName: string;
  readonly identityLabel: string;
}

const asContentId = (value: string): ContentId => value as ContentId;

export const BOSS_ROUTING_IDENTITIES: readonly BossRoutingIdentity[] =
  Object.freeze([
    Object.freeze({
      id: asContentId("boss-warden"),
      displayName: "Warden",
      identityLabel: "Shield lattice — break outer nodes before pressuring the core.",
    }),
    Object.freeze({
      id: asContentId("boss-broodmother"),
      displayName: "Broodmother",
      identityLabel: "Swarm control — clear spawned lanes before they close angles.",
    }),
    Object.freeze({
      id: asContentId("boss-null-architect"),
      displayName: "Null Architect",
      identityLabel: "Field denial — preserve a safe rebound route through shifting space.",
    }),
    Object.freeze({
      id: asContentId("boss-leech"),
      displayName: "Leech",
      identityLabel: "Sustain pressure — interrupt recovery windows with focused hits.",
    }),
  ]);
