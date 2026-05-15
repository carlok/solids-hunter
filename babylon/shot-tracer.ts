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
    const axis = Vector3.Cross(Y_UP, dir);
    const sin = axis.length();
    axis.scaleInPlace(1 / sin);
    const angle = Math.atan2(sin, Vector3.Dot(Y_UP, dir));
    mesh.rotationQuaternion = Quaternion.RotationAxis(axis, angle);
  }
  mesh.position.copyFrom(mid);
  mesh.isPickable = false;
  /** Group 0 with the rest of the scene; group 1 was sorting badly with sky/fog and often disappeared. */
  mesh.renderingGroupId = 0;
}

/**
 * Warm halo + bright core cylinder along the segment, fading out over ~240ms (Three.js parity).
 */
export function spawnShotTracer(scene: Scene, start: Vector3, end: Vector3): void {
  const d = end.clone().subtractInPlace(start);
  const len = d.length();
  if (len < 0.04) {
    return;
  }
  d.scaleInPlace(1 / len);
  const beamDir = d;
  const mid = Vector3.Lerp(start, end, 0.5);

  const haloMat = new StandardMaterial(`shot_halo_${Math.random().toString(36).slice(2)}`, scene);
  haloMat.diffuseColor.copyFromFloats(1, 0.45, 0.08);
  haloMat.emissiveColor.copyFromFloats(1, 0.55, 0.12);
  haloMat.specularColor = Color3.Black();
  haloMat.alpha = 0.88;
  haloMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  haloMat.disableLighting = true;
  haloMat.backFaceCulling = false;
  haloMat.disableDepthWrite = false;

  const halo = MeshBuilder.CreateCylinder(
    `shot_halo`,
    { diameterTop: 0.22, diameterBottom: 0.42, height: len, tessellation: 14 },
    scene,
  );
  halo.material = haloMat;
  orientBeam(halo, beamDir, mid);

  const coreMat = new StandardMaterial(`shot_core_${Math.random().toString(36).slice(2)}`, scene);
  coreMat.diffuseColor.copyFromFloats(1, 1, 0.92);
  coreMat.emissiveColor.copyFromFloats(1, 1, 1);
  coreMat.specularColor = Color3.Black();
  coreMat.alpha = 1;
  coreMat.transparencyMode = StandardMaterial.MATERIAL_OPAQUE;
  coreMat.disableLighting = true;
  coreMat.backFaceCulling = false;
  coreMat.disableDepthWrite = false;

  const core = MeshBuilder.CreateCylinder(
    `shot_core`,
    { diameterTop: 0.08, diameterBottom: 0.18, height: len, tessellation: 12 },
    scene,
  );
  core.material = coreMat;
  orientBeam(core, beamDir, mid);

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
    haloMat.alpha = 0.88 * k;
  });
}

export function spawnImpactMark(scene: Scene, point: Vector3, shotDir: Vector3): void {
  const normal = shotDir.clone().normalize().scaleInPlace(-1);
  const pos = point.clone().addInPlace(normal.clone().scale(0.035));
  const markMat = new StandardMaterial(`impact_${Math.random().toString(36).slice(2)}`, scene);
  markMat.diffuseColor.copyFromFloats(0.08, 0.055, 0.035);
  markMat.emissiveColor.copyFromFloats(0.12, 0.06, 0.025);
  markMat.specularColor = Color3.Black();
  markMat.alpha = 0.72;
  markMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  markMat.disableLighting = true;
  markMat.disableDepthWrite = true;
  markMat.backFaceCulling = false;

  const mark = MeshBuilder.CreateDisc(
    'impact_mark',
    { radius: 0.22, tessellation: 14, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  mark.material = markMat;
  mark.position.copyFrom(pos);
  mark.lookAt(pos.clone().addInPlace(normal));
  mark.isPickable = false;
  mark.renderingGroupId = 0;

  const t0 = performance.now();
  const dur = 3600;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const u = (performance.now() - t0) / dur;
    if (u >= 1) {
      scene.onBeforeRenderObservable.remove(obs);
      mark.dispose(false, true);
      return;
    }
    markMat.alpha = 0.72 * (1 - u);
  });
}
