import type { ContentCatalog, ContentId } from "../content/catalog";
import type { BuildSnapshot, EffectParam, SkillChargeSnapshot } from "../run/model";

/**
 * Simulation modifiers resolved once from the durable build plus the
 * enhancement params rolled onto granted reward cards. The combat rules
 * consume a snapshot at their named hook points (impact force, pierce,
 * hazard softening, launch speed, rebound shaping); the run reducer consumes
 * `extraCharges` when initializing room-scoped skill charges. Every field is
 * a bounded number or a frozen list so a snapshot is always
 * persistence-safe data.
 */
export interface EffectSnapshot {
  /** Extra damage per enemy hit, from rolled "pierce"/"momentum" values. */
  readonly ballDamageBonus: number;
  /** Extra impact force per enemy hit, from rolled "amplitude" values. */
  readonly impactForceBonus: number;
  /**
   * Hazard softening: an active hazard lane's deflection amplification is
   * divided by `1 + hazardStepReduction`, so rolled hazard-shield values
   * (the equipment soft-patch analog) progressively flatten the lane's
   * angle bend.
   */
  readonly hazardStepReduction: number;
  /** Bonus room charges added to every skill's authored maximum. */
  readonly extraCharges: number;
  /** Enemy hits the ball passes through instead of deflecting off. */
  readonly pierceLayers: number;
  /** Paddle-bounce deviation multiplier, clamped to `MAX_REBOUND_WIDEN_FACTOR`. */
  readonly reboundWidenFactor: number;
  /** Launch speed multiplier, clamped to `MAX_BALL_SPEED_FACTOR`. */
  readonly ballSpeedFactor: number;
  /**
   * Skills granted already primed. The reward cards roll `primed` without a
   * durable granted-item linkage, so the resolver cannot name the affected
   * skill yet; the field stays in the contract for the arena display and
   * stays empty until a carrier lands.
   */
  readonly primedSkillIds: readonly ContentId[];
  /** Currency units banked per wall hit, from Fractal Core (S07's grant). */
  readonly wallHitCurrencyRate: number;
}

/** Hard ceiling for `ballSpeedFactor`; the boosted launch stays inside the substep bounds. */
export const MAX_BALL_SPEED_FACTOR = 1.25;
/** Hard ceiling for `reboundWidenFactor`; the widened bounce stays inside the aim cone. */
export const MAX_REBOUND_WIDEN_FACTOR = 2;
/** One spent Overclock charge contributes this step to the speed factor. */
export const OVERCLOCK_SPEED_BONUS = 0.25;
/** One spent Shield Bash charge adds this impact force to every hit. */
export const SHIELD_BASH_IMPACT_BONUS = 1;
/** One spent Rebound Lens charge widens paddle bounces by this factor. */
export const REBOUND_LENS_WIDEN_FACTOR = 1.5;
/** Soft Patch softens exactly one hazard step, per its authored description. */
export const SOFT_PATCH_HAZARD_STEPS = 1;
/** Fractal Core banks exactly one currency unit per wall hit. */
export const FRACTAL_CORE_CURRENCY_RATE = 1;

/**
 * The zero-contribution snapshot: the exact behavior of the pre-effect
 * simulation. The rules default to it so every S01 call site stays valid.
 */
export const NEUTRAL_EFFECTS: EffectSnapshot = Object.freeze({
  ballDamageBonus: 0,
  impactForceBonus: 0,
  hazardStepReduction: 0,
  extraCharges: 0,
  pierceLayers: 0,
  reboundWidenFactor: 1,
  ballSpeedFactor: 1,
  primedSkillIds: Object.freeze([]) as readonly ContentId[],
  wallHitCurrencyRate: 0,
});

function rolledValue(param: EffectParam): number {
  return typeof param.value === "number" && Number.isFinite(param.value)
    ? param.value
    : 0;
}

function clampSpeedFactor(factor: number): number {
  return Math.min(MAX_BALL_SPEED_FACTOR, Math.max(1, factor));
}

function clampWidenFactor(factor: number): number {
  return Math.min(MAX_REBOUND_WIDEN_FACTOR, Math.max(1, factor));
}

/**
 * Resolve the build-driven effect snapshot. Enhancement params contribute by
 * their rolled `effectKey`; passive equipment contributes by its authored
 * `effectKey`. Skills are deliberately not mapped here: they are
 * charge-activated, so a static build mapping would grant always-on effects
 * their authored charge cost denies — spent skills enter through
 * `resolveVolleyEffects`. Unknown keys and unknown content IDs fail closed
 * (ignored, never thrown inside simulation).
 *
 * Simulatable keys: `pierce` (layers + damage), `momentum` (damage),
 * `amplitude` (impact force), `hazard-shield` (hazard softening),
 * `bonus-charges` (extra charges); equipment `soft-patch` (hazard
 * softening) and `fractal-core` (wall-hit currency rate). Presentational
 * keys with no simulation target this feature: enhancements `primed`,
 * `charge-persistence`, `haste`, `echo`, `stability`, `quick-recharge`,
 * `focus`, `cleanup`, `anchor`; skills `phase-shunt`, `prism-burst`,
 * `null-thread`, `specter-step`, `cascade`; equipment `arc-coil`,
 * `static-ward`, `mirror-plating`, `power-cell`, `echo-chip`, `hard-light`.
 */
export function resolveEffects(
  catalog: ContentCatalog,
  build: BuildSnapshot,
  rolledParams: readonly EffectParam[],
): EffectSnapshot {
  let ballDamageBonus = 0;
  let impactForceBonus = 0;
  let hazardStepReduction = 0;
  let extraCharges = 0;
  let pierceLayers = 0;

  for (const param of rolledParams) {
    const value = rolledValue(param);
    switch (param.key) {
      case "pierce":
        ballDamageBonus += value;
        pierceLayers += value;
        break;
      case "momentum":
        ballDamageBonus += value;
        break;
      case "amplitude":
        impactForceBonus += value;
        break;
      case "hazard-shield":
        hazardStepReduction += value;
        break;
      case "bonus-charges":
        extraCharges += value;
        break;
      default:
        break;
    }
  }

  let wallHitCurrencyRate = 0;
  for (const equipmentId of build.passiveEquipmentIds) {
    const result = catalog.getEquipment(equipmentId);
    if (!result.ok) {
      continue;
    }
    switch (result.value.effectKey) {
      case "soft-patch":
        hazardStepReduction += SOFT_PATCH_HAZARD_STEPS;
        break;
      case "fractal-core":
        wallHitCurrencyRate += FRACTAL_CORE_CURRENCY_RATE;
        break;
      default:
        break;
    }
  }

  return Object.freeze({
    ballDamageBonus,
    impactForceBonus,
    hazardStepReduction,
    extraCharges,
    pierceLayers,
    reboundWidenFactor: 1,
    ballSpeedFactor: 1,
    primedSkillIds: NEUTRAL_EFFECTS.primedSkillIds,
    wallHitCurrencyRate,
  });
}

/**
 * Resolve the snapshot for one volley: the build-driven snapshot plus the
 * contributions of skills already spent this room (a charge entry below its
 * maximum). Spent `overclock` speeds the launch, spent `shield-bash` adds
 * impact force, and spent `rebound-lens` widens paddle bounces; all remain
 * charge-gated so an unspent skill never contributes. The bridge (S03) owns
 * threading this snapshot into `launchBall`/`stepCombat`; the run reducer
 * uses `resolveEffects` for charge initialization.
 */
export function resolveVolleyEffects(
  catalog: ContentCatalog,
  build: BuildSnapshot,
  rolledParams: readonly EffectParam[],
  skillCharges: readonly SkillChargeSnapshot[],
): EffectSnapshot {
  const base = resolveEffects(catalog, build, rolledParams);
  let speedBonus = 0;
  let impactBonus = 0;
  let widenFactor = base.reboundWidenFactor;
  for (const charge of skillCharges) {
    if (charge.remaining >= charge.maximum) {
      continue;
    }
    const result = catalog.getSkill(charge.skillId);
    if (!result.ok) {
      continue;
    }
    switch (result.value.effectKey) {
      case "overclock":
        speedBonus += OVERCLOCK_SPEED_BONUS;
        break;
      case "shield-bash":
        impactBonus += SHIELD_BASH_IMPACT_BONUS;
        break;
      case "rebound-lens":
        widenFactor = clampWidenFactor(widenFactor * REBOUND_LENS_WIDEN_FACTOR);
        break;
      default:
        break;
    }
  }
  return Object.freeze({
    ...base,
    impactForceBonus: base.impactForceBonus + impactBonus,
    ballSpeedFactor: clampSpeedFactor(base.ballSpeedFactor + speedBonus),
    reboundWidenFactor: widenFactor,
  });
}