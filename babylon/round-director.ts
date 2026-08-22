import type { MoveMode } from './entity-motion';

export type DirectorLevel = 'assist' | 'standard' | 'challenge';
export type DirectorAxis = 'rules' | 'density' | 'motion' | 'speed' | 'decoys';
export type RoundOutcome = 'complete' | 'gameOver';

export type RoundDirectorState = {
  level: DirectorLevel;
  axis: DirectorAxis;
  strongRounds: number;
  /** Rounds actually cleared this session. Drives the rule-complexity ladder. */
  clearedRounds: number;
};

export type RoundResult = {
  outcome: RoundOutcome;
  correctHits: number;
  wrongHits: number;
  elapsedSeconds: number;
};

export type RoundTuning = {
  allowedRuleFamilies?: string[];
  count?: number;
  moveModes?: readonly MoveMode[];
  speedMultiplier?: number;
  /** Share of decoys drawn from the near-miss set; also scales how many targets spawn. */
  nearMissBias?: number;
};

const AXES: readonly DirectorAxis[] = ['rules', 'density', 'motion', 'speed', 'decoys'];

/**
 * Rule-complexity ladder, climbed one rung per round cleared.
 *
 * Each rung does not merely add harder families — it also drops the ones that
 * have stopped asking anything. `NOT Purple` matches 24 of the 28 spawnable
 * pairs, so leaving it in the pool at the top would keep handing out rounds
 * that are over before they start. The last two rungs are where the genuinely
 * two-condition rules live.
 */
const RULE_LADDER: readonly (readonly string[])[] = [
  ['and', 'notColor', 'notShape'],
  ['and', 'notColor', 'notShape', 'orColor', 'orShape'],
  ['and', 'orColor', 'orShape', 'andNot'],
  ['and', 'orShape', 'andNot', 'compound', 'andOr'],
  ['andNot', 'compound', 'andOr', 'doubleAnd'],
];

export function createRoundDirector(): RoundDirectorState {
  return { level: 'standard', axis: 'rules', strongRounds: 0, clearedRounds: 0 };
}

/** Ladder rung for a session, clamped to the ends. */
export function ruleTierForClears(clearedRounds: number, shift = 0): number {
  const tier = Math.min(RULE_LADDER.length - 1, Math.max(0, clearedRounds)) + shift;
  return Math.min(RULE_LADDER.length - 1, Math.max(0, tier));
}

export function ruleFamiliesForTier(tier: number): readonly string[] {
  return RULE_LADDER[Math.min(RULE_LADDER.length - 1, Math.max(0, tier))]!;
}

export function accuracyForRound(result: RoundResult): number {
  const attempts = result.correctHits + result.wrongHits;
  return attempts === 0 ? 0 : result.correctHits / attempts;
}

function advanceAxis(axis: DirectorAxis): DirectorAxis {
  return AXES[(AXES.indexOf(axis) + 1) % AXES.length]!;
}

function retreatAxis(axis: DirectorAxis): DirectorAxis {
  return AXES[(AXES.indexOf(axis) + AXES.length - 1) % AXES.length]!;
}

export function recordRound(state: RoundDirectorState, result: RoundResult): RoundDirectorState {
  const accuracy = accuracyForRound(result);
  const cleared = state.clearedRounds + (result.outcome === 'complete' ? 1 : 0);
  state = { ...state, clearedRounds: cleared };
  const needsAssist = result.outcome === 'gameOver' || accuracy < 0.55;
  if (needsAssist) {
    if (state.level === 'challenge') return { ...state, level: 'standard', strongRounds: 0 };
    if (state.level === 'standard') return { ...state, level: 'assist', strongRounds: 0 };
    return { ...state, axis: retreatAxis(state.axis), strongRounds: 0 };
  }

  const strong = result.outcome === 'complete' && accuracy >= 0.8 && result.elapsedSeconds <= 60;
  if (!strong) return { ...state, strongRounds: 0 };
  if (state.strongRounds < 1) return { ...state, strongRounds: state.strongRounds + 1 };
  if (state.level === 'assist') return { ...state, level: 'standard', strongRounds: 0 };
  if (state.level === 'standard') return { ...state, level: 'challenge', strongRounds: 0 };
  return { ...state, level: 'standard', axis: advanceAxis(state.axis), strongRounds: 0 };
}

export function tuningForRound(state: RoundDirectorState): RoundTuning {
  const assist = state.level === 'assist';
  /**
   * The rule ladder applies at every level — clearing rounds is what makes the
   * boolean harder. The `rules` axis only nudges a rung either side of it.
   */
  const rulesAxis = state.axis === 'rules' && state.level !== 'standard';
  const shift = rulesAxis ? (assist ? -1 : 1) : 0;
  const allowedRuleFamilies = [...ruleFamiliesForTier(ruleTierForClears(state.clearedRounds, shift))];

  if (state.level === 'standard') return { allowedRuleFamilies };
  switch (state.axis) {
    case 'rules':
      return { allowedRuleFamilies };
    case 'density':
      return { allowedRuleFamilies, count: assist ? 14 : 18 };
    case 'motion':
      return {
        allowedRuleFamilies,
        moveModes: assist ? ['drift', 'bounce'] : ['bounce', 'orbit', 'slide'],
      };
    case 'speed':
      return { allowedRuleFamilies, speedMultiplier: assist ? 0.86 : 1.14 };
    case 'decoys':
      return { allowedRuleFamilies, nearMissBias: assist ? 0.15 : 0.65 };
  }
  return { allowedRuleFamilies };
}
