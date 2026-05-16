import type { Scene } from '@babylonjs/core';

import type { ArenaBuildResult } from './arena-shared';
import { buildDuomoScene } from './build-duomo';
import { buildDungeonScene } from './build-dungeon';
import { buildForestScene } from './build-forest';
import { buildLabScene } from './build-lab';

export type ArenaName = 'lab' | 'dungeon' | 'forest' | 'duomo';

const ARENA_ALIASES: Record<string, ArenaName> = {
  lab: 'lab',
  dungeon: 'dungeon',
  forest: 'forest',
  duomo: 'duomo',
};

export function normalizeArenaName(raw: string | null | undefined): ArenaName {
  const k = (raw || 'lab').toLowerCase().trim();
  return ARENA_ALIASES[k] ?? 'lab';
}

export function buildArenaScene(scene: Scene, name: ArenaName): ArenaBuildResult {
  switch (name) {
    case 'dungeon':
      return buildDungeonScene(scene);
    case 'forest':
      return buildForestScene(scene);
    case 'duomo':
      return buildDuomoScene(scene);
    case 'lab':
    default:
      return buildLabScene(scene);
  }
}

export function arenaNameFromSearch(search: string): ArenaName {
  try {
    const q = new URLSearchParams(search).get('env');
    return normalizeArenaName(q);
  } catch {
    return 'lab';
  }
}
