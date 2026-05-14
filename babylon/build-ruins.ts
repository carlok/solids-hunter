import {
  DynamicTexture,
  Light,
  Scene,
  Vector3,
} from '@babylonjs/core';

import {
  addAmbientFill,
  addBox,
  addDirFromPosition,
  addFloor,
  addPoint,
  addSkySphere,
  addSoftClouds,
  addSunLight,
  addWallBox,
  addWallBoxRotY,
  applyDiffuseHex,
  disposeArenaResources,
  setAzureBackgroundExp2Fog,
  type ArenaBuildResult,
} from './arena-shared';
import { envTintHex } from './env-colors';
import type { WallAABB } from './wall-collision';

export const RUINS_ENV_SPAWN_HALF_XZ = 40;

/** Port of `ENVS.ruins()`. */
export function buildRuinsScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const textures: DynamicTexture[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = RUINS_ENV_SPAWN_HALF_XZ;

  setAzureBackgroundExp2Fog(scene, 0.009);

  addAmbientFill(scene, lights, 0xc8b8a8, 0.55);
  addDirFromPosition(scene, lights, 0xffaa77, 0.65, 10, 20, 5);
  addPoint(scene, lights, 0xff6622, 0.58, -13, 4, -13, 52);
  addPoint(scene, lights, 0xff8844, 0.48, 16, 3, 16, 40);

  addFloor(scene, meshes, 90, 0x1a140e);

  const rPerimLo = 0x321c10;
  const rPerimHi = 0x5c3820;
  addWallBox(scene, meshes, wallBoxes, 90, 9, 0.5, rPerimLo, rPerimHi, 0, 4.5, -45, 0);
  addWallBox(scene, meshes, wallBoxes, 90, 9, 0.5, rPerimLo, rPerimHi, 0, 4.5, 45, 0);
  addWallBox(scene, meshes, wallBoxes, 0.5, 9, 90, rPerimLo, rPerimHi, -45, 4.5, 0, 0);
  addWallBox(scene, meshes, wallBoxes, 0.5, 9, 90, rPerimLo, rPerimHi, 45, 4.5, 0, 0);

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
    addWallBox(scene, meshes, wallBoxes, 1.2, ch, 1.2, 0x442818, 0x6a4838, x, ch / 2, z, 0);
    if (Math.random() > 0.45) {
      const capX = x + (Math.random() - 0.5) * 0.4;
      const capZ = z + (Math.random() - 0.5) * 0.4;
      addBox(
        scene,
        meshes,
        2,
        0.45,
        2,
        envTintHex(0x4a2e18, capX * 61 + capZ * 47 + ch * 2.1),
        capX,
        ch + 0.23,
        capZ,
        Math.random() * 0.3,
        false,
        wallBoxes,
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
      addBox(
        scene,
        meshes,
        s,
        s * 0.45,
        s * 0.8,
        envTintHex(0x3a2010, rx * 51 + rz * 49 + i * 31 + s * 10),
        rx,
        s * 0.23,
        rz,
        Math.random() * Math.PI,
        false,
        wallBoxes,
      );
    }
  }

  addSkySphere(scene, meshes, textures);
  addSoftClouds(scene, meshes, textures, 20, 1);
  addSunLight(scene, lights);

  const spawnPosition = new Vector3(0, 1.7, 0);

  return {
    wallBoxes,
    envSpawnHalfXZ,
    spawnPosition,
    dispose: () => disposeArenaResources(meshes, lights, textures),
  };
}
