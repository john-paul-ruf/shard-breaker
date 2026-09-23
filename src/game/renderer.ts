import type { CombatPhase, CombatState } from "../domain/combat/model";
import { PADDLE_HALF_WIDTH, PADDLE_Y, WORLD_HEIGHT, WORLD_WIDTH } from "../domain/combat/model";

/**
 * World-space projection the session publishes and the Canvas draws. Derived
 * from the live `CombatState`; essential text (telegraph, status) is data for
 * the DOM host (S04) — nothing essential lives only in the canvas.
 */
export interface RenderSnapshot {
  readonly balls: readonly { readonly x: number; readonly y: number }[];
  readonly paddleX: number;
  readonly aimAngle: number;
  readonly phase: CombatPhase;
  readonly enemies: readonly {
    readonly x: number;
    readonly y: number;
    readonly halfWidth: number;
    readonly halfHeight: number;
    readonly health: number;
    readonly maxHealth: number;
    readonly glyph: string;
    readonly defeated: boolean;
  }[];
  readonly hazards: readonly {
    readonly laneX: number;
    readonly halfWidth: number;
    readonly state: string;
  }[];
  readonly wallHits: number;
  readonly objectivesRemaining: number;
  /** Named hazard state for the DOM host's display; null when none is pending. */
  readonly telegraphText: string | null;
  /** One of "Aim ready" | "Ball live" | "Loss of ball — Integrity -1" | "Room clear". */
  readonly statusLine: string;
}

export interface RenderSnapshotOptions {
  /**
   * Optional enemy-ID → glyph resolver. The session has no catalog access
   * (arch M06 import rules), so the host wires
   * `(enemyId) => catalog.getEnemy(enemyId).glyph`; without it bricks draw
   * with health ticks only.
   */
  readonly glyphFor?: (enemyId: string) => string;
}

function statusLineFor(state: CombatState): string {
  if (state.outcome?.kind === "clear") {
    return "Room clear";
  }
  if (state.outcome?.kind === "loss_of_ball") {
    return "Loss of ball — Integrity -1";
  }
  if (state.phase === "live") {
    return "Ball live";
  }
  return "Aim ready";
}

function telegraphTextFor(state: CombatState): string | null {
  const pending = state.hazards.find((hazard) => hazard.state !== "resolved");
  return pending === undefined ? null : `${pending.hazardId} — ${pending.state}`;
}

/**
 * Project the live combat state into the renderer's snapshot. `aimAngle`
 * overrides the state's own angle so the pre-launch indicator can follow the
 * pointer before any launch has written the angle into the state.
 */
export function createRenderSnapshot(
  state: CombatState,
  options: RenderSnapshotOptions = {},
): RenderSnapshot {
  const glyphFor = options.glyphFor ?? (() => "");
  return Object.freeze({
    balls: Object.freeze(
      state.balls.map((ball) => Object.freeze({ x: ball.x, y: ball.y })),
    ),
    paddleX: state.paddleX,
    aimAngle: state.aimAngle,
    phase: state.phase,
    enemies: Object.freeze(
      state.enemies.map((enemy) =>
        Object.freeze({
          x: enemy.x,
          y: enemy.y,
          halfWidth: enemy.halfWidth,
          halfHeight: enemy.halfHeight,
          health: enemy.health,
          maxHealth: enemy.maxHealth,
          glyph: glyphFor(enemy.enemyId),
          defeated: enemy.defeated,
        }),
      ),
    ),
    hazards: Object.freeze(
      state.hazards.map((hazard) =>
        Object.freeze({
          laneX: hazard.laneX,
          halfWidth: hazard.halfWidth,
          state: hazard.state,
        }),
      ),
    ),
    wallHits: state.wallHits,
    objectivesRemaining: state.enemies.filter((enemy) => !enemy.defeated).length,
    telegraphText: telegraphTextFor(state),
    statusLine: statusLineFor(state),
  });
}

/**
 * The slice of `CanvasRenderingContext2D` the frame draw consumes, so tests
 * can stub the context without a real canvas implementation.
 */
export interface Context2DLike {
  readonly canvas: { readonly width: number; readonly height: number };
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(dashes: readonly number[]): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
}

export interface FrameDrawOptions {
  /** Backing-store device pixel ratio; geometry scales by it uniformly. */
  readonly devicePixelRatio: number;
  /**
   * Reduced-motion policy: draw static geometry and text only — no pulse
   * decoration on telegraphed or active hazards. Static hatch marks and all
   * text remain, so state never depends on motion or color alone.
   */
  readonly reducedMotion?: boolean;
}

export interface WorldTransform {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * The affine world→backing-store transform: full-bleed, so world x ∈ [0, 160]
 * maps exactly onto the canvas width the input mapping assumes (the input
 * layer maps CSS pixels onto the same span, and the backing store is the CSS
 * size times the device pixel ratio). The host keeps the 8:5 aspect so the
 * two axes stay uniform in practice.
 */
export function computeWorldTransform(target: {
  readonly width: number;
  readonly height: number;
}): WorldTransform {
  if (target.width <= 0 || target.height <= 0) {
    throw new RangeError("canvas dimensions must be positive");
  }
  return {
    scaleX: target.width / WORLD_WIDTH,
    scaleY: target.height / WORLD_HEIGHT,
    offsetX: 0,
    offsetY: 0,
  };
}

const HEALTH_TICK_WIDTH = 2;
const HAZARD_HATCH_SPACING = 6;

/**
 * Draw one world-space frame. Order: clear → field border → hazard lanes →
 * enemies → ball → paddle → aim cone (pre-launch only). Every coordinate is
 * transformed world space; the device pixel ratio enters only through the
 * backing-store dimensions. Essential state text is never drawn here.
 */
export function drawFrame(
  ctx: Context2DLike,
  snapshot: RenderSnapshot,
  options: FrameDrawOptions,
): void {
  const dpr = options.devicePixelRatio;
  if (!Number.isFinite(dpr) || dpr <= 0) {
    throw new RangeError("devicePixelRatio must be a finite positive number");
  }
  const { scaleX, scaleY } = computeWorldTransform(ctx.canvas);
  const px = (x: number): number => x * scaleX;
  const py = (y: number): number => y * scaleY;

  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Field border.
  ctx.strokeStyle = "#54f6d1";
  ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(0, 0, px(WORLD_WIDTH), py(WORLD_HEIGHT));

  // Hazard lanes: static hatch marks plus the state label; reduced motion
  // keeps the hatch (no pulse decoration), so the danger stays visible.
  for (const hazard of snapshot.hazards) {
    if (hazard.state === "resolved") {
      continue;
    }
    const left = px(hazard.laneX - hazard.halfWidth);
    const width = px(hazard.halfWidth * 2);
    ctx.strokeStyle = "#ffc857";
    ctx.lineWidth = Math.max(1, 1 * dpr);
    for (let x = left; x < left + width; x += HAZARD_HATCH_SPACING * dpr) {
      ctx.beginPath();
      ctx.moveTo(x, py(0));
      ctx.lineTo(x + HAZARD_HATCH_SPACING * dpr, py(WORLD_HEIGHT));
      ctx.stroke();
    }
    if (hazard.state === "active" && !options.reducedMotion) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#ffc857";
      ctx.fillRect(left, 0, width, py(WORLD_HEIGHT));
      ctx.globalAlpha = 1;
    }
  }

  // Enemies: brick with a health fraction fill, health ticks, and glyph.
  for (const enemy of snapshot.enemies) {
    if (enemy.defeated) {
      continue;
    }
    const x = px(enemy.x - enemy.halfWidth);
    const y = py(enemy.y - enemy.halfHeight);
    const w = px(enemy.halfWidth * 2);
    const h = py(enemy.halfHeight * 2);
    ctx.fillStyle = "#0e1523";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#fb3fb6";
    ctx.lineWidth = Math.max(1, 1 * dpr);
    ctx.strokeRect(x, y, w, h);
    const healthRatio = enemy.maxHealth > 0 ? enemy.health / enemy.maxHealth : 0;
    ctx.fillStyle = "#54f6d1";
    const tickCount = Math.max(0, Math.round(healthRatio * enemy.maxHealth));
    for (let tick = 0; tick < tickCount; tick += 1) {
      ctx.fillRect(x + (tick + 0.5) * (w / Math.max(1, enemy.maxHealth)), y, HEALTH_TICK_WIDTH * dpr, h);
    }
    if (enemy.glyph.length > 0) {
      ctx.fillStyle = "#f4f7ff";
      ctx.font = `${String(8 * dpr)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(enemy.glyph, px(enemy.x), py(enemy.y));
    }
  }

  // Ball.
  const ball = snapshot.balls[0];
  if (ball !== undefined) {
    ctx.beginPath();
    ctx.fillStyle = "#54f6d1";
    ctx.arc(px(ball.x), py(ball.y), Math.max(1, 2 * dpr), 0, Math.PI * 2);
    ctx.fill();
  }

  // Paddle.
  ctx.fillStyle = "#54f6d1";
  ctx.fillRect(
    px(snapshot.paddleX - PADDLE_HALF_WIDTH),
    py(PADDLE_Y),
    px(PADDLE_HALF_WIDTH * 2),
    py(3),
  );

  // Aim cone: pre-launch only, dashed static guide (never animated).
  if (snapshot.phase === "pre_launch") {
    const aimReach = 24;
    ctx.strokeStyle = "#54f6d1";
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.lineWidth = Math.max(1, 1 * dpr);
    ctx.beginPath();
    ctx.moveTo(px(snapshot.paddleX), py(PADDLE_Y));
    ctx.lineTo(
      px(snapshot.paddleX + Math.sin(snapshot.aimAngle) * aimReach),
      py(PADDLE_Y - Math.cos(snapshot.aimAngle) * aimReach),
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}