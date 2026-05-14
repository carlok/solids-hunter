import { Color3 } from '@babylonjs/core';

export function color3ToRgbNumber(c: Color3): number {
  const r = Math.round(Math.min(1, Math.max(0, c.r)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, c.g)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, c.b)) * 255);
  return (r << 16) | (g << 8) | b;
}

/** Slight per-surface hue from base (deterministic from salt so layouts stay stable). */
export function envTintHex(base: number, salt: number): number {
  const u = Math.sin(salt * 12.9898) * 43758.5453;
  const v = Math.sin(salt * 78.233 + 2.1) * 43758.5453;
  const da = (u - Math.floor(u) - 0.5) * 0.1;
  const db = (v - Math.floor(v) - 0.5) * 0.09;
  const c = Color3.FromInts((base >> 16) & 0xff, (base >> 8) & 0xff, base & 0xff);
  c.r = Math.min(1, Math.max(0, c.r + da));
  c.g = Math.min(1, Math.max(0, c.g + db - da * 0.35));
  c.b = Math.min(1, Math.max(0, c.b - db * 0.25 + da * 0.2));
  return color3ToRgbNumber(c);
}

const _wallLo = new Color3();
const _wallHi = new Color3();
const _wallMix = new Color3();

/**
 * Wall color sampled between env style anchors, with light per-face jitter (salt).
 * If lo === hi, falls back to envTintHex on that tone.
 */
export function wallColorInPalette(
  colorLo: number,
  colorHi: number,
  salt: number,
): number {
  if (colorLo === colorHi) return envTintHex(colorLo, salt);
  _wallLo.copyFromFloats(
    ((colorLo >> 16) & 0xff) / 255,
    ((colorLo >> 8) & 0xff) / 255,
    (colorLo & 0xff) / 255,
  );
  _wallHi.copyFromFloats(
    ((colorHi >> 16) & 0xff) / 255,
    ((colorHi >> 8) & 0xff) / 255,
    (colorHi & 0xff) / 255,
  );
  const t = Math.sin(salt * 12.9898) * 43758.5453;
  const u = t - Math.floor(t);
  Color3.LerpToRef(_wallLo, _wallHi, u, _wallMix);
  const m = Math.sin(salt * 55.391 + 1.7) * 0.03;
  _wallMix.r = Math.min(1, Math.max(0, _wallMix.r + m));
  _wallMix.g = Math.min(1, Math.max(0, _wallMix.g - m * 0.35));
  _wallMix.b = Math.min(1, Math.max(0, _wallMix.b + m * 0.22));
  return color3ToRgbNumber(_wallMix);
}
