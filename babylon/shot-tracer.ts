import type { Scene } from '@babylonjs/core';
import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

const Y_UP = Vector3.Up();

function orientBeam(mesh: Mesh, beamDir: Vector3, mid: Vector3): void {
  const dir = beamDir.clone().normalize();
  if (Math.abs(Vector3.Dot(dir, Y_UP)) > 0.995) {
    mesh.rotationQuaternion = Quaternion.RotationAxis(
      new Vector3(1, 0, 0),
      dir.y > 0 ? 0 : Math.PI,
    );
  } else {
    mesh.rotationQuaternion = Quaternion.FromUnitVectors(Y_UP, dir);
  }
  mesh.position.copyFrom(mid);
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;
}

/**
 * Warm halo + bright core cylinder along the segment, fading out over ~240ms (Three.js parity).
 */
export function spawnShotTracer(scene: Scene, start: Vector3, end: Vector3): void {
  const d = end.clone().subtract(start);
  const len = d.length();
  if (len < 0.04) return;
  d.scaleInPlace(1 / len);
  const beamDir = d;
  const mid = start.clone().add(end).scaleInPlace(0.5);

  const haloMat = new StandardMaterial(`shot_halo_${Math.random().toString(36).slice(2)}`, scene);
  haloMat.diffuseColor = Color3.FromHexString('#ff7722');
  haloMat.emissiveColor = haloMat.diffuseColor.scale(0.35);
  haloMat.alpha = 0.95;
  haloMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  haloMat.disableLighting = true;
  haloMat.backFaceCulling = false;
  haloMat.disableDepthWrite = true;

  const halo = MeshBuilder.CreateCylinder(
    `shot_halo`,
    { diameterTop: 0.14, diameterBottom: 0.32, height: len, tessellation: 12 },
    scene,
  );
  halo.material = haloMat;
  orientBeam(halo, beamDir, mid);

  const coreMat = new StandardMaterial(`shot_core_${Math.random().toString(36).slice(2)}`, scene);
  coreMat.diffuseColor = new Color3(1, 1, 0.93);
  coreMat.emissiveColor = new Color3(1, 1, 0.85);
  coreMat.specularColor = Color3.Black();
  coreMat.alpha = 1;
  coreMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  coreMat.disableLighting = true;
  coreMat.backFaceCulling = false;
  coreMat.disableDepthWrite = true;

  const core = MeshBuilder.CreateCylinder(
    `shot_core`,
    { diameterTop: 0.04, diameterBottom: 0.096, height: len, tessellation: 10 },
    scene,
  );
  core.material = coreMat;
  orientBeam(core, beamDir.clone(), mid.clone());
  core.renderingGroupId = 1;

  const t0 = performance.now();
  const dur = 240;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const elapsed = performance.now() - t0;
    if (elapsed >= dur) {
      scene.onBeforeRenderObservable.remove(obs);
      halo.dispose(false, true);
      core.dispose(false, true);
      return;
    }
    const u = elapsed / dur;
    const k = 1 - u * u;
    haloMat.alpha = 0.95 * k;
    coreMat.alpha = k;
  });
}
