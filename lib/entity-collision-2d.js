/**
 * XZ-plane overlap resolution between two disc-like solids (no Three.js).
 * Returns separation normal (from A toward B) and equal half-shifts along that axis.
 *
 * @param {number} ax
 * @param {number} az
 * @param {number} bx
 * @param {number} bz
 * @param {number} minSep center-to-center distance at which discs touch
 * @returns {{ nx: number, nz: number, ha: number, hb: number }} ha/hb are magnitudes to subtract from A / add to B along n
 */
export function xzOverlapSeparation(ax, az, bx, bz, minSep) {
  const dx = bx - ax;
  const dz = bz - az;
  const d2 = dx * dx + dz * dz;
  if (d2 < 1e-12) {
    return { nx: 1, nz: 0, ha: minSep * 0.26, hb: minSep * 0.26 };
  }
  const d = Math.sqrt(d2);
  if (d >= minSep) return { nx: 0, nz: 0, ha: 0, hb: 0 };
  /* Equal half-shifts so centers end exactly `minSep` apart (was 0.52 each → slight over-push). */
  const push = (minSep - d) * 0.5;
  const nx = dx / d;
  const nz = dz / d;
  return { nx, nz, ha: push, hb: push };
}
