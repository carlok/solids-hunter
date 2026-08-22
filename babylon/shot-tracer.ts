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

const TRACER_MS = 240;
const IMPACT_MS = 3600;

/**
 * Ring sizes. A tracer lives 240ms and an impact mark 3.6s, so these only have
 * to cover what can plausibly overlap at a human fire rate. When a ring is
 * exhausted the oldest entry is recycled, which is invisible because the oldest
 * is also the most faded.
 */
const TRACER_POOL = 8;
const IMPACT_POOL = 16;

const HALO_ALPHA = 0.88;
const IMPACT_ALPHA = 0.72;

type Effect = {
  meshes: Mesh[];
  /** Materials whose alpha is animated; one per pooled entry, not per shot. */
  fading: { material: StandardMaterial; peak: number }[];
  bornAt: number;
  durationMs: number;
  active: boolean;
};

type ScenePools = {
  tracers: Effect[];
  impacts: Effect[];
  nextTracer: number;
  nextImpact: number;
};

/**
 * Effect meshes were previously built and disposed per shot — three meshes and
 * three materials every time the player pulled the trigger, each with its own
 * `onBeforeRender` observer. Every material was a fresh shader lookup and every
 * disposal was garbage on the hot path. They are now built once per scene and
 * recycled, driven by a single observer that ticks whatever is live.
 */
const poolsByScene = new WeakMap<Scene, ScenePools>();

function orient(mesh: Mesh, dir: Vector3, mid: Vector3): void {
  if (Math.abs(Vector3.Dot(dir, Y_UP)) > 0.995) {
    mesh.rotationQuaternion = Quaternion.RotationAxis(
      new Vector3(1, 0, 0),
      dir.y > 0 ? 0 : Math.PI,
    );
  } else {
    const axis = Vector3.Cross(Y_UP, dir);
    const sin = axis.length();
    axis.scaleInPlace(1 / sin);
    mesh.rotationQuaternion = Quaternion.RotationAxis(axis, Math.atan2(sin, Vector3.Dot(Y_UP, dir)));
  }
  mesh.position.copyFrom(mid);
}

function unlitMaterial(
  scene: Scene,
  name: string,
  diffuse: [number, number, number],
  emissive: [number, number, number],
  alpha: number,
  depthWrite: boolean,
): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor.copyFromFloats(...diffuse);
  mat.emissiveColor.copyFromFloats(...emissive);
  mat.specularColor = Color3.Black();
  mat.alpha = alpha;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = !depthWrite;
  return mat;
}

function prepare(mesh: Mesh): void {
  mesh.isPickable = false;
  /** Group 0 with the rest of the scene; group 1 sorted badly against sky and fog. */
  mesh.renderingGroupId = 0;
  mesh.setEnabled(false);
}

function buildTracer(scene: Scene, index: number): Effect {
  const haloMat = unlitMaterial(scene, `shot_halo_${index}`, [1, 0.45, 0.08], [1, 0.55, 0.12], HALO_ALPHA, true);
  const coreMat = unlitMaterial(scene, `shot_core_${index}`, [1, 1, 0.92], [1, 1, 1], 1, true);

  /** Unit height, scaled along Y per shot, so one geometry covers every range. */
  const halo = MeshBuilder.CreateCylinder(
    `shot_halo_${index}`,
    { diameterTop: 0.22, diameterBottom: 0.42, height: 1, tessellation: 14 },
    scene,
  );
  halo.material = haloMat;
  prepare(halo);

  const core = MeshBuilder.CreateCylinder(
    `shot_core_${index}`,
    { diameterTop: 0.08, diameterBottom: 0.18, height: 1, tessellation: 12 },
    scene,
  );
  core.material = coreMat;
  prepare(core);

  return {
    meshes: [halo, core],
    fading: [{ material: haloMat, peak: HALO_ALPHA }],
    bornAt: 0,
    durationMs: TRACER_MS,
    active: false,
  };
}

function buildImpact(scene: Scene, index: number): Effect {
  const mat = unlitMaterial(
    scene,
    `impact_${index}`,
    [0.08, 0.055, 0.035],
    [0.12, 0.06, 0.025],
    IMPACT_ALPHA,
    false,
  );
  const mark = MeshBuilder.CreateDisc(
    `impact_mark_${index}`,
    { radius: 0.22, tessellation: 14, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  mark.material = mat;
  prepare(mark);

  return {
    meshes: [mark],
    fading: [{ material: mat, peak: IMPACT_ALPHA }],
    bornAt: 0,
    durationMs: IMPACT_MS,
    active: false,
  };
}

function retire(effect: Effect): void {
  effect.active = false;
  for (const mesh of effect.meshes) mesh.setEnabled(false);
}

function poolsFor(scene: Scene): ScenePools {
  const existing = poolsByScene.get(scene);
  if (existing) return existing;

  const pools: ScenePools = {
    tracers: Array.from({ length: TRACER_POOL }, (_, i) => buildTracer(scene, i)),
    impacts: Array.from({ length: IMPACT_POOL }, (_, i) => buildImpact(scene, i)),
    nextTracer: 0,
    nextImpact: 0,
  };

  /** One observer for every effect in the scene, instead of one per shot. */
  const tick = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    for (const effect of [...pools.tracers, ...pools.impacts]) {
      if (!effect.active) continue;
      const u = (now - effect.bornAt) / effect.durationMs;
      if (u >= 1) {
        retire(effect);
        continue;
      }
      const k = effect.durationMs === TRACER_MS ? 1 - u * u : 1 - u;
      for (const { material, peak } of effect.fading) material.alpha = peak * k;
    }
  });

  scene.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(tick);
    poolsByScene.delete(scene);
  });

  poolsByScene.set(scene, pools);
  return pools;
}

/** Take the next entry in the ring, recycling the oldest if all are live. */
function claim(ring: Effect[], cursor: number): { effect: Effect; cursor: number } {
  const effect = ring[cursor % ring.length]!;
  retire(effect);
  effect.active = true;
  effect.bornAt = performance.now();
  for (const { material, peak } of effect.fading) material.alpha = peak;
  return { effect, cursor: (cursor + 1) % ring.length };
}

/** Warm halo plus bright core along the shot segment, fading over ~240ms. */
export function spawnShotTracer(scene: Scene, start: Vector3, end: Vector3): void {
  const d = end.subtract(start);
  const len = d.length();
  if (len < 0.04) return;
  d.scaleInPlace(1 / len);

  const pools = poolsFor(scene);
  const { effect, cursor } = claim(pools.tracers, pools.nextTracer);
  pools.nextTracer = cursor;

  const mid = Vector3.Lerp(start, end, 0.5);
  for (const mesh of effect.meshes) {
    mesh.scaling.set(1, len, 1);
    orient(mesh, d, mid);
    mesh.setEnabled(true);
  }
}

export function spawnImpactMark(scene: Scene, point: Vector3, shotDir: Vector3): void {
  const normal = shotDir.clone().normalize().scaleInPlace(-1);

  const pools = poolsFor(scene);
  const { effect, cursor } = claim(pools.impacts, pools.nextImpact);
  pools.nextImpact = cursor;

  const mark = effect.meshes[0]!;
  mark.position.copyFrom(point).addInPlace(normal.scale(0.035));
  mark.rotationQuaternion = null;
  mark.lookAt(mark.position.add(normal));
  mark.setEnabled(true);
}
