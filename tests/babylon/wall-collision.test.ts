import { Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import {
  aabbFromCenterAndSize,
  entityHitsWallAt,
  hitsEntity,
  hitsWall,
  intersectsAABB,
  pushWallBoxCenterSize,
  separateEntityFromWalls,
  type WallAABB,
} from '../../babylon/wall-collision';

describe('intersectsAABB', () => {
  it('returns true when boxes overlap', () => {
    const a: WallAABB = {
      min: new Vector3(0, 0, 0),
      max: new Vector3(1, 1, 1),
    };
    const b: WallAABB = {
      min: new Vector3(0.5, 0.5, 0.5),
      max: new Vector3(2, 2, 2),
    };
    expect(intersectsAABB(a, b)).toBe(true);
  });

  it('returns false when separated on X', () => {
    const a: WallAABB = {
      min: new Vector3(0, 0, 0),
      max: new Vector3(1, 1, 1),
    };
    const b: WallAABB = {
      min: new Vector3(2, 0, 0),
      max: new Vector3(3, 1, 1),
    };
    expect(intersectsAABB(a, b)).toBe(false);
  });
});

describe('hitsWall', () => {
  it('detects overlap with a wall slab', () => {
    const wallBoxes: WallAABB[] = [];
    pushWallBoxCenterSize(wallBoxes, 5, 1, 0, 2, 2, 2);
    expect(hitsWall(new Vector3(5, 1, 0), wallBoxes)).toBe(true);
    expect(hitsWall(new Vector3(0, 1, 0), wallBoxes)).toBe(false);
  });

  it('lab perimeter AABBs (from js/main.js lab) do not contain spawn (0,1.7,0)', () => {
    const wallBoxes: WallAABB[] = [];
    pushWallBoxCenterSize(wallBoxes, 0, 3.5, -32, 65, 7, 0.5);
    pushWallBoxCenterSize(wallBoxes, 0, 3.5, 32, 65, 7, 0.5);
    pushWallBoxCenterSize(wallBoxes, -32, 3.5, 0, 0.5, 7, 65);
    pushWallBoxCenterSize(wallBoxes, 32, 3.5, 0, 0.5, 7, 65);
    const spawn = new Vector3(0, 1.7, 0);
    expect(hitsWall(spawn, wallBoxes)).toBe(false);
  });
});

describe('hitsEntity', () => {
  it('returns true when player AABB overlaps a living entity block', () => {
    const ents = [
      {
        root: { position: new Vector3(10, 0, 0) },
        alive: true,
        dying: false,
      },
    ];
    expect(hitsEntity(new Vector3(10, 1.7, 0), ents)).toBe(true);
    expect(hitsEntity(new Vector3(0, 1.7, 0), ents)).toBe(false);
  });

  it('ignores dead or dying entities', () => {
    const ents = [
      {
        root: { position: new Vector3(5, 0, 0) },
        alive: false,
        dying: false,
      },
      {
        root: { position: new Vector3(8, 0, 0) },
        alive: true,
        dying: true,
      },
    ];
    expect(hitsEntity(new Vector3(5, 1.7, 0), ents)).toBe(false);
    expect(hitsEntity(new Vector3(8, 1.7, 0), ents)).toBe(false);
  });
});

describe('entityHitsWallAt', () => {
  it('uses smaller entity AABB than player', () => {
    const wallBoxes: WallAABB[] = [];
    pushWallBoxCenterSize(wallBoxes, 10, 1.45, 0, 0.2, 2, 0.2);
    expect(entityHitsWallAt(new Vector3(10, 1.45, 0), wallBoxes)).toBe(true);
  });
});

describe('separateEntityFromWalls', () => {
  it('pushes entity center out of a thin wall slab on XZ', () => {
    const wallBoxes: WallAABB[] = [];
    pushWallBoxCenterSize(wallBoxes, 5, 1.45, 0, 0.4, 2.5, 0.4);
    const pos = new Vector3(5, 1.45, 0);
    expect(entityHitsWallAt(pos, wallBoxes)).toBe(true);
    separateEntityFromWalls(pos, wallBoxes);
    expect(entityHitsWallAt(pos, wallBoxes)).toBe(false);
    expect(Math.hypot(pos.x - 5, pos.z)).toBeGreaterThan(0.05);
  });
});

describe('aabbFromCenterAndSize', () => {
  it('writes expected min/max', () => {
    const outMin = new Vector3();
    const outMax = new Vector3();
    const box = aabbFromCenterAndSize(new Vector3(1, 2, 3), new Vector3(2, 4, 6), outMin, outMax);
    expect(box.min.equalsWithEpsilon(new Vector3(0, 0, 0), 1e-6)).toBe(true);
    expect(box.max.equalsWithEpsilon(new Vector3(2, 4, 6), 1e-6)).toBe(true);
  });
});
