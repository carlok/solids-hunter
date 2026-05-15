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
import { spawnImpactMark, spawnShotTracer } from './shot-tracer';

const MAX_TRACE = 135;
const MUZZLE_FORWARD = 0.22;

export type BabylonShootHud = {
  scoreEl: HTMLElement;
  targetsEl: HTMLElement;
  flashEl: HTMLElement;
  roundEndEl: HTMLElement;
  finalScoreEl: HTMLElement;
};

export type BabylonGameRuntime = {
  score: number;
  matchLeft: number;
  roundEnded: boolean;
  shotsThisRound: number;
};

export type BabylonShootContext = {
  getEntities: () => GameEntity[];
  getMatchLeft: () => number;
  /** Invoked after round-win sound and pointer unlock; shows round-end UI. */
  onRoundComplete: () => void;
};

export type BabylonShooter = {
  shoot: () => boolean;
};

function updateHud(runtime: BabylonGameRuntime, hud: BabylonShootHud): void {
  hud.scoreEl.textContent = String(runtime.score);
  hud.targetsEl.textContent = String(runtime.matchLeft);
}

function flash(hud: BabylonShootHud, color: string, alpha: number): void {
  hud.flashEl.style.background = color;
  hud.flashEl.style.opacity = String(alpha);
  window.setTimeout(() => {
    hud.flashEl.style.opacity = '0';
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

  const onRoundEndMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    if (!runtime.roundEnded) return;
    window.location.reload();
  };
  window.addEventListener('mousedown', onRoundEndMouseDown, true);

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
      ent.dying = true;
      ent.dyingT = 0;
      flash(hud, '#00ff88', 0.28);
      GameAudio.hitCorrect();
      updateHud(runtime, hud);
      if (runtime.matchLeft <= 0) {
        const endRound = (): void => {
          GameAudio.roundWin();
          runtime.roundEnded = true;
          document.exitPointerLock();
          hud.roundEndEl.classList.remove('hidden');
          hud.finalScoreEl.textContent = String(runtime.score);
          shootContext.onRoundComplete();
        };
        scheduleEndRoundAfterCorrectCoach(ent, coachThis, shootContext.getMatchLeft(), endRound);
      }
    } else {
      runtime.score = Math.max(0, runtime.score - 5);
      flash(hud, '#ff2200', 0.42);
      GameAudio.hitWrong();
      updateHud(runtime, hud);
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
