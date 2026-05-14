import {
  Color3,
  DynamicTexture,
  Light,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

import {
  addAmbientFill,
  addBox,
  addFloor,
  addPoint,
  addSkySphere,
  addSunLight,
  addWallBox,
  applyDiffuseHex,
  disposeArenaResources,
  setAzureBackgroundLinearFog,
  type ArenaBuildResult,
} from './arena-shared';
import { envTintHex } from './env-colors';
import type { WallAABB } from './wall-collision';

export const DUNGEON_ENV_SPAWN_HALF_XZ = 32;

/** Port of `ENVS.dungeon()`. */
export function buildDungeonScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const textures: DynamicTexture[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = DUNGEON_ENV_SPAWN_HALF_XZ;

  setAzureBackgroundLinearFog(scene, 18, 102);

  addAmbientFill(scene, lights, 0xa8c4e8, 0.55);
  addPoint(scene, lights, 0xaabbff, 1.55, 0, 3.5, 0, 48);
  addPoint(scene, lights, 0xffaa88, 1.0, 13, 3, -13, 28);
  addPoint(scene, lights, 0xffaa88, 1.0, -13, 3, 13, 28);

  addFloor(scene, meshes, 70, 0x2a3148);

  const ceil = MeshBuilder.CreatePlane('dungeonCeil', { width: 70, height: 70 }, scene);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 5.5;
  const ceilMat = new StandardMaterial('dungeonCeilMat', scene);
  ceilMat.specularColor = Color3.Black();
  applyDiffuseHex(ceilMat, envTintHex(0x3a4d68, 11));
  ceil.material = ceilMat;
  meshes.push(ceil);

  const dOutLo = 0x283648;
  const dOutHi = 0x446080;
  addWallBox(scene, meshes, wallBoxes, 70, 6, 1, dOutLo, dOutHi, 0, 3, -35, 0);
  addWallBox(scene, meshes, wallBoxes, 70, 6, 1, dOutLo, dOutHi, 0, 3, 35, 0);
  addWallBox(scene, meshes, wallBoxes, 1, 6, 70, dOutLo, dOutHi, -35, 3, 0, 0);
  addWallBox(scene, meshes, wallBoxes, 1, 6, 70, dOutLo, dOutHi, 35, 3, 0, 0);

  const dInLo = 0x303e52;
  const dInHi = 0x4a6080;
  addWallBox(scene, meshes, wallBoxes, 18, 5, 1.2, dInLo, dInHi, -9, 2.5, -11, 0);
  addWallBox(scene, meshes, wallBoxes, 18, 5, 1.2, dInLo, dInHi, 9, 2.5, 11, 0);
  addWallBox(scene, meshes, wallBoxes, 1.2, 5, 14, dInLo, dInHi, 7, 2.5, -19, 0);
  addWallBox(scene, meshes, wallBoxes, 1.2, 5, 14, dInLo, dInHi, -7, 2.5, 19, 0);
  addWallBox(scene, meshes, wallBoxes, 10, 5, 1.2, dInLo, dInHi, 19, 2.5, -5, 0);
  addWallBox(scene, meshes, wallBoxes, 10, 5, 1.2, dInLo, dInHi, -19, 2.5, 5, 0);

  const dPilLo = 0x384858;
  const dPilHi = 0x5a6c88;
  for (const [x, , z] of [
    [-9, 0, -9],
    [9, 0, -9],
    [-9, 0, 9],
    [9, 0, 9],
    [-17, 0, -17],
    [17, 0, -17],
    [-17, 0, 17],
    [17, 0, 17],
  ] as const) {
    addWallBox(scene, meshes, wallBoxes, 1.5, 5.5, 1.5, dPilLo, dPilHi, x, 2.75, z, 0);
  }

  for (const [x, , z] of [
    [-4, 0, -4],
    [6, 0, 8],
    [-13, 0, -6],
    [15, 0, 7],
    [-8, 0, 15],
    [10, 0, -17],
  ] as const) {
    const salt = x * 101 + z * 73;
    addBox(
      scene,
      meshes,
      1.8,
      0.55,
      1.2,
      envTintHex(0x2e3545, salt),
      x,
      0.28,
      z,
      Math.random() * Math.PI,
      false,
      wallBoxes,
    );
  }

  addSkySphere(scene, meshes, textures);
  addSunLight(scene, lights);

  const spawnPosition = new Vector3(6, 1.7, 8);

  return {
    wallBoxes,
    envSpawnHalfXZ,
    spawnPosition,
    dispose: () => disposeArenaResources(meshes, lights, textures),
  };
}
