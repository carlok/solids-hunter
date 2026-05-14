import type { Scene, UniversalCamera } from '@babylonjs/core';
import { Ray, Vector3 } from '@babylonjs/core';

import {
  coachAppliesThisShot,
  onHitWrongAfterScoring,
  scheduleEndRoundAfterCorrectCoach,
} from './coach';
import { resolveEntityIdFromPick } from './entity-pick';
import type { GameEntity } from './entity-motion';
import { gameFeedback } from './entity-motion';
import { GameAudio } from './game-audio';
import { spawnShotTracer } from './shot-tracer';

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

export function attachBabylonShooting(options: {
  scene: Scene;
  canvas: HTMLCanvasElement;
  camera: UniversalCamera;
  shootContext: BabylonShootContext;
  hud: BabylonShootHud;
  runtime: BabylonGameRuntime;
}): void {
  const { scene, canvas, camera, shootContext, hud, runtime } = options;

  updateHud(runtime, hud);

  window.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;

    if (runtime.roundEnded) {
      window.location.reload();
      return;
    }

    if (gameFeedback.paused) return;
    if (document.pointerLockElement !== canvas) return;

    GameAudio.shoot();

    const entities = shootContext.getEntities();

    const dir = camera.getDirection(new Vector3(0, 0, 1));
    const muzzle = camera.position.clone().addScaledVector(dir, MUZZLE_FORWARD);
    const traceFar = muzzle.clone().addScaledVector(dir, MAX_TRACE);

    const ray = new Ray(camera.position.clone(), dir, MAX_TRACE + MUZZLE_FORWARD + 4);
    const pick = scene.pickWithRay(ray, (mesh) => {
      const id = resolveEntityIdFromPick(mesh);
      if (id === undefined) return false;
      const ent = entities.find((x) => x.entityId === id);
      return !!ent && ent.alive && !ent.dying;
    });

    let traceEnd = traceFar;
    let ent: GameEntity | null = null;
    if (pick.hit && pick.pickedMesh && pick.pickedPoint) {
      const id = resolveEntityIdFromPick(pick.pickedMesh);
      const found = id === undefined ? undefined : entities.find((x) => x.entityId === id);
      if (found && found.alive && !found.dying) {
        ent = found;
        traceEnd = pick.pickedPoint.clone();
      }
    }

    spawnShotTracer(scene, muzzle, traceEnd);

    if (!ent) return;

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
  });
}
