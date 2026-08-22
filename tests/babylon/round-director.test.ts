import { describe, expect, it } from 'vitest';

import {
  accuracyForRound,
  createRoundDirector,
  recordRound,
  ruleFamiliesForTier,
  ruleTierForClears,
  tuningForRound,
  type RoundDirectorState,
  type RoundResult,
} from '../../babylon/round-director';

const strong: RoundResult = {
  outcome: 'complete',
  correctHits: 4,
  wrongHits: 0,
  elapsedSeconds: 32,
};

const gameOver: RoundResult = {
  outcome: 'gameOver',
  correctHits: 0,
  wrongHits: 3,
  elapsedSeconds: 20,
};

/** Clear `n` rounds without letting the level/axis machinery drift. */
function afterClears(n: number): RoundDirectorState {
  let state = createRoundDirector();
  for (let i = 0; i < n; i++) state = recordRound(state, strong);
  return { ...state, level: 'standard', axis: 'rules', strongRounds: 0 };
}

describe('round director', () => {
  it('starts a session on the gentlest rung', () => {
    const start = createRoundDirector();
    expect(start).toEqual({
      level: 'standard',
      axis: 'rules',
      strongRounds: 0,
      clearedRounds: 0,
    });
    expect(tuningForRound(start)).toEqual({
      allowedRuleFamilies: ['and', 'notColor', 'notShape'],
    });
  });

  it('advances after two strong rounds and changes only the active axis', () => {
    const first = recordRound(createRoundDirector(), strong);
    expect(first).toMatchObject({ level: 'standard', axis: 'rules', strongRounds: 1 });
    const second = recordRound(first, strong);
    expect(second).toMatchObject({ level: 'challenge', axis: 'rules', strongRounds: 0 });
  });

  it('lowers difficulty without counting missed shots against the player', () => {
    const state = recordRound(createRoundDirector(), {
      outcome: 'complete',
      correctHits: 1,
      wrongHits: 2,
      elapsedSeconds: 40,
    });
    expect(state.level).toBe('assist');
    expect(
      accuracyForRound({ outcome: 'complete', correctHits: 0, wrongHits: 0, elapsedSeconds: 4 }),
    ).toBe(0);
  });

  it('rotates to one new axis after a challenge profile is mastered', () => {
    const challenge: RoundDirectorState = {
      level: 'challenge',
      axis: 'rules',
      strongRounds: 1,
      clearedRounds: 3,
    };
    expect(recordRound(challenge, strong)).toEqual({
      level: 'standard',
      axis: 'density',
      strongRounds: 0,
      clearedRounds: 4,
    });
  });

  it('wraps the axis rotation back to rules after decoys', () => {
    const mastered: RoundDirectorState = {
      level: 'challenge',
      axis: 'decoys',
      strongRounds: 1,
      clearedRounds: 2,
    };
    expect(recordRound(mastered, strong).axis).toBe('rules');
    const struggling: RoundDirectorState = {
      level: 'assist',
      axis: 'rules',
      strongRounds: 0,
      clearedRounds: 0,
    };
    expect(recordRound(struggling, gameOver).axis).toBe('decoys');
  });

  it('carries the rule ladder alongside whichever axis is active', () => {
    const base = afterClears(2);
    const families = tuningForRound(base).allowedRuleFamilies;

    expect(tuningForRound({ ...base, level: 'assist', axis: 'density' })).toEqual({
      allowedRuleFamilies: families,
      count: 14,
    });
    expect(tuningForRound({ ...base, level: 'challenge', axis: 'motion' })).toEqual({
      allowedRuleFamilies: families,
      moveModes: ['bounce', 'orbit', 'slide'],
    });
    expect(tuningForRound({ ...base, level: 'assist', axis: 'speed' })).toEqual({
      allowedRuleFamilies: families,
      speedMultiplier: 0.86,
    });
    expect(tuningForRound({ ...base, level: 'challenge', axis: 'decoys' })).toEqual({
      allowedRuleFamilies: families,
      nearMissBias: 0.65,
    });
  });
});

describe('rule ladder', () => {
  it('counts only cleared rounds, not attempts', () => {
    let state = createRoundDirector();
    state = recordRound(state, gameOver);
    expect(state.clearedRounds).toBe(0);
    state = recordRound(state, strong);
    expect(state.clearedRounds).toBe(1);
  });

  it('climbs a rung per clear and then holds at the top', () => {
    const tiers = [0, 1, 2, 3, 4, 5, 9].map((n) => ruleTierForClears(n));
    expect(tiers).toEqual([0, 1, 2, 3, 4, 4, 4]);
  });

  it('reaches the two-condition rules only at the top rungs', () => {
    expect(ruleFamiliesForTier(0)).not.toContain('doubleAnd');
    expect(ruleFamiliesForTier(0)).not.toContain('andOr');
    expect(ruleFamiliesForTier(3)).toContain('andOr');
    expect(ruleFamiliesForTier(4)).toContain('doubleAnd');
  });

  it('retires the near-trivial NOT rules once the player is past the early rungs', () => {
    // `NOT Purple` matches 24 of 28 pairs; keeping it in the top pool would
    // hand out rounds that are over before they start.
    expect(ruleFamiliesForTier(1)).toContain('notColor');
    expect(ruleFamiliesForTier(4)).not.toContain('notColor');
    expect(ruleFamiliesForTier(4)).not.toContain('notShape');
  });

  it('lets the rules axis nudge one rung either way without leaving the ladder', () => {
    expect(ruleTierForClears(2, -1)).toBe(1);
    expect(ruleTierForClears(2, 1)).toBe(3);
    expect(ruleTierForClears(0, -1)).toBe(0);
    expect(ruleTierForClears(99, 1)).toBe(4);
  });
});
