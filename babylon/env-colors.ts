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

const _drift = new Color3();

/**
 * Stronger per-instance tint for static props (trees, rubble, rocks).
 * `spread` scales RGB jitter in ~[0, 0.25].
 */
export function propColorDrift(base: number, salt: number, spread = 0.15): number {
  const u = Math.sin(salt * 12.9898 + 2.7) * 43758.5453;
  const v = Math.sin(salt * 78.233 + 5.1) * 43758.5453;
  const w = Math.sin(salt * 43.771 + 0.9) * 43758.5453;
  const dr = (u - Math.floor(u) - 0.5) * 2 * spread;
  const dg = (v - Math.floor(v) - 0.5) * 2 * spread;
  const db = (w - Math.floor(w) - 0.5) * 2 * spread;
  _drift.copyFromFloats(
    ((base >> 16) & 0xff) / 255,
    ((base >> 8) & 0xff) / 255,
    (base & 0xff) / 255,
  );
  _drift.r = Math.min(1, Math.max(0, _drift.r + dr - dg * 0.2));
  _drift.g = Math.min(1, Math.max(0, _drift.g + dg));
  _drift.b = Math.min(1, Math.max(0, _drift.b + db * 0.85 - dr * 0.12));
  return color3ToRgbNumber(_drift);
}

/** Deterministic index in `0..len-1` from a float salt (stable per position). */
export function palettePick(salt: number, len: number): number {
  if (len <= 1) return 0;
  const u = Math.sin(salt * 19.9898 + 1.3) * 43758.5453;
  return Math.floor((u - Math.floor(u)) * len) % len;
}
