import { describe, it, expect } from 'vitest';
import { xzOverlapSeparation } from '../js/lib/entity-collision-2d.js';

describe('xzOverlapSeparation', () => {
  it('returns zero shift when discs are separated', () => {
    const r = xzOverlapSeparation(0, 0, 5, 0, 2);
    expect(r.ha).toBe(0);
    expect(r.hb).toBe(0);
  });

  it('returns non-zero push when overlapping', () => {
    const r = xzOverlapSeparation(0, 0, 1, 0, 2);
    expect(r.ha).toBeGreaterThan(0);
    expect(r.hb).toBeGreaterThan(0);
    expect(r.nx).toBeCloseTo(1, 5);
    expect(r.nz).toBeCloseTo(0, 5);
  });

  it('separation brings centers to exactly minSep apart on X axis', () => {
    const minSep = 2;
    const r = xzOverlapSeparation(0, 0, 1, 0, minSep);
    const ax = 0 - r.nx * r.ha;
    const bx = 1 + r.nx * r.hb;
    expect(Math.hypot(bx - ax, 0)).toBeCloseTo(minSep, 5);
  });

  it('handles coincident centers with arbitrary stable normal', () => {
    const r = xzOverlapSeparation(3, 3, 3, 3, 1.2);
    expect(r.ha).toBeGreaterThan(0);
    expect(Math.hypot(r.nx, r.nz)).toBeCloseTo(1, 5);
  });
});
