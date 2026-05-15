import { NullEngine, Scene } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import {
  addDecorativeArch,
  addDecorativeColumn,
  addLabTable,
  addTrilith,
  addTrimmedWallSegment,
} from '../../babylon/arena-shared';
import type { WallAABB } from '../../babylon/wall-collision';

function withScene(fn: (scene: Scene) => void): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    fn(scene);
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

describe('decorative arena geometry helpers', () => {
  it('return meshes without adding collision by default', () => {
    withScene((scene) => {
      const meshes = [];
      const wallBoxes: WallAABB[] = [];

      expect(addDecorativeColumn(scene, meshes, wallBoxes, 2, 3)).not.toHaveLength(0);
      expect(addDecorativeArch(scene, meshes, wallBoxes, -2, 3)).not.toHaveLength(0);
      expect(addTrilith(scene, meshes, wallBoxes, 0, -3)).not.toHaveLength(0);
      expect(addLabTable(scene, meshes, wallBoxes, 4, -2)).not.toHaveLength(0);

      expect(meshes.length).toBeGreaterThan(10);
      expect(wallBoxes).toHaveLength(0);
    });
  });

  it('adds collision only when explicitly requested', () => {
    withScene((scene) => {
      const meshes = [];
      const wallBoxes: WallAABB[] = [];

      addDecorativeColumn(scene, meshes, wallBoxes, 0, 0, { collides: true });
      addDecorativeArch(scene, meshes, wallBoxes, 6, 0, { collides: true });
      addTrilith(scene, meshes, wallBoxes, -6, 0, { collides: true });
      addTrimmedWallSegment(scene, meshes, wallBoxes, 4, 2, 0.5, 0x555555, 0, 1, 6, 0, true);

      expect(wallBoxes).toHaveLength(4);
    });
  });
});
