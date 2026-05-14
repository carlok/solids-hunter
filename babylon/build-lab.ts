import {
  Color3,
  DynamicTexture,
  Light,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  SpotLight,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

import {
  addAmbientFill,
  addBox,
  addDustMotes,
  addFloor,
  addPoint,
  addSkySphere,
  addSunLight,
  addWallBox,
  applyAlbedoHex,
  applyDiffuseHex,
  makeArenaBuildResult,
  setAzureBackgroundLinearFog,
  type ArenaBuildResult,
} from './arena-shared';
import { envTintHex, propColorDrift } from './env-colors';
import { stylePbrSurfaceMaterial } from './material-style';
import { pushWallBoxCenterSize, type WallAABB } from './wall-collision';

/** Matches `buildEnv('lab')` → `envSpawnHalfXZ` in js/main.js */
export const LAB_ENV_SPAWN_HALF_XZ = 28;

/**
 * Port of `ENVS.lab()` plus shared sky/sun (order: env → `addSkySphere` → `addSunLight` in Three).
 */
export function buildLabScene(scene: Scene): ArenaBuildResult {
  const meshes: Mesh[] = [];
  const lights: Light[] = [];
  const textures: DynamicTexture[] = [];
  const wallBoxes: WallAABB[] = [];
  const envSpawnHalfXZ = LAB_ENV_SPAWN_HALF_XZ;

  setAzureBackgroundLinearFog(scene, 36, 118);

  addAmbientFill(scene, lights, 0xd2e8fc, 0.3); // Softer ambient
  addPoint(scene, lights, 0x55eeff, 1.0, 0, 6, 0, 60); // Central chandelier

  // Spot lights
  const addSpot = (x: number, z: number) => {
    const spot = new SpotLight(`spot_${x}_${z}`, new Vector3(x, 6, z), new Vector3(0, -1, 0), Math.PI / 3, 2, scene);
    spot.diffuse = new Color3(1, 1, 1);
    spot.intensity = 0.8;
    lights.push(spot);
  };
  addSpot(15, 15);
  addSpot(-15, -15);
  addSpot(15, -15);
  addSpot(-15, 15);

  addFloor(scene, meshes, 65, 0x3a4a5e, 'lab');

  const ceil = MeshBuilder.CreatePlane('ceil', { width: 65, height: 65 }, scene);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 6.5;
  const ceilMat = new PBRMaterial('ceilMat', scene);
  applyAlbedoHex(ceilMat, envTintHex(0x456080, 19));
  stylePbrSurfaceMaterial(ceilMat, 'ceiling');
  ceil.material = ceilMat;
  meshes.push(ceil);

  for (let i = -30; i <= 30; i += 5) {
    const lineMat = new StandardMaterial(`lineMat_${i}_a`, scene);
    lineMat.disableLighting = true;
    applyDiffuseHex(lineMat, 0x18183a);
    const gl1 = MeshBuilder.CreatePlane('gl1', { width: 60, height: 0.055 }, scene);
    gl1.rotation.x = Math.PI / 2;
    gl1.position.set(0, 0.088, i);
    gl1.material = lineMat;
    meshes.push(gl1);

    const lineMat2 = new StandardMaterial(`lineMat_${i}_b`, scene);
    lineMat2.disableLighting = true;
    applyDiffuseHex(lineMat2, 0x18183a);
    const gl2 = MeshBuilder.CreatePlane('gl2', { width: 0.055, height: 60 }, scene);
    gl2.rotation.x = Math.PI / 2;
    gl2.position.set(i, 0.088, 0);
    gl2.material = lineMat2;
    meshes.push(gl2);
  }

  const lOutLo = 0x222c40;
  const lOutHi = 0x405878;
  addWallBox(scene, meshes, wallBoxes, 65, 7, 0.5, lOutLo, lOutHi, 0, 3.5, -32, 0);
  addWallBox(scene, meshes, wallBoxes, 65, 7, 0.5, lOutLo, lOutHi, 0, 3.5, 32, 0);
  addWallBox(scene, meshes, wallBoxes, 0.5, 7, 65, lOutLo, lOutHi, -32, 3.5, 0, 0);
  addWallBox(scene, meshes, wallBoxes, 0.5, 7, 65, lOutLo, lOutHi, 32, 3.5, 0, 0);

  const panels: [number, number, number, number, number, number][] = [
    [0.3, 6, 10, 10, 3, 0],
    [0.3, 6, 10, -10, 3, 0],
    [10, 6, 0.3, 0, 3, 10],
    [10, 6, 0.3, 0, 3, -10],
  ];
  for (const [w, h, d, x, y, z] of panels) {
    const panelSalt = x * 19 + y * 7 + z * 13 + w * 3;
    const mesh = MeshBuilder.CreateBox(`panel_${x}_${z}`, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    const pm = new PBRMaterial(`pm_${x}_${z}`, scene);
    applyAlbedoHex(pm, envTintHex(0x4a6a8a, panelSalt));
    stylePbrSurfaceMaterial(pm, 'glass');
    mesh.material = pm;
    meshes.push(mesh);
    pushWallBoxCenterSize(wallBoxes, x, y, z, w, h, d);
  }

  const consolePos: [number, number, number][] = [
    [-7, 0, 7],
    [7, 0, -7],
    [13, 0, -13],
    [-13, 0, 13],
    [0, 0, -19],
    [0, 0, 19],
    [-19, 0, 0],
    [19, 0, 0],
  ];
  consolePos.forEach(([x, , z], i) => {
    addBox(
      scene,
      meshes,
      3,
      1.2,
      1.5,
      propColorDrift(0x121828, x * 67 + z * 53 + i * 17, 0.11),
      x,
      0.6,
      z,
      0,
      false,
      wallBoxes,
      1,
      'metal',
    );
  });

  const stripCoords: [number, number, number][] = [
    [-13, 6, 0],
    [13, 6, 0],
    [0, 6, -13],
    [0, 6, 13],
    [-13, 6, -13],
    [13, 6, 13],
  ];
  for (const [x, y, z] of stripCoords) {
    const sMat = new StandardMaterial(`stripMat_${x}_${z}`, scene);
    sMat.disableLighting = true;
    applyDiffuseHex(sMat, 0x00e5ff);
    const sm = MeshBuilder.CreateBox(`strip_${x}_${z}`, { width: 9, height: 0.07, depth: 0.22 }, scene);
    sm.position.set(x, y - 0.05, z);
    sm.material = sMat;
    meshes.push(sm);
    const sl = new PointLight(`stripL_${x}_${z}`, new Vector3(x, y - 0.7, z), scene);
    sl.diffuse = Color3.FromInts(0, 0xe5, 0xff);
    sl.intensity = 0.4;
    sl.range = 15;
    lights.push(sl);
  }

  addSkySphere(scene, meshes, textures);
  addSunLight(scene, lights);

  addDustMotes(scene, meshes);

  const spawnPosition = new Vector3(0, 1.7, 0);

  return makeArenaBuildResult(scene, meshes, lights, textures, wallBoxes, envSpawnHalfXZ, spawnPosition);
}
