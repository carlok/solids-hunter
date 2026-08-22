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
  addDamageDecals,
  addDustMotes,
  addFloor,
  addLabTable,
  addPoint,
  addSkySphere,
  addSunLight,
  addTrimmedWallSegment,
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

  setAzureBackgroundLinearFog(scene, 44, 126);

  addAmbientFill(scene, lights, 0xd8edff, 0.36); // Cleaner fill for target contrast
  addPoint(scene, lights, 0x55eeff, 0.9, 0, 6, 0, 60); // Central chandelier

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

  const lineMat = new StandardMaterial('lineMat', scene);
  lineMat.disableLighting = true;
  applyDiffuseHex(lineMat, 0x18183a);

  for (let i = -30; i <= 30; i += 5) {
    const gl1 = MeshBuilder.CreatePlane(`gl1_${i}`, { width: 60, height: 0.055 }, scene);
    gl1.rotation.x = Math.PI / 2;
    gl1.position.set(0, 0.001, i);
    gl1.material = lineMat;
    meshes.push(gl1);

    const gl2 = MeshBuilder.CreatePlane(`gl2_${i}`, { width: 0.055, height: 60 }, scene);
    gl2.rotation.x = Math.PI / 2;
    gl2.position.set(i, 0.001, 0);
    gl2.material = lineMat;
    meshes.push(gl2);
  }

  const lOutLo = 0x222c40;
  const lOutHi = 0x405878;
  addWallBox(scene, meshes, wallBoxes, 65, 7, 0.5, lOutLo, lOutHi, 0, 3.5, -32, 0);
  addWallBox(scene, meshes, wallBoxes, 65, 7, 0.5, lOutLo, lOutHi, 0, 3.5, 32, 0);
  addWallBox(scene, meshes, wallBoxes, 0.5, 7, 65, lOutLo, lOutHi, -32, 3.5, 0, 0);
  addWallBox(scene, meshes, wallBoxes, 0.5, 7, 65, lOutLo, lOutHi, 32, 3.5, 0, 0);

  addTrimmedWallSegment(scene, meshes, wallBoxes, 18, 2.2, 0.22, 0x25364d, -18, 5.4, -31.64, 0);
  addTrimmedWallSegment(scene, meshes, wallBoxes, 18, 2.2, 0.22, 0x25364d, 18, 5.4, 31.64, Math.PI);
  addTrimmedWallSegment(scene, meshes, wallBoxes, 0.22, 2.2, 18, 0x25364d, -31.64, 5.4, 18, 0);
  addTrimmedWallSegment(scene, meshes, wallBoxes, 0.22, 2.2, 18, 0x25364d, 31.64, 5.4, -18, 0);

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
    addLabTable(
      scene,
      meshes,
      wallBoxes,
      x,
      z,
      {
        width: i % 2 === 0 ? 4.2 : 3.4,
        depth: 1.55,
        height: 0.95,
        color: propColorDrift(0x121828, x * 67 + z * 53 + i * 17, 0.11),
        ry: i % 2 === 0 ? 0 : Math.PI / 2,
      },
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

  addDamageDecals(scene, meshes, textures, [
    { x: -31.72, y: 2.6, z: -18, w: 3.6, h: 2.4, ry: Math.PI / 2, kind: 'crack', seed: 11 },
    { x: 31.72, y: 3.2, z: 13, w: 4.2, h: 2.8, ry: -Math.PI / 2, kind: 'hole', seed: 12 },
    { x: -17, y: 2.4, z: -31.72, w: 3.4, h: 2.1, ry: 0, kind: 'crack', seed: 13 },
    { x: 18, y: 3.1, z: 31.72, w: 4, h: 2.7, ry: Math.PI, kind: 'hole', seed: 14 },
    { x: 10.18, y: 3.5, z: -2, w: 2.3, h: 3.1, ry: Math.PI / 2, kind: 'crack', seed: 15 },
    { x: -2, y: 3.2, z: 10.18, w: 2.9, h: 2.4, ry: Math.PI, kind: 'hole', seed: 16 },
  ]);

  addSkySphere(scene, meshes, textures);
  addSunLight(scene, lights);

  addDustMotes(scene, meshes);

  const spawnPosition = new Vector3(0, 1.7, 0);
  /**
   * Four glass panels box in the origin, and the one at z = +10 sits squarely
   * in the default +Z view — the round opened with the player's nose against
   * it. The panels only span x or z in [-5, 5], so the diagonals are the open
   * sightlines out of the enclosure.
   */
  const spawnYaw = Math.PI / 4;

  return makeArenaBuildResult(
    scene,
    meshes,
    lights,
    textures,
    wallBoxes,
    envSpawnHalfXZ,
    spawnPosition,
    spawnYaw,
  );
}
