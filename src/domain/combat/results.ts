import type { CombatState } from "./model";

/**
 * Room-scoped outcome identity per CA-02: `<eventKey>:outcome:<kind>:<index>`
 * where index is the count of prior same-kind outcomes in this room. The room
 * event key participates directly so a foreign room can never accept the ID.
 */
export function outcomeIdFor(
  eventKey: string,
  kind: "loss_of_ball" | "clear",
  index: number,
): string {
  return `${eventKey}:outcome:${kind}:${String(index)}`;
}

/**
 * Total shape check for an outcome ID produced against a room: bounded, and
 * exactly the CA-02 composition for this room's event key and outcome kind.
 * Returns a typed rejection instead of throwing so callers branch without
 * try/catch.
 */
export function validateOutcomeId(
  state: Pick<CombatState, "eventKey">,
  kind: "loss_of_ball" | "clear",
  outcomeId: string,
): { ok: true } | { ok: false; code: "invalid-outcome-id" } {
  const prefix = `${state.eventKey}:outcome:${kind}:`;
  const suffix = outcomeId.startsWith(prefix) ? outcomeId.slice(prefix.length) : "";
  const wellFormed = suffix.length > 0 && /^\d+$/.test(suffix);
  return wellFormed && outcomeId.length <= 512
    ? { ok: true }
    : { ok: false, code: "invalid-outcome-id" };
}