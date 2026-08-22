import { firstFocusIndex, nextFocusIndex, type FocusRect } from './menu-focus';

/**
 * Gamepad control of the DOM menus.
 *
 * Previously only the arena grid and two buttons responded to a pad: the
 * sound / ambient / coach toggles, the nav menu, the help and credits dialogs
 * and "CHANGE ARENA" were all unreachable without a mouse. Rather than add more
 * per-screen special cases, every overlay now exposes its controls the same
 * way and {@link nextFocusIndex} decides where a direction lands.
 */

/** Highest priority first: whichever layer is on top owns the pad. */
export type MenuLayer = {
  /** Element that must be visible for this layer to be active. */
  root: HTMLElement;
  /** Extra roots whose controls join this layer (the floating nav button). */
  also?: HTMLElement[];
  /** B / circle while this layer is active. */
  onBack?: () => void;
};

const FOCUSABLE =
  'button:not([disabled]):not([aria-hidden="true"]), input[type="checkbox"]:not([disabled]), .env-card';

export const GAMEPAD_FOCUS_CLASS = 'gp-focus';

function isVisible(el: HTMLElement): boolean {
  if (el.classList.contains('hidden')) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function rectOf(el: HTMLElement): FocusRect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function createGamepadMenu(layers: readonly MenuLayer[]) {
  let focused: HTMLElement | null = null;

  const clearFocus = (): void => {
    if (!focused) return;
    focused.classList.remove(GAMEPAD_FOCUS_CLASS);
    focused = null;
  };

  const activeLayer = (): MenuLayer | null =>
    layers.find((layer) => isVisible(layer.root)) ?? null;

  const controlsOf = (layer: MenuLayer): HTMLElement[] => {
    const roots = [layer.root, ...(layer.also ?? [])].filter(isVisible);
    const found = roots.flatMap((root) => [
      ...root.querySelectorAll<HTMLElement>(FOCUSABLE),
    ]);
    return found.filter(isVisible);
  };

  /** Re-point at the current layer, keeping the highlight if it is still shown. */
  const refresh = (): HTMLElement[] => {
    const layer = activeLayer();
    if (!layer) {
      clearFocus();
      return [];
    }
    const controls = controlsOf(layer);
    if (!controls.length) {
      clearFocus();
      return controls;
    }
    if (focused && !controls.includes(focused)) clearFocus();
    return controls;
  };

  const focus = (el: HTMLElement | undefined): void => {
    if (!el) return;
    clearFocus();
    focused = el;
    el.classList.add(GAMEPAD_FOCUS_CLASS);
    el.scrollIntoView?.({ block: 'nearest' });
  };

  return {
    /** True when a DOM menu is on screen, so play input should stay parked. */
    isMenuOpen(): boolean {
      return activeLayer() !== null;
    },

    move(dx: number, dy: number): void {
      const controls = refresh();
      if (!controls.length) return;
      if (!focused) {
        focus(controls[firstFocusIndex(controls.map(rectOf))]);
        return;
      }
      const rects = controls.map(rectOf);
      focus(controls[nextFocusIndex(rects, controls.indexOf(focused), dx, dy)]);
    },

    /** A / cross. Falls back to the layer's first control so a fresh screen is
     *  never a dead press. */
    activate(): boolean {
      const controls = refresh();
      if (!controls.length) return false;
      if (!focused) {
        focus(controls[firstFocusIndex(controls.map(rectOf))]);
        return true;
      }
      focused.click();
      /** Clicking may have swapped layers; drop a stale highlight. */
      if (!isVisible(focused)) clearFocus();
      return true;
    },

    /** B / circle. Returns false when the layer has no back action. */
    back(): boolean {
      const layer = activeLayer();
      if (!layer?.onBack) return false;
      clearFocus();
      layer.onBack();
      return true;
    },

    reset(): void {
      clearFocus();
    },
  };
}

export type GamepadMenu = ReturnType<typeof createGamepadMenu>;
