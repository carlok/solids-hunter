import { describe, it, expect } from 'vitest';
import {
  COLORS,
  CNAMES,
  SHAPES,
  MOVE_MODES,
  pick,
  generateHuntRule,
  ensureMinimumMatches
} from '../js/lib/game-rules.js';

describe('pick', () => {
  it('returns first element when rng is 0', () => {
    expect(pick(['x', 'y', 'z'], () => 0)).toBe('x');
  });

  it('returns last element when rng approaches 1', () => {
    expect(pick(['only'], () => 0.999)).toBe('only');
    expect(pick(['a', 'b'], () => 0.999)).toBe('b');
  });
});

describe('generateHuntRule', () => {
  it('produces AND rule when rng is in first branch', () => {
    const rule = generateHuntRule(() => 0.1);
    expect(rule.lines).toHaveLength(1);
    expect(rule.lines[0]).toMatch(/ AND /);
    expect(rule.badge).toBe(rule.lines[0]);
    const [c, s] = rule.lines[0].split(' AND ');
    expect(CNAMES).toContain(c);
    expect(SHAPES).toContain(s);
    expect(rule.matches({ color: c, shape: s })).toBe(true);
    expect(rule.matches({ color: c, shape: SHAPES.find((x) => x !== s) })).toBe(false);
  });

  it('produces NOT color when rng hits second branch', () => {
    const rule = generateHuntRule(() => 0.25);
    expect(rule.badge.startsWith('NOT ')).toBe(true);
    const bad = rule.badge.slice(4);
    expect(CNAMES).toContain(bad);
    expect(rule.matches({ color: 'Red', shape: 'Cube' })).toBe(bad !== 'Red');
  });

  it('produces NOT shape branch', () => {
    const rule = generateHuntRule(() => 0.45);
    expect(rule.badge.startsWith('NOT ')).toBe(true);
    const badS = rule.badge.slice(4);
    expect(SHAPES).toContain(badS);
  });
});

describe('ensureMinimumMatches', () => {
  it('raises match count to at least min when rule allows matches', () => {
    const rule = {
      matches: (e) => e.color === 'Red' && e.shape === 'Cube'
    };
    const list = Array.from({ length: 8 }, () => ({
      color: 'Blue',
      shape: 'Sphere'
    }));
    let call = 0;
    const rng = () => {
      call += 1;
      return (call % 7) / 10;
    };
    ensureMinimumMatches(list, rule, 3, rng);
    expect(list.filter((e) => rule.matches(e)).length).toBeGreaterThanOrEqual(3);
  });

  it('no-ops when already enough matches', () => {
    const rule = { matches: () => true };
    const list = [{ color: 'Red', shape: 'Cube' }];
    ensureMinimumMatches(list, rule, 1, () => 0.5);
    expect(list).toHaveLength(1);
  });
});

describe('constants', () => {
  it('COLORS keys align with CNAMES', () => {
    expect(CNAMES.sort()).toEqual(Object.keys(COLORS).sort());
  });

  it('MOVE_MODES has four modes', () => {
    expect(MOVE_MODES).toEqual(['drift', 'bounce', 'orbit', 'slide']);
  });
});
