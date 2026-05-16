import {
  DynamicTexture,
  Light,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  Vector3,
} from '@babylonjs/core';

import {
  addAmbientFill,
  addBox,
  addDecorativeArch,
  addDirFromPosition,
  addFloor,
  addPoint,
  addSoftClouds,
  addSunLight,
  addTrimmedWallSegment,
  applyAlbedoHex,
  applyRandomVertexGradient,
  makeArenaBuildResult,
  setBackgroundExp2FogCustom,
  type ArenaBuildResult,
} from './arena-shared';
import { envTintHex, propColorDrift } from './env-colors';
import { stylePbrSurfaceMaterial } from './material-style';
import {
  pushWallBoxCenterSize,
  type WallAABB,
} from './wall-collision';

export const DUOMO_ENV_SPAWN_HALF_XZ = 36;

const CENTER_AISLE_INTERAXIS = 11.2;
const SIDE_AISLE_INTERAXIS = 5.7;
const LONGITUDINAL_BAY = 7.8;
const PLAN_Z_OFFSET = 6.5;
const PILLAR_HEIGHT = 13.2;
const PILLAR_CORE_RADIUS = 0.74;
const PILLAR_RIB_RADIUS = 0.14;
const PILLAR_COLOR = 0xd2c6bd;

function bayX(x: number): number {
  if (x === 0) return 0;
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  if (ax <= 0.5) return sign * (CENTER_AISLE_INTERAXIS * ax);
  return sign * (CENTER_AISLE_INTERAXIS * 0.5 + (ax - 0.5) * SIDE_AISLE_INTERAXIS);
}

function bayZ(z: number): number {
  return (z - PLAN_Z_OFFSET) * LONGITUDINAL_BAY;
}

function makeDuomoMaterial(scene: Scene, name: string, color: number): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  applyAlbedoHex(mat, color);
  stylePbrSurfaceMaterial(mat, 'stone');
  mat.roughness = 0.78;
  return mat;
}

function addDuomoPillar(
  scene: Scene,
  meshes: Mesh[],
  wallBoxes: WallAABB[],
  x: number,
  z: number,
  height = PILLAR_HEIGHT,
  collides = true,
): Mesh[] {
  const out: Mesh[] = [];
  const material = makeDuomoMaterial(
    scene,
    `duomoPillarMat_${meshes.length}`,
    propColorDrift(PILLAR_COLOR, x * 13 + z * 17, 0.08),
  );
  const core = MeshBuilder.CreateCylinder(
    `duomoPillarCore_${meshes.length}`,
    {
      height,
      diameter: PILLAR_CORE_RADIUS * 2,
      tessellation: 28,
    },
    scene,
  );
  core.position.set(x, height * 0.5, z);
  core.material = material;
  applyRandomVertexGradient(core, PILLAR_COLOR, 0.16);
  meshes.push(core);
  out.push(core);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = MeshBuilder.CreateCylinder(
      `duomoPillarRib_${meshes.length}`,
      {
        height,
        diameter: PILLAR_RIB_RADIUS * 2,
        tessellation: 14,
      },
      scene,
    );
    rib.position.set(
      x + Math.cos(a) * (PILLAR_CORE_RADIUS + PILLAR_RIB_RADIUS * 0.58),
      height * 0.5,
      z + Math.sin(a) * (PILLAR_CORE_RADIUS + PILLAR_RIB_RADIUS * 0.58),
    );
    rib.material = material;
    applyRandomVertexGradient(rib, PILLAR_COLOR, 0.14);
    meshes.push(rib);
    out.push(rib);
  }

  const baseMat = makeDuomoMaterial(scene, `duomoBaseMat_${meshes.length}`, envTintHex(0xbeb0a8, x * 7 + z * 5));
  for (const [name, y, radius, h] of [
    ['base', 0.13, 1.02, 0.26],
    ['plinth', 0.39, 0.86, 0.22],
    ['capital', height + 0.18, 0.98, 0.36],
  ] as const) {
    const cap = MeshBuilder.CreateCylinder(
      `duomoPillar_${name}_${meshes.length}`,
      { height: h, diameter: radius * 2, tessellation: 24 },
      scene,
    );
    cap.position.set(x, y, z);
    cap.material = baseMat;
    applyRandomVertexGradient(cap, 0xbeb0a8, 0.12);
    meshes.push(cap);
    out.push(cap);
  }

  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + x * 0.02;
    addBox(
      scene,
      meshes,
      0.025,
      height * 0.86,
      0.025,
      0x9f9692,
      x + Math.cos(a) * 0.82,
      height * 0.48,
      z + Math.sin(a) * 0.82,
      a,
      false,
      wallBoxes,
      1,
      'stone',
    );
  }

  if (collides) {
    pushWallBoxCenterSize(wallBoxes, x, height * 0.5, z, 1.75, height, 1.75);
  }
  return out;
}

function addPillarRows(scene: Scene, meshes: Mesh[], wallBoxes: WallAABB[]): void {
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const x of [-1.5, -0.5, 0.5, 1.5]) {
      addDuomoPillar(scene, meshes, wallBoxes, bayX(x), bayZ(z));
    }
  }
  for (const x of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
    addDuomoPillar(scene, meshes, wallBoxes, bayX(x), bayZ(9), PILLAR_HEIGHT * 1.04);
  }
  for (const z of [10, 11, 12]) {
    for (const x of [-1.5, -0.5, 0.5, 1.5]) {
      addDuomoPillar(scene, meshes, wallBoxes, bayX(x), bayZ(z));
    }
  }
  for (const x of [-1, 0, 1]) {
    addDuomoPillar(scene, meshes, wallBoxes, bayX(x), bayZ(13), PILLAR_HEIGHT * 0.96);
  }
}

function addEngagedWallPiers(scene: Scene, meshes: Mesh[], wallBoxes: WallAABB[]): void {
  for (const side of [-1, 1]) {
    for (const z of [1, 2, 3, 4, 5, 6, 7, 8]) {
      addDuomoPillar(scene, meshes, wallBoxes, bayX(side * 2.65), bayZ(z), PILLAR_HEIGHT * 0.72, false);
    }
  }
  for (const [x, z] of [
    [-3.8, 8.5],
    [-3.8, 9.5],
    [3.8, 8.5],
    [3.8, 9.5],
    [-2.2, 10],
    [-2.2, 11],
    [-2, 12],
    [2.2, 10],
    [2.2, 11],
    [2, 12],
  ] as const) {
    addDuomoPillar(scene, meshes, wallBoxes, bayX(x), bayZ(z), PILLAR_HEIGHT * 0.66, false);
  }
}

function addDuomoEnvelope(scene: Scene, meshes: Mesh[], wallBoxes: WallAABB[]): void {
  const wall = 0x8b817c;
  addTrimmedWallSegment(scene, meshes, wallBoxes, 1.15, 4.2, 92, wall, bayX(-3.1), 2.1, bayZ(4.6), 0, true);
  addTrimmedWallSegment(scene, meshes, wallBoxes, 1.15, 4.2, 92, wall, bayX(3.1), 2.1, bayZ(4.6), 0, true);
  addTrimmedWallSegment(scene, meshes, wallBoxes, 43, 4.0, 1.1, wall, 0, 2, bayZ(0.35), 0, true);
  addTrimmedWallSegment(scene, meshes, wallBoxes, 30, 4.0, 1.1, wall, 0, 2, bayZ(13.75), 0, true);
  addTrimmedWallSegment(scene, meshes, wallBoxes, 1.1, 4.0, 20, wall, bayX(-4.1), 2, bayZ(9), 0, true);
  addTrimmedWallSegment(scene, meshes, wallBoxes, 1.1, 4.0, 20, wall, bayX(4.1), 2, bayZ(9), 0, true);

  for (const x of [-2, -1, 0, 1, 2]) {
    addDecorativeArch(scene, meshes, wallBoxes, bayX(x), bayZ(13.45), {
      width: 3.4,
      height: 4.6,
      depth: 0.48,
      color: 0xb8aaa2,
      role: 'stone',
      ry: 0,
      segments: 8,
    });
  }
}

export function buildDuomoScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const textures: DynamicTexture[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = DUOMO_ENV_SPAWN_HALF_XZ;

  setBackgroundExp2FogCustom(scene, 0xdde8f2, 0xb8c1cc, 0.0085);
  addAmbientFill(scene, lights, 0xf8f2ea, 0.78);
  addDirFromPosition(scene, lights, 0xf3f7ff, 0.76, -7, 28, -8);
  addPoint(scene, lights, 0xffdfbd, 0.52, 0, 4.6, bayZ(2.2), 34);
  addPoint(scene, lights, 0xddefff, 0.48, 0, 7.2, bayZ(9.2), 42);

  addFloor(scene, meshes, 112, 0xcfc5bd, 'duomo');
  addDuomoEnvelope(scene, meshes, wallBoxes);
  addPillarRows(scene, meshes, wallBoxes);
  addEngagedWallPiers(scene, meshes, wallBoxes);

  for (const z of [2.5, 5.5, 8.5, 11.5]) {
    addBox(scene, meshes, 42, 0.035, 0.08, 0x9f9692, 0, 0.09, bayZ(z), 0, false, wallBoxes, 1, 'floorPatch');
  }
  for (const x of [-2, -1, 0, 1, 2]) {
    addBox(scene, meshes, 0.08, 0.035, 94, 0xaaa19b, bayX(x), 0.095, bayZ(6.75), 0, false, wallBoxes, 1, 'floorPatch');
  }

  addSoftClouds(scene, meshes, textures, 18, 0.36);
  addSunLight(scene, lights);

  const spawnPosition = new Vector3(0, 1.7, bayZ(0.9));
  return makeArenaBuildResult(scene, meshes, lights, textures, wallBoxes, envSpawnHalfXZ, spawnPosition);
}
