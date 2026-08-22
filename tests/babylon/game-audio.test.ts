import { describe, expect, it } from 'vitest';

import { hitPlaybackRate } from '../../babylon/game-audio';

describe('hitPlaybackRate', () => {
  it('keeps hit sound variation within restrained, deterministic bounds', () => {
    expect(hitPlaybackRate('correct', 0)).toBe(0.96);
    expect(hitPlaybackRate('correct', 1)).toBe(1.04);
    expect(hitPlaybackRate('wrong', 0)).toBe(0.94);
    expect(hitPlaybackRate('wrong', 1)).toBe(1.04);
  });

  it('clamps unexpected random values', () => {
    expect(hitPlaybackRate('correct', -1)).toBe(0.96);
    expect(hitPlaybackRate('wrong', 2)).toBe(1.04);
  });
});
