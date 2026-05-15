import {
  DynamicTexture,
  Light,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  Vector3,
  Color4,
  Color3,
} from '@babylonjs/core';

import {
  addAmbientFill,
  addBox,
  addFloor,
  addPoint,
  addDustMotes,
  addWallBox,
  applyAlbedoHex,
  makeArenaBuildResult,
  type ArenaBuildResult,
} from './arena-shared';
import { envTintHex, propColorDrift } from './env-colors';
import { stylePbrSurfaceMaterial } from './material-style';
import type { WallAABB } from './wall-collision';

export const DUNGEON_ENV_SPAWN_HALF_XZ = 32;

/** Port of `ENVS.dungeon()`. */
export function buildDungeonScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const textures: DynamicTexture[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = DUNGEON_ENV_SPAWN_HALF_XZ;

  scene.clearColor = new Color4(0.02, 0.02, 0.02, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 10;
  scene.fogEnd = 45;
  scene.fogColor = new Color3(0.02, 0.02, 0.02);

  addAmbientFill(scene, lights, 0x101010, 0.15); // Very low ambient
  addPoint(scene, lights, 0xff5500, 1.8, 0, 0.5, 0, 40); // Central bonfire
  
  // Torches on walls
  addPoint(scene, lights, 0xff8800, 1.2, -34, 3, 0, 30);
  addPoint(scene, lights, 0xff8800, 1.2, 34, 3, 0, 30);
  addPoint(scene, lights, 0xff8800, 1.2, 0, 3, -34, 30);
  addPoint(scene, lights, 0xff8800, 1.2, 0, 3, 34, 30);

  addFloor(scene, meshes, 70, 0x2a2218, 'dungeon');

  const ceil = MeshBuilder.CreatePlane('dungeonCeil', { width: 70, height: 70 }, scene);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 10;
  const ceilMat = new PBRMaterial('dungeonCeilMat', scene);
  applyAlbedoHex(ceilMat, envTintHex(0x302018, 11));
  stylePbrSurfaceMaterial(ceilMat, 'stone');
  ceil.material = ceilMat;
  meshes.push(ceil);

  const dOutLo = 0x283648;
  const dOutHi = 0x446080;
  
  // Break outer walls into segments with slight jitter and varying heights
  for (let i = -30; i <= 30; i += 15) {
    const h1 = 4 + Math.random() * 5;
    const h2 = 4 + Math.random() * 5;
    const h3 = 4 + Math.random() * 5;
    const h4 = 4 + Math.random() * 5;
    const ry1 = (Math.random() - 0.5) * 0.1;
    const ry2 = (Math.random() - 0.5) * 0.1;
    const ry3 = (Math.random() - 0.5) * 0.1;
    const ry4 = (Math.random() - 0.5) * 0.1;
    addWallBox(scene, meshes, wallBoxes, 16, h1, 1.5, dOutLo, dOutHi, i, h1 / 2, -35, ry1);
    addWallBox(scene, meshes, wallBoxes, 16, h2, 1.5, dOutLo, dOutHi, i, h2 / 2, 35, ry2);
    addWallBox(scene, meshes, wallBoxes, 1.5, h3, 16, dOutLo, dOutHi, -35, h3 / 2, i, ry3);
    addWallBox(scene, meshes, wallBoxes, 1.5, h4, 16, dOutLo, dOutHi, 35, h4 / 2, i, ry4);
  }

  // Make the lights flicker (Bonfire & Torches)
  const baseIntensities = lights.map(l => l.intensity);
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += scene.getEngine().getDeltaTime() * 0.005;
    lights.forEach((l, idx) => {
      // Small random sin wave variation for flicker
      const flicker = Math.sin(time * (1 + idx)) * 0.15 * Math.random();
      l.intensity = baseIntensities[idx]! + flicker;
    });
  });

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
      propColorDrift(0x2e3545, salt, 0.14),
      x,
      0.28,
      z,
      Math.random() * Math.PI,
      false,
      wallBoxes,
      1,
      'stone',
    );
  }

  addDustMotes(scene, meshes);

  // No sky sphere, no sun light for dark dungeon

  const spawnPosition = new Vector3(6, 1.7, 8);

  return makeArenaBuildResult(scene, meshes, lights, textures, wallBoxes, envSpawnHalfXZ, spawnPosition);
}
