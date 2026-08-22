import { Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import {
  aabbFromCenterAndSize,
  bestSpawnYaw,
  entityHitsWallAt,
  hitsEntity,
  hitsWall,
  intersectsAABB,
  pushWallBoxCenterSize,
  separateEntityFromWalls,
  sightlineDistance,
  viewOpenness,
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

describe('spawn facing', () => {
  const boxAt = (x: number, z: number, w: number, d: number) => {
    const boxes: WallAABB[] = [];
    pushWallBoxCenterSize(boxes, x, 1.7, z, w, 4, d);
    return boxes[0]!;
  };

  it('keeps the arena\'s intended heading when it is already clear', () => {
    const open: WallAABB[] = [];
    expect(bestSpawnYaw(new Vector3(0, 1.7, 0), open, 0)).toBe(0);
    expect(bestSpawnYaw(new Vector3(0, 1.7, 0), open, 1.2)).toBe(1.2);
  });

  it('turns away from a panel far enough ahead to still average well', () => {
    // The lab's case: a wide panel 10m out. Every off-axis ray clears it, so a
    // fan average alone looks fine while the player stares straight at it.
    const walls = [boxAt(0, 10, 10, 0.4)];
    const origin = new Vector3(0, 1.7, 0);
    expect(sightlineDistance(origin, 0, walls)).toBeGreaterThan(7);
    expect(bestSpawnYaw(origin, walls, 0)).not.toBe(0);
  });

  it('turns away from a wall standing in the intended heading', () => {
    // A panel 3m ahead on +Z, the lab's exact situation.
    const walls = [boxAt(0, 3, 20, 0.4)];
    const yaw = bestSpawnYaw(new Vector3(0, 1.7, 0), walls, 0);
    expect(yaw).not.toBe(0);
    expect(viewOpenness(new Vector3(0, 1.7, 0), yaw, walls)).toBeGreaterThan(
      viewOpenness(new Vector3(0, 1.7, 0), 0, walls),
    );
  });

  it('finds the gap when the spawn is boxed in on three sides', () => {
    const walls = [boxAt(0, 6, 24, 0.4), boxAt(6, 0, 0.4, 24), boxAt(-6, 0, 0.4, 24)];
    const origin = new Vector3(0, 1.7, 0);
    const yaw = bestSpawnYaw(origin, walls, 0);
    // Only -Z is open, so the player must end up facing roughly backwards.
    expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(0.6);
    expect(viewOpenness(origin, yaw, walls)).toBeGreaterThan(7);
  });

  it('judges a heading by the whole field of view, not one centre ray', () => {
    // Dead ahead is wide open, but a slab sits just off-axis filling the frame.
    const origin = new Vector3(0, 1.7, 0);
    const walls = [boxAt(4, 4, 6, 14)];
    expect(viewOpenness(origin, 0, walls)).toBeLessThan(sightlineDistance(origin, 0, walls));
  });

  it('measures clearance with the player box, not a hairline ray', () => {
    // A 0.3m slot: a ray threads it, but the 0.5m-wide player cannot.
    const walls = [boxAt(0.35, 5, 0.4, 12), boxAt(-0.35, 5, 0.4, 12)];
    expect(sightlineDistance(new Vector3(0, 1.7, 0), 0, walls)).toBeLessThan(7);
  });
});
