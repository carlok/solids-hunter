import {
  Color3,
  Color4,
  Light,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';

import {
  addAmbientFill,
  addBox,
  addDirFromPosition,
  addPoint,
  addSunLight,
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

export const DUOMO_ENV_SPAWN_HALF_XZ = 78;

const CENTER_AISLE_INTERAXIS = 19.3;
const SIDE_AISLE_INTERAXIS = 9.65;
const LONGITUDINAL_BAY = 9.65;
const PLAN_Z_OFFSET = 6.5;
const PILLAR_HEIGHT = 24;
const PILLAR_CORE_RADIUS = 1.35;
const PILLAR_RIB_RADIUS = 0.225;
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
    ['base', 0.18, 1.7, 0.36],
    ['plinth', 0.54, 1.45, 0.32],
    ['capital', height + 0.32, 1.65, 0.64],
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
    pushWallBoxCenterSize(wallBoxes, x, height * 0.5, z, 3.45, height, 3.45);
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
  for (const x of [-1, 1]) {
    addDuomoPillar(scene, meshes, wallBoxes, bayX(x), bayZ(13), PILLAR_HEIGHT * 0.96);
  }
}

function addEngagedWallPiers(scene: Scene, meshes: Mesh[], wallBoxes: WallAABB[]): void {
  for (const side of [-1, 1]) {
    for (const z of [1, 2, 3, 4, 5, 6, 7, 8]) {
      addDuomoPillar(scene, meshes, wallBoxes, bayX(side * 2.65), bayZ(z), PILLAR_HEIGHT * 0.9, false);
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
    addDuomoPillar(scene, meshes, wallBoxes, bayX(x), bayZ(z), PILLAR_HEIGHT * 0.86, false);
  }
}

function addDuomoTexturedFloor(scene: Scene, meshes: Mesh[]): void {
  const floor = MeshBuilder.CreateGround(
    `duomoFloor_${meshes.length}`,
    { width: 160, height: 160, subdivisions: 2 },
    scene,
  );
  const texture = new Texture(`${import.meta.env.BASE_URL}assets/duomo/floor.jpg`, scene);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 10;
  texture.vScale = 10;

  const mat = new PBRMaterial(`duomoFloorMat_${meshes.length}`, scene);
  mat.albedoTexture = texture;
  mat.metallic = 0;
  mat.roughness = 0.68;
  mat.environmentIntensity = 0.58;
  floor.material = mat;
  floor.receiveShadows = true;
  meshes.push(floor);
}

function addDuomoAzureSky(scene: Scene, meshes: Mesh[]): void {
  const sky = MeshBuilder.CreateSphere('duomoAzureSky', { diameter: 560, segments: 48 }, scene);
  const positions = sky.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const colors: number[] = [];
  const low = Color3.FromHexString('#24c9ff');
  const mid = Color3.FromHexString('#064cb4');
  const high = Color3.FromHexString('#010524');

  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1] ?? 0;
    const t = Math.max(0, Math.min(1, (y + 20) / 155));
    const c = t < 0.42
      ? Color3.Lerp(low, mid, t / 0.42)
      : Color3.Lerp(mid, high, (t - 0.42) / 0.58);
    colors.push(c.r, c.g, c.b, 1);
  }
  sky.setVerticesData(VertexBuffer.ColorKind, colors);

  const mat = new StandardMaterial('duomoAzureSkyMat', scene);
  mat.backFaceCulling = false;
  mat.disableLighting = true;
  mat.disableDepthWrite = true;
  mat.useVertexColors = true;
  mat.diffuseColor = Color3.White();
  mat.emissiveColor = Color3.White();
  mat.specularColor = Color3.Black();
  sky.material = mat;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.renderingGroupId = 0;
  meshes.push(sky);
}

function addDuomoStars(scene: Scene, meshes: Mesh[], lights: Light[]): void {
  let seed = 0x51d00d0;
  const rnd = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 3266489917) >>> 0;
    return seed / 4294967296;
  };
  const starColors = [0xfff7dc, 0xffd36f, 0xffa24a, 0xffffff] as const;
  const addStar = (x: number, y: number, z: number, color: number, diameter: number): Mesh => {
    const star = MeshBuilder.CreateSphere(
      `duomoStar_${meshes.length}`,
      { diameter, segments: 8 },
      scene,
    );
    star.position.set(x, y, z);
    const mat = new StandardMaterial(`duomoStarMat_${meshes.length}`, scene);
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = Color3.FromInts((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
    mat.specularColor = Color3.Black();
    star.material = mat;
    star.isPickable = false;
    star.renderingGroupId = 0;
    meshes.push(star);
    return star;
  };

  for (let i = 0; i < 96; i++) {
    const angle = rnd() < 0.62
      ? (rnd() - 0.5) * Math.PI * 1.18
      : rnd() * Math.PI * 2;
    const elevation = 0.18 + rnd() * 0.72;
    const radius = 218 + rnd() * 34;
    const horizontal = Math.cos(elevation) * radius;
    const x = Math.sin(angle) * horizontal;
    const y = Math.max(42, Math.sin(elevation) * radius);
    const z = Math.cos(angle) * horizontal;
    const color = starColors[Math.floor(rnd() * starColors.length)]!;
    const diameter = 0.7 + rnd() * (i % 11 === 0 ? 1.1 : 0.72);
    addStar(x, y, z, color, diameter);

    if (i < 10) {
      addPoint(scene, lights, color, 0.055 + rnd() * 0.045, x, y, z, 55 + rnd() * 35);
    }
  }
}

export function buildDuomoScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = DUOMO_ENV_SPAWN_HALF_XZ;

  setBackgroundExp2FogCustom(scene, 0x3db7ff, 0x77d6ff, 0);
  scene.clearColor = Color4.FromColor3(Color3.FromInts(0x3d, 0xb7, 0xff), 1);
  scene.fogDensity = 0;
  scene.fogStart = 180;
  scene.fogEnd = 360;
  scene.fogColor.set(0.24, 0.72, 1);
  addAmbientFill(scene, lights, 0xd8f2ff, 0.58);
  addDirFromPosition(scene, lights, 0xffffff, 1.08, -9, 34, -12);
  addDirFromPosition(scene, lights, 0xb9e8ff, 0.28, 12, 18, 16);
  addPoint(scene, lights, 0xffdfbd, 0.34, 0, 5.6, bayZ(2.2), 42);
  addPoint(scene, lights, 0xc8edff, 0.38, 0, 9.2, bayZ(9.2), 52);
  addDuomoStars(scene, meshes, lights);

  addDuomoTexturedFloor(scene, meshes);
  addPillarRows(scene, meshes, wallBoxes);
  addEngagedWallPiers(scene, meshes, wallBoxes);

  addDuomoAzureSky(scene, meshes);
  addSunLight(scene, lights);

  const spawnPosition = new Vector3(0, 1.7, bayZ(0.9));
  return makeArenaBuildResult(scene, meshes, lights, [], wallBoxes, envSpawnHalfXZ, spawnPosition);
}
