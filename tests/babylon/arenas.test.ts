import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { describe, it, expect } from 'vitest';

import { arenaNameFromSearch, normalizeArenaName } from '../../babylon/arenas';
import { buildDuomoScene } from '../../babylon/build-duomo';
import { xzPlayHalfLimit } from '../../babylon/entity-motion';
import { hitsWall, entityHitsWallAt } from '../../babylon/wall-collision';

describe('xzPlayHalfLimit', () => {
  it('caps at 29.8 when envSpawnHalfXZ is large (forest/ruins)', () => {
    expect(xzPlayHalfLimit(40)).toBe(29.8);
  });

  it('uses envSpawnHalfXZ - 1.2 when that is tighter than the cap', () => {
    expect(xzPlayHalfLimit(28)).toBe(26.8);
  });

  it('still caps at 29.8 when envSpawnHalfXZ - 1.2 would exceed it', () => {
    expect(xzPlayHalfLimit(32)).toBe(29.8);
  });

  it('allows oversized architecture arenas to keep their walking scale', () => {
    expect(xzPlayHalfLimit(78)).toBe(76.8);
  });
});

describe('normalizeArenaName', () => {
  it('defaults null/empty to lab', () => {
    expect(normalizeArenaName(null)).toBe('lab');
    expect(normalizeArenaName(undefined)).toBe('lab');
    expect(normalizeArenaName('')).toBe('lab');
  });

  it('trims and lowercases known arenas', () => {
    expect(normalizeArenaName('  FOREST  ')).toBe('forest');
    expect(normalizeArenaName('Ruins')).toBe('ruins');
    expect(normalizeArenaName('Duomo')).toBe('duomo');
  });

  it('maps unknown names to lab', () => {
    expect(normalizeArenaName('nope')).toBe('lab');
  });
});

describe('arenaNameFromSearch', () => {
  it('reads env query', () => {
    expect(arenaNameFromSearch('?env=dungeon')).toBe('dungeon');
    expect(arenaNameFromSearch('?env=forest&x=1')).toBe('forest');
    expect(arenaNameFromSearch('?env=duomo')).toBe('duomo');
  });

  it('defaults when env missing or invalid', () => {
    expect(arenaNameFromSearch('')).toBe('lab');
    expect(arenaNameFromSearch('?env=unknown')).toBe('lab');
  });
});

describe('duomo collision', () => {
  it('blocks engaged external pillars for player and target movement', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const arena = buildDuomoScene(scene);
    const firstExternalPillar = new Vector3(30.3975, 1.7, -53.075);

    expect(hitsWall(firstExternalPillar, arena.wallBoxes)).toBe(true);
    expect(entityHitsWallAt(new Vector3(firstExternalPillar.x, 1.45, firstExternalPillar.z), arena.wallBoxes))
      .toBe(true);

    arena.dispose();
    scene.dispose();
    engine.dispose();
  });
});
