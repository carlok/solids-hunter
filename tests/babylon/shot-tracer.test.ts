import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import { spawnImpactMark, spawnShotTracer } from '../../babylon/shot-tracer';

function withScene<T>(fn: (scene: Scene) => T): T {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    return fn(scene);
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

const countEffects = (scene: Scene) =>
  scene.meshes.filter((m) => /^(shot_halo|shot_core|impact_mark)_/.test(m.name)).length;

describe('shot effects are pooled', () => {
  it('stops allocating meshes and materials after the pool is warm', () => {
    withScene((scene) => {
      const from = new Vector3(0, 1.7, 0);
      const to = new Vector3(0, 1.7, 20);
      const dir = new Vector3(0, 0, 1);

      spawnShotTracer(scene, from, to);
      spawnImpactMark(scene, to, dir);
      const meshesAfterFirst = countEffects(scene);
      const materialsAfterFirst = scene.materials.length;
      const observersAfterFirst = scene.onBeforeRenderObservable.observers.length;

      for (let i = 0; i < 200; i++) {
        spawnShotTracer(scene, from, to);
        spawnImpactMark(scene, to, dir);
      }

      expect(countEffects(scene)).toBe(meshesAfterFirst);
      expect(scene.materials.length).toBe(materialsAfterFirst);
      // One tick observer for the whole scene, not one per shot.
      expect(scene.onBeforeRenderObservable.observers.length).toBe(observersAfterFirst);
    });
  });

  it('scales one unit-height beam to the shot distance instead of rebuilding it', () => {
    withScene((scene) => {
      const from = new Vector3(0, 1.7, 0);
      spawnShotTracer(scene, from, new Vector3(0, 1.7, 12));
      const beam = scene.meshes.find((m) => m.name.startsWith('shot_core_'))!;
      expect(beam.scaling.y).toBeCloseTo(12, 5);

      spawnShotTracer(scene, from, new Vector3(0, 1.7, 3));
      const reused = scene.meshes.filter((m) => m.name.startsWith('shot_core_'));
      expect(reused.some((m) => Math.abs(m.scaling.y - 3) < 1e-5)).toBe(true);
    });
  });

  it('ignores a degenerate zero-length shot', () => {
    withScene((scene) => {
      const p = new Vector3(1, 1.7, 1);
      spawnShotTracer(scene, p, p.clone());
      expect(scene.meshes.filter((m) => m.name.startsWith('shot_core_'))).toHaveLength(0);
    });
  });
});
