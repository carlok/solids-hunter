import type { MoveMode } from './entity-motion';

export type DirectorLevel = 'assist' | 'standard' | 'challenge';
export type DirectorAxis = 'rules' | 'density' | 'motion' | 'speed' | 'decoys';
export type RoundOutcome = 'complete' | 'gameOver';

export type RoundDirectorState = {
  level: DirectorLevel;
  axis: DirectorAxis;
  strongRounds: number;
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
const BASIC_RULES = ['and', 'notColor', 'notShape'];
const CHALLENGE_RULES = ['andNot', 'compound'];

export function createRoundDirector(): RoundDirectorState {
  return { level: 'standard', axis: 'rules', strongRounds: 0 };
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
  return { level: 'standard', axis: advanceAxis(state.axis), strongRounds: 0 };
}

export function tuningForRound(state: RoundDirectorState): RoundTuning {
  if (state.level === 'standard') return {};
  const assist = state.level === 'assist';
  switch (state.axis) {
    case 'rules':
      return { allowedRuleFamilies: assist ? BASIC_RULES : CHALLENGE_RULES };
    case 'density':
      return { count: assist ? 14 : 18 };
    case 'motion':
      return { moveModes: assist ? ['drift', 'bounce'] : ['bounce', 'orbit', 'slide'] };
    case 'speed':
      return { speedMultiplier: assist ? 0.86 : 1.14 };
    case 'decoys':
      return { nearMissBias: assist ? 0.15 : 0.65 };
  }
  return {};
}
