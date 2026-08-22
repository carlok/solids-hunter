import { describe, it, expect } from 'vitest';
import {
  COLORS,
  CNAMES,
  SHAPES,
  MOVE_MODES,
  RULE_FAMILIES,
  pick,
  generateHuntRule,
  generateHuntRuleForFamily,
  ensureMinimumMatches,
  allPairs,
  classifyPairs,
  buildSpawnList
} from '../lib/game-rules.js';

/** Deterministic stand-in for Math.random so distribution assertions are stable. */
function seededRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  it('produces color OR color when rng in fourth branch', () => {
    let i = 0;
    const seq = [0.55, 0, 0, 0.99];
    const rng = () => seq[i++] ?? 0.5;
    const rule = generateHuntRule(rng);
    expect(rule.badge).toMatch(/ OR /);
    expect(rule.lines[0]).toMatch(/ OR /);
    const [a, b] = rule.lines[0].split(' OR ');
    expect(CNAMES).toContain(a);
    expect(CNAMES).toContain(b);
    expect(a).not.toBe(b);
    expect(rule.matches({ color: a, shape: 'Cube' })).toBe(true);
    expect(rule.matches({ color: b, shape: 'Cube' })).toBe(true);
  });

  it('produces shape OR shape when rng in fifth branch', () => {
    let i = 0;
    const seq = [0.67, 0, 0, 0.99];
    const rng = () => seq[i++] ?? 0.5;
    const rule = generateHuntRule(rng);
    expect(rule.badge).toMatch(/ OR /);
    const [s1, s2] = rule.badge.split(' OR ');
    expect(SHAPES).toContain(s1);
    expect(SHAPES).toContain(s2);
    expect(s1).not.toBe(s2);
  });

  it('produces color AND NOT shape in sixth branch', () => {
    let i = 0;
    const seq = [0.79, 0.1, 0.1];
    const rng = () => seq[i++] ?? 0.5;
    const rule = generateHuntRule(rng);
    expect(rule.badge).toMatch(/ AND NOT /);
    const m = rule.badge.match(/^(.+) AND NOT (.+)$/);
    expect(m).not.toBeNull();
    const [, c, s] = m;
    expect(CNAMES).toContain(c);
    expect(SHAPES).toContain(s);
    expect(rule.matches({ color: c, shape: s })).toBe(false);
    expect(rule.matches({ color: c, shape: SHAPES.find((x) => x !== s) })).toBe(true);
  });

  it('produces compound (c AND s) OR cB in final branch', () => {
    let i = 0;
    const seq = [0.91, 0, 0.1, 0, 0, 0.99];
    const rng = () => seq[i++] ?? 0.5;
    const rule = generateHuntRule(rng);
    expect(rule.badge).toMatch(/\) OR /);
    expect(rule.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('limits generated rules to an explicit director-selected family', () => {
    const rule = generateHuntRule(() => 0.5, ['andNot']);
    expect(rule.badge).toMatch(/ AND NOT /);
  });

  it('creates every named rule family', () => {
    expect(RULE_FAMILIES).toHaveLength(9);
    for (const family of RULE_FAMILIES) {
      let i = 0;
      const rule = generateHuntRuleForFamily(family, () => (i++ % 7) / 7);
      expect(rule.badge).not.toHaveLength(0);
    }
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

  it('uses seven highly separated rule colors', () => {
    expect(CNAMES).toHaveLength(7);
    expect(CNAMES).not.toContain('Orange');
    expect(CNAMES).toContain('Cyan');

    const channels = (rgb) => [
      (rgb >> 16) & 0xff,
      (rgb >> 8) & 0xff,
      rgb & 0xff
    ];
    for (let i = 0; i < CNAMES.length; i++) {
      for (let j = i + 1; j < CNAMES.length; j++) {
        const a = channels(COLORS[CNAMES[i]]);
        const b = channels(COLORS[CNAMES[j]]);
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(dist).toBeGreaterThan(150);
      }
    }
  });

  it('MOVE_MODES has four modes', () => {
    expect(MOVE_MODES).toEqual(['drift', 'bounce', 'orbit', 'slide']);
  });
});

describe('classifyPairs', () => {
  it('partitions every spawnable pair exactly once', () => {
    for (const family of RULE_FAMILIES) {
      const rule = generateHuntRuleForFamily(family, seededRng(family.length + 3));
      const { matching, near, far } = classifyPairs(rule);
      const all = [...matching, ...near, ...far];
      expect(all).toHaveLength(allPairs().length);
      const keys = new Set(all.map((p) => `${p.color}/${p.shape}`));
      expect(keys.size).toBe(allPairs().length);
    }
  });

  it('puts matches in matching and nothing else', () => {
    const rule = generateHuntRuleForFamily('and', seededRng(11));
    const { matching, near, far } = classifyPairs(rule);
    expect(matching.every((p) => rule.matches(p))).toBe(true);
    expect(near.some((p) => rule.matches(p))).toBe(false);
    expect(far.some((p) => rule.matches(p))).toBe(false);
  });

  it('treats a pair sharing exactly one attribute with a match as a near miss', () => {
    // "Red AND Cube": a Red Sphere shares the colour, a Blue Cube shares the shape.
    const rule = {
      matches: (e) => e.color === 'Red' && e.shape === 'Cube',
    };
    const { near, far } = classifyPairs(rule);
    const has = (list, color, shape) => list.some((p) => p.color === color && p.shape === shape);
    expect(has(near, 'Red', 'Sphere')).toBe(true);
    expect(has(near, 'Blue', 'Cube')).toBe(true);
    expect(has(far, 'Blue', 'Sphere')).toBe(true);
    expect(has(near, 'Blue', 'Sphere')).toBe(false);
  });
});

describe('buildSpawnList', () => {
  const nearShare = (rule, bias, rounds = 120) => {
    const { near } = classifyPairs(rule);
    const isNear = (e) => near.some((p) => p.color === e.color && p.shape === e.shape);
    let decoys = 0;
    let nears = 0;
    for (let i = 0; i < rounds; i++) {
      for (const e of buildSpawnList(16, rule, bias, seededRng(i + 1))) {
        if (rule.matches(e)) continue;
        decoys++;
        if (isNear(e)) nears++;
      }
    }
    return decoys === 0 ? 0 : nears / decoys;
  };

  it('honours count and keeps the round clearable at every bias', () => {
    for (const family of RULE_FAMILIES) {
      for (const bias of [undefined, 0, 0.15, 0.65, 1]) {
        const rule = generateHuntRuleForFamily(family, seededRng(7));
        const list = buildSpawnList(16, rule, bias, seededRng(21));
        expect(list).toHaveLength(16);
        expect(list.filter((e) => rule.matches(e)).length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('shifts decoys toward near misses as the bias rises', () => {
    const rule = { matches: (e) => e.color === 'Red' && e.shape === 'Cube' };
    const low = nearShare(rule, 0.15);
    const high = nearShare(rule, 0.65);
    expect(low).toBeLessThan(0.3);
    expect(high).toBeGreaterThan(0.55);
    expect(high).toBeGreaterThan(low);
  });

  it('spawns fewer targets at challenge bias than at assist bias', () => {
    // Families without a "far" bucket respond on decoy volume instead.
    const rule = { matches: (e) => e.color !== 'Red' };
    const count = (bias) => {
      let matches = 0;
      for (let i = 0; i < 120; i++) {
        matches += buildSpawnList(16, rule, bias, seededRng(i + 1)).filter((e) => rule.matches(e)).length;
      }
      return matches / 120;
    };
    expect(count(0.65)).toBeLessThan(count(0.15));
  });

  it('leaves the uniform draw untouched when no bias is given', () => {
    const rule = generateHuntRuleForFamily('orShape', seededRng(5));
    const rng = seededRng(99);
    const list = buildSpawnList(16, rule, undefined, rng);
    const expectedRng = seededRng(99);
    const expected = Array.from({ length: 16 }, () => ({
      shape: SHAPES[Math.floor(expectedRng() * SHAPES.length)],
      color: CNAMES[Math.floor(expectedRng() * CNAMES.length)],
    }));
    ensureMinimumMatches(expected, rule, 3, expectedRng);
    expect(list).toEqual(expected);
  });
});

describe('ensureMinimumMatches', () => {
  it('does not fill the round with identical clones', () => {
    const rule = { matches: (e) => e.color !== 'Red' };
    const list = Array.from({ length: 12 }, () => ({ color: 'Red', shape: 'Cube' }));
    ensureMinimumMatches(list, rule, 6, seededRng(4));
    const forced = list.filter((e) => rule.matches(e));
    expect(forced.length).toBeGreaterThanOrEqual(6);
    const distinct = new Set(forced.map((e) => `${e.color}/${e.shape}`));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('is a no-op when the rule is unsatisfiable', () => {
    const rule = { matches: () => false };
    const list = [{ color: 'Red', shape: 'Cube' }];
    ensureMinimumMatches(list, rule, 3, seededRng(1));
    expect(list).toEqual([{ color: 'Red', shape: 'Cube' }]);
  });
});
