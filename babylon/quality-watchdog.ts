/**
 * Decides when to shed rendering quality on hardware that cannot hold the
 * frame rate.
 *
 * The decision is kept here, pure and free of Babylon, because the two bugs
 * this logic has already shipped were both invisible by inspection: it was fed
 * a clamped delta and so measured a 10fps device as 20fps, and it re-armed its
 * warm-up on every round boundary so a brisk player never completed a single
 * measurement window. Both are the kind of thing a test catches and a reading
 * does not.
 *
 * The caller owns the actual downgrades; this only says how many to apply.
 */

export const QUALITY_TARGET_FPS = 45;
/**
 * Below this the device is not struggling, it is unplayable. One window this
 * low skips the polite one-step-at-a-time ladder, so a hopeless machine becomes
 * playable in seconds rather than after half a minute of stutter.
 */
export const QUALITY_DESPERATE_FPS = 22;
/** Steps applied at once when a window comes in below the desperate threshold. */
export const QUALITY_DESPERATE_STEPS = 3;
export const QUALITY_SAMPLE_SECONDS = 2;
/** Skipped after a downgrade so the next window measures the new settings. */
export const QUALITY_SETTLE_SECONDS = 3;
/**
 * Shader compilation makes the opening seconds slow on every machine, fast ones
 * included. Measuring through that would strip effects from hardware that never
 * needed it. Charged once per session, not once per round.
 */
export const QUALITY_WARMUP_SECONDS = 5;
/**
 * Consecutive failing windows required before stepping down. A single stall —
 * a GC pause, a texture decode, another tab in the same process — should not
 * permanently cost a quality tier.
 */
export const QUALITY_STRIKES = 2;

export type WatchdogState = {
  /** Seconds accumulated into the open measurement window. */
  window: number;
  /** Frames counted in the open window. */
  frames: number;
  /** Consecutive failing windows so far. */
  strikes: number;
  /** Seconds left to skip before measuring again. */
  settle: number;
  /** Whether the one-off warm-up has been served. */
  warmedUp: boolean;
};

export type WatchdogTick = {
  /** Wall-clock seconds since the previous frame. NOT a clamped simulation delta. */
  realDt: number;
  /** False when the tab is hidden or play is not running; measuring is meaningless. */
  measurable: boolean;
};

export function createWatchdogState(): WatchdogState {
  return { window: 0, frames: 0, strikes: 0, settle: QUALITY_WARMUP_SECONDS, warmedUp: false };
}

export function createWatchdogStateForTest(overrides: Partial<WatchdogState> = {}): WatchdogState {
  return { ...createWatchdogState(), ...overrides };
}

/** How many quality steps the caller should apply, and the state to carry on with. */
export function tickWatchdog(
  state: WatchdogState,
  tick: WatchdogTick,
): { state: WatchdogState; applySteps: number } {
  if (!tick.measurable) {
    return {
      state: {
        ...state,
        window: 0,
        frames: 0,
        strikes: 0,
        /** Only the first settle is a warm-up. `measurable` goes false at every
         *  round end, and re-arming there starved the measurement entirely. */
        settle: state.warmedUp ? state.settle : QUALITY_WARMUP_SECONDS,
      },
      applySteps: 0,
    };
  }

  if (state.settle > 0) {
    return { state: { ...state, settle: state.settle - tick.realDt }, applySteps: 0 };
  }

  const window = state.window + tick.realDt;
  const frames = state.frames + 1;
  const warmedUp = true;

  if (window < QUALITY_SAMPLE_SECONDS) {
    return { state: { ...state, window, frames, warmedUp }, applySteps: 0 };
  }

  const averageFps = frames / window;
  const closed: WatchdogState = { ...state, window: 0, frames: 0, warmedUp };

  if (averageFps >= QUALITY_TARGET_FPS) {
    return { state: { ...closed, strikes: 0 }, applySteps: 0 };
  }

  if (averageFps < QUALITY_DESPERATE_FPS) {
    return {
      state: { ...closed, strikes: 0, settle: QUALITY_SETTLE_SECONDS },
      applySteps: QUALITY_DESPERATE_STEPS,
    };
  }

  const strikes = state.strikes + 1;
  if (strikes < QUALITY_STRIKES) {
    return { state: { ...closed, strikes }, applySteps: 0 };
  }
  return { state: { ...closed, strikes: 0, settle: QUALITY_SETTLE_SECONDS }, applySteps: 1 };
}
