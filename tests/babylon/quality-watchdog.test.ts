import { describe, expect, it } from 'vitest';

import {
  createWatchdogState,
  createWatchdogStateForTest,
  QUALITY_DESPERATE_STEPS,
  QUALITY_SAMPLE_SECONDS,
  QUALITY_WARMUP_SECONDS,
  tickWatchdog,
  type WatchdogState,
} from '../../babylon/quality-watchdog';

/** Run `seconds` of play at a steady frame rate; returns state and total steps. */
function play(
  state: WatchdogState,
  fps: number,
  seconds: number,
  measurable = true,
): { state: WatchdogState; applied: number } {
  const realDt = 1 / fps;
  let applied = 0;
  for (let t = 0; t < seconds; t += realDt) {
    const out = tickWatchdog(state, { realDt, measurable });
    state = out.state;
    applied += out.applySteps;
  }
  return { state, applied };
}

describe('quality watchdog', () => {
  it('leaves a machine that holds the target frame rate completely alone', () => {
    const { applied } = play(createWatchdogState(), 60, 120);
    expect(applied).toBe(0);
  });

  it('measures wall-clock time, so a 10fps device reads as 10fps', () => {
    // The original bug: the caller passed a delta clamped to 0.05s, which made
    // this read 20fps for a 10fps device and doubled every timer below.
    let state = createWatchdogStateForTest({ settle: 0, warmedUp: true });
    const realDt = 1 / 10;
    let closed = false;
    for (let i = 0; i < 40 && !closed; i++) {
      const before = state;
      const out = tickWatchdog(state, { realDt, measurable: true });
      state = out.state;
      if (out.state.window === 0 && before.window > 0) closed = true;
    }
    expect(closed).toBe(true);
    // 10fps is below the desperate threshold, so the window must act hard.
    const { applied } = play(
      createWatchdogStateForTest({ settle: 0, warmedUp: true }),
      10,
      QUALITY_SAMPLE_SECONDS + 0.5,
    );
    expect(applied).toBe(QUALITY_DESPERATE_STEPS);
  });

  it('does not step down on a single bad window', () => {
    const state = createWatchdogStateForTest({ settle: 0, warmedUp: true });
    // One failing window only, then recovery.
    const bad = play(state, 35, QUALITY_SAMPLE_SECONDS + 0.1);
    expect(bad.applied).toBe(0);
    expect(bad.state.strikes).toBe(1);
    const good = play(bad.state, 60, QUALITY_SAMPLE_SECONDS + 0.1);
    expect(good.applied).toBe(0);
    expect(good.state.strikes).toBe(0);
  });

  it('steps down after two consecutive bad windows', () => {
    const state = createWatchdogStateForTest({ settle: 0, warmedUp: true });
    const { applied } = play(state, 35, (QUALITY_SAMPLE_SECONDS + 0.1) * 2);
    expect(applied).toBe(1);
  });

  it('drops several tiers at once when the device is hopeless', () => {
    const state = createWatchdogStateForTest({ settle: 0, warmedUp: true });
    const { applied } = play(state, 8, QUALITY_SAMPLE_SECONDS + 0.5);
    // No strike accumulation required — one window is enough.
    expect(applied).toBe(QUALITY_DESPERATE_STEPS);
  });

  it('serves the warm-up once per session, not once per round', () => {
    // The original bug: every round end reset the warm-up, so a player clearing
    // rounds quickly never completed a measurement window.
    let state = createWatchdogState();
    expect(state.settle).toBe(QUALITY_WARMUP_SECONDS);

    // Play through the warm-up.
    state = play(state, 60, QUALITY_WARMUP_SECONDS + 1).state;
    expect(state.warmedUp).toBe(true);

    // Round ends: not measurable for a moment.
    state = play(state, 60, 0.5, false).state;
    expect(state.settle).toBeLessThanOrEqual(0);

    // Next round on a slow device must be able to act without re-warming.
    const { applied } = play(state, 8, QUALITY_SAMPLE_SECONDS + 0.5);
    expect(applied).toBe(QUALITY_DESPERATE_STEPS);
  });

  it('never measures a hidden tab, whose rAF is throttled to about 1Hz', () => {
    // Without this guard a backgrounded tab looks like a 1fps device and strips
    // every effect from hardware that was doing fine.
    const state = createWatchdogStateForTest({ settle: 0, warmedUp: true });
    const { applied } = play(state, 1, 60, false);
    expect(applied).toBe(0);
  });

  it('discards a partial window when play stops', () => {
    let state = createWatchdogStateForTest({ settle: 0, warmedUp: true });
    state = play(state, 30, 1).state;
    expect(state.frames).toBeGreaterThan(0);
    state = tickWatchdog(state, { realDt: 0.016, measurable: false }).state;
    expect(state.frames).toBe(0);
    expect(state.window).toBe(0);
    expect(state.strikes).toBe(0);
  });

  it('settles after a downgrade so the next window measures the new settings', () => {
    const state = createWatchdogStateForTest({ settle: 0, warmedUp: true });
    const out = play(state, 8, QUALITY_SAMPLE_SECONDS + 0.5);
    expect(out.state.settle).toBeGreaterThan(0);
  });
});
