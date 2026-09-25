import type { ContentId } from "./catalog";

/** Stable boss identity used by routing before boss combat rules are authored. */
export interface BossRoutingIdentity {
  readonly id: ContentId;
  readonly displayName: string;
  readonly identityLabel: string;
}

/**
 * One phase of an authored boss encounter. Phases advance deterministically at
 * health thresholds; `hpThreshold` is the fraction of max health at which this
 * phase begins, ordered strictly descending across the phase list.
 */
export interface BossPhaseDefinition {
  /** Bounded phase id, e.g. "lock", "split", "breach" (never "routing"). */
  readonly id: string;
  readonly displayName: string;
  /** Human-readable transition condition shown on the boss screen. */
  readonly transitionCondition: string;
  /** Fraction of max health where the phase begins, in (0, 1]. */
  readonly hpThreshold: number;
}

/**
 * One high-impact boss attack. Its identity, counterplay, and telegraph
 * window are DOM content per CA-10: the boss screen renders name, countdown
 * text, and counterplay — never color or animation alone.
 */
export interface BossTelegraphDefinition {
  /** Bounded telegraph id, e.g. "prism-sweep". */
  readonly id: string;
  readonly displayName: string;
  /** The counterplay the player must execute inside the window. */
  readonly counterplay: string;
  /** Telegraph warning window in seconds; converted to steps at CP2. */
  readonly windowSeconds: number;
}

/**
 * A later-cycle modifier compatible with one or more archetypes. Selection
 * (M02, S06) picks from this registry by `compatibleArchetypeIds`; application
 * (M09) caps effects per CA-11/CA-12.
 */
export interface BossModifierDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  /** Archetype IDs this modifier may apply to, or "any" for all four. */
  readonly compatibleArchetypeIds: readonly ContentId[] | "any";
  /** Authored cap explanation shown on the boss screen's modifier chips. */
  readonly cappedDescription: string;
}

/**
 * The full authored boss definition. Extends the routing identity so catalog
 * lookups keep exposing `id/displayName/identityLabel` for CA-09 consumers.
 */
export interface BossDefinition extends BossRoutingIdentity {
  readonly identitySummary: string;
  readonly counterplay: string;
  /** Exactly three phases, ordered strictly descending by `hpThreshold`. */
  readonly phases: readonly BossPhaseDefinition[];
  readonly telegraphs: readonly BossTelegraphDefinition[];
  readonly shieldNodeCount: 1 | 2 | 3;
  readonly compatibleModifiers: readonly BossModifierDefinition[];
}

const asContentId = (value: string): ContentId => value as ContentId;

/**
 * The four stable routing identities. Kept exactly three fields: the committed
 * rooms.test.ts contract enumerates the objects' keys as
 * id/displayName/identityLabel, so combat fields never enter these entries.
 */
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

const modifier = (
  id: string,
  displayName: string,
  compatibleArchetypeIds: readonly string[] | "any",
  cappedDescription: string,
): BossModifierDefinition =>
  Object.freeze({
    id: asContentId(id),
    displayName,
    compatibleArchetypeIds:
      compatibleArchetypeIds === "any"
        ? "any"
        : Object.freeze(compatibleArchetypeIds.map(asContentId)),
    cappedDescription,
  } satisfies BossModifierDefinition);

/**
 * The two later-cycle modifiers compatible with every archetype. Authored once
 * so every archetype's compatibility row can carry the same frozen entries.
 */
export const SHARED_BOSS_MODIFIERS: readonly BossModifierDefinition[] =
  Object.freeze([
    modifier(
      "boss-modifier-split-lane",
      "Split lane",
      "any",
      "Split lane · compatible — the arena gains a second hazard lane; it never removes the open rebound route.",
    ),
    modifier(
      "boss-modifier-arc-saturation",
      "Arc saturation",
      "any",
      "Arc saturation · capped — telegraph windows shorten to a bounded step floor; timing stays readable.",
    ),
  ]);

/**
 * The four authored archetypes. Each extends its routing identity with combat
 * anatomy: three named phases with transition conditions, at least two named
 * high-impact telegraphs with counterplay, one to three shield nodes, and
 * two to three capped modifiers. `compatibleModifiers` carries the shared
 * entries plus per-archetype additions so selection can scope to the room's
 * routed identity.
 */
export const BOSS_DEFINITIONS: readonly BossDefinition[] = Object.freeze([
  Object.freeze({
    id: asContentId("boss-warden"),
    displayName: "Warden",
    identityLabel: "Shield lattice — break outer nodes before pressuring the core.",
    identitySummary:
      "Warden rotates a predictable prism sweep behind a three-node shield lattice.",
    counterplay:
      "Break the outer node before the sweep resolves, then use the return angle to breach the core.",
    phases: Object.freeze([
      Object.freeze({
        id: "lock",
        displayName: "Lock",
        transitionCondition: "Outer node breaks",
        hpThreshold: 1,
      }),
      Object.freeze({
        id: "split",
        displayName: "Split",
        transitionCondition: "Warden falls below 70% integrity",
        hpThreshold: 0.7,
      }),
      Object.freeze({
        id: "breach",
        displayName: "Breach",
        transitionCondition: "Warden falls below 40% integrity",
        hpThreshold: 0.4,
      }),
    ]),
    telegraphs: Object.freeze([
      Object.freeze({
        id: "prism-sweep",
        displayName: "Prism sweep",
        counterplay: "Break the outer node before the sweep resolves.",
        windowSeconds: 2.4,
      }),
      Object.freeze({
        id: "lattice-recycle",
        displayName: "Lattice recycle",
        counterplay: "Clear the respawned node's lane before the shield closes.",
        windowSeconds: 1.8,
      }),
    ]),
    shieldNodeCount: 3,
    compatibleModifiers: Object.freeze([
      SHARED_BOSS_MODIFIERS[0]!,
      SHARED_BOSS_MODIFIERS[1]!,
      modifier(
        "boss-modifier-widened-sweep",
        "Widened sweep",
        ["boss-warden"],
        "Widened sweep · capped — the sweep lane widens but always leaves a bank route.",
      ),
    ]),
  }),
  Object.freeze({
    id: asContentId("boss-broodmother"),
    displayName: "Broodmother",
    identityLabel: "Swarm control — clear spawned lanes before they close angles.",
    identitySummary:
      "Broodmother floods the field with hatchling lanes between interrupt windows.",
    counterplay:
      "Clear spawned lanes before they close angles; spend interrupts on the brood pulse.",
    phases: Object.freeze([
      Object.freeze({
        id: "brood",
        displayName: "Brood",
        transitionCondition: "First spawn lane collapses",
        hpThreshold: 1,
      }),
      Object.freeze({
        id: "swarm",
        displayName: "Swarm",
        transitionCondition: "Broodmother falls below 60% integrity",
        hpThreshold: 0.6,
      }),
      Object.freeze({
        id: "hatch",
        displayName: "Hatch",
        transitionCondition: "Broodmother falls below 30% integrity",
        hpThreshold: 0.3,
      }),
    ]),
    telegraphs: Object.freeze([
      Object.freeze({
        id: "brood-pulse",
        displayName: "Brood pulse",
        counterplay: "Interrupt the pulse with a focused hit on the brood sac.",
        windowSeconds: 2.1,
      }),
      Object.freeze({
        id: "lane-collapse",
        displayName: "Lane collapse",
        counterplay: "Rebound through the closing lane before it seals.",
        windowSeconds: 1.5,
      }),
    ]),
    shieldNodeCount: 2,
    compatibleModifiers: Object.freeze([
      SHARED_BOSS_MODIFIERS[0]!,
      SHARED_BOSS_MODIFIERS[1]!,
      modifier(
        "boss-modifier-twin-brood",
        "Twin brood",
        ["boss-broodmother"],
        "Twin brood · capped — spawn lanes double, but interrupt windows stay open.",
      ),
    ]),
  }),
  Object.freeze({
    id: asContentId("boss-null-architect"),
    displayName: "Null Architect",
    identityLabel: "Field denial — preserve a safe rebound route through shifting space.",
    identitySummary:
      "Null Architect erases bands of the field to deny any stable rebound route.",
    counterplay:
      "Keep to the preserved safe lane and strike the architect through it.",
    phases: Object.freeze([
      Object.freeze({
        id: "survey",
        displayName: "Survey",
        transitionCondition: "First denied band collapses",
        hpThreshold: 1,
      }),
      Object.freeze({
        id: "denial",
        displayName: "Denial",
        transitionCondition: "Null Architect falls below 65% integrity",
        hpThreshold: 0.65,
      }),
      Object.freeze({
        id: "rewrite",
        displayName: "Rewrite",
        transitionCondition: "Null Architect falls below 35% integrity",
        hpThreshold: 0.35,
      }),
    ]),
    telegraphs: Object.freeze([
      Object.freeze({
        id: "null-field",
        displayName: "Null field",
        counterplay: "Route through the preserved safe lane while the field builds.",
        windowSeconds: 2.7,
      }),
      Object.freeze({
        id: "space-rewrite",
        displayName: "Space rewrite",
        counterplay: "Exit the denied band before the rewrite reseals it.",
        windowSeconds: 1.6,
      }),
    ]),
    shieldNodeCount: 1,
    compatibleModifiers: Object.freeze([
      SHARED_BOSS_MODIFIERS[0]!,
      SHARED_BOSS_MODIFIERS[1]!,
      modifier(
        "boss-modifier-denied-band",
        "Denied band",
        ["boss-null-architect"],
        "Denied band · capped — one extra field band, but the safe lane is never removed.",
      ),
    ]),
  }),
  Object.freeze({
    id: asContentId("boss-leech"),
    displayName: "Leech",
    identityLabel: "Sustain pressure — interrupt recovery windows with focused hits.",
    identitySummary:
      "Leech drains the field to heal, forcing pressure during narrow recovery windows.",
    counterplay:
      "Interrupt recovery windows with focused hits before the drain pays off.",
    phases: Object.freeze([
      Object.freeze({
        id: "drain",
        displayName: "Drain",
        transitionCondition: "First drain node breaks",
        hpThreshold: 1,
      }),
      Object.freeze({
        id: "coalesce",
        displayName: "Coalesce",
        transitionCondition: "Leech falls below 55% integrity",
        hpThreshold: 0.55,
      }),
      Object.freeze({
        id: "burst",
        displayName: "Burst",
        transitionCondition: "Leech falls below 25% integrity",
        hpThreshold: 0.25,
      }),
    ]),
    telegraphs: Object.freeze([
      Object.freeze({
        id: "recovery-window",
        displayName: "Recovery window",
        counterplay: "Land focused hits inside the window to cancel the heal.",
        windowSeconds: 2.2,
      }),
      Object.freeze({
        id: "drain-surge",
        displayName: "Drain surge",
        counterplay: "Bank the ball away from the surge lane it charges.",
        windowSeconds: 1.4,
      }),
    ]),
    shieldNodeCount: 2,
    compatibleModifiers: Object.freeze([
      SHARED_BOSS_MODIFIERS[0]!,
      SHARED_BOSS_MODIFIERS[1]!,
      modifier(
        "boss-modifier-siphon-lane",
        "Siphon lane",
        ["boss-leech"],
        "Siphon lane · capped — the drain lane widens, but recovery windows never close entirely.",
      ),
    ]),
  }),
]);
