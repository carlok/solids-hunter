/**
 * Pure hunt-rule logic (no Three.js). Shared by the game client and unit tests.
 */

export const COLORS = {
  Red: 0xff2d2d,
  Blue: 0x0033cc,
  Green: 0x00c853,
  Yellow: 0xffd600,
  Purple: 0xb000ff,
  Cyan: 0x00ffff,
  White: 0xffffff
};

export const CNAMES = Object.keys(COLORS);
export const SHAPES = ['Sphere', 'Tetrahedron', 'Cube', 'Cylinder'];
export const MOVE_MODES = ['drift', 'bounce', 'orbit', 'slide'];
export const RULE_FAMILIES = [
  'and',
  'notColor',
  'notShape',
  'orColor',
  'orShape',
  'andNot',
  'compound',
  'andOr',
  'doubleAnd'
];

/** @param {unknown[]} arr @param {() => number} [rng] */
export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Random boolean rule (simple or compound). `matches` is satisfiable
 * by some (color, shape) pairs from CNAMES × SHAPES.
 * @param {() => number} [rng] same contract as Math.random — returns [0, 1)
 * @param {string[]} [allowedFamilies] optional director-selected rule families
 */
export function generateHuntRuleForFamily(family, rng = Math.random) {
  switch (family) {
    case 'and': {
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
    case 'notColor': {
    const bad = pick(CNAMES, rng);
    return {
      lines: ['NOT ' + bad],
      badge: 'NOT ' + bad,
      accent: '#6a7a92',
      matches: (e) => e.color !== bad
    };
    }
    case 'notShape': {
    const badS = pick(SHAPES, rng);
    return {
      lines: ['NOT ' + badS],
      badge: 'NOT ' + badS,
      accent: '#6a7a92',
      matches: (e) => e.shape !== badS
    };
    }
    case 'orColor': {
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
    case 'orShape': {
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
    case 'andNot': {
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
    case 'andOr': {
      const c = pick(CNAMES, rng);
      const s1 = pick(SHAPES, rng);
      let s2 = pick(SHAPES, rng);
      while (s2 === s1) s2 = pick(SHAPES, rng);
      const hex = '#' + COLORS[c].toString(16).padStart(6, '0');
      return {
        lines: [c + ' AND', '(' + s1 + ' OR ' + s2 + ')'],
        badge: c + ' AND (' + s1 + ' OR ' + s2 + ')',
        accent: hex,
        matches: (e) => e.color === c && (e.shape === s1 || e.shape === s2)
      };
    }
    case 'doubleAnd': {
      const cA = pick(CNAMES, rng);
      const sA = pick(SHAPES, rng);
      let cB = pick(CNAMES, rng);
      while (cB === cA) cB = pick(CNAMES, rng);
      let sB = pick(SHAPES, rng);
      while (sB === sA) sB = pick(SHAPES, rng);
      const hexA = '#' + COLORS[cA].toString(16).padStart(6, '0');
      return {
        lines: ['(' + cA + ' AND ' + sA + ')', 'OR (' + cB + ' AND ' + sB + ')'],
        badge: '(' + cA + ' AND ' + sA + ') OR (' + cB + ' AND ' + sB + ')',
        accent: hexA,
        matches: (e) =>
          (e.color === cA && e.shape === sA) || (e.color === cB && e.shape === sB)
      };
    }
    case 'compound': {
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
    default:
      return generateHuntRuleForFamily('and', rng);
  }
}

export function generateHuntRule(rng = Math.random, allowedFamilies) {
  if (allowedFamilies?.length) return generateHuntRuleForFamily(pick(allowedFamilies, rng), rng);

  const r = rng();
  if (r < 0.24) return generateHuntRuleForFamily('and', rng);
  if (r < 0.4) return generateHuntRuleForFamily('notColor', rng);
  if (r < 0.54) return generateHuntRuleForFamily('notShape', rng);
  if (r < 0.66) return generateHuntRuleForFamily('orColor', rng);
  if (r < 0.78) return generateHuntRuleForFamily('orShape', rng);
  if (r < 0.9) return generateHuntRuleForFamily('andNot', rng);
  return generateHuntRuleForFamily('compound', rng);
}

/**
 * Every (color, shape) pair the game can spawn, in a stable order.
 * @returns {{ color: string, shape: string }[]}
 */
export function allPairs() {
  const out = [];
  for (const color of CNAMES) {
    for (const shape of SHAPES) out.push({ color, shape });
  }
  return out;
}

/**
 * Split the 28 spawnable pairs into matching / near-miss / far buckets.
 *
 * A pair is a **near miss** when it fails the rule but differs from some
 * matching pair in exactly one attribute — i.e. it satisfies "half" of what
 * the rule asks for. Those are the decoys that make a round genuinely hard.
 * Derived from `rule.matches` alone, so it works for any rule family.
 *
 * @param {{ matches: (e: { color: string, shape: string }) => boolean }} rule
 * @returns {{ matching: {color:string,shape:string}[], near: {color:string,shape:string}[], far: {color:string,shape:string}[] }}
 */
export function classifyPairs(rule) {
  const pairs = allPairs();
  const matching = [];
  const rest = [];
  for (const p of pairs) {
    if (rule.matches(p)) matching.push(p);
    else rest.push(p);
  }

  const near = [];
  const far = [];
  for (const p of rest) {
    const isNear = matching.some((m) => (m.color === p.color) !== (m.shape === p.shape));
    if (isNear) near.push(p);
    else far.push(p);
  }
  return { matching, near, far };
}

/**
 * Build a round's spawn list, optionally skewing the non-matching solids
 * toward near-miss decoys.
 *
 * `nearMissBias` is the share of decoys drawn from the near-miss bucket:
 * `0` avoids them, `1` uses only them. Passing `undefined` reproduces the
 * historical uniform draw over CNAMES x SHAPES exactly, so the default
 * difficulty level is unchanged.
 *
 * @param {number} count
 * @param {{ matches: (e: { color: string, shape: string }) => boolean }} rule
 * @param {number} [nearMissBias]
 * @param {() => number} [rng]
 * @returns {{ color: string, shape: string }[]}
 */
export function buildSpawnList(count, rule, nearMissBias, rng = Math.random) {
  if (typeof nearMissBias !== 'number') {
    const uniform = Array.from({ length: count }, () => ({
      shape: SHAPES[Math.floor(rng() * SHAPES.length)],
      color: CNAMES[Math.floor(rng() * CNAMES.length)]
    }));
    ensureMinimumMatches(uniform, rule, 3, rng);
    return uniform;
  }

  const bias = Math.min(1, Math.max(0, nearMissBias));
  const { matching, near, far } = classifyPairs(rule);
  const total = matching.length + near.length + far.length;
  /**
   * Two levers off the same knob. Which decoys appear (near-miss vs far) only
   * varies for rules that have both kinds — `AND` and `AND NOT`. How *many*
   * decoys appear works for every family, so `NOT` / `OR` / compound rounds
   * still respond to the director. `ensureMinimumMatches` still guarantees the
   * round is clearable, exactly as it does for the uniform draw.
   */
  const natural = matching.length / total;
  const matchShare = Math.min(0.95, natural * (1.5 - 1.1 * bias));

  const list = [];
  for (let i = 0; i < count; i++) {
    if (matching.length && rng() < matchShare) {
      list.push({ ...pick(matching, rng) });
      continue;
    }
    let pool = near.length && far.length ? (rng() < bias ? near : far) : (near.length ? near : far);
    if (!pool.length) pool = matching.length ? matching : allPairs();
    list.push({ ...pick(pool, rng) });
  }
  ensureMinimumMatches(list, rule, 3, rng);
  return list;
}

/**
 * Mutates `list` until at least `min` entries satisfy `rule.matches`, if possible.
 * Replacements are drawn at random from the matching set so forced matches are
 * not all identical clones.
 * @param {{ color: string, shape: string }[]} list
 * @param {{ matches: (e: { color: string, shape: string }) => boolean }} rule
 * @param {number} min
 * @param {() => number} [rng]
 */
export function ensureMinimumMatches(list, rule, min, rng = Math.random) {
  const matching = allPairs().filter((p) => rule.matches(p));
  if (!matching.length) return;
  for (let guard = 0; guard < 500; guard++) {
    const n = list.filter((e) => rule.matches(e)).length;
    if (n >= min) return;
    const i = Math.floor(rng() * list.length);
    if (rule.matches(list[i])) continue;
    list[i] = { ...pick(matching, rng) };
  }
}
