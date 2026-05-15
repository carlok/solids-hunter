export type GamepadInputFrame = {
  connected: boolean;
  moveX: number;
  moveForward: number;
  lookX: number;
  lookY: number;
  shoot: boolean;
  primary: boolean;
  menu: boolean;
};

const DEADZONE = 0.18;
const TRIGGER_THRESHOLD = 0.45;

export const EMPTY_GAMEPAD_INPUT: GamepadInputFrame = {
  connected: false,
  moveX: 0,
  moveForward: 0,
  lookX: 0,
  lookY: 0,
  shoot: false,
  primary: false,
  menu: false,
};

export function applyStickDeadzone(value: number, deadzone = DEADZONE): number {
  if (!Number.isFinite(value)) return 0;
  const mag = Math.abs(value);
  if (mag <= deadzone) return 0;
  return Math.sign(value) * Math.min(1, (mag - deadzone) / (1 - deadzone));
}

function buttonDown(button: GamepadButton | undefined): boolean {
  return !!button && (button.pressed || button.value >= TRIGGER_THRESHOLD);
}

export function gamepadButtonJustPressed(
  current: GamepadInputFrame,
  previous: GamepadInputFrame,
  button: 'shoot' | 'primary' | 'menu',
): boolean {
  return current[button] && !previous[button];
}

export function readGamepadInput(gamepad: Gamepad | null | undefined): GamepadInputFrame {
  if (!gamepad || !gamepad.connected) return EMPTY_GAMEPAD_INPUT;

  return {
    connected: true,
    moveX: applyStickDeadzone(gamepad.axes[0] ?? 0),
    moveForward: -applyStickDeadzone(gamepad.axes[1] ?? 0),
    lookX: applyStickDeadzone(gamepad.axes[2] ?? 0),
    lookY: applyStickDeadzone(gamepad.axes[3] ?? 0),
    shoot: buttonDown(gamepad.buttons[7]) || buttonDown(gamepad.buttons[5]),
    primary: buttonDown(gamepad.buttons[0]),
    menu:
      buttonDown(gamepad.buttons[9]) ||
      buttonDown(gamepad.buttons[8]) ||
      buttonDown(gamepad.buttons[1]),
  };
}

export function firstUsableGamepad(gamepads: readonly (Gamepad | null)[]): Gamepad | null {
  return (
    gamepads.find((pad) => pad?.connected && pad.mapping === 'standard') ??
    gamepads.find((pad) => pad?.connected) ??
    null
  );
}
