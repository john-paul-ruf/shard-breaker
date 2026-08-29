export type SaveSignalView =
  | { readonly tone: "saved"; readonly message: string }
  | { readonly tone: "warning"; readonly message: string }
  | { readonly tone: "rejected"; readonly message: string }
  | null;

export interface SaveSignalProps {
  readonly signal: SaveSignalView;
}

const TONE_LABELS: Readonly<Record<NonNullable<SaveSignalView>["tone"], string>> = {
  saved: "Saved",
  warning: "Warning",
  rejected: "Save rejected",
};

/** A controlled, persistent live-region message for durable action feedback. */
export function SaveSignal({ signal }: SaveSignalProps) {
  if (signal === null) {
    return null;
  }

  const isRejected = signal.tone === "rejected";

  return (
    <div
      className="save-signal"
      data-tone={signal.tone}
      role={isRejected ? "alert" : "status"}
      aria-live={isRejected ? "assertive" : "polite"}
    >
      <strong>{TONE_LABELS[signal.tone]}:</strong>{" "}
      <span>{signal.message}</span>
    </div>
  );
}
