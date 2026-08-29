import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, MouseEvent, RefObject } from "react";

export interface ConfirmationDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly description: string;
  readonly isBusy: boolean;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onResume: () => void;
  readonly onConfirmAbandon: () => void;
  readonly onCancel: () => void;
}

/**
 * Controlled three-way guard for replacing a living run. The dialog owns only
 * transient focus management: intent and open/busy state remain with its
 * caller.
 */
export function ConfirmationDialog({
  isOpen,
  title,
  description,
  isBusy,
  returnFocusRef,
  onResume,
  onConfirmAbandon,
  onCancel,
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const busyStatusId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      if (isBusy) {
        dialogRef.current?.focus();
      } else {
        resumeButtonRef.current?.focus();
      }
      return;
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      returnFocusRef.current?.focus();
    }
  }, [isBusy, isOpen, returnFocusRef]);

  if (!isOpen) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (!isBusy && event.target === event.currentTarget) {
      onCancel();
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isBusy) {
        onCancel();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableControls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    if (focusableControls.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstControl = focusableControls[0];
    const lastControl = focusableControls[focusableControls.length - 1];
    if (event.shiftKey && document.activeElement === firstControl) {
      event.preventDefault();
      lastControl?.focus();
    } else if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl?.focus();
    }
  }

  const describedBy = isBusy ? `${descriptionId} ${busyStatusId}` : descriptionId;

  return (
    <div className="confirmation-backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="confirmation-dialog"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        aria-busy={isBusy}
        onKeyDown={handleDialogKeyDown}
      >
        <p className="signal-eyebrow" data-tone="danger">
          Overwrite guard · action required
        </p>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {isBusy ? (
          <p id={busyStatusId} role="status" aria-live="polite">
            Action in progress. Wait for the durable save to finish.
          </p>
        ) : null}
        <div className="confirmation-dialog__actions">
          <button
            ref={resumeButtonRef}
            type="button"
            className="action-button action-button--primary"
            onClick={onResume}
            disabled={isBusy}
          >
            Resume living run
          </button>
          <button
            type="button"
            className="action-button action-button--danger"
            onClick={onConfirmAbandon}
            disabled={isBusy}
          >
            Abandon &amp; start
          </button>
          <button
            type="button"
            className="action-button action-button--quiet"
            onClick={onCancel}
            disabled={isBusy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
