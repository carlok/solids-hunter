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
  addDirFromPosition,
  addFloor,
  addHemisphericFillSplit,
  addPoint,
  addSkySphere,
  addSoftClouds,
  addSunLight,
  addWallBox,
  applyDiffuseHex,
  disposeArenaResources,
  setBackgroundExp2FogCustom,
  type ArenaBuildResult,
} from './arena-shared';
import { envTintHex } from './env-colors';
import { pushWallBoxCenterSize, type WallAABB } from './wall-collision';

export const FOREST_ENV_SPAWN_HALF_XZ = 40;

/** Port of `ENVS.forest()`. */
export function buildForestScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const textures: DynamicTexture[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = FOREST_ENV_SPAWN_HALF_XZ;

  /* Mist + sky aligned with foliage (cyan horizon was washing / shifting perceived neutrals). */
  setBackgroundExp2FogCustom(scene, 0x6a8f82, 0xa0c4b5, 0.0082);

  addHemisphericFillSplit(scene, lights, 0xd2e8dd, 0x283028, 0.48);
  addDirFromPosition(scene, lights, 0xc4ebd4, 0.52, 5, 15, 5);
  addPoint(scene, lights, 0x8cbea0, 0.52, 0, 6, 0, 65);
  addPoint(scene, lights, 0x7aab8c, 0.34, 16, 5, -16, 38);

  addFloor(scene, meshes, 90, 0x132618);

  const fWallLo = 0x1a3020;
  const fWallHi = 0x3e6048;
  addWallBox(scene, meshes, wallBoxes, 90, 12, 0.5, fWallLo, fWallHi, 0, 6, -45, 0);
  addWallBox(scene, meshes, wallBoxes, 90, 12, 0.5, fWallLo, fWallHi, 0, 6, 45, 0);
  addWallBox(scene, meshes, wallBoxes, 0.5, 12, 90, fWallLo, fWallHi, -45, 6, 0, 0);
  addWallBox(scene, meshes, wallBoxes, 0.5, 12, 90, fWallLo, fWallHi, 45, 6, 0, 0);

  const treePos: ReadonlyArray<readonly [number, number, number]> = [
    [7, 0, 10],
    [-10, 0, 8],
    [14, 0, -5],
    [-17, 0, -9],
    [5, 0, -14],
    [-6, 0, 17],
    [23, 0, 7],
    [-23, 0, -12],
    [2, 0, 21],
    [-12, 0, -21],
    [20, 0, -17],
    [-20, 0, 14],
    [10, 0, -23],
    [-27, 0, 5],
    [27, 0, -10],
    [9, 0, 28],
    [-9, 0, -28],
    [16, 0, 16],
    [-16, 0, -16],
  ];

  for (const [x, , z] of treePos) {
    const h = 7 + Math.random() * 7;
    const r = 0.25 + Math.random() * 0.3;
    const rb = r * 1.35;
    const trunkSalt = x * 131 + z * 97 + h * 3.1;
    const trunk = MeshBuilder.CreateCylinder(
      `trunk_${x}_${z}`,
      { height: h, diameterTop: r * 2, diameterBottom: rb * 2, tessellation: 7 },
      scene,
    );
    trunk.position.set(x, h / 2, z);
    const tmat = new StandardMaterial(`tmat_${x}_${z}`, scene);
    tmat.specularColor = Color3.Black();
    applyDiffuseHex(tmat, envTintHex(0x2a1007, trunkSalt));
    trunk.material = tmat;
    meshes.push(trunk);
    pushWallBoxCenterSize(wallBoxes, x, h / 2, z, rb * 2, h, rb * 2);

    for (let i = 0; i < 3; i++) {
      const off = [0, 1.8, 3.5][i]!;
      const bottomR = r * (6 - i * 1.3);
      const coneH = 3.2 + i * 0.3;
      const leafSalt = x * 127 + z * 89 + off * 11 + i * 41;
      const canopy = MeshBuilder.CreateCylinder(
        `canopy_${x}_${z}_${i}`,
        { height: coneH, diameterTop: 0, diameterBottom: bottomR * 2, tessellation: 7 },
        scene,
      );
      canopy.position.set(x, h - 0.5 + off + coneH / 2, z);
      const cmat = new StandardMaterial(`cmat_${x}_${z}_${i}`, scene);
      cmat.specularColor = Color3.Black();
      applyDiffuseHex(cmat, envTintHex(0x0e2e0e, leafSalt));
      canopy.material = cmat;
      meshes.push(canopy);
    }
  }

  for (const [x, , z] of [
    [-5, 0, 6],
    [12, 0, -10],
    [-14, 0, 4],
    [8, 0, -5],
    [1, 0, 11],
    [-7, 0, -17],
  ] as const) {
    const rockSize = 0.55 + Math.random() * 0.6;
    const rock = MeshBuilder.CreatePolyhedron(
      `rock_${x}_${z}`,
      { type: 2, size: rockSize, flat: true },
      scene,
    );
    rock.position.set(x, 0.4, z);
    const rmat = new StandardMaterial(`rmat_${x}_${z}`, scene);
    rmat.specularColor = Color3.Black();
    applyDiffuseHex(rmat, envTintHex(0x3a4a3a, x * 83 + z * 59));
    rock.material = rmat;
    meshes.push(rock);
    pushWallBoxCenterSize(wallBoxes, x, 0.4, z, rockSize * 2.2, rockSize * 2.2, rockSize * 2.2);
  }

  addSkySphere(scene, meshes, textures);
  addSoftClouds(scene, meshes, textures, 26, 0);
  addSunLight(scene, lights);

  const spawnPosition = new Vector3(0, 1.7, 0);

  return {
    wallBoxes,
    envSpawnHalfXZ,
    spawnPosition,
    dispose: () => disposeArenaResources(meshes, lights, textures),
  };
}
