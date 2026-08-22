import { NullEngine, Scene } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import { disposeAllGameEntities, spawnGameEntities } from '../../babylon/entity-motion';

const alwaysMatches = {
  lines: ['TEST'],
  badge: 'TEST',
  accent: '#ffffff',
  matches: () => true,
};

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

describe('spawnGameEntities director tuning', () => {
  it('honours optional count, motion mix, and speed tuning', () => {
    withScene((scene) => {
      const entities = spawnGameEntities(scene, {
        wallBoxes: [],
        envSpawnHalfXZ: 20,
        rule: alwaysMatches,
        count: 5,
        moveModes: ['drift'],
        speedMultiplier: 0.5,
        rng: () => 0.5,
      });

      expect(entities).toHaveLength(5);
      expect(entities.every((entity) => entity.moveMode === 'drift')).toBe(true);
      for (const entity of entities) {
        // drift speed is (1.4 + rng * 1.3) * speedMultiplier
        expect(entity.speed).toBeCloseTo(1.025, 6);
      }

      disposeAllGameEntities(entities);
    });
  });

  it('skews decoys toward near misses when the director asks for it', () => {
    withScene((scene) => {
      const rule = {
        lines: ['Red AND Cube'],
        badge: 'Red AND Cube',
        accent: '#ff2d2d',
        matches: (e: { color: string; shape: string }) => e.color === 'Red' && e.shape === 'Cube',
      };
      const entities = spawnGameEntities(scene, {
        wallBoxes: [],
        envSpawnHalfXZ: 20,
        rule,
        count: 24,
        nearMissBias: 1,
      });

      const decoys = entities.filter((e) => !e.isMatch);
      expect(decoys.length).toBeGreaterThan(0);
      // At bias 1 every decoy shares exactly one attribute with the rule.
      expect(
        decoys.every((e) => (e.colorName === 'Red') !== (e.shape === 'Cube')),
      ).toBe(true);

      disposeAllGameEntities(entities);
    });
  });
});

describe('hit-test coverage', () => {
  it('never lets a hitbox be narrower than the solid it stands for', () => {
    withScene((scene) => {
      const entities = spawnGameEntities(scene, {
        wallBoxes: [],
        envSpawnHalfXZ: 20,
        rule: alwaysMatches,
        count: 24,
      });

      for (const entity of entities) {
        const hitRadius = entity.hitbox.getBoundingInfo().boundingSphere.radius;
        // The solids are open cages, so the silhouette is mostly outer edges.
        // A hitbox tighter than the drawn shape means shots that visibly strike
        // the solid pass straight through it.
        const bodyRadius = entity.body.getBoundingInfo().boundingSphere.radius;
        expect(hitRadius).toBeGreaterThanOrEqual(bodyRadius * 0.99);
      }

      disposeAllGameEntities(entities);
    });
  });
});
