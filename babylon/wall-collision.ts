import { Vector3 } from '@babylonjs/core';

/** Axis-aligned wall volume (world space), same contract as THREE.Box3 for collision. */
export type WallAABB = {
  readonly min: Vector3;
  readonly max: Vector3;
};

export function intersectsAABB(a: WallAABB, b: WallAABB): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

export function aabbFromCenterAndSize(
  center: Vector3,
  size: Vector3,
  outMin: Vector3,
  outMax: Vector3,
): WallAABB {
  const hx = size.x * 0.5;
  const hy = size.y * 0.5;
  const hz = size.z * 0.5;
  outMin.set(center.x - hx, center.y - hy, center.z - hz);
  outMax.set(center.x + hx, center.y + hy, center.z + hz);
  return { min: outMin, max: outMax };
}

const PLAYER_SIZE = new Vector3(0.5, 1.8, 0.5);
/** Entity foot AABB size (world axes); same as Three `entWallSize` / wall separation. */
export const ENTITY_FOOT_SIZE = new Vector3(0.48, 0.88, 0.48);
const _pMin = new Vector3();
const _pMax = new Vector3();
const _eMin = new Vector3();
const _eMax = new Vector3();
const _sepMin = new Vector3();
const _sepMax = new Vector3();
const _sepEnt: WallAABB = { min: _sepMin, max: _sepMax };
const _playerBox: WallAABB = { min: _pMin, max: _pMax };
const _entBox: WallAABB = { min: _eMin, max: _eMax };

export function hitsWall(pos: Vector3, wallBoxes: readonly WallAABB[]): boolean {
  aabbFromCenterAndSize(pos, PLAYER_SIZE, _pMin, _pMax);
  for (const wb of wallBoxes) {
    if (intersectsAABB(_playerBox, wb)) return true;
  }
  return false;
}

/** Solid block roughly over hunt entity body+outline (XZ); center Y matches moving solids. */
const ENTITY_PLAYER_BLOCK = new Vector3(1.05, 1.05, 1.05);
const ENTITY_PLAYER_CENTER_Y = 1.45;

export type EntityCollider = {
  root: { position: Vector3 };
  alive: boolean;
  dying: boolean;
};

export function hitsEntity(pos: Vector3, entities: readonly EntityCollider[]): boolean {
  aabbFromCenterAndSize(pos, PLAYER_SIZE, _pMin, _pMax);
  for (const e of entities) {
    if (!e.alive || e.dying) continue;
    const m = e.root.position;
    _try.set(m.x, ENTITY_PLAYER_CENTER_Y, m.z);
    aabbFromCenterAndSize(_try, ENTITY_PLAYER_BLOCK, _eMin, _eMax);
    if (intersectsAABB(_playerBox, _entBox)) return true;
  }
  return false;
}

export function entityHitsWallAt(
  pos: Vector3,
  wallBoxes: readonly WallAABB[],
): boolean {
  aabbFromCenterAndSize(pos, ENTITY_FOOT_SIZE, _eMin, _eMax);
  for (const wb of wallBoxes) {
    if (intersectsAABB(_entBox, wb)) return true;
  }
  return false;
}

const _try = new Vector3();

/**
 * Random XZ whose entity AABB (at yTest) does not intersect any wall.
 * Ported from js/main.js randomOpenXZ.
 */
export function randomOpenXZ(
  half: number,
  excludeOrigin: number,
  yTest: number | undefined,
  wallBoxes: readonly WallAABB[],
): Vector3 {
  const y = yTest === undefined ? 1.45 : yTest;
  const ex = excludeOrigin === undefined ? 4 : excludeOrigin;
  for (let t = 0; t < 100; t++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (Math.abs(x) < ex && Math.abs(z) < ex) continue;
    _try.set(x, y, z);
    if (!entityHitsWallAt(_try, wallBoxes)) return _try.clone();
  }
  for (let ring = 1; ring < 48; ring++) {
    const ang = ring * 2.399963229728653;
    const x = Math.cos(ang) * ring * 1.25;
    const z = Math.sin(ang) * ring * 1.25;
    if (Math.abs(x) >= half || Math.abs(z) >= half) continue;
    _try.set(x, y, z);
    if (!entityHitsWallAt(_try, wallBoxes)) return _try.clone();
  }
  return new Vector3(0, y, 14);
}

/**
 * Push entity center out of penetrating wall boxes on XZ (smallest overlap axis).
 * Ported from `js/main.js` `separateEntityFromWalls`.
 */
export function separateEntityFromWalls(
  pos: Vector3,
  wallBoxes: readonly WallAABB[],
): void {
  for (let iter = 0; iter < 14; iter++) {
    aabbFromCenterAndSize(pos, ENTITY_FOOT_SIZE, _sepMin, _sepMax);
    let wbHit: WallAABB | null = null;
    for (const wb of wallBoxes) {
      if (intersectsAABB(_sepEnt, wb)) {
        wbHit = wb;
        break;
      }
    }
    if (!wbHit) return;
    const penX =
      Math.min(_sepMax.x, wbHit.max.x) - Math.max(_sepMin.x, wbHit.min.x);
    const penZ =
      Math.min(_sepMax.z, wbHit.max.z) - Math.max(_sepMin.z, wbHit.min.z);
    if (penX <= 0 || penZ <= 0) {
      pos.y += 0.06;
      continue;
    }
    const midX = (wbHit.min.x + wbHit.max.x) * 0.5;
    const midZ = (wbHit.min.z + wbHit.max.z) * 0.5;
    const eps = 0.02;
    if (penX < penZ) {
      pos.x += pos.x < midX ? -(penX + eps) : penX + eps;
    } else {
      pos.z += pos.z < midZ ? -(penZ + eps) : penZ + eps;
    }
  }
}

/** Push axis-aligned wall box (center x,y,z, full width/height/depth). Lab walls use ry=0. */
export function pushWallBoxCenterSize(
  wallBoxes: WallAABB[],
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
): WallAABB {
  const hx = w * 0.5;
  const hy = h * 0.5;
  const hz = d * 0.5;
  const box: WallAABB = {
    min: new Vector3(cx - hx, cy - hy, cz - hz),
    max: new Vector3(cx + hx, cy + hy, cz + hz),
  };
  wallBoxes.push(box);
  return box;
}

/**
 * World AABB for a yaw-rotated box (same expansion as THREE.Box3.setFromObject on Ry).
 */
export function pushWallBoxCenterSizeRotY(
  wallBoxes: WallAABB[],
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  ry: number,
): WallAABB {
  const hx = w * 0.5;
  const hy = h * 0.5;
  const hz = d * 0.5;
  const c = Math.abs(Math.cos(ry));
  const s = Math.abs(Math.sin(ry));
  const ax = c * hx + s * hz;
  const az = s * hx + c * hz;
  return pushWallBoxCenterSize(wallBoxes, cx, cy, cz, ax * 2, hy * 2, az * 2);
}
