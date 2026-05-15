import { describe, it, expect } from 'vitest';
import { Color3 } from '@babylonjs/core';

import {
  color3ToRgbNumber,
  envTintHex,
  palettePick,
  propColorDrift,
  wallColorInPalette,
} from '../../babylon/env-colors';

describe('color3ToRgbNumber', () => {
  it('packs white and black', () => {
    expect(color3ToRgbNumber(new Color3(1, 1, 1))).toBe(0xffffff);
    expect(color3ToRgbNumber(new Color3(0, 0, 0))).toBe(0);
  });

  it('clamps channels', () => {
    expect(color3ToRgbNumber(new Color3(1.5, -0.2, 0.5))).toBe(0xff0080);
  });
});

describe('envTintHex', () => {
  it('is stable for the same salt', () => {
    expect(envTintHex(0x112233, 42)).toBe(envTintHex(0x112233, 42));
  });
});

describe('wallColorInPalette', () => {
  it('delegates to envTint when anchors match', () => {
    expect(wallColorInPalette(0x223344, 0x223344, 7)).toBe(envTintHex(0x223344, 7));
  });

  it('varies between different salts when range is non-trivial', () => {
    const a = wallColorInPalette(0x101010, 0xf0f0f0, 0);
    const b = wallColorInPalette(0x101010, 0xf0f0f0, 500);
    expect(typeof a).toBe('number');
    expect(typeof b).toBe('number');
    expect(a).not.toBe(b);
  });
});

describe('propColorDrift', () => {
  it('is stable for the same base, salt, and spread', () => {
    expect(propColorDrift(0x446633, 12, 0.2)).toBe(propColorDrift(0x446633, 12, 0.2));
  });

  it('keeps channels clamped with wide spread', () => {
    const color = propColorDrift(0x0101fe, 99, 1);
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThanOrEqual(0xffffff);
  });
});

describe('palettePick', () => {
  it('returns zero for empty or single-entry palettes', () => {
    expect(palettePick(4, 0)).toBe(0);
    expect(palettePick(4, 1)).toBe(0);
  });

  it('returns an in-range deterministic index', () => {
    const picked = palettePick(123, 5);
    expect(picked).toBe(palettePick(123, 5));
    expect(picked).toBeGreaterThanOrEqual(0);
    expect(picked).toBeLessThan(5);
  });
});
