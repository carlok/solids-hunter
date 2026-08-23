import type { Ray, Scene, UniversalCamera } from '@babylonjs/core';
/** Ensures Scene picking is patched in this chunk (same as main.ts); avoids treeshook stubs that throw. */
import '@babylonjs/core/Culling/ray';

import {
  coachAppliesThisShot,
  onHitMissAfterScoring,
  onHitWrongAfterScoring,
  scheduleEndRoundAfterCorrectCoach,
} from './coach';
import { resolveEntityIdFromPick } from './entity-pick';
import type { GameEntity } from './entity-motion';
import { gameFeedback } from './entity-motion';
import { GameAudio } from './game-audio';
import type { RoundOutcome } from './round-director';
import { spawnImpactMark, spawnShotTracer } from './shot-tracer';

const MAX_TRACE = 135;
const MUZZLE_FORWARD = 0.22;

export type BabylonShootHud = {
  scoreEl: HTMLElement;
  targetsEl: HTMLElement;
  flashEl: HTMLElement;
  reticleEl: HTMLElement;
  roundEndEl: HTMLElement;
  roundEndLabelEl: HTMLElement;
  roundEndTitleEl: HTMLElement;
  roundEndPointsEl: HTMLElement;
  finalScoreEl: HTMLElement;
};

export type BabylonGameRuntime = {
  score: number;
  matchLeft: number;
  roundEnded: boolean;
  shotsThisRound: number;
  correctHits: number;
  wrongHits: number;
};

export type BabylonShootContext = {
  getEntities: () => GameEntity[];
  getMatchLeft: () => number;
  /** Invoked after round-win sound and pointer unlock; shows round-end UI. */
  onRoundComplete: (outcome: RoundOutcome) => void;
};

export type BabylonShooter = {
  shoot: () => boolean;
};

function updateHud(runtime: BabylonGameRuntime, hud: BabylonShootHud): void {
  hud.scoreEl.textContent = String(runtime.score);
  hud.targetsEl.textContent = String(runtime.matchLeft);
}

export function applyWrongHitPenalty(score: number): { score: number; gameOver: boolean } {
  const nextScore = Math.max(0, score - 5);
  return { score: nextScore, gameOver: score > 0 && nextScore === 0 };
}

function showRoundEnd(
  runtime: BabylonGameRuntime,
  hud: BabylonShootHud,
  shootContext: BabylonShootContext,
  outcome: RoundOutcome,
  label: string,
  title: string,
  pointsLabel = 'POINTS',
): void {
  runtime.roundEnded = true;
  document.exitPointerLock();
  hud.roundEndLabelEl.textContent = label;
  hud.roundEndTitleEl.textContent = title;
  hud.roundEndPointsEl.textContent = pointsLabel;
  hud.roundEndEl.classList.remove('hidden');
  hud.finalScoreEl.textContent = String(runtime.score);
  shootContext.onRoundComplete(outcome);
}

export type HitFeedbackKind = 'correct' | 'wrong';

export type HitFeedback = {
  color: string;
  alpha: number;
  reticleClass: string;
};

export function hitFeedbackFor(kind: HitFeedbackKind): HitFeedback {
  return kind === 'correct'
    ? { color: '#00ff88', alpha: 0.28, reticleClass: 'is-hit-correct' }
    : { color: '#ff2200', alpha: 0.42, reticleClass: 'is-hit-wrong' };
}

function flash(hud: BabylonShootHud, kind: HitFeedbackKind): void {
  const feedback = hitFeedbackFor(kind);
  hud.flashEl.style.background = feedback.color;
  hud.flashEl.style.opacity = String(feedback.alpha);
  hud.reticleEl.classList.remove('is-hit-correct', 'is-hit-wrong');
  void hud.reticleEl.offsetWidth;
  hud.reticleEl.classList.add(feedback.reticleClass);
  const feedbackId = String(performance.now());
  hud.reticleEl.dataset.hitFeedbackId = feedbackId;
  window.setTimeout(() => {
    hud.flashEl.style.opacity = '0';
    if (hud.reticleEl.dataset.hitFeedbackId === feedbackId) {
      hud.reticleEl.classList.remove(feedback.reticleClass);
    }
  }, 180);
}

export function createCenterShotRay(camera: UniversalCamera): Ray {
  const ray = camera.getForwardRay(MAX_TRACE + MUZZLE_FORWARD + 4);
  ray.length = MAX_TRACE + MUZZLE_FORWARD + 4;
  return ray;
}

export function attachBabylonShooting(options: {
  scene: Scene;
  canvas: HTMLCanvasElement;
  camera: UniversalCamera;
  shootContext: BabylonShootContext;
  hud: BabylonShootHud;
  runtime: BabylonGameRuntime;
}): BabylonShooter {
  const { scene, canvas, camera, shootContext, hud, runtime } = options;

  updateHud(runtime, hud);

  /**
   * There used to be a window-level capture-phase `mousedown` here that called
   * `window.location.reload()` whenever `roundEnded` was set. Capture fires
   * before any button's `click`, so it swallowed NEW ROUND and CHANGE ARENA and
   * reloaded the page instead — and because the reload wiped module state, the
   * round director's `clearedRounds` reset every round and the rule ladder
   * never advanced. Gamepad players were unaffected, since activating a control
   * dispatches `click` without `mousedown`, which is why it survived testing.
   * The round-end screen has its own buttons; nothing needs a global handler.
   */

  const shoot = (): boolean => {
    if (runtime.roundEnded) return false;

    if (gameFeedback.paused) return false;

    GameAudio.shoot();

    const entities = shootContext.getEntities();

    const ray = createCenterShotRay(camera);
    const dir = ray.direction.clone();
    dir.normalize();
    const muzzle = ray.origin.clone();
    {
      const forward = dir.clone();
      forward.scale(MUZZLE_FORWARD);
      muzzle.addInPlace(forward);
    }
    const traceFar = muzzle.clone();
    {
      const span = dir.clone();
      span.scale(MAX_TRACE);
      traceFar.addInPlace(span);
    }

    const pick = scene.pickWithRay(ray, (mesh) => {
      const id = resolveEntityIdFromPick(mesh);
      if (id === undefined) return false;
      const ent = entities.find((x) => x.entityId === id);
      return !!ent && ent.alive && !ent.dying;
    });

    let traceEnd = traceFar;
    let ent: GameEntity | null = null;
    if (pick.hit && pick.pickedMesh) {
      const id = resolveEntityIdFromPick(pick.pickedMesh);
      const found = id === undefined ? undefined : entities.find((x) => x.entityId === id);
      if (found && found.alive && !found.dying) {
        ent = found;
        if (pick.pickedPoint) {
          traceEnd = pick.pickedPoint.clone();
        } else {
          const d =
            typeof pick.distance === 'number' && pick.distance > 0 ? pick.distance : MAX_TRACE;
          traceEnd = ray.origin.clone().add(dir.clone().scale(d));
        }
      }
    }

    spawnShotTracer(scene, muzzle, traceEnd);
    if (pick.hit && pick.pickedPoint) {
      spawnImpactMark(scene, pick.pickedPoint, dir);
    }

    if (!ent) {
      const coachThis = coachAppliesThisShot(runtime.shotsThisRound);
      onHitMissAfterScoring(coachThis);
      return true;
    }

    const coachThis = coachAppliesThisShot(runtime.shotsThisRound);
    runtime.shotsThisRound++;

    if (ent.isMatch) {
      runtime.score += 10;
      runtime.matchLeft--;
      runtime.correctHits++;
      ent.dying = true;
      ent.dyingT = 0;
      flash(hud, 'correct');
      GameAudio.hitCorrect();
      updateHud(runtime, hud);
      if (runtime.matchLeft <= 0) {
        const endRound = (): void => {
          GameAudio.roundWin();
          showRoundEnd(runtime, hud, shootContext, 'complete', 'ROUND COMPLETE', 'ALL TARGETS ELIMINATED');
        };
        scheduleEndRoundAfterCorrectCoach(ent, coachThis, shootContext.getMatchLeft(), endRound);
      }
    } else {
      const penalty = applyWrongHitPenalty(runtime.score);
      runtime.score = penalty.score;
      runtime.wrongHits++;
      flash(hud, 'wrong');
      GameAudio.hitWrong();
      updateHud(runtime, hud);
      if (penalty.gameOver) {
        showRoundEnd(runtime, hud, shootContext, 'gameOver', 'GAME OVER', 'SCORE RETURNED TO ZERO', 'FINAL SCORE');
        return true;
      }
      onHitWrongAfterScoring(ent, coachThis);
    }
    return true;
  };

  const onShootMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;

    if (document.pointerLockElement !== canvas) return;
    shoot();
  };

  /** Capture so HUD/overlay does not eat the click; center-ray pick matches the crosshair under pointer lock. */
  canvas.addEventListener('mousedown', onShootMouseDown, true);

  return { shoot };
}
