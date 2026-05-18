import { describe, expect, it } from 'vitest';

import {
  EMPTY_GAMEPAD_INPUT,
  applyStickDeadzone,
  applyStickResponseCurve,
  firstUsableGamepad,
  gamepadButtonJustPressed,
  readGamepadInput,
} from '../../babylon/gamepad-input';

function button(value = 0, pressed = value >= 0.5): GamepadButton {
  return { pressed, touched: pressed, value };
}

function pad(params: {
  connected?: boolean;
  mapping?: GamepadMappingType;
  axes?: number[];
  buttons?: GamepadButton[];
}): Gamepad {
  return {
    axes: params.axes ?? [],
    buttons: params.buttons ?? [],
    connected: params.connected ?? true,
    hapticActuators: [],
    id: 'test pad',
    index: 0,
    mapping: params.mapping ?? 'standard',
    timestamp: 1,
    vibrationActuator: null,
  } as Gamepad;
}

describe('applyStickDeadzone', () => {
  it('zeros small values and rescales larger values', () => {
    expect(applyStickDeadzone(0.1)).toBe(0);
    expect(applyStickDeadzone(-0.18)).toBe(0);
    expect(applyStickDeadzone(1)).toBe(1);
    expect(applyStickDeadzone(-1)).toBe(-1);
    expect(applyStickDeadzone(0.59)).toBeCloseTo(0.5, 6);
  });

  it('ignores non-finite values', () => {
    expect(applyStickDeadzone(Number.NaN)).toBe(0);
    expect(applyStickDeadzone(Infinity)).toBe(0);
  });
});

describe('applyStickResponseCurve', () => {
  it('keeps full deflection but softens partial stick input', () => {
    expect(applyStickResponseCurve(1, 2.15)).toBe(1);
    expect(applyStickResponseCurve(-1, 2.15)).toBe(-1);
    expect(applyStickResponseCurve(0.5, 2.15)).toBeLessThan(0.5);
    expect(applyStickResponseCurve(-0.5, 2.15)).toBeGreaterThan(-0.5);
  });
});

describe('readGamepadInput', () => {
  it('returns an empty frame for missing or disconnected pads', () => {
    expect(readGamepadInput(null)).toEqual(EMPTY_GAMEPAD_INPUT);
    expect(readGamepadInput(pad({ connected: false }))).toEqual(EMPTY_GAMEPAD_INPUT);
  });

  it('maps standard sticks and buttons to game actions', () => {
    const frame = readGamepadInput(
      pad({
        axes: [0.59, -1, 1, -0.59],
        buttons: [
          button(1),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0.7),
          button(0),
          button(1),
        ],
      }),
    );

    expect(frame.connected).toBe(true);
    expect(frame.moveX).toBeCloseTo(Math.pow(0.5, 1.45), 6);
    expect(frame.moveForward).toBe(1);
    expect(frame.lookX).toBe(1);
    expect(frame.lookY).toBeCloseTo(-Math.pow(0.5, 2.15), 6);
    expect(frame.menuX).toBe(1);
    expect(frame.menuY).toBe(-1);
    expect(frame.primary).toBe(true);
    expect(frame.shoot).toBe(true);
    expect(frame.menu).toBe(true);
  });

  it('maps d-pad buttons to digital menu directions', () => {
    const frame = readGamepadInput(
      pad({
        buttons: [
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(0),
          button(1),
          button(1),
          button(0),
        ],
      }),
    );

    expect(frame.menuX).toBe(-1);
    expect(frame.menuY).toBe(1);
  });
});

describe('gamepadButtonJustPressed', () => {
  it('detects button rising edges', () => {
    expect(
      gamepadButtonJustPressed(
        { ...EMPTY_GAMEPAD_INPUT, shoot: true },
        EMPTY_GAMEPAD_INPUT,
        'shoot',
      ),
    ).toBe(true);
    expect(
      gamepadButtonJustPressed(
        { ...EMPTY_GAMEPAD_INPUT, shoot: true },
        { ...EMPTY_GAMEPAD_INPUT, shoot: true },
        'shoot',
      ),
    ).toBe(false);
  });
});

describe('firstUsableGamepad', () => {
  it('prefers standard connected pads', () => {
    const generic = pad({ mapping: '' });
    const standard = pad({ mapping: 'standard' });
    expect(firstUsableGamepad([null, generic, standard])).toBe(standard);
  });

  it('falls back to any connected pad', () => {
    const generic = pad({ mapping: '' });
    expect(firstUsableGamepad([null, generic, pad({ connected: false, mapping: 'standard' })]))
      .toBe(generic);
  });

  it('returns null when nothing is connected', () => {
    expect(firstUsableGamepad([null, pad({ connected: false })])).toBeNull();
  });
});
