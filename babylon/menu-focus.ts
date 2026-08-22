/**
 * Geometry-driven focus movement for gamepad menu navigation.
 *
 * Menus in this game are laid out very differently from one another — a 2x2
 * arena grid, a horizontal row of toggles, vertical button stacks, a floating
 * nav button in the corner. Hardcoding an order per screen means every new
 * control has to be remembered in a second place, which is how the previous
 * pass ended up with half the menus unreachable.
 *
 * Instead the caller hands over the on-screen rectangles and a direction, and
 * this picks whatever a player would say is "next" that way. It is pure, so it
 * can be tested without a DOM.
 */

export type FocusRect = { x: number; y: number; w: number; h: number };

/** Off-axis drift costs more than on-axis distance, so rows and columns hold together. */
const PERPENDICULAR_PENALTY = 2.5;
/** Centres closer than this on the primary axis count as the same row/column. */
const SAME_LINE_EPSILON = 1;

function centre(rect: FocusRect): { cx: number; cy: number } {
  return { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };
}

/** Do two rects share any extent on the axis we are *not* travelling along? */
function sharesLine(a: FocusRect, b: FocusRect, horizontal: boolean): boolean {
  const [aLo, aHi] = horizontal ? [a.y, a.y + a.h] : [a.x, a.x + a.w];
  const [bLo, bHi] = horizontal ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
  return aLo <= bHi && bLo <= aHi;
}

/** Reading order: top to bottom, then left to right. */
export function firstFocusIndex(rects: readonly FocusRect[]): number {
  if (!rects.length) return -1;
  let best = 0;
  let bestKey = Infinity;
  rects.forEach((rect, i) => {
    const { cx, cy } = centre(rect);
    const key = cy * 10000 + cx;
    if (key < bestKey) {
      bestKey = key;
      best = i;
    }
  });
  return best;
}

/**
 * Index to focus after a directional press, or `current` when there is nowhere
 * to go. Exactly one of `dx`/`dy` should be non-zero; a diagonal resolves to
 * the horizontal.
 *
 * Resolved in order of how a player reads the screen:
 *   1. the nearest control ahead that shares this row or column
 *   2. failing that, wrap to the far end of the same row or column
 *   3. failing that, the nearest control ahead anywhere, off-axis penalised
 *
 * Step 1 before step 3 is what stops "right" at the end of a toggle row from
 * diving into a card that happens to sit slightly to the right and far below.
 */
export function nextFocusIndex(
  rects: readonly FocusRect[],
  current: number,
  dx: number,
  dy: number,
): number {
  if (rects.length === 0) return -1;
  if (rects.length === 1) return 0;
  if (current < 0 || current >= rects.length) return firstFocusIndex(rects);

  const horizontal = dx !== 0;
  const dir = horizontal ? Math.sign(dx) : Math.sign(dy);
  if (dir === 0) return current;

  const self = rects[current]!;
  const from = centre(self);
  const fromPrimary = horizontal ? from.cx : from.cy;
  const fromPerp = horizontal ? from.cy : from.cx;

  let aheadInLine = -1;
  let aheadInLineScore = Infinity;
  let wrapInLine = -1;
  let wrapInLineScore = Infinity;
  let aheadAnywhere = -1;
  let aheadAnywhereScore = Infinity;

  rects.forEach((rect, i) => {
    if (i === current) return;
    const to = centre(rect);
    const primary = horizontal ? to.cx : to.cy;
    const perp = horizontal ? to.cy : to.cx;
    const alongDir = (primary - fromPrimary) * dir;
    const perpDelta = Math.abs(perp - fromPerp);
    const inLine = sharesLine(self, rect, horizontal);

    if (alongDir > SAME_LINE_EPSILON) {
      if (inLine && alongDir < aheadInLineScore) {
        aheadInLineScore = alongDir;
        aheadInLine = i;
      }
      const score = alongDir + perpDelta * PERPENDICULAR_PENALTY;
      if (score < aheadAnywhereScore) {
        aheadAnywhereScore = score;
        aheadAnywhere = i;
      }
      return;
    }

    /** Furthest back along this row or column: where a wrap lands. */
    if (inLine && alongDir < wrapInLineScore) {
      wrapInLineScore = alongDir;
      wrapInLine = i;
    }
  });

  if (aheadInLine >= 0) return aheadInLine;
  if (wrapInLine >= 0) return wrapInLine;
  return aheadAnywhere >= 0 ? aheadAnywhere : current;
}
