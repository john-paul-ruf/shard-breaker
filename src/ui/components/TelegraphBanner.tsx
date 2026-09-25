/**
 * Accessible high-impact warning banner. The tone changes text color, left
 * border, and icon glyph together (CA-08: never color-only), and the banner
 * is fully static — no animation — so reduced-motion preferences never remove
 * state. Controlled from props only; the caller resolves telegraph content.
 */
export type TelegraphTone = "incoming" | "active" | "resolved";

export interface TelegraphBannerProps {
  readonly title: string;
  readonly detail: string;
  readonly tone: TelegraphTone;
}

const TONE_META: Readonly<
  Record<TelegraphTone, { readonly glyph: string; readonly label: string }>
> = Object.freeze({
  incoming: { glyph: "▲", label: "Telegraph incoming" },
  active: { glyph: "◆", label: "Telegraph active" },
  resolved: { glyph: "✓", label: "Telegraph resolved" },
});

/** Telegraph banner: named warning + countdown/state + counterplay, non-color-only. */
export function TelegraphBanner({ title, detail, tone }: TelegraphBannerProps) {
  const meta = TONE_META[tone];
  return (
    <section
      className="telegraph-banner"
      data-tone={tone}
      role="status"
      aria-label={`${meta.label}: ${title}`}
    >
      <p className="telegraph-banner__title">
        <span className="telegraph-banner__icon" aria-hidden="true">
          {meta.glyph}
        </span>
        {title}
      </p>
      <p className="telegraph-banner__detail">{detail}</p>
    </section>
  );
}
