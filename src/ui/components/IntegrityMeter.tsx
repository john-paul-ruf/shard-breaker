/**
 * Controlled Integrity readout: a row of hollow pips that fill in, paired with
 * `current / maximum` text. Shape (filled versus hollow) carries the reading
 * alongside color, and a single accessible label announces the value so the
 * decorative pips are not each re-read by assistive technology. The component
 * renders defensively — malformed input can never produce an unbounded pip
 * count — but callers are expected to pass valid, in-range data.
 */
export interface IntegrityMeterProps {
  readonly current: number;
  readonly maximum: number;
  readonly label?: string;
}

/**
 * Ceiling on rendered pips. Well above any authored Integrity maximum (the
 * classes cap at 4), it bounds the DOM if a malformed `maximum` arrives.
 */
const MAX_RENDERED_PIPS = 24;

export function IntegrityMeter({ current, maximum, label = "Integrity" }: IntegrityMeterProps) {
  const safeMaximum = Math.min(
    Math.max(Number.isSafeInteger(maximum) ? maximum : 1, 1),
    MAX_RENDERED_PIPS,
  );
  const safeCurrent = Math.min(
    Math.max(Number.isSafeInteger(current) ? current : 0, 0),
    safeMaximum,
  );
  const isCritical = safeCurrent === 1 && safeMaximum > 1;

  return (
    <span
      className="integrity-meter"
      role="img"
      aria-label={`${safeCurrent} of ${safeMaximum} ${label}`}
      data-critical={isCritical ? "true" : "false"}
    >
      {Array.from({ length: safeMaximum }, (_, index) => (
        <span
          key={index}
          className="integrity-meter__pip"
          data-filled={index < safeCurrent ? "true" : "false"}
        />
      ))}
      <span>
        {safeCurrent} / {safeMaximum}
      </span>
    </span>
  );
}
