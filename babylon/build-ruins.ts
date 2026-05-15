import {
  DynamicTexture,
  Light,
  Mesh,
  Scene,
  Vector3,
} from '@babylonjs/core';

import {
  addAmbientFill,
  addBox,
  addDamageDecals,
  addDirFromPosition,
  addDustMotes,
  addFloor,
  addPoint,
  addSkySphere,
  addSoftClouds,
  addSunLight,
  addWallBox,
  addWallBoxRotY,
  makeArenaBuildResult,
  setBackgroundExp2FogCustom,
  type ArenaBuildResult,
} from './arena-shared';
import { palettePick, propColorDrift } from './env-colors';
import type { MaterialSurfaceRole } from './material-style';
import type { WallAABB } from './wall-collision';

export const RUINS_ENV_SPAWN_HALF_XZ = 40;

/** Port of `ENVS.ruins()`. */
export function buildRuinsScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const textures: DynamicTexture[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = RUINS_ENV_SPAWN_HALF_XZ;

  // Dusty amber/sunset atmosphere — distinct from the azure sky of forest
  setBackgroundExp2FogCustom(scene, 0xd4a96a, 0xc89450, 0.006);

  addAmbientFill(scene, lights, 0xf0e4d4, 0.66);
  addDirFromPosition(scene, lights, 0xffcc99, 0.72, 10, 22, 5);
  addPoint(scene, lights, 0xffaa66, 0.62, -13, 5, -13, 56);
  addPoint(scene, lights, 0xffb88a, 0.52, 16, 4, 16, 44);

  addFloor(scene, meshes, 90, 0x5c5044, 'ruins');

  const rPerimLo = 0x2d2d2d; // Greyish stone
  const rPerimHi = 0x5a5a5a;
  
  // Vary perimeter walls heights
  for (let i = -40; i <= 40; i += 10) {
    const h1 = 3 + Math.random() * 8;
    const h2 = 3 + Math.random() * 8;
    const h3 = 3 + Math.random() * 8;
    const h4 = 3 + Math.random() * 8;
    const ry1 = (Math.random() - 0.5) * 0.15;
    const ry2 = (Math.random() - 0.5) * 0.15;
    const ry3 = (Math.random() - 0.5) * 0.15;
    const ry4 = (Math.random() - 0.5) * 0.15;
    addWallBox(scene, meshes, wallBoxes, 11, h1, 1.5, rPerimLo, rPerimHi, i, h1 / 2, -45, ry1);
    addWallBox(scene, meshes, wallBoxes, 11, h2, 1.5, rPerimLo, rPerimHi, i, h2 / 2, 45, ry2);
    addWallBox(scene, meshes, wallBoxes, 1.5, h3, 11, rPerimLo, rPerimHi, -45, h3 / 2, i, ry3);
    addWallBox(scene, meshes, wallBoxes, 1.5, h4, 11, rPerimLo, rPerimHi, 45, h4 / 2, i, ry4);
  }

  const rInLo = 0x3a2412;
  const rInHi = 0x644030;
  addWallBoxRotY(scene, meshes, wallBoxes, 10, 4, 0.9, rInLo, rInHi, -11, 2, -9, 0.2);
  addWallBoxRotY(scene, meshes, wallBoxes, 7, 6, 0.9, rInLo, rInHi, 7, 3, -14, -0.1);
  addWallBoxRotY(scene, meshes, wallBoxes, 14, 3, 0.9, rInLo, rInHi, 10, 1.5, 7, 0.3);
  addWallBoxRotY(scene, meshes, wallBoxes, 8, 5, 0.9, rInLo, rInHi, -17, 2.5, 12, -0.2);
  addWallBoxRotY(scene, meshes, wallBoxes, 5, 2, 0.9, rInLo, rInHi, 1, 1, 10, 0.5);
  addWallBoxRotY(scene, meshes, wallBoxes, 12, 4, 0.9, rInLo, rInHi, -5, 2, -22, 0.1);
  addWallBoxRotY(scene, meshes, wallBoxes, 9, 5, 0.9, rInLo, rInHi, 20, 2.5, 0, 0);
  addWallBoxRotY(scene, meshes, wallBoxes, 11, 3, 0.9, rInLo, rInHi, -22, 1.5, -7, 0.15);
  addWallBoxRotY(scene, meshes, wallBoxes, 7, 4, 0.9, rInLo, rInHi, -4, 2, 19, 0.35);
  addWallBoxRotY(scene, meshes, wallBoxes, 8, 3, 0.9, rInLo, rInHi, 15, 1.5, -21, 0.1);

  for (const [x, , z] of [
    [-5, 0, 5],
    [-10, 0, 10],
    [17, 0, -7],
    [-17, 0, -14],
    [2, 0, -20],
    [12, 0, 17],
    [23, 0, 4],
    [-23, 0, -5],
  ] as const) {
    const ch = 1.5 + Math.random() * 4;
    // Mix grey and brown for pillars, with random Y rotation and height jitter
    const isGrey = Math.random() > 0.5;
    const pLo = isGrey ? 0x444444 : 0x442818;
    const pHi = isGrey ? 0x6a6a6a : 0x6a4838;
    const ry = (Math.random() - 0.5) * 0.4;
    addWallBox(scene, meshes, wallBoxes, 1.2, ch, 1.2, pLo, pHi, x, ch / 2, z, ry);
    if (Math.random() > 0.45) {
      const capX = x + (Math.random() - 0.5) * 0.4;
      const capZ = z + (Math.random() - 0.5) * 0.4;
      const capSalt = capX * 61 + capZ * 47 + ch * 2.1;
      const capFinish: MaterialSurfaceRole = palettePick(capSalt, 2) === 0 ? 'stone' : 'wood';
      addBox(
        scene,
        meshes,
        2,
        0.45,
        2,
        propColorDrift(0x4a2e18, capSalt, 0.13),
        capX,
        ch + 0.23,
        capZ,
        Math.random() * 0.3,
        false,
        wallBoxes,
        1,
        capFinish,
      );
    }
  }

  for (const [x, , z] of [
    [6, 0, -7],
    [-5, 0, 14],
    [14, 0, 10],
    [-10, 0, -17],
    [2, 0, 7],
    [11, 0, -5],
  ] as const) {
    for (let i = 0; i < 5; i++) {
      const s = 0.22 + Math.random() * 0.65;
      const rx = x + (Math.random() - 0.5) * 2.5;
      const rz = z + (Math.random() - 0.5) * 2.5;
      const rubSalt = rx * 51 + rz * 49 + i * 31 + s * 10;
      const rubFinish: MaterialSurfaceRole = palettePick(rubSalt, 4) === 0 ? 'wood' : 'stone';
      addBox(
        scene,
        meshes,
        s,
        s * 0.45,
        s * 0.8,
        propColorDrift(0x3a2010, rubSalt, 0.14),
        rx,
        s * 0.23,
        rz,
        Math.random() * Math.PI,
        false,
        wallBoxes,
        1,
        rubFinish,
      );
    }
  }

  // Scattered rubble and debris across the floor
  for (let i = 0; i < 45; i++) {
    const dx = (Math.random() - 0.5) * 80;
    const dz = (Math.random() - 0.5) * 80;
    const s = 0.2 + Math.random() * 0.5;
    const ry = Math.random() * Math.PI;
    addWallBox(scene, meshes, wallBoxes, s, s, s, 0x3a3a3a, 0x6a6a6a, dx, s / 2, dz, ry);
  }

  addDamageDecals(scene, meshes, textures, [
    { x: -44.22, y: 3.1, z: -29, w: 6, h: 4.1, ry: Math.PI / 2, kind: 'hole', seed: 301 },
    { x: 44.22, y: 2.6, z: 22, w: 5.2, h: 3.8, ry: -Math.PI / 2, kind: 'crack', seed: 302 },
    { x: -30, y: 2.4, z: -44.22, w: 5.6, h: 3.7, ry: 0, kind: 'crack', seed: 303 },
    { x: 26, y: 3.5, z: 44.22, w: 6.2, h: 4.6, ry: Math.PI, kind: 'hole', seed: 304 },
    { x: -11, y: 2.5, z: -8.52, w: 3.5, h: 2.5, ry: 0.2, kind: 'hole', seed: 305 },
    { x: 9.52, y: 1.8, z: 7, w: 4.2, h: 2.1, ry: 0.3 + Math.PI, kind: 'crack', seed: 306 },
  ]);

  addDustMotes(scene, meshes);

  addSkySphere(scene, meshes, textures);
  addSoftClouds(scene, meshes, textures, 20, 1);
  addSunLight(scene, lights);

  const spawnPosition = new Vector3(0, 1.7, 0);

  return makeArenaBuildResult(scene, meshes, lights, textures, wallBoxes, envSpawnHalfXZ, spawnPosition);
}
