/**
 * Pure hunt-rule logic (no Three.js). Shared by the game client and unit tests.
 */

export const COLORS = {
  Red: 0xe74c3c,
  Blue: 0x2980b9,
  Green: 0x27ae60,
  Yellow: 0xf1c40f,
  Purple: 0x8e44ad,
  Orange: 0xe67e22,
  White: 0xecf0f1
};

export const CNAMES = Object.keys(COLORS);
export const SHAPES = ['Sphere', 'Tetrahedron', 'Cube', 'Cylinder'];
export const MOVE_MODES = ['drift', 'bounce', 'orbit', 'slide'];

/** @param {unknown[]} arr @param {() => number} [rng] */
export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Random boolean rule (simple or compound). `matches` is satisfiable
 * by some (color, shape) pairs from CNAMES × SHAPES.
 * @param {() => number} [rng] same contract as Math.random — returns [0, 1)
 */
export function generateHuntRule(rng = Math.random) {
  const r = rng();
  if (r < 0.24) {
    const c = pick(CNAMES, rng);
    const s = pick(SHAPES, rng);
    const hex = '#' + COLORS[c].toString(16).padStart(6, '0');
    return {
      lines: [c + ' AND ' + s],
      badge: c + ' AND ' + s,
      accent: hex,
      matches: (e) => e.color === c && e.shape === s
    };
  }
  if (r < 0.4) {
    const bad = pick(CNAMES, rng);
    return {
      lines: ['NOT ' + bad],
      badge: 'NOT ' + bad,
      accent: '#6a7a92',
      matches: (e) => e.color !== bad
    };
  }
  if (r < 0.54) {
    const badS = pick(SHAPES, rng);
    return {
      lines: ['NOT ' + badS],
      badge: 'NOT ' + badS,
      accent: '#6a7a92',
      matches: (e) => e.shape !== badS
    };
  }
  if (r < 0.66) {
    const c1 = pick(CNAMES, rng);
    let c2 = pick(CNAMES, rng);
    while (c2 === c1) c2 = pick(CNAMES, rng);
    return {
      lines: [c1 + ' OR ' + c2],
      badge: c1 + ' OR ' + c2,
      accent: '#2980b9',
      matches: (e) => e.color === c1 || e.color === c2
    };
  }
  if (r < 0.78) {
    const s1 = pick(SHAPES, rng);
    let s2 = pick(SHAPES, rng);
    while (s2 === s1) s2 = pick(SHAPES, rng);
    return {
      lines: [s1 + ' OR ' + s2],
      badge: s1 + ' OR ' + s2,
      accent: '#27ae60',
      matches: (e) => e.shape === s1 || e.shape === s2
    };
  }
  if (r < 0.9) {
    const c = pick(CNAMES, rng);
    const s = pick(SHAPES, rng);
    const hex = '#' + COLORS[c].toString(16).padStart(6, '0');
    return {
      lines: [c + ' AND NOT ' + s],
      badge: c + ' AND NOT ' + s,
      accent: hex,
      matches: (e) => e.color === c && e.shape !== s
    };
  }
  const cA = pick(CNAMES, rng);
  const sA = pick(SHAPES, rng);
  let cB = pick(CNAMES, rng);
  while (cB === cA) cB = pick(CNAMES, rng);
  const hexA = '#' + COLORS[cA].toString(16).padStart(6, '0');
  return {
    lines: ['(' + cA + ' AND ' + sA + ')', 'OR ' + cB],
    badge: '(' + cA + ' AND ' + sA + ') OR ' + cB,
    accent: hexA,
    matches: (e) => (e.color === cA && e.shape === sA) || e.color === cB
  };
}

/**
 * Mutates `list` until at least `min` entries satisfy `rule.matches`, if possible.
 * @param {{ color: string, shape: string }[]} list
 * @param {{ matches: (e: { color: string, shape: string }) => boolean }} rule
 * @param {number} min
 * @param {() => number} [rng]
 */
export function ensureMinimumMatches(list, rule, min, rng = Math.random) {
  for (let guard = 0; guard < 500; guard++) {
    const n = list.filter((e) => rule.matches(e)).length;
    if (n >= min) return;
    const i = Math.floor(rng() * list.length);
    let fixed = false;
    for (const c of CNAMES) {
      for (const s of SHAPES) {
        if (rule.matches({ color: c, shape: s })) {
          list[i] = { color: c, shape: s };
          fixed = true;
          break;
        }
      }
      if (fixed) break;
    }
  }
}
