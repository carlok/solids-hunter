import {
  AbstractMesh,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  InstancedMesh,
  Light,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';

import { envTintHex, wallColorInPalette } from './env-colors';
import { stylePbrSurfaceMaterial, type MaterialSurfaceRole } from './material-style';
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
  /** Optional: register hunt entity bodies for shadow cast/receive after spawn. */
  registerEntityShadowMeshes?: (bodies: AbstractMesh[]) => void;
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

export function applyAlbedoHex(mat: PBRMaterial, rgb: number): void {
  rgbToColor3(rgb, mat.albedoColor);
}

export function applyRandomVertexGradient(mesh: Mesh, colorRgb: number, driftRange = 0.4): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;
  const vColors = [];
  const cr = ((colorRgb >> 16) & 0xff) / 255;
  const cg = ((colorRgb >> 8) & 0xff) / 255;
  const cb = (colorRgb & 0xff) / 255;
  for (let i = 0; i < positions.length / 3; i++) {
    const shift = (Math.random() - 0.5) * driftRange;
    vColors.push(Math.max(0, Math.min(1, cr + shift)));
    vColors.push(Math.max(0, Math.min(1, cg + shift)));
    vColors.push(Math.max(0, Math.min(1, cb + shift)));
    vColors.push(1);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, vColors);
  
  if (mesh.material && 'albedoColor' in mesh.material) {
    (mesh.material as PBRMaterial).albedoColor = Color3.White();
  }
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

function makeDamageTexture(
  scene: Scene,
  textures: DynamicTexture[],
  name: string,
  seed: number,
  kind: 'crack' | 'hole',
): DynamicTexture {
  const tex = new DynamicTexture(name, { width: 128, height: 128 }, scene, false);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 128, 128);
  const rnd = mulberry32(seed);

  if (kind === 'hole') {
    const cx = 64 + (rnd() - 0.5) * 10;
    const cy = 64 + (rnd() - 0.5) * 10;
    const sides = 5 + Math.floor(rnd() * 5);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + rnd() * 0.25;
      const r = 24 + rnd() * 24;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(2, 2, 4, 0.46)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const lines = kind === 'hole' ? 7 : 12;
  ctx.lineCap = 'round';
  for (let i = 0; i < lines; i++) {
    const x0 = 64 + (rnd() - 0.5) * (kind === 'hole' ? 50 : 84);
    const y0 = 64 + (rnd() - 0.5) * (kind === 'hole' ? 50 : 84);
    let x = x0;
    let y = y0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 2 + Math.floor(rnd() * 4);
    const base = rnd() * Math.PI * 2;
    for (let s = 0; s < steps; s++) {
      const len = 9 + rnd() * 22;
      const a = base + (rnd() - 0.5) * 1.4;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(4, 5, 8, ${0.18 + rnd() * 0.22})`;
    ctx.lineWidth = 1.1 + rnd() * 2.2;
    ctx.stroke();
  }
  tex.update(true);
  tex.hasAlpha = true;
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
  surfaceHint: 'none' | MaterialSurfaceRole = 'none',
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    `env_${meshes.length}`,
    { width: w, height: h, depth: d },
    scene,
  );
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  const mat = new PBRMaterial(`m_${meshes.length}`, scene);
  if (opacity < 1) {
    mat.alpha = opacity;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  applyAlbedoHex(mat, color);

  mesh.material = mat;
  applyRandomVertexGradient(mesh, color);

  if (isWall) {
    stylePbrSurfaceMaterial(mat, 'wall');
  } else if (surfaceHint !== 'none') {
    stylePbrSurfaceMaterial(mat, surfaceHint);
  }
  mesh.material = mat;
  meshes.push(mesh);
  if (isWall) pushWallBoxCenterSize(wallBoxes, x, y, z, w, h, d);
  return mesh;
}

export function addFloorPropCylinder(
  scene: Scene,
  meshes: Mesh[],
  radius: number,
  height: number,
  color: number,
  x: number,
  y: number,
  z: number,
  surfaceHint: MaterialSurfaceRole = 'prop'
): Mesh {
  const mesh = MeshBuilder.CreateCylinder(
    `envCyl_${meshes.length}`,
    { height, diameter: radius * 2, tessellation: 16 },
    scene
  );
  mesh.position.set(x, y, z);
  const mat = new PBRMaterial(`mCyl_${meshes.length}`, scene);
  applyAlbedoHex(mat, color);
  stylePbrSurfaceMaterial(mat, surfaceHint);
  mesh.material = mat;
  applyRandomVertexGradient(mesh, color);
  meshes.push(mesh);
  return mesh;
}

export function addBoxRotated(
  scene: Scene,
  meshes: Mesh[],
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  surfaceHint: MaterialSurfaceRole = 'prop'
): Mesh {
  const mesh = MeshBuilder.CreateBox(`envRot_${meshes.length}`, { width: w, height: h, depth: d }, scene);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  const mat = new PBRMaterial(`mRot_${meshes.length}`, scene);
  applyAlbedoHex(mat, color);
  stylePbrSurfaceMaterial(mat, surfaceHint);
  mesh.material = mat;
  applyRandomVertexGradient(mesh, color);
  meshes.push(mesh);
  return mesh;
}

function makePbrMat(
  scene: Scene,
  name: string,
  color: number,
  role: MaterialSurfaceRole,
): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  applyAlbedoHex(mat, color);
  stylePbrSurfaceMaterial(mat, role);
  return mat;
}

function addDecorativeCylinder(
  scene: Scene,
  meshes: Mesh[],
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: number,
  x: number,
  y: number,
  z: number,
  tessellation: number,
  role: MaterialSurfaceRole,
  ry = 0,
): Mesh {
  const mesh = MeshBuilder.CreateCylinder(
    `decorCyl_${meshes.length}`,
    {
      height,
      diameterTop: radiusTop * 2,
      diameterBottom: radiusBottom * 2,
      tessellation,
    },
    scene,
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.material = makePbrMat(scene, `decorCylMat_${meshes.length}`, color, role);
  applyRandomVertexGradient(mesh, color);
  meshes.push(mesh);
  return mesh;
}

export type DecorativeColumnOptions = {
  radius?: number;
  height?: number;
  color?: number;
  role?: MaterialSurfaceRole;
  tessellation?: number;
  taper?: number;
  broken?: boolean;
  collides?: boolean;
  ry?: number;
};

export function addDecorativeColumn(
  scene: Scene,
  meshes: Mesh[],
  wallBoxes: WallAABB[],
  x: number,
  z: number,
  options: DecorativeColumnOptions = {},
): Mesh[] {
  const radius = options.radius ?? 0.7;
  const height = options.height ?? 4.5;
  const color = options.color ?? 0x5a5148;
  const role = options.role ?? 'stone';
  const tessellation = options.tessellation ?? 12;
  const taper = options.taper ?? 0.15;
  const ry = options.ry ?? 0;
  const out: Mesh[] = [];

  out.push(addDecorativeCylinder(scene, meshes, radius * 1.28, radius * 1.42, 0.34, color, x, 0.17, z, tessellation, role, ry));
  out.push(addDecorativeCylinder(scene, meshes, radius * 0.95, radius * (1 + taper), height, color, x, 0.34 + height * 0.5, z, tessellation, role, ry));
  const topY = 0.34 + height;
  out.push(addDecorativeCylinder(scene, meshes, radius * 1.32, radius * 1.08, 0.34, color, x, topY + 0.17, z, tessellation, role, ry));

  if (options.broken) {
    out.push(addBoxRotated(scene, meshes, radius * 1.5, 0.34, radius * 0.82, envTintHex(color, x * 31 + z * 17), x + radius * 0.18, topY + 0.48, z - radius * 0.1, 0.08, ry + 0.28, -0.12, role));
  }
  if (options.collides) {
    pushWallBoxCenterSize(wallBoxes, x, height * 0.5, z, radius * 2.4, height, radius * 2.4);
  }
  return out;
}

export type DecorativeArchOptions = {
  width?: number;
  height?: number;
  depth?: number;
  color?: number;
  role?: MaterialSurfaceRole;
  ry?: number;
  segments?: number;
  collides?: boolean;
};

export function addDecorativeArch(
  scene: Scene,
  meshes: Mesh[],
  wallBoxes: WallAABB[],
  x: number,
  z: number,
  options: DecorativeArchOptions = {},
): Mesh[] {
  const width = options.width ?? 6;
  const height = options.height ?? 4.5;
  const depth = options.depth ?? 0.8;
  const color = options.color ?? 0x504638;
  const role = options.role ?? 'stone';
  const ry = options.ry ?? 0;
  const segments = Math.max(8, (options.segments ?? 8) * 3);
  const out: Mesh[] = [];
  const sideW = Math.max(0.42, width * 0.16);
  const supportH = height * 0.68;
  const innerWidth = width - sideW * 1.35;
  const halfInner = innerWidth * 0.5;
  const archRise = Math.max(0.6, height - supportH - 0.25);

  const localToWorld = (lx: number, lz: number): [number, number] => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    return [x + lx * c - lz * s, z + lx * s + lz * c];
  };

  for (const sx of [-1, 1]) {
    const [wx, wz] = localToWorld(sx * (width * 0.5 - sideW * 0.5), 0);
    out.push(addBox(scene, meshes, sideW, supportH, depth, envTintHex(color, sx * 37 + x), wx, supportH * 0.5, wz, ry, false, wallBoxes, 1, role));
  }

  const arcPath: Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const t = segments === 1 ? 0.5 : i / (segments - 1);
    const lx = (t - 0.5) * innerWidth;
    const y = supportH + Math.sin(t * Math.PI) * archRise;
    const [wx, wz] = localToWorld(lx, 0);
    arcPath.push(new Vector3(wx, y, wz));
  }
  const arc = MeshBuilder.CreateTube(
    `decorArch_${meshes.length}`,
    {
      path: arcPath,
      radius: Math.max(0.18, Math.min(depth * 0.48, sideW * 0.36)),
      tessellation: Math.max(8, Math.min(14, Math.round(depth * 14))),
    },
    scene,
  );
  arc.material = makePbrMat(scene, `decorArchMat_${meshes.length}`, envTintHex(color, x * 13 + z * 7), role);
  applyRandomVertexGradient(arc, color, 0.22);
  meshes.push(arc);
  out.push(arc);

  for (const sx of [-1, 1]) {
    const [wx, wz] = localToWorld(sx * halfInner, 0);
    out.push(addBox(scene, meshes, sideW * 0.92, 0.42, depth * 1.1, envTintHex(color, sx * 43 + z), wx, supportH - 0.02, wz, ry, false, wallBoxes, 1, role));
  }

  if (options.collides) {
    pushWallBoxCenterSize(wallBoxes, x, supportH * 0.5, z, width, supportH, depth);
  }
  return out;
}

export type TrilithOptions = {
  width?: number;
  height?: number;
  depth?: number;
  color?: number;
  role?: MaterialSurfaceRole;
  ry?: number;
  broken?: boolean;
  collides?: boolean;
};

export function addTrilith(
  scene: Scene,
  meshes: Mesh[],
  wallBoxes: WallAABB[],
  x: number,
  z: number,
  options: TrilithOptions = {},
): Mesh[] {
  const width = options.width ?? 5.2;
  const height = options.height ?? 4.2;
  const depth = options.depth ?? 0.9;
  const color = options.color ?? 0x5a5148;
  const role = options.role ?? 'stone';
  const ry = options.ry ?? 0;
  const out: Mesh[] = [];
  const uprightW = Math.max(0.65, width * 0.18);
  const lintelH = Math.max(0.45, height * 0.18);
  const uprightH = height - lintelH * 0.5;
  const c = Math.cos(ry);
  const s = Math.sin(ry);

  const place = (lx: number): [number, number] => [x + lx * c, z + lx * s];
  for (const sx of [-1, 1]) {
    const [wx, wz] = place(sx * (width * 0.5 - uprightW * 0.5));
    out.push(addBox(scene, meshes, uprightW, uprightH * (options.broken && sx > 0 ? 0.75 : 1), depth, envTintHex(color, sx * 59 + z), wx, uprightH * 0.5, wz, ry + sx * 0.04, false, wallBoxes, 1, role));
  }
  out.push(addBox(scene, meshes, width, lintelH, depth * 1.12, envTintHex(color, x * 11 + z * 17), x, uprightH + lintelH * 0.45, z, ry + (options.broken ? 0.08 : 0), false, wallBoxes, 1, role));
  if (options.collides) {
    pushWallBoxCenterSize(wallBoxes, x, height * 0.5, z, width, height, depth);
  }
  return out;
}

export type LabTableOptions = {
  width?: number;
  depth?: number;
  height?: number;
  color?: number;
  ry?: number;
};

export function addLabTable(
  scene: Scene,
  meshes: Mesh[],
  wallBoxes: WallAABB[],
  x: number,
  z: number,
  options: LabTableOptions = {},
): Mesh[] {
  const width = options.width ?? 4.4;
  const depth = options.depth ?? 1.75;
  const height = options.height ?? 1.05;
  const color = options.color ?? 0x172033;
  const ry = options.ry ?? 0;
  const out: Mesh[] = [];
  const topY = height;
  out.push(addBox(scene, meshes, width, 0.18, depth, color, x, topY, z, ry, false, wallBoxes, 1, 'metal'));
  const legX = width * 0.38;
  const legZ = depth * 0.34;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const lx = sx * legX;
      const lz = sz * legZ;
      out.push(addBox(scene, meshes, 0.16, height, 0.16, 0x0b101c, x + lx * c - lz * s, height * 0.5, z + lx * s + lz * c, ry, false, wallBoxes, 1, 'metal'));
    }
  }
  out.push(addBox(scene, meshes, width * 0.28, 0.34, depth * 0.42, envTintHex(0x243a56, x * 13 + z * 31), x - Math.cos(ry) * width * 0.22, topY + 0.26, z - Math.sin(ry) * width * 0.22, ry, false, wallBoxes, 1, 'metal'));
  out.push(addBox(scene, meshes, width * 0.18, 0.08, depth * 0.36, 0x00e5ff, x + Math.cos(ry) * width * 0.18, topY + 0.22, z + Math.sin(ry) * width * 0.18, ry, false, wallBoxes, 1, 'glass'));
  return out;
}

export function addTrimmedWallSegment(
  scene: Scene,
  meshes: Mesh[],
  wallBoxes: WallAABB[],
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  ry: number,
  collides = false,
): Mesh[] {
  const out: Mesh[] = [];
  out.push(addBox(scene, meshes, w, h, d, color, x, y, z, ry, collides, wallBoxes, 1, collides ? 'none' : 'wall'));
  const capH = Math.min(0.34, h * 0.12);
  out.push(addBox(scene, meshes, w * 1.04, capH, d * 1.22, envTintHex(color, x * 29 + z * 31), x, y + h * 0.5 + capH * 0.5, z, ry, false, wallBoxes, 1, 'stone'));
  out.push(addBox(scene, meshes, w * 1.03, capH * 0.72, d * 1.16, envTintHex(color, x * 37 + z * 41), x, Math.max(capH * 0.5, y - h * 0.5 + capH * 0.5), z, ry, false, wallBoxes, 1, 'stone'));
  return out;
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
  const mat = new PBRMaterial(`wm_${meshes.length}`, scene);
  applyAlbedoHex(mat, col);
  stylePbrSurfaceMaterial(mat, 'wall');
  mesh.material = mat;
  applyRandomVertexGradient(mesh, col);
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
export type ArenaFloorStyle = 'lab' | 'dungeon' | 'forest' | 'ruins' | 'duomo';

export function addFloor(
  scene: Scene,
  meshes: Mesh[],
  size: number,
  baseColor: number,
  style: ArenaFloorStyle = 'lab',
): void {
  // To keep contrast with sky, we do not lift RGB anymore. We use baseColor directly.
  const base = baseColor;
  const main = MeshBuilder.CreateGround(
    `floor_${meshes.length}`,
    { width: size, height: size, subdivisions: 24 },
    scene,
  );
  const mat = new PBRMaterial(`floorMat_${meshes.length}`, scene);
  applyAlbedoHex(mat, base);
  const roleMap: Record<ArenaFloorStyle, MaterialSurfaceRole> = {
    lab: 'tiles',
    dungeon: 'bricks',
    forest: 'grass',
    ruins: 'sand',
    duomo: 'tiles',
  };
  stylePbrSurfaceMaterial(mat, roleMap[style] || 'floorMain');
  main.material = mat;
  applyRandomVertexGradient(main, base);
  meshes.push(main);

  const seed = (baseColor ^ Math.imul(size, 73856093) ^ style.charCodeAt(0) * 131) >>> 0;
  const rnd = mulberry32(seed);

  const patchesByStyle: Record<ArenaFloorStyle, number[]> = {
    lab: [
      0x4a78a8, 0x6a98c8, 0x3a6888, 0x88b8d8, 0x2a5878, 0xa0d0f0, 0x5080a0, 0x78a8c0, 0x5c7a9a,
      0x98c0e0,
    ],
    dungeon: [
      0x5c4034, 0x7a5a48, 0x4a3028, 0x6b5040, 0x3d281c, 0x8a6a52, 0x483028, 0x705040, 0x584038,
      0x3a2018,
    ],
    forest: [
      0x4a7c34, 0x5d8a3a, 0x3d6b2a, 0x6b9e4a, 0x558b2f, 0x33691e, 0x7aae52, 0x455c38, 0x8b7355,
      0x689f38,
    ],
    ruins: [
      0xc8b8a8, 0xa89078, 0x8d6e63, 0xd7ccc8, 0x795548, 0xbcaaa4, 0xb5a090, 0x9a8070, 0xded0c8,
      0x887060,
    ],
    duomo: [
      0xd8d0c8, 0xc9b9ad, 0xe2d8d1, 0xbcaea4, 0xf0e6dd, 0xc6c4c0, 0xd4c2ba, 0xb8b0aa, 0xe7ded6,
      0xcfc0b8,
    ],
  };
  const patchColors = patchesByStyle[style];

  const n = 22 + Math.floor(rnd() * 16);
  const margin = 3;
  for (let i = 0; i < n; i++) {
    const pw = 1.85 + rnd() * 10.5;
    const pd = 1.85 + rnd() * 10.5;
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

  const microN = 26 + Math.floor(rnd() * 14);
  for (let i = 0; i < microN; i++) {
    const pw = 0.5 + rnd() * 2.15;
    const pd = 0.5 + rnd() * 2.15;
    const half = size * 0.5 - margin;
    const x = (rnd() * 2 - 1) * Math.max(0, half - pw * 0.5);
    const z = (rnd() * 2 - 1) * Math.max(0, half - pd * 0.5);
    const col = patchColors[Math.floor(rnd() * patchColors.length)]!;
    const py = 0.042 + rnd() * 0.022 + (i % 7) * 0.0004;
    addBox(
      scene,
      meshes,
      pw,
      0.038,
      pd,
      envTintHex(col, x * 91 + z * 67 + i * 19 + 901),
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
    style === 'forest' ? 46 : style === 'ruins' ? 38 : style === 'dungeon' ? 34 : style === 'duomo' ? 20 : 30;
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

  // Coins / Short Cylinders
  const coinN = 12 + Math.floor(rnd() * 12);
  for (let i = 0; i < coinN; i++) {
    const radius = 0.5 + rnd() * 1.5;
    const height = 0.05 + rnd() * 0.15;
    const halfS = size * 0.5 - margin - 1;
    const x = (rnd() * 2 - 1) * halfS;
    const z = (rnd() * 2 - 1) * halfS;
    const col = patchColors[Math.floor(rnd() * patchColors.length)]!;
    addFloorPropCylinder(
      scene,
      meshes,
      radius,
      height,
      envTintHex(col, x * 107 + z * 79 + i * 37),
      x,
      height * 0.5,
      z,
      'floorPatch'
    );
  }

  // Ramps / Steps / Tilted objects
  const rampN = 10 + Math.floor(rnd() * 10);
  for (let i = 0; i < rampN; i++) {
    const w = 1.0 + rnd() * 2.5;
    const d = 1.0 + rnd() * 2.5;
    const h = 0.2 + rnd() * 0.8;
    const halfS = size * 0.5 - margin - 1;
    const x = (rnd() * 2 - 1) * halfS;
    const z = (rnd() * 2 - 1) * halfS;
    const col = patchColors[Math.floor(rnd() * patchColors.length)]!;
    addBoxRotated(
      scene,
      meshes,
      w,
      h,
      d,
      envTintHex(col, x * 113 + z * 83 + i * 41),
      x,
      h * 0.5,
      z,
      (rnd() - 0.5) * 0.4, // rx tilt
      rnd() * Math.PI * 2, // ry
      (rnd() - 0.5) * 0.4, // rz tilt
      'prop'
    );
  }
}

export type DamageDecal = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  ry: number;
  kind?: 'crack' | 'hole';
  seed?: number;
};

export function addDamageDecals(
  scene: Scene,
  meshes: Mesh[],
  textures: DynamicTexture[],
  decals: readonly DamageDecal[],
): void {
  decals.forEach((d, i) => {
    const kind = d.kind ?? 'crack';
    const tex = makeDamageTexture(
      scene,
      textures,
      `damage_${meshes.length}_${i}`,
      d.seed ?? Math.floor((d.x * 97 + d.y * 53 + d.z * 31 + i * 401) * 1000),
      kind,
    );
    const mat = new StandardMaterial(`damageMat_${meshes.length}_${i}`, scene);
    mat.diffuseTexture = tex;
    mat.opacityTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.diffuseColor = kind === 'hole' ? new Color3(0.08, 0.075, 0.07) : new Color3(0.02, 0.02, 0.025);
    mat.emissiveColor.copyFrom(mat.diffuseColor);
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.alpha = kind === 'hole' ? 0.78 : 0.64;
    mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;

    const plane = MeshBuilder.CreatePlane(`damagePlane_${meshes.length}_${i}`, { width: d.w, height: d.h }, scene);
    plane.position.set(d.x, d.y, d.z);
    plane.rotation.y = d.ry;
    plane.material = mat;
    plane.isPickable = false;
    plane.renderingGroupId = 0;
    meshes.push(plane);
  });
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
    'arenaSun',
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

export function addDustMotes(scene: Scene, meshes: Mesh[]): void {
  const count = 300;
  
  // We create 5 different colored base meshes for the dust to not look like uniform snow
  const bases: Mesh[] = [];
  for (let b = 0; b < 5; b++) {
    const dustBase = MeshBuilder.CreateBox(`dustBase_${b}`, { size: 0.025 }, scene);
    const mat = new PBRMaterial(`dustMat_${b}`, scene);
    mat.emissiveColor = new Color3(Math.random(), Math.random(), Math.random());
    mat.alpha = 0.6;
    mat.disableLighting = true;
    dustBase.material = mat;
    dustBase.isVisible = false;
    meshes.push(dustBase);
    bases.push(dustBase);
  }
  
  const instances: InstancedMesh[] = [];
  const startOffsets: number[] = [];
  
  for (let i = 0; i < count; i++) {
    const dustBase = bases[i % bases.length]!;
    const inst = dustBase.createInstance(`dust_${i}`);
    inst.position.set(
      (Math.random() - 0.5) * 80,
      Math.random() * 20,
      (Math.random() - 0.5) * 80
    );
    inst.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    instances.push(inst);
    startOffsets.push(Math.random() * Math.PI * 2);
  }
  
  let time = 0;
  const obs = scene.onBeforeRenderObservable.add(() => {
    time += scene.getEngine().getDeltaTime() * 0.001;
    for (let i = 0; i < count; i++) {
      const inst = instances[i]!;
      const offset = startOffsets[i]!;
      
      // Swirling Brownian-like motion instead of straight falling
      inst.position.x += Math.sin(time + offset) * 0.01;
      inst.position.y += Math.cos(time * 0.8 + offset) * 0.005;
      inst.position.z += Math.sin(time * 1.2 + offset) * 0.01;
      
      inst.rotation.x += 0.01;
      inst.rotation.y += 0.02;
      
      // Wrap around
      if (inst.position.y < 0) inst.position.y = 20;
      if (inst.position.y > 20) inst.position.y = 0;
      if (inst.position.x > 40) inst.position.x = -40;
      if (inst.position.x < -40) inst.position.x = 40;
      if (inst.position.z > 40) inst.position.z = -40;
      if (inst.position.z < -40) inst.position.z = 40;
    }
  });

  bases[0]!.onDisposeObservable.add(() => {
    scene.onBeforeRenderObservable.remove(obs);
  });
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

function meshShouldCastShadow(mesh: Mesh): boolean {
  if (mesh.name === 'sky') return false;
  if (mesh.name.startsWith('cloudPlane_')) return false;
  const mat = mesh.material;
  if (mat && 'disableLighting' in mat && (mat as StandardMaterial).disableLighting) {
    return false;
  }
  return true;
}

/**
 * Exponential blur shadows from the `arenaSun` directional. Skips unlit deco / sky / clouds.
 */
export function attachArenaShadows(scene: Scene, lights: Light[], meshes: Mesh[]): ShadowGenerator | null {
  const sun = lights.find(
    (l): l is DirectionalLight => l instanceof DirectionalLight && l.name === 'arenaSun',
  );
  if (!sun) return null;

  const sg = new ShadowGenerator(2048, sun);
  sg.useBlurExponentialShadowMap = true;
  sg.blurKernel = 26;
  sg.darkness = 0.38;
  sg.bias = 0.00065;
  sg.normalBias = 0.018;

  for (const m of meshes) {
    m.receiveShadows = true;
    if (meshShouldCastShadow(m)) {
      sg.addShadowCaster(m, true);
    }
  }
  return sg;
}

/**
 * Wrap arena build with shadow setup and resource disposal (IBL is scene-wide from `main`).
 */
export function makeArenaBuildResult(
  scene: Scene,
  meshes: Mesh[],
  lights: Light[],
  textures: DynamicTexture[],
  wallBoxes: WallAABB[],
  envSpawnHalfXZ: number,
  spawnPosition: Vector3,
): ArenaBuildResult {
  const shadowGen = attachArenaShadows(scene, lights, meshes);
  return {
    wallBoxes,
    envSpawnHalfXZ,
    spawnPosition,
    registerEntityShadowMeshes(bodies: AbstractMesh[]) {
      if (!shadowGen) return;
      for (const b of bodies) {
        b.receiveShadows = true;
        shadowGen.addShadowCaster(b);
      }
    },
    dispose: () => {
      shadowGen?.dispose();
      disposeArenaResources(meshes, lights, textures);
    },
  };
}
