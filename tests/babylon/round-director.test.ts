import { describe, expect, it } from 'vitest';

import {
  accuracyForRound,
  createRoundDirector,
  recordRound,
  tuningForRound,
  type RoundResult,
} from '../../babylon/round-director';

const strong: RoundResult = {
  outcome: 'complete',
  correctHits: 4,
  wrongHits: 0,
  elapsedSeconds: 32,
};

describe('round director', () => {
  it('starts at the unchanged standard profile', () => {
    expect(createRoundDirector()).toEqual({ level: 'standard', axis: 'rules', strongRounds: 0 });
    expect(tuningForRound(createRoundDirector())).toEqual({});
  });

  it('advances after two strong rounds and changes only the active axis', () => {
    const first = recordRound(createRoundDirector(), strong);
    expect(first).toMatchObject({ level: 'standard', axis: 'rules', strongRounds: 1 });
    const second = recordRound(first, strong);
    expect(second).toMatchObject({ level: 'challenge', axis: 'rules', strongRounds: 0 });
    expect(tuningForRound(second)).toEqual({ allowedRuleFamilies: ['andNot', 'compound'] });
  });

  it('lowers difficulty without counting missed shots against the player', () => {
    const state = recordRound(createRoundDirector(), {
      outcome: 'complete',
      correctHits: 1,
      wrongHits: 2,
      elapsedSeconds: 40,
    });
    expect(state.level).toBe('assist');
    expect(accuracyForRound({ outcome: 'complete', correctHits: 0, wrongHits: 0, elapsedSeconds: 4 })).toBe(0);
  });

  it('rotates to one new axis after a challenge profile is mastered', () => {
    const challenge = { level: 'challenge' as const, axis: 'rules' as const, strongRounds: 1 };
    const next = recordRound(challenge, strong);
    expect(next).toEqual({ level: 'standard', axis: 'density', strongRounds: 0 });
  });

  it('tunes decoy composition on its own axis', () => {
    expect(tuningForRound({ level: 'challenge', axis: 'decoys', strongRounds: 0 })).toEqual({
      nearMissBias: 0.65,
    });
    expect(tuningForRound({ level: 'assist', axis: 'decoys', strongRounds: 0 })).toEqual({
      nearMissBias: 0.15,
    });
    expect(tuningForRound({ level: 'standard', axis: 'decoys', strongRounds: 0 })).toEqual({});
  });

  it('wraps the axis rotation back to rules after decoys', () => {
    const mastered = { level: 'challenge' as const, axis: 'decoys' as const, strongRounds: 1 };
    expect(recordRound(mastered, strong)).toEqual({
      level: 'standard',
      axis: 'rules',
      strongRounds: 0,
    });
    const struggling = { level: 'assist' as const, axis: 'rules' as const, strongRounds: 0 };
    expect(
      recordRound(struggling, { outcome: 'gameOver', correctHits: 0, wrongHits: 3, elapsedSeconds: 20 }).axis,
    ).toBe('decoys');
  });

  it('keeps every nonstandard adjustment on exactly one axis', () => {
    expect(tuningForRound({ level: 'assist', axis: 'density', strongRounds: 0 })).toEqual({ count: 14 });
    expect(tuningForRound({ level: 'challenge', axis: 'motion', strongRounds: 0 })).toEqual({
      moveModes: ['bounce', 'orbit', 'slide'],
    });
    expect(tuningForRound({ level: 'assist', axis: 'speed', strongRounds: 0 })).toEqual({
      speedMultiplier: 0.86,
    });
  });
});
