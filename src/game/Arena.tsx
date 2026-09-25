import { useEffect, useRef, useState } from "react";

import type { AppCommand } from "../app/commands";
import type { CombatPhase, CombatState } from "../domain/combat/model";
import type { EngineOptions, FrameClock } from "./engine";
import { attachInput } from "./input";
import { drawFrame } from "./renderer";
import type { Context2DLike, RenderSnapshot } from "./renderer";
import { createGameSession } from "./session";
import type { GameSession, SkillId, VolleyEffectsResolver } from "./session";

/** One active-skill control the rail renders; charges are App-resolved. */
export interface ArenaSkillDisplay {
  readonly skillId: SkillId;
  readonly name: string;
  readonly description: string;
  readonly charges: number;
  readonly maximum: number;
}

/**
 * The arena's display slice. Deliberately narrow: the composing screen owns
 * run and room context, and the durable checkpoint never crosses into this
 * module as data — reconstruction arrives through the injected
 * `createInitialState` closure (arch M06 import rules).
 */
export interface ArenaViewModel {
  readonly roomName: string;
  readonly skillDisplay: readonly ArenaSkillDisplay[];
  readonly isBusy: boolean;
}

export interface ArenaProps {
  readonly model: ArenaViewModel;
  readonly dispatch: (command: AppCommand) => void;
  /** Checkpoint→state reconstruction, injected by the composing screen. */
  readonly createInitialState: () => CombatState;
  /** Per-volley effect snapshot provider (production: the S02 resolver closure). */
  readonly resolveVolleyEffects: VolleyEffectsResolver;
  /** Engine and clock overrides for deterministic tests; production omits it. */
  readonly sessionOptions?: { readonly engine?: EngineOptions; readonly clock?: FrameClock };
}

const PHASE_LABELS: Readonly<Record<CombatPhase, string>> = Object.freeze({
  pre_launch: "pre-launch",
  live: "live",
  resolved: "resolved",
});

const FIELD_NOTES: Readonly<Record<CombatPhase, string>> = Object.freeze({
  pre_launch: "Aim with pointer — launch is explicit",
  live: "Ball live — track the paddle",
  resolved: "Room resolved",
});

const INITIAL_STATUS = "Aim ready";

interface StatusMeta {
  readonly state: string;
  readonly glyph: string;
}

/** Map the renderer's canonical status lines onto state + glyph pairs. */
function statusMetaFor(statusLine: string): StatusMeta {
  switch (statusLine) {
    case "Ball live":
      return { state: "ball-live", glyph: "◉" };
    case "Loss of ball — Integrity -1":
      return { state: "loss", glyph: "▼" };
    case "Room clear":
      return { state: "clear", glyph: "✓" };
    default:
      return { state: "aim-ready", glyph: "◎" };
  }
}

function readsReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Canvas arena host: mounts the S03 session over the injected initial state,
 * draws every published snapshot, and renders the essential combat state —
 * status line, live telegraph, launch control, and skill rail — as DOM
 * siblings of the canvas so nothing essential is canvas-only (arch M06).
 * Pointer movement aims and moves only; the launch control is the sole
 * dispatcher of `combat/launch` (CA-07).
 */
export function Arena({
  model,
  dispatch,
  createInitialState,
  resolveVolleyEffects,
  sessionOptions,
}: ArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const snapshotRef = useRef<RenderSnapshot | null>(null);
  const aimAngleRef = useRef(0);
  const launchRef = useRef<() => void>(() => undefined);
  const renderedStatusRef = useRef({
    statusLine: INITIAL_STATUS,
    phase: "pre_launch" as CombatPhase,
  });
  const telegraphRef = useRef<string | null>(null);
  const liveRef = useRef({
    createInitialState,
    resolveVolleyEffects,
    dispatch,
    sessionOptions,
  });
  liveRef.current = {
    createInitialState,
    resolveVolleyEffects,
    dispatch,
    sessionOptions,
  };

  const [reducedMotion] = useState(readsReducedMotion);
  const [statusLine, setStatusLine] = useState(INITIAL_STATUS);
  const [phase, setPhase] = useState<CombatPhase>("pre_launch");
  const [telegraphText, setTelegraphText] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    contextRef.current = canvas.getContext("2d") as CanvasRenderingContext2D | null;

    function draw(): void {
      const context = contextRef.current;
      const snapshot = snapshotRef.current;
      if (context === null || snapshot === null) {
        return;
      }
      if (canvas === null) {
        return;
      }
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (cssWidth <= 0 || cssHeight <= 0) {
        return;
      }
      const ratio = window.devicePixelRatio || 1;
      const targetWidth = Math.round(cssWidth * ratio);
      const targetHeight = Math.round(cssHeight * ratio);
      if (canvas.width !== targetWidth) {
        canvas.width = targetWidth;
      }
      if (canvas.height !== targetHeight) {
        canvas.height = targetHeight;
      }
      // Pre-launch, the aim indicator follows the pointer before any launch
      // has written the angle into the state (renderer snapshot override).
      const drawSnapshot =
        snapshot.phase === "pre_launch"
          ? { ...snapshot, aimAngle: aimAngleRef.current }
          : snapshot;
      drawFrame(context as unknown as Context2DLike, drawSnapshot, {
        devicePixelRatio: ratio,
        reducedMotion,
      });
    }

    function handleRender(snapshot: RenderSnapshot): void {
      snapshotRef.current = snapshot;
      draw();
      if (snapshot.statusLine !== renderedStatusRef.current.statusLine) {
        renderedStatusRef.current.statusLine = snapshot.statusLine;
        setStatusLine(snapshot.statusLine);
      }
      if (snapshot.phase !== renderedStatusRef.current.phase) {
        renderedStatusRef.current.phase = snapshot.phase;
        setPhase(snapshot.phase);
      }
      if (snapshot.telegraphText !== telegraphRef.current) {
        telegraphRef.current = snapshot.telegraphText;
        setTelegraphText(snapshot.telegraphText);
      }
    }

    function launchFromControl(): void {
      const session = sessionRef.current;
      if (session === null) {
        return;
      }
      const state = session.state();
      if (state.phase !== "pre_launch" || state.outcome !== null) {
        return;
      }
      const angle = aimAngleRef.current;
      session.launch(angle);
      liveRef.current.dispatch({ type: "combat/launch", aimAngle: angle });
    }
    launchRef.current = launchFromControl;

    const session = createGameSession(
      liveRef.current.createInitialState(),
      {
        onOutcome: (outcome) =>
          liveRef.current.dispatch({ type: "combat/report-outcome", outcome }),
        onRender: handleRender,
        onSkillRequested: (skillId) =>
          liveRef.current.dispatch({ type: "combat/use-skill", skillId }),
        resolveVolleyEffects: () => liveRef.current.resolveVolleyEffects(),
      },
      liveRef.current.sessionOptions,
    );
    sessionRef.current = session;

    const detach = attachInput(canvas, {
      onAim: (intent) => {
        aimAngleRef.current = intent.aimAngle;
        session.movePaddle(intent.paddleX);
      },
      onLaunch: launchFromControl,
      onKeyboardPaddle: (direction) => session.movePaddleBy(direction),
    });
    const onResize = (): void => draw();
    window.addEventListener("resize", onResize);
    handleRender(session.snapshot());

    return () => {
      window.removeEventListener("resize", onResize);
      detach();
      session.stop();
      sessionRef.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    const session = sessionRef.current;
    if (session === null) {
      return;
    }
    const current = session.state();
    // A live volley is never swapped; a clear ends the room's session; any
    // other recorded outcome is replaced by the durable restore publish.
    // Everything else (skill charges, save feedback) leaves the ephemeral
    // state — and the player's paddle position — untouched.
    if (
      current.phase === "live" ||
      current.outcome === null ||
      current.outcome.kind === "clear"
    ) {
      return;
    }
    session.replaceState(createInitialState());
  }, [createInitialState]);

  const status = statusMetaFor(statusLine);
  const canLaunch = !model.isBusy && phase === "pre_launch";

  return (
    <section
      className="arena-panel surface-panel"
      aria-label="Combat arena"
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <div className="arena-panel__top">
        <p className="arena-panel__label">
          Playable field <span aria-hidden="true">/</span> {PHASE_LABELS[phase]}
        </p>
        <p className="arena-status" role="status" data-status={status.state}>
          <span className="arena-status__icon" aria-hidden="true">
            {status.glyph}
          </span>
          <span className="arena-status__text">{statusLine}</span>
        </p>
      </div>
      <div className="arena-panel__field">
        <canvas
          ref={canvasRef}
          className="arena-panel__canvas"
          role="img"
          aria-label={`${model.roomName} arena. Pointer movement aims the ball; the launch control begins it.`}
        />
        <p className="arena-panel__fieldnote">{FIELD_NOTES[phase]}</p>
      </div>
      {telegraphText !== null ? (
        <p className="arena-panel__telegraph" role="status">
          {telegraphText}
        </p>
      ) : null}
      <div className="arena-panel__controls">
        <p className="arena-panel__hint">
          Move pointer to set angle.
          <br />
          Touch and mouse use the same control.
        </p>
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={() => launchRef.current()}
          disabled={!canLaunch}
          aria-busy={model.isBusy}
        >
          Launch ball <span aria-hidden="true">→</span>
        </button>
      </div>
      {model.skillDisplay.length > 0 ? (
        <div className="arena-skills" role="group" aria-label="Active skills">
          {model.skillDisplay.map((skill, index) => {
            const isDepleted = skill.charges <= 0;
            return (
              <button
                key={skill.skillId}
                type="button"
                className="arena-skill"
                disabled={model.isBusy || isDepleted}
                aria-busy={model.isBusy}
                onClick={() => sessionRef.current?.useSkill(skill.skillId)}
              >
                <span className="arena-skill__key" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="arena-skill__info">
                  <b>{skill.name}</b>
                  <span>{skill.description}</span>
                  {isDepleted ? (
                    <span className="arena-skill__reason">
                      Depleted — no charges left this room
                    </span>
                  ) : null}
                </span>
                <span className="arena-skill__charges">
                  {skill.charges} <em>/ {skill.maximum}</em>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}