import { describe, it, expect } from 'vitest';

import { arenaNameFromSearch, normalizeArenaName } from '../../babylon/arenas';

describe('normalizeArenaName', () => {
  it('defaults null/empty to lab', () => {
    expect(normalizeArenaName(null)).toBe('lab');
    expect(normalizeArenaName(undefined)).toBe('lab');
    expect(normalizeArenaName('')).toBe('lab');
  });

  it('trims and lowercases known arenas', () => {
    expect(normalizeArenaName('  FOREST  ')).toBe('forest');
    expect(normalizeArenaName('Ruins')).toBe('ruins');
  });

  it('maps unknown names to lab', () => {
    expect(normalizeArenaName('nope')).toBe('lab');
  });
});

describe('arenaNameFromSearch', () => {
  it('reads env query', () => {
    expect(arenaNameFromSearch('?env=dungeon')).toBe('dungeon');
    expect(arenaNameFromSearch('?env=forest&x=1')).toBe('forest');
  });

  it('defaults when env missing or invalid', () => {
    expect(arenaNameFromSearch('')).toBe('lab');
    expect(arenaNameFromSearch('?env=unknown')).toBe('lab');
  });
});
