import { describe, expect, it } from 'vitest';

import { firstFocusIndex, nextFocusIndex, type FocusRect } from '../../babylon/menu-focus';

const box = (x: number, y: number, w = 100, h = 40): FocusRect => ({ x, y, w, h });

/** The arena screen: a row of three toggles, a 2x2 card grid, then the button. */
const envScreen: FocusRect[] = [
  box(200, 100, 80, 30), // sound
  box(300, 100, 80, 30), // ambient
  box(400, 100, 80, 30), // coach
  box(200, 200, 160, 120), // dungeon
  box(400, 200, 160, 120), // forest
  box(200, 340, 160, 120), // lab
  box(400, 340, 160, 120), // duomo
  box(280, 500, 200, 44), // enter
];

const [SOUND, AMBIENT, COACH, DUNGEON, FOREST, LAB, DUOMO, ENTER] = [0, 1, 2, 3, 4, 5, 6, 7];

describe('firstFocusIndex', () => {
  it('starts at the topmost, then leftmost, control', () => {
    expect(firstFocusIndex(envScreen)).toBe(SOUND);
  });

  it('reports nothing focusable for an empty menu', () => {
    expect(firstFocusIndex([])).toBe(-1);
  });
});

describe('nextFocusIndex', () => {
  it('walks a row horizontally', () => {
    expect(nextFocusIndex(envScreen, SOUND, 1, 0)).toBe(AMBIENT);
    expect(nextFocusIndex(envScreen, AMBIENT, 1, 0)).toBe(COACH);
    expect(nextFocusIndex(envScreen, COACH, -1, 0)).toBe(AMBIENT);
  });

  it('walks a grid vertically, staying in its column', () => {
    expect(nextFocusIndex(envScreen, DUNGEON, 0, 1)).toBe(LAB);
    expect(nextFocusIndex(envScreen, FOREST, 0, 1)).toBe(DUOMO);
    expect(nextFocusIndex(envScreen, DUOMO, 0, -1)).toBe(FOREST);
  });

  it('crosses between unrelated groups in the natural direction', () => {
    expect(nextFocusIndex(envScreen, SOUND, 0, 1)).toBe(DUNGEON);
    expect(nextFocusIndex(envScreen, LAB, 0, 1)).toBe(ENTER);
  });

  it('wraps within the row rather than diving into a nearby card', () => {
    // Forest sits slightly right of the coach toggle but far below it.
    expect(nextFocusIndex(envScreen, COACH, 1, 0)).toBe(SOUND);
    expect(nextFocusIndex(envScreen, SOUND, -1, 0)).toBe(COACH);
  });

  it('wraps back to the top when pushed past the last control', () => {
    expect([SOUND, AMBIENT, COACH]).toContain(nextFocusIndex(envScreen, ENTER, 0, 1));
  });

  it('strands no control: every one is reachable from every other', () => {
    for (let start = 0; start < envScreen.length; start++) {
      const seen = new Set<number>([start]);
      const queue = [start];
      while (queue.length) {
        const at = queue.shift()!;
        for (const [dx, dy] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          const next = nextFocusIndex(envScreen, at, dx, dy);
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size).toBe(envScreen.length);
    }
  });

  it('handles degenerate menus without moving anywhere odd', () => {
    expect(nextFocusIndex([], 0, 0, 1)).toBe(-1);
    expect(nextFocusIndex([box(0, 0)], 0, 0, 1)).toBe(0);
    expect(nextFocusIndex(envScreen, SOUND, 0, 0)).toBe(SOUND);
    expect(nextFocusIndex(envScreen, 99, 0, 1)).toBe(SOUND);
  });

  it('treats a diagonal push as horizontal rather than freezing', () => {
    expect(nextFocusIndex(envScreen, SOUND, 1, 1)).toBe(AMBIENT);
  });
});
