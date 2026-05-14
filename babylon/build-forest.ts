import {
  DynamicTexture,
  Light,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  Vector3,
  DirectionalLight,
  Color3,
} from '@babylonjs/core';

import {
  addDirFromPosition,
  addDustMotes,
  addFloor,
  addHemisphericFillSplit,
  addPoint,
  addSkySphere,
  addSoftClouds,
  addWallBox,
  applyAlbedoHex,
  applyRandomVertexGradient,
  makeArenaBuildResult,
  setAzureBackgroundExp2Fog,
  type ArenaBuildResult,
} from './arena-shared';
import { envTintHex, palettePick, propColorDrift } from './env-colors';
import { stylePbrSurfaceMaterial } from './material-style';
import { pushWallBoxCenterSize, type WallAABB } from './wall-collision';

export const FOREST_ENV_SPAWN_HALF_XZ = 40;

const TRUNK_BASES = [
  0x1a0d06, 0x2a1810, 0x3d2818, 0x4a3220, 0x251208, 0x352014, 0x1f120a, 0x5c3a28,
] as const;
const LEAF_BASES = [
  0x1b5e20, 0x2e7d32, 0x33691e, 0x558b2f, 0x43a047, 0x3d6b2a, 0x4caf50, 0x2a6b2f, 0x5d8a3a, 0x388e3c,
] as const;
const ROCK_BASES = [0x3a4a3a, 0x4a5550, 0x2d3830, 0x5a6058, 0x3d4838, 0x4a5c50] as const;

/** Port of `ENVS.forest()`. */
export function buildForestScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const textures: DynamicTexture[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = FOREST_ENV_SPAWN_HALF_XZ;

  setAzureBackgroundExp2Fog(scene, 0.0055);

  addHemisphericFillSplit(scene, lights, 0xb8e6ff, 0x4a6b52, 0.62);
  addDirFromPosition(scene, lights, 0xe8f8ee, 0.58, 5, 18, 5);
  addPoint(scene, lights, 0xb8e8c8, 0.55, 0, 7, 0, 72);
  addPoint(scene, lights, 0x9dd4b0, 0.4, 16, 6, -16, 42);

  addFloor(scene, meshes, 90, 0x2d4a38, 'forest');

  const fWallLo = 0x1a3020;
  const fWallHi = 0x3e6048;
  // Break outer walls into segments with varying heights and jitter
  for (let i = -40; i <= 40; i += 10) {
    const h1 = 6 + Math.random() * 8;
    const h2 = 6 + Math.random() * 8;
    const h3 = 6 + Math.random() * 8;
    const h4 = 6 + Math.random() * 8;
    const ry1 = (Math.random() - 0.5) * 0.15;
    const ry2 = (Math.random() - 0.5) * 0.15;
    const ry3 = (Math.random() - 0.5) * 0.15;
    const ry4 = (Math.random() - 0.5) * 0.15;
    addWallBox(scene, meshes, wallBoxes, 11, h1, 1.5, fWallLo, fWallHi, i, h1 / 2, -45, ry1);
    addWallBox(scene, meshes, wallBoxes, 11, h2, 1.5, fWallLo, fWallHi, i, h2 / 2, 45, ry2);
    addWallBox(scene, meshes, wallBoxes, 1.5, h3, 11, fWallLo, fWallHi, -45, h3 / 2, i, ry3);
    addWallBox(scene, meshes, wallBoxes, 1.5, h4, 11, fWallLo, fWallHi, 45, h4 / 2, i, ry4);
  }

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
    const h = 4 + Math.random() * 14;
    const r = 0.25 + Math.random() * 0.3;
    const rb = r * 1.35;
    const trunkSalt = x * 131 + z * 97 + h * 3.1;
    const trunk = MeshBuilder.CreateCylinder(
      `trunk_${x}_${z}`,
      { height: h, diameterTop: r * 2, diameterBottom: rb * 2, tessellation: 7 },
      scene,
    );
    trunk.position.set(x, h / 2, z);
    const tmat = new PBRMaterial(`tmat_${x}_${z}`, scene);
    const tb = TRUNK_BASES[palettePick(trunkSalt, TRUNK_BASES.length)]!;
    applyAlbedoHex(tmat, propColorDrift(tb, trunkSalt, 0.15));
    stylePbrSurfaceMaterial(tmat, 'trunk');
    trunk.material = tmat;
    applyRandomVertexGradient(trunk, propColorDrift(tb, trunkSalt, 0.15));
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
      const cmat = new PBRMaterial(`cmat_${x}_${z}_${i}`, scene);
      const lb = LEAF_BASES[palettePick(leafSalt, LEAF_BASES.length)]!;
      applyAlbedoHex(cmat, propColorDrift(lb, leafSalt, 0.13));
      stylePbrSurfaceMaterial(cmat, 'canopy');
      canopy.material = cmat;
      applyRandomVertexGradient(canopy, propColorDrift(lb, leafSalt, 0.13));
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
    const rmat = new PBRMaterial(`rmat_${x}_${z}`, scene);
    const rk = ROCK_BASES[palettePick(x * 83 + z * 59, ROCK_BASES.length)]!;
    applyAlbedoHex(rmat, propColorDrift(rk, x * 83 + z * 59, 0.12));
    stylePbrSurfaceMaterial(rmat, 'stone');
    rock.material = rmat;
    applyRandomVertexGradient(rock, propColorDrift(rk, x * 83 + z * 59, 0.12));
    meshes.push(rock);
    pushWallBoxCenterSize(wallBoxes, x, 0.4, z, rockSize * 2.2, rockSize * 2.2, rockSize * 2.2);
  }

  addDustMotes(scene, meshes);

  addSkySphere(scene, meshes, textures);
  addSoftClouds(scene, meshes, textures, 26, 0);

  // 45 degree sun
  const sunDir = new Vector3(-1, -1, -1).normalize();
  const sun = new DirectionalLight('arenaSun', sunDir, scene);
  sun.diffuse = Color3.FromInts(0xff, 0xf6, 0xec);
  sun.intensity = 1.0;
  lights.push(sun);

  // Instead of VolumetricLightScatteringPostProcess (which crashes due to tree-shaking),
  // we add a bright emissive sun mesh in the sky.
  const sunMesh = MeshBuilder.CreateSphere('sunMesh', { diameter: 12 }, scene);
  sunMesh.position = new Vector3(80, 80, 80);
  const sunMat = new PBRMaterial('sunMat', scene);
  sunMat.emissiveColor = Color3.FromInts(0xff, 0xf0, 0xd0);
  sunMat.disableLighting = true;
  sunMesh.material = sunMat;
  meshes.push(sunMesh);

  const spawnPosition = new Vector3(0, 1.7, 0);

  return makeArenaBuildResult(scene, meshes, lights, textures, wallBoxes, envSpawnHalfXZ, spawnPosition);
}
