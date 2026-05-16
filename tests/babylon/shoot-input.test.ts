import { NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import { applyWrongHitPenalty, createCenterShotRay } from '../../babylon/shoot-input';

function expectVectorClose(actual: Vector3, expected: Vector3): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

describe('createCenterShotRay', () => {
  it('uses the camera forward ray instead of render-size screen coordinates', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new UniversalCamera('cam', new Vector3(3, 2, -5), scene);
    camera.setTarget(new Vector3(4, 2.5, -1));

    engine.getRenderWidth = () => {
      throw new Error('render width should not be read for center shots');
    };
    engine.getRenderHeight = () => {
      throw new Error('render height should not be read for center shots');
    };

    const ray = createCenterShotRay(camera);

    expectVectorClose(ray.origin, camera.globalPosition);
    expectVectorClose(ray.direction, camera.getDirection(Vector3.Forward()).normalize());

    scene.dispose();
    engine.dispose();
  });
});

describe('applyWrongHitPenalty', () => {
  it('ends the round only when a nonzero score returns to zero', () => {
    expect(applyWrongHitPenalty(20)).toEqual({ score: 15, gameOver: false });
    expect(applyWrongHitPenalty(5)).toEqual({ score: 0, gameOver: true });
    expect(applyWrongHitPenalty(0)).toEqual({ score: 0, gameOver: false });
  });
});
