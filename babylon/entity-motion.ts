import type { Scene } from '@babylonjs/core';
import { PBRMaterial, Vector3 } from '@babylonjs/core';

import { xzOverlapSeparation } from '@lib/entity-collision-2d.js';
import {
  CNAMES,
  COLORS,
  ensureMinimumMatches,
  MOVE_MODES,
  pick,
  SHAPES,
} from '@lib/game-rules.js';

import {
  createSolidEntity,
  disposeSolidEntity,
  type HuntRule,
  type SolidEntityRecord,
  type SolidShape,
} from './entities';
import {
  entityHitsWallAt,
  randomOpenXZ,
  separateEntityFromWalls,
  type WallAABB,
} from './wall-collision';

const ENTITY_PAIR_SEP = 1.38;

export type MoveMode = (typeof MOVE_MODES)[number];

export type GameEntity = SolidEntityRecord & {
  moveMode: MoveMode;
  alive: boolean;
  dying: boolean;
  dyingT: number;
  bobPhase: number;
  bobFreq: number;
  bobAmp: number;
  speed: number;
  target: Vector3;
  targetTimer: number;
  orbitCx: number;
  orbitCz: number;
  orbitAng: number;
  orbitR: number;
  orbitSpeed: number;
  slideVx: number;
  slideVz: number;
  rotVx: number;
  rotVy: number;
  rotVz: number;
  glowPhase: number; // random offset for emissive pulse
};

export type SpawnGameOptions = {
  wallBoxes: readonly WallAABB[];
  envSpawnHalfXZ: number;
  rule: HuntRule;
  /** @default `14 + floor(rng * 5)` like js/main.js */
  count?: number;
  rng?: () => number;
};

export const gameFeedback = { paused: false };

/**
 * Max |x| and |z| for entity motion clamp and player walk clamp (parity with js/main.js).
 * Tied to arena {@link SpawnGameOptions.envSpawnHalfXZ}.
 */
export function xzPlayHalfLimit(envSpawnHalfXZ: number): number {
  return Math.min(29.8, envSpawnHalfXZ - 1.2);
}

/** Dispose every spawned entity and clear the list (arena teardown / new round). */
export function disposeAllGameEntities(list: GameEntity[]): void {
  while (list.length) {
    const ent = list.pop()!;
    disposeSolidEntity(ent);
  }
}

function clampN(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** Spawns hunt solids with drift / bounce / orbit / slide motion (js/main.js parity). */
export function spawnGameEntities(scene: Scene, opts: SpawnGameOptions): GameEntity[] {
  const rng = opts.rng ?? Math.random;
  const count = opts.count ?? 14 + Math.floor(rng() * 5);
  const { wallBoxes, envSpawnHalfXZ, rule } = opts;

  const list: { shape: SolidShape; color: string }[] = Array.from({ length: count }, () => ({
    shape: SHAPES[Math.floor(rng() * SHAPES.length)]!,
    color: CNAMES[Math.floor(rng() * CNAMES.length)]!,
  }));
  ensureMinimumMatches(list, rule, 3, rng);

  const out: GameEntity[] = [];
  for (const { shape, color } of list) {
    const colorHex = COLORS[color as keyof typeof COLORS];
    const pos = randomOpenXZ(envSpawnHalfXZ, 4, 1.5, wallBoxes);
    const isMatch = rule.matches({ color, shape });
    const rec = createSolidEntity(scene, {
      position: pos,
      shape,
      colorName: color,
      colorHex,
      isMatch,
    });
    const tp = randomOpenXZ(envSpawnHalfXZ, 3, 1.45, wallBoxes);
    const target = new Vector3(tp.x, 1.5, tp.z);
    const moveMode = pick(MOVE_MODES, rng) as MoveMode;

    const baseMotion: Omit<GameEntity, keyof SolidEntityRecord> = {
      moveMode,
      alive: true,
      dying: false,
      dyingT: 0,
      bobPhase: rng() * Math.PI * 2,
      bobFreq: 0,
      bobAmp: 0,
      speed: 0,
      target,
      targetTimer: 0,
      orbitCx: 0,
      orbitCz: 0,
      orbitAng: 0,
      orbitR: 0,
      orbitSpeed: 0,
      slideVx: 0,
      slideVz: 0,
      rotVx: (rng() - 0.5) * 2.5,
      rotVy: (rng() - 0.5) * 2.5,
      rotVz: (rng() - 0.5) * 2.5,
      glowPhase: rng() * Math.PI * 2,
    };

    if (moveMode === 'drift') {
      out.push({
        ...rec,
        ...baseMotion,
        bobFreq: 1.1 + rng() * 0.9,
        speed: 1.4 + rng() * 1.3,
        targetTimer: 3 + rng() * 4,
        bobAmp: 0.2,
      });
    } else if (moveMode === 'bounce') {
      out.push({
        ...rec,
        ...baseMotion,
        bobFreq: 2.0 + rng() * 1.2,
        speed: 0.85 + rng() * 0.95,
        targetTimer: 2.5 + rng() * 3.5,
        bobAmp: 0.38 + rng() * 0.18,
      });
    } else if (moveMode === 'orbit') {
      out.push({
        ...rec,
        ...baseMotion,
        orbitCx: pos.x,
        orbitCz: pos.z,
        orbitAng: rng() * Math.PI * 2,
        orbitR: 2.2 + rng() * 4.2,
        orbitSpeed: 0.38 + rng() * 0.55,
      });
    } else {
      const ang = rng() * Math.PI * 2;
      const sp = 1.85 + rng() * 2.35;
      out.push({
        ...rec,
        ...baseMotion,
        slideVx: Math.cos(ang) * sp,
        slideVz: Math.sin(ang) * sp,
        bobAmp: 0.05 + rng() * 0.06,
      });
    }
  }
  return out;
}

export function updateGameEntities(params: {
  entities: GameEntity[];
  wallBoxes: readonly WallAABB[];
  envSpawnHalfXZ: number;
  feedbackPaused: boolean;
  cameraWorldPosition: Vector3;
  dt: number;
  t: number;
}): void {
  const {
    entities,
    wallBoxes,
    envSpawnHalfXZ,
    feedbackPaused: freeze,
    cameraWorldPosition,
    dt,
    t,
  } = params;

  if (freeze) return;

  const entXZLim = xzPlayHalfLimit(envSpawnHalfXZ);

  for (const ent of entities) {
    if (!ent.alive) continue;
    if (!ent.body || ent.body.isDisposed()) continue; // guard disposed meshes
    const m = ent.root.position;

    if (ent.dying) {
      ent.dyingT += dt * 4;
      const s = Math.max(0, 1 - ent.dyingT);
      if (!ent.body.isDisposed()) ent.body.scaling.setAll(s);
      if (ent.dyingT >= 1) {
        ent.alive = false;
        disposeSolidEntity(ent);
      }
      continue;
    }

    // Emissive glow pulse — subtle breathing effect on each solid
    const mat = ent.body.material as PBRMaterial | null;
    if (mat && 'emissiveColor' in mat) {
      const pulse = 0.08 + Math.abs(Math.sin(t * 1.4 + ent.glowPhase)) * 0.18;
      mat.emissiveColor.scaleToRef(1, mat.emissiveColor); // keep colour
      const base = mat.albedoColor;
      mat.emissiveColor.set(base.r * pulse, base.g * pulse, base.b * pulse);
    }

    if (ent.moveMode === 'orbit') {
      ent.orbitAng += dt * ent.orbitSpeed;
      m.x = ent.orbitCx + Math.cos(ent.orbitAng) * ent.orbitR;
      m.z = ent.orbitCz + Math.sin(ent.orbitAng) * ent.orbitR;
      m.y = 1.45 + Math.sin(t * 2.3 + ent.bobPhase) * 0.14;
      ent.body.rotation.x += dt * ent.rotVx;
      ent.body.rotation.y += dt * ent.rotVy;
      ent.body.rotation.z += dt * ent.rotVz;
      let guard = 0;
      while (entityHitsWallAt(m, wallBoxes) && guard++ < 16) {
        ent.orbitR *= 0.93;
        if (ent.orbitR < 0.55) ent.orbitR = 0.55;
        m.x = ent.orbitCx + Math.cos(ent.orbitAng) * ent.orbitR;
        m.z = ent.orbitCz + Math.sin(ent.orbitAng) * ent.orbitR;
        if (entityHitsWallAt(m, wallBoxes)) ent.orbitAng += 0.18;
      }
    } else if (ent.moveMode === 'slide') {
      const py = 1.45 + Math.sin(t * 3.1 + ent.bobPhase) * ent.bobAmp;
      const ox = m.x;
      const oz = m.z;
      let vx = ent.slideVx;
      let vz = ent.slideVz;
      let x = ox + vx * dt;
      let z = oz;
      m.set(x, py, z);
      if (entityHitsWallAt(m, wallBoxes)) {
        vx *= -1;
        x = ox + vx * dt;
        m.set(x, py, z);
      }
      z = oz + vz * dt;
      m.set(x, py, z);
      if (entityHitsWallAt(m, wallBoxes)) {
        vz *= -1;
        z = oz + vz * dt;
        m.set(x, py, z);
      }
      m.set(x, py, z);
      if (entityHitsWallAt(m, wallBoxes)) {
        x = ox;
        z = oz;
        vx *= -1;
        vz *= -1;
      }
      ent.slideVx = vx;
      ent.slideVz = vz;
      m.set(x, py, z);
      const slideBound = entXZLim - 0.1;
      if (m.x > slideBound || m.x < -slideBound) {
        ent.slideVx *= -1;
        m.x = clampN(m.x, -entXZLim, entXZLim);
      }
      if (m.z > slideBound || m.z < -slideBound) {
        ent.slideVz *= -1;
        m.z = clampN(m.z, -entXZLim, entXZLim);
      }
      ent.body.rotation.x += dt * ent.rotVx;
      ent.body.rotation.y += dt * ent.rotVy;
      ent.body.rotation.z += dt * ent.rotVz;
    } else {
      const amp = ent.moveMode === 'bounce' ? ent.bobAmp : 0.2;
      m.y = 1.45 + Math.sin(t * ent.bobFreq + ent.bobPhase) * amp;
      ent.body.rotation.x += dt * ent.rotVx;
      ent.body.rotation.y += dt * ent.rotVy;
      ent.body.rotation.z += dt * ent.rotVz;

      ent.targetTimer -= dt;
      if (ent.targetTimer <= 0) {
        const nt = randomOpenXZ(envSpawnHalfXZ, 2, 1.45, wallBoxes);
        ent.target.set(nt.x, 1.5, nt.z);
        ent.targetTimer = 3 + Math.random() * 4;
      }
      const dx = ent.target.x - m.x;
      const dz = ent.target.z - m.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.5) {
        const ox = m.x;
        const oz = m.z;
        m.x += (dx / dist) * ent.speed * dt;
        m.z += (dz / dist) * ent.speed * dt;
        if (entityHitsWallAt(m, wallBoxes)) {
          m.x = ox;
          m.z = oz;
          ent.targetTimer = Math.min(ent.targetTimer, 0.2 + Math.random() * 0.35);
        }
      }
      m.x = clampN(m.x, -entXZLim, entXZLim);
      m.z = clampN(m.z, -entXZLim, entXZLim);
    }
  }

  const pairPasses = 4;
  for (let pass = 0; pass < pairPasses; pass++) {
    for (let i = 0; i < entities.length; i++) {
      const ea = entities[i]!;
      if (!ea.alive || ea.dying) continue;
      const a = ea.root.position;
      for (let j = i + 1; j < entities.length; j++) {
        const eb = entities[j]!;
        if (!eb.alive || eb.dying) continue;
        const b = eb.root.position;
        const sep = xzOverlapSeparation(a.x, a.z, b.x, b.z, ENTITY_PAIR_SEP);
        if (sep.ha <= 0) continue;
        a.x -= sep.nx * sep.ha;
        a.z -= sep.nz * sep.ha;
        b.x += sep.nx * sep.hb;
        b.z += sep.nz * sep.hb;
        if (pass === 0) {
          if (ea.moveMode === 'slide') {
            const vn = ea.slideVx * sep.nx + ea.slideVz * sep.nz;
            if (vn > 0) {
              ea.slideVx -= 2 * vn * sep.nx;
              ea.slideVz -= 2 * vn * sep.nz;
            }
          }
          if (eb.moveMode === 'slide') {
            const vn = eb.slideVx * sep.nx + eb.slideVz * sep.nz;
            if (vn < 0) {
              eb.slideVx -= 2 * vn * sep.nx;
              eb.slideVz -= 2 * vn * sep.nz;
            }
          }
          if (ea.moveMode === 'drift' || ea.moveMode === 'bounce') {
            ea.target.x += sep.nx * 1.1;
            ea.target.z += sep.nz * 1.1;
            ea.target.x = clampN(ea.target.x, -entXZLim, entXZLim);
            ea.target.z = clampN(ea.target.z, -entXZLim, entXZLim);
          }
          if (eb.moveMode === 'drift' || eb.moveMode === 'bounce') {
            eb.target.x -= sep.nx * 1.1;
            eb.target.z -= sep.nz * 1.1;
            eb.target.x = clampN(eb.target.x, -entXZLim, entXZLim);
            eb.target.z = clampN(eb.target.z, -entXZLim, entXZLim);
          }
          if (ea.moveMode === 'orbit') ea.orbitAng += Math.random() > 0.5 ? 0.1 : -0.1;
          if (eb.moveMode === 'orbit') eb.orbitAng += Math.random() > 0.5 ? 0.1 : -0.1;
        }
      }
    }
  }

  for (const ent of entities) {
    if (!ent.alive || ent.dying) continue;
    const m = ent.root.position;
    if (entityHitsWallAt(m, wallBoxes) && ent.moveMode === 'orbit') ent.orbitR *= 0.88;
    separateEntityFromWalls(m, wallBoxes);
    m.x = clampN(m.x, -entXZLim, entXZLim);
    m.z = clampN(m.z, -entXZLim, entXZLim);
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < entities.length; i++) {
      const ea = entities[i]!;
      if (!ea.alive || ea.dying) continue;
      const a = ea.root.position;
      for (let j = i + 1; j < entities.length; j++) {
        const eb = entities[j]!;
        if (!eb.alive || eb.dying) continue;
        const b = eb.root.position;
        const sep = xzOverlapSeparation(a.x, a.z, b.x, b.z, ENTITY_PAIR_SEP);
        if (sep.ha <= 0) continue;
        a.x -= sep.nx * sep.ha;
        a.z -= sep.nz * sep.ha;
        b.x += sep.nx * sep.hb;
        b.z += sep.nz * sep.hb;
      }
    }
  }

  for (const ent of entities) {
    if (!ent.alive || ent.dying) continue;
    const m = ent.root.position;
    if (entityHitsWallAt(m, wallBoxes) && ent.moveMode === 'orbit') ent.orbitR *= 0.91;
    separateEntityFromWalls(m, wallBoxes);
    m.x = clampN(m.x, -entXZLim, entXZLim);
    m.z = clampN(m.z, -entXZLim, entXZLim);
  }
}
