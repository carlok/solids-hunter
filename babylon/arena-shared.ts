import {
  AbstractMesh,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  Light,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';

import { envTintHex, wallColorInPalette } from './env-colors';
import { styleSurfaceMaterial } from './material-style';
import {
  pushWallBoxCenterSize,
  pushWallBoxCenterSizeRotY,
  type WallAABB,
} from './wall-collision';

/** Same as `js/main.js` SKY_AZURE / SKY_AZURE_HORIZON — lifted for a clearer day read. */
export const SKY_AZURE = 0x7ed8ff;
export const SKY_AZURE_HORIZON = 0xd6f2ff;

export type ArenaBuildResult = {
  wallBoxes: WallAABB[];
  envSpawnHalfXZ: number;
  spawnPosition: Vector3;
  dispose: () => void;
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rgbToColor3(rgb: number, out: Color3): void {
  out.r = ((rgb >> 16) & 0xff) / 255;
  out.g = ((rgb >> 8) & 0xff) / 255;
  out.b = (rgb & 0xff) / 255;
}

export function applyDiffuseHex(mat: StandardMaterial, rgb: number): void {
  rgbToColor3(rgb, mat.diffuseColor);
  mat.specularColor.set(0, 0, 0);
}

function getOrCreateSkyGradientTexture(
  scene: Scene,
  textures: DynamicTexture[],
): DynamicTexture {
  const tex = new DynamicTexture('skyTex', { width: 4, height: 128 }, scene, false);
  const ctx = tex.getContext();
  const grd = ctx.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#5ec4ff');
  grd.addColorStop(0.32, '#7ed8ff');
  grd.addColorStop(0.68, '#a8e8ff');
  grd.addColorStop(1, '#eaf8ff');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 4, 128);
  tex.update(true);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  textures.push(tex);
  return tex;
}

function getOrCreateCloudPuffTexture(
  scene: Scene,
  textures: DynamicTexture[],
): DynamicTexture {
  const tex = new DynamicTexture('cloudPuffTex', { width: 128, height: 128 }, scene, false);
  const ctx = tex.getContext();
  const rg = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  rg.addColorStop(0, 'rgba(255,255,255,0.58)');
  rg.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, 128, 128);
  tex.update(true);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  textures.push(tex);
  return tex;
}

/** `THREE.AmbientLight`-like fill via hemispheric with matched ground tone. */
export function addAmbientFill(
  scene: Scene,
  lights: Light[],
  colorHex: number,
  intensity: number,
): void {
  const hemi = new HemisphericLight(`amb_${lights.length}`, new Vector3(0, 1, 0), scene);
  rgbToColor3(colorHex, hemi.diffuse);
  hemi.groundColor.copyFrom(hemi.diffuse);
  hemi.groundColor.scaleInPlace(0.35);
  hemi.intensity = intensity;
  lights.push(hemi);
}

export function addDirFromPosition(
  scene: Scene,
  lights: Light[],
  colorHex: number,
  intensity: number,
  px: number,
  py: number,
  pz: number,
): void {
  const dir = new Vector3(-px, -py, -pz);
  dir.normalize();
  const sun = new DirectionalLight(`dir_${lights.length}`, dir, scene);
  rgbToColor3(colorHex, sun.diffuse);
  sun.intensity = intensity;
  lights.push(sun);
}

export function addPoint(
  scene: Scene,
  lights: Light[],
  color: number,
  intensity: number,
  x: number,
  y: number,
  z: number,
  range: number,
): void {
  const pl = new PointLight(`pl_${lights.length}`, new Vector3(x, y, z), scene);
  rgbToColor3(color, pl.diffuse);
  pl.intensity = intensity;
  pl.range = range;
  lights.push(pl);
}

export function setAzureBackgroundLinearFog(
  scene: Scene,
  fogStart: number,
  fogEnd: number,
): void {
  scene.clearColor = Color4.FromInts(
    (SKY_AZURE >> 16) & 0xff,
    (SKY_AZURE >> 8) & 0xff,
    SKY_AZURE & 0xff,
    1,
  );
  scene.fogMode = Scene.FOGMODE_LINEAR;
  rgbToColor3(SKY_AZURE_HORIZON, scene.fogColor);
  scene.fogStart = fogStart;
  scene.fogEnd = fogEnd;
}

export function setAzureBackgroundExp2Fog(scene: Scene, density: number): void {
  scene.clearColor = Color4.FromInts(
    (SKY_AZURE >> 16) & 0xff,
    (SKY_AZURE >> 8) & 0xff,
    SKY_AZURE & 0xff,
    1,
  );
  scene.fogMode = Scene.FOGMODE_EXP2;
  rgbToColor3(SKY_AZURE_HORIZON, scene.fogColor);
  scene.fogDensity = density;
}

/** EXP2 fog with explicit clear + fog colors (for arenas where cyan horizon fights set-dressing). */
export function setBackgroundExp2FogCustom(
  scene: Scene,
  clearRgb: number,
  fogRgb: number,
  density: number,
): void {
  scene.clearColor = Color4.FromInts((clearRgb >> 16) & 0xff, (clearRgb >> 8) & 0xff, clearRgb & 0xff, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  rgbToColor3(fogRgb, scene.fogColor);
  scene.fogDensity = density;
}

/**
 * Hemispheric fill with **separate** sky vs ground tint (less muddy whites than monochrome fill).
 */
export function addHemisphericFillSplit(
  scene: Scene,
  lights: Light[],
  skyRgb: number,
  groundRgb: number,
  intensity: number,
): void {
  const hemi = new HemisphericLight(`amb_${lights.length}`, new Vector3(0, 1, 0), scene);
  rgbToColor3(skyRgb, hemi.diffuse);
  rgbToColor3(groundRgb, hemi.groundColor);
  hemi.intensity = intensity;
  lights.push(hemi);
}

export function addBox(
  scene: Scene,
  meshes: Mesh[],
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  ry: number,
  isWall: boolean,
  wallBoxes: WallAABB[],
  opacity = 1,
  surfaceHint: 'none' | 'floorPatch' | 'prop' = 'none',
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    `env_${meshes.length}`,
    { width: w, height: h, depth: d },
    scene,
  );
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  const mat = new StandardMaterial(`m_${meshes.length}`, scene);
  mat.specularColor = Color3.Black();
  if (opacity < 1) {
    mat.alpha = opacity;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  }
  applyDiffuseHex(mat, color);
  if (isWall) {
    styleSurfaceMaterial(mat, 'wall');
  } else if (surfaceHint === 'floorPatch') {
    styleSurfaceMaterial(mat, 'floorPatch');
  } else if (surfaceHint === 'prop') {
    styleSurfaceMaterial(mat, 'prop');
  }
  mesh.material = mat;
  meshes.push(mesh);
  if (isWall) pushWallBoxCenterSize(wallBoxes, x, y, z, w, h, d);
  return mesh;
}

export function addWallBox(
  scene: Scene,
  meshes: Mesh[],
  wallBoxes: WallAABB[],
  w: number,
  h: number,
  d: number,
  colorLo: number,
  colorHi: number,
  x: number,
  y: number,
  z: number,
  ry: number,
): void {
  const salt = x * 31 + y * 17 + z * 13 + w * 2.7 + d * 2.1 + (ry || 0) * 47;
  const col = wallColorInPalette(colorLo, colorHi, salt);
  addBox(scene, meshes, w, h, d, col, x, y, z, ry, true, wallBoxes);
}

/** Yaw-rotated wall: mesh Ry + world AABB expansion (ruins inner walls). */
export function addWallBoxRotY(
  scene: Scene,
  meshes: Mesh[],
  wallBoxes: WallAABB[],
  w: number,
  h: number,
  d: number,
  colorLo: number,
  colorHi: number,
  x: number,
  y: number,
  z: number,
  ry: number,
): void {
  const salt = x * 31 + y * 17 + z * 13 + w * 2.7 + d * 2.1 + ry * 47;
  const col = wallColorInPalette(colorLo, colorHi, salt);
  const mesh = MeshBuilder.CreateBox(`wall_r_${meshes.length}`, { width: w, height: h, depth: d }, scene);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  const mat = new StandardMaterial(`wm_${meshes.length}`, scene);
  mat.specularColor = Color3.Black();
  applyDiffuseHex(mat, col);
  styleSurfaceMaterial(mat, 'wall');
  mesh.material = mat;
  meshes.push(mesh);
  pushWallBoxCenterSizeRotY(wallBoxes, x, y, z, w, h, d, ry);
}

/** Lift RGB toward white for brighter floors / fills (0..1). */
export function liftRgb(rgb: number, t: number): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const L = (n: number) => Math.min(255, Math.round(n + (255 - n) * t));
  return (L(r) << 16) | (L(g) << 8) | L(b);
}

/** Minecraft-ish ground accents: flat patches + small voxels (no wall collision). */
export type ArenaFloorStyle = 'lab' | 'dungeon' | 'forest' | 'ruins';

export function addFloor(
  scene: Scene,
  meshes: Mesh[],
  size: number,
  baseColor: number,
  style: ArenaFloorStyle = 'lab',
): void {
  const base = liftRgb(baseColor, 0.32);
  const main = MeshBuilder.CreateGround(
    `floor_${meshes.length}`,
    { width: size, height: size, subdivisions: 2 },
    scene,
  );
  const mat = new StandardMaterial(`floorMat_${meshes.length}`, scene);
  applyDiffuseHex(mat, base);
  styleSurfaceMaterial(mat, 'floorMain');
  main.material = mat;
  meshes.push(main);

  const seed = (baseColor ^ Math.imul(size, 73856093) ^ style.charCodeAt(0) * 131) >>> 0;
  const rnd = mulberry32(seed);

  const patchesByStyle: Record<ArenaFloorStyle, number[]> = {
    lab: [0x5a8ab8, 0x7eb8d8, 0x4a78a0, 0xa0d0f0, 0x3a6888, 0xb8e0f8],
    dungeon: [0x6c4838, 0x8a6248, 0x543028, 0x7a5848, 0x402018, 0x9a7258],
    forest: [0x558b2f, 0x6b8e23, 0x8b7355, 0x33691e, 0xa1887f, 0x5d4037, 0x689f38, 0x795548],
    ruins: [0xc8b8a8, 0xa89078, 0x8d6e63, 0xd7ccc8, 0x795548, 0xbcaaa4, 0xa1887f],
  };
  const patchColors = patchesByStyle[style];

  const n = 11 + Math.floor(rnd() * 9);
  const margin = 3;
  for (let i = 0; i < n; i++) {
    const pw = 2.2 + rnd() * 9;
    const pd = 2.2 + rnd() * 9;
    const half = size * 0.5 - margin;
    const x = (rnd() * 2 - 1) * Math.max(0, half - pw * 0.5);
    const z = (rnd() * 2 - 1) * Math.max(0, half - pd * 0.5);
    const col = patchColors[Math.floor(rnd() * patchColors.length)]!;
    const py = 0.055 + rnd() * 0.04 + i * 0.0018;
    addBox(
      scene,
      meshes,
      pw,
      0.055,
      pd,
      envTintHex(col, x * 83 + z * 59 + i * 17),
      x,
      py,
      z,
      rnd() * Math.PI * 2,
      false,
      [],
      1,
      'floorPatch',
    );
  }

  const voxelN =
    style === 'forest' ? 34 : style === 'ruins' ? 28 : style === 'dungeon' ? 24 : 20;
  for (let i = 0; i < voxelN; i++) {
    const bx = 0.32 + rnd() * 0.55;
    const bz = 0.32 + rnd() * 0.55;
    const by = 0.26 + rnd() * 0.48;
    const halfS = size * 0.5 - margin - 1;
    const x = (rnd() * 2 - 1) * halfS;
    const z = (rnd() * 2 - 1) * halfS;
    const col = patchColors[Math.floor(rnd() * patchColors.length)]!;
    addBox(
      scene,
      meshes,
      bx,
      by,
      bz,
      envTintHex(col, x * 101 + z * 73 + i * 31 + style.length),
      x,
      by * 0.5,
      z,
      rnd() < 0.2 ? rnd() * 0.08 : 0,
      false,
      [],
      1,
      'prop',
    );
  }
}

/** Sky gradient sphere + shared with Three `addSkySphere`. */
export function addSkySphere(
  scene: Scene,
  meshes: Mesh[],
  textures: DynamicTexture[],
): void {
  const tex = getOrCreateSkyGradientTexture(scene, textures);
  const sky = MeshBuilder.CreateSphere('sky', { diameter: 300, segments: 32 }, scene);
  const smat = new StandardMaterial('skyMat', scene);
  smat.backFaceCulling = false;
  smat.disableLighting = true;
  smat.disableDepthWrite = true;
  smat.emissiveTexture = tex;
  smat.emissiveColor = Color3.White();
  sky.material = smat;
  sky.infiniteDistance = true;
  meshes.push(sky);
}

/** Directional warm sun `0xfff6ec` intensity 0.62, direction from (36,52,18). */
export function addSunLight(scene: Scene, lights: Light[]): void {
  const sun = new DirectionalLight(
    'sun',
    new Vector3(-36, -52, -18).normalize(),
    scene,
  );
  sun.diffuse = Color3.FromInts(0xff, 0xf6, 0xec);
  sun.intensity = 0.95;
  lights.push(sun);
}

/**
 * Billboard cloud puffs (forest / ruins). `warmth` > 0.5 tints cream vs cool white.
 */
export function addSoftClouds(
  scene: Scene,
  meshes: Mesh[],
  textures: DynamicTexture[],
  count: number,
  warmth: number,
): void {
  const tex = getOrCreateCloudPuffTexture(scene, textures);
  const tintRgb = warmth > 0.5 ? 0xfff8f4 : 0xf0fbff;
  for (let i = 0; i < count; i++) {
    const tw = 10 + Math.random() * 16;
    const th = 6 + Math.random() * 11;
    const mat = new StandardMaterial(`cloud_${i}`, scene);
    mat.diffuseTexture = tex;
    mat.opacityTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    rgbToColor3(tintRgb, mat.diffuseColor);
    mat.emissiveColor.copyFrom(mat.diffuseColor);
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.alpha = 0.2 + Math.random() * 0.38;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;

    const plane = MeshBuilder.CreatePlane(`cloudPlane_${i}`, { width: tw, height: th }, scene);
    plane.material = mat;
    plane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    const ang = (i / count) * Math.PI * 2 + Math.random() * 1.1;
    const rad = 52 + Math.random() * 52;
    const y = 20 + Math.random() * 42;
    plane.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
    plane.renderingGroupId = 0;
    meshes.push(plane);
  }
}

export function disposeArenaResources(
  meshes: Mesh[],
  lights: Light[],
  textures: DynamicTexture[],
): void {
  for (const m of meshes) {
    m.dispose(true, true);
  }
  for (const L of lights) {
    L.dispose();
  }
  for (const t of textures) {
    t.dispose();
  }
}
