import {
  DefaultRenderingPipeline,
  Engine,
  CubeTexture,
  ImageProcessingConfiguration,
  Scene,
  UniversalCamera,
  Vector3,
  SSAO2RenderingPipeline,
} from '@babylonjs/core';
/** Side effect: patches Scene picking (`createPickingRay`, `pickWithRay`). Without this, treeshaking can drop Culling/ray and those methods throw `_WarnImport("Ray")`. */
import '@babylonjs/core/Culling/ray';

import { generateHuntRule } from '@lib/game-rules.js';
import type { ArenaBuildResult } from './arena-shared';
import type { ArenaName } from './arenas';
import { buildArenaScene, normalizeArenaName } from './arenas';
import {
  hideLockErrBanner,
  isHitFeedbackModalVisible,
  onPointerLockAcquired,
  resetHitFeedbackState,
  showLockErrBanner,
  syncSoundToggles,
  wantReLockAfterWrongModal,
  wireCoachAndSoundUi,
} from './coach';
import type { HuntRule } from './entities';
import {
  disposeAllGameEntities,
  gameFeedback,
  spawnGameEntities,
  updateGameEntities,
  xzPlayHalfLimit,
} from './entity-motion';
import { GameAudio } from './game-audio';
import {
  EMPTY_GAMEPAD_INPUT,
  firstUsableGamepad,
  gamepadButtonJustPressed,
  readGamepadInput,
  type GamepadInputFrame,
} from './gamepad-input';
import { attachBabylonShooting } from './shoot-input';
import { hitsEntity, hitsWall } from './wall-collision';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Missing #game canvas');
}

function req<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

const envScreen = req<HTMLDivElement>('env-screen');
const huntScreen = req<HTMLDivElement>('hunt-screen');
const hudEl = req<HTMLDivElement>('hud');
const pausedEl = req<HTMLDivElement>('paused');
const roundEndEl = req<HTMLDivElement>('round-end');
const vigEl = req<HTMLDivElement>('vignette');
const ruleDisp = req<HTMLDivElement>('rule-disp');
const hudRuleText = req<HTMLDivElement>('hud-rule-text');
const hudRuleStrip = req<HTMLDivElement>('hud-rule-strip');
const envBtn = req<HTMLButtonElement>('env-btn');
const topNav = req<HTMLDivElement>('top-nav');
const navToggle = req<HTMLButtonElement>('nav-toggle');
const navDropdown = req<HTMLDivElement>('nav-dropdown');
const modalHelp = req<HTMLDivElement>('modal-help');
const modalCredits = req<HTMLDivElement>('modal-credits');
const mobileControlsEl = req<HTMLDivElement>('mobile-controls');
const mobileLookZoneEl = req<HTMLDivElement>('mobile-look-zone');
const mobileStickEl = req<HTMLDivElement>('mobile-stick');
const mobileStickKnobEl = req<HTMLDivElement>('mobile-stick-knob');
const mobileShootEl = req<HTMLButtonElement>('mobile-shoot');
const mobileLandscapeWarningEl = req<HTMLDivElement>('mobile-landscape-warning');

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  adaptToDeviceRatio: true,
});
const scene = new Scene(engine);

{
  const ipc = scene.imageProcessingConfiguration;
  ipc.toneMappingEnabled = true;
  ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ipc.exposure = 1.12;
  ipc.contrast = 1.06;
}

const iblPath = `${import.meta.env.BASE_URL}assets/textures/environmentSpecular.env`;
const envCube = CubeTexture.CreateFromPrefilteredData(iblPath, scene);
scene.environmentTexture = envCube;
scene.environmentIntensity = 0.84;

function syncCanvasToEngineSize(): void {
  engine.resize();
}
syncCanvasToEngineSize();
requestAnimationFrame(() => {
  syncCanvasToEngineSize();
});

const camera = new UniversalCamera('cam', new Vector3(0, 1.7, 0), scene);
camera.attachControl(canvas, true);
camera.inertia = 0;
/** Keyboard walking is custom (constant speed). Built-in FreeCamera keyboard uses acceleration — stacks with arrows/WASD. */
const kbInput = camera.inputs.attached.keyboard;
if (kbInput) camera.inputs.remove(kbInput);
/** Gamepad walking/looking is also custom. Babylon's built-in gamepad camera input can fly vertically. */
const gamepadCameraInput = camera.inputs.attached.gamepad;
if (gamepadCameraInput) camera.inputs.remove(gamepadCameraInput);
camera.minZ = 0.05;
camera.fov = (68 * Math.PI) / 180;
const mouseInput = camera.inputs.attached.mouse as { angularSensibility?: number } | undefined;
if (mouseInput && typeof mouseInput.angularSensibility === 'number') {
  mouseInput.angularSensibility = 2400;
}
scene.activeCamera = camera;

let devFpsEl: HTMLDivElement | null = null;
let devFpsTimer = 0;
if (import.meta.env.DEV) {
  devFpsEl = document.createElement('div');
  devFpsEl.className = 'dev-fps';
  devFpsEl.textContent = 'FPS --';
  document.body.appendChild(devFpsEl);
}

// ── Post-processing pipeline ──────────────────────────────────────────────────
const renderPipeline = new DefaultRenderingPipeline('main', true, scene, [camera]);

// FXAA anti-aliasing
renderPipeline.fxaaEnabled = true;
renderPipeline.fxaa.samples = 4;

// Bloom — makes emissive solids & torches glow
renderPipeline.bloomEnabled = true;
renderPipeline.bloomThreshold = 0.55;
renderPipeline.bloomWeight = 0.42;
renderPipeline.bloomKernel = 64;
renderPipeline.bloomScale = 0.5;

// Chromatic aberration — subtle lens realism
renderPipeline.chromaticAberrationEnabled = true;
renderPipeline.chromaticAberration.aberrationAmount = 0.8;
renderPipeline.chromaticAberration.radialIntensity = 1.0;

// Grain — disabled
renderPipeline.grainEnabled = false;

// Depth of field — very subtle, cinematic
renderPipeline.depthOfFieldEnabled = false; // keep off by default, toggle if wanted

// SSAO2 — contact shadows / ambient occlusion
const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
ssao.radius = 1.8;
ssao.totalStrength = 0.65;
ssao.base = 0.12;
ssao.maxZ = 80;
ssao.minZAspect = 0.2;
// ─────────────────────────────────────────────────────────────────────────────

let arena: ArenaBuildResult | null = null;
let entities: ReturnType<typeof spawnGameEntities> = [];
let currentRule: HuntRule | null = null;
let selectedEnv: ArenaName | null = null;
let gameActive = false;
const keys: Record<string, boolean> = {};
let elapsedTime = 0;
let previousGamepadInput: GamepadInputFrame = EMPTY_GAMEPAD_INPUT;
let smoothedGamepadLookX = 0;
let smoothedGamepadLookY = 0;
let smoothedGamepadMoveX = 0;
let smoothedGamepadMoveForward = 0;
const touchLikeDevice =
  navigator.maxTouchPoints > 0 ||
  window.matchMedia?.('(pointer: coarse)').matches === true;
const mobileInput = {
  moveX: 0,
  moveForward: 0,
  lookDX: 0,
  lookDY: 0,
};
let mobileMovePointerId: number | null = null;
let mobileLookPointerId: number | null = null;
let mobileLookLastX = 0;
let mobileLookLastY = 0;

const shootRuntime = {
  score: 0,
  matchLeft: 0,
  roundEnded: false,
  shotsThisRound: 0,
};

function syncHudRuleStrip(): void {
  if (!currentRule) return;
  hudRuleText.textContent = currentRule.lines.join('\n');
  hudRuleText.style.color = currentRule.accent;
  hudRuleStrip.style.borderColor = currentRule.accent;
  const longRule = currentRule.lines.length > 1 || (currentRule.badge && currentRule.badge.length > 22);
  hudRuleText.classList.toggle('hud-rule-text--long', longRule);
}

function updateHUD(): void {
  req<HTMLDivElement>('score-el').textContent = String(shootRuntime.score);
  req<HTMLDivElement>('targets-el').textContent = String(shootRuntime.matchLeft);
}

function clearWorld(): void {
  disposeAllGameEntities(entities);
  if (arena) {
    arena.dispose();
    arena = null;
  }
}

function syncTopNav(): void {
  topNav.classList.toggle('hidden', gameActive);
}

function isLandscapeViewport(): boolean {
  return window.innerWidth >= window.innerHeight;
}

function resetMobileInput(): void {
  mobileInput.moveX = 0;
  mobileInput.moveForward = 0;
  mobileInput.lookDX = 0;
  mobileInput.lookDY = 0;
  mobileMovePointerId = null;
  mobileLookPointerId = null;
  mobileStickKnobEl.style.transform = 'translate(-50%, -50%)';
}

function syncMobileUi(): void {
  const showControls = touchLikeDevice && gameActive && roundEndEl.classList.contains('hidden');
  mobileControlsEl.classList.toggle('hidden', !showControls);
  mobileControlsEl.setAttribute('aria-hidden', showControls ? 'false' : 'true');
  mobileLandscapeWarningEl.classList.toggle('hidden', !(showControls && !isLandscapeViewport()));
  hudEl.classList.toggle('hud--mobile', showControls);
}

function closeModals(): void {
  modalHelp.classList.add('hidden');
  modalCredits.classList.add('hidden');
  resetHitFeedbackState();
}

function closeNavMenu(): void {
  navDropdown.classList.add('hidden');
  navToggle.setAttribute('aria-expanded', 'false');
}

function requestBestEffortFullscreen(): void {
  const root = document.documentElement;
  if (document.fullscreenElement) return;
  void root.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}

function goHome(): void {
  resetHitFeedbackState();
  closeModals();
  closeNavMenu();
  gameActive = false;
  resetMobileInput();
  roundEndEl.classList.add('hidden');
  pausedEl.classList.add('hidden');
  huntScreen.classList.add('hidden');
  hudEl.classList.add('hidden');
  vigEl.classList.add('hidden');
  syncMobileUi();
  clearWorld();
  document.querySelectorAll('.env-card').forEach((c) => c.classList.remove('sel'));
  selectedEnv = null;
  envBtn.disabled = true;
  envBtn.textContent = '— SELECT AN ENVIRONMENT —';
  envScreen.classList.remove('hidden');
  hideLockErrBanner();
  document.exitPointerLock();
  currentRule = null;
  syncTopNav();
  syncSoundToggles();
}

function showHuntScreen(): void {
  if (!arena || !selectedEnv) return;
  hideLockErrBanner();
  resetHitFeedbackState();
  resetMobileInput();
  syncMobileUi();
  req<HTMLDivElement>('round-end-label').textContent = 'ROUND COMPLETE';
  req<HTMLDivElement>('round-end-title').textContent = 'ALL TARGETS ELIMINATED';
  req<HTMLDivElement>('round-end-points').textContent = 'POINTS';
  shootRuntime.shotsThisRound = 0;
  shootRuntime.score = 0;
  shootRuntime.roundEnded = false;
  currentRule = generateHuntRule();

  disposeAllGameEntities(entities);
  elapsedTime = 0;

  entities = spawnGameEntities(scene, {
    wallBoxes: arena.wallBoxes,
    envSpawnHalfXZ: arena.envSpawnHalfXZ,
    rule: currentRule,
  });
  arena.registerEntityShadowMeshes?.(entities.map((e) => e.body));
  shootRuntime.matchLeft = entities.filter((e) => e.isMatch).length;

  ruleDisp.textContent = currentRule.lines.join('\n');
  ruleDisp.classList.toggle('rule--long', currentRule.lines.length > 1 || currentRule.badge.length > 22);
  ruleDisp.style.color = currentRule.accent;
  syncHudRuleStrip();
  updateHUD();

  envScreen.classList.add('hidden');
  huntScreen.classList.remove('hidden');
  hudEl.classList.add('hidden');
  vigEl.classList.add('hidden');
  pausedEl.classList.add('hidden');
  roundEndEl.classList.add('hidden');
  syncSoundToggles();
}

const shooter = attachBabylonShooting({
  scene,
  canvas,
  camera,
  shootContext: {
    getEntities: () => entities,
    getMatchLeft: () => shootRuntime.matchLeft,
    onRoundComplete: () => {
      gameActive = false;
      resetMobileInput();
      syncTopNav();
      syncSoundToggles();
      syncMobileUi();
    },
  },
  hud: {
    scoreEl: req('score-el'),
    targetsEl: req('targets-el'),
    flashEl: req('flash'),
    roundEndEl,
    roundEndLabelEl: req('round-end-label'),
    roundEndTitleEl: req('round-end-title'),
    roundEndPointsEl: req('round-end-points'),
    finalScoreEl: req('final-score'),
  },
  runtime: shootRuntime,
});

wireCoachAndSoundUi(canvas);

navToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = navDropdown.classList.contains('hidden');
  navDropdown.classList.toggle('hidden');
  navToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
});

document.addEventListener('click', (e) => {
  if (navDropdown.classList.contains('hidden')) return;
  if ((e.target as Element).closest('#top-nav')) return;
  closeNavMenu();
});

req<HTMLButtonElement>('nav-main').addEventListener('click', () => {
  goHome();
});
req<HTMLButtonElement>('nav-help').addEventListener('click', () => {
  closeNavMenu();
  modalHelp.classList.remove('hidden');
});
req<HTMLButtonElement>('nav-credits').addEventListener('click', () => {
  closeNavMenu();
  modalCredits.classList.remove('hidden');
});

req<HTMLButtonElement>('help-close').addEventListener('click', () => {
  modalHelp.classList.add('hidden');
});
req<HTMLButtonElement>('credits-close').addEventListener('click', () => {
  modalCredits.classList.add('hidden');
});
modalHelp.addEventListener('click', (e) => {
  if (e.target === modalHelp) modalHelp.classList.add('hidden');
});
modalCredits.addEventListener('click', (e) => {
  if (e.target === modalCredits) modalCredits.classList.add('hidden');
});

function selectEnvironmentCard(card: Element): void {
  document.querySelectorAll('.env-card').forEach((c) => c.classList.remove('sel'));
  card.classList.add('sel');
  const env = card.getAttribute('data-env');
  selectedEnv = normalizeArenaName(env);
  envBtn.disabled = false;
  envBtn.textContent = 'ENTER ' + selectedEnv.toUpperCase() + ' \u2192';
}

document.querySelectorAll('.env-card').forEach((card) => {
  card.addEventListener('click', () => {
    selectEnvironmentCard(card);
  });
  card.addEventListener('pointerup', (e) => {
    if ((e as PointerEvent).pointerType !== 'mouse') selectEnvironmentCard(card);
  });
  card.addEventListener('keydown', (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    selectEnvironmentCard(card);
  });
});

envBtn.addEventListener('click', () => {
  if (!selectedEnv) return;
  requestBestEffortFullscreen();
  clearWorld();
  arena = buildArenaScene(scene, selectedEnv);
  GameAudio.setArena(selectedEnv);
  camera.position.copyFrom(arena.spawnPosition);
  camera.rotation.set(0, 0, 0);
  if (import.meta.env.DEV) {
    console.assert(
      !hitsWall(arena.spawnPosition, arena.wallBoxes),
      `${selectedEnv} spawn should not intersect wall AABBs`,
    );
  }
  showHuntScreen();
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    try {
      hideLockErrBanner();
      onPointerLockAcquired();
      huntScreen.classList.add('hidden');
      gameActive = true;
      hudEl.classList.remove('hidden');
      vigEl.classList.remove('hidden');
      pausedEl.classList.add('hidden');
      syncTopNav();
      syncSoundToggles();
      syncMobileUi();
      GameAudio.onEnterPlay();
    } catch {
      /* ignore */
    }
  } else {
    GameAudio.onLeavePlay();
    if (!roundEndEl.classList.contains('hidden')) {
      syncTopNav();
      syncSoundToggles();
      return;
    }
    if (isHitFeedbackModalVisible()) {
      syncTopNav();
      syncSoundToggles();
      return;
    }
    if (!envScreen.classList.contains('hidden')) {
      syncTopNav();
      syncSoundToggles();
      return;
    }
    if (!huntScreen.classList.contains('hidden')) {
      syncTopNav();
      syncSoundToggles();
      return;
    }
    pausedEl.classList.remove('hidden');
    hudEl.classList.add('hidden');
    vigEl.classList.add('hidden');
    gameActive = false;
    resetMobileInput();
    syncTopNav();
    syncSoundToggles();
    syncMobileUi();
  }
});

document.addEventListener('pointerlockerror', () => {
  showLockErrBanner(
    window.isSecureContext
      ? 'Pointer lock was denied. Try another browser, disable extensions that block input, or open this page directly (not inside an iframe or embedded preview).'
      : 'Pointer lock needs a secure page. Use http://localhost:PORT on this machine, or https://. A plain http:// URL to another computer’s IP is blocked in Chromium-based browsers.',
  );
});

function tryLockPointer(): void {
  requestBestEffortFullscreen();
  if (touchLikeDevice) {
    enterPlayMode();
    return;
  }
  if (!window.isSecureContext) {
    showLockErrBanner(
      'Pointer lock needs a secure page. Use http://localhost:PORT on this machine, or https://. A plain http:// URL to another computer’s IP is blocked in Chromium-based browsers.',
    );
    return;
  }
  canvas.requestPointerLock();
}

function enterPlayMode(): void {
  hideLockErrBanner();
  onPointerLockAcquired();
  huntScreen.classList.add('hidden');
  gameActive = true;
  hudEl.classList.remove('hidden');
  vigEl.classList.remove('hidden');
  pausedEl.classList.add('hidden');
  syncTopNav();
  syncSoundToggles();
  syncMobileUi();
  GameAudio.onEnterPlay();
}

function pauseGamepadPlay(): void {
  if (!gameActive) return;
  if (!roundEndEl.classList.contains('hidden')) return;
  if (isHitFeedbackModalVisible()) return;
  gameActive = false;
  resetMobileInput();
  GameAudio.onLeavePlay();
  pausedEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
  vigEl.classList.add('hidden');
  syncTopNav();
  syncSoundToggles();
  syncMobileUi();
}

req<HTMLButtonElement>('start-btn').addEventListener('click', () => {
  tryLockPointer();
});

req<HTMLButtonElement>('resume-btn').addEventListener('click', () => {
  tryLockPointer();
});

req<HTMLButtonElement>('new-round-btn').addEventListener('click', () => {
  roundEndEl.classList.add('hidden');
  showHuntScreen();
});

req<HTMLButtonElement>('change-env-btn').addEventListener('click', () => {
  roundEndEl.classList.add('hidden');
  goHome();
});

req<HTMLButtonElement>('back-arena-btn').addEventListener('click', () => {
  goHome();
});

req<HTMLButtonElement>('paused-menu-btn').addEventListener('click', () => {
  goHome();
});

function updateMobileStick(clientX: number, clientY: number): void {
  const rect = mobileStickEl.getBoundingClientRect();
  const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.36);
  const dx = clientX - (rect.left + rect.width * 0.5);
  const dy = clientY - (rect.top + rect.height * 0.5);
  const len = Math.hypot(dx, dy);
  const scale = len > radius ? radius / len : 1;
  const kx = dx * scale;
  const ky = dy * scale;
  mobileInput.moveX = kx / radius;
  mobileInput.moveForward = -ky / radius;
  mobileStickKnobEl.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
}

mobileStickEl.addEventListener('pointerdown', (e) => {
  if (!touchLikeDevice || !gameActive) return;
  e.preventDefault();
  mobileMovePointerId = e.pointerId;
  mobileStickEl.setPointerCapture(e.pointerId);
  updateMobileStick(e.clientX, e.clientY);
});

mobileStickEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== mobileMovePointerId) return;
  e.preventDefault();
  updateMobileStick(e.clientX, e.clientY);
});

function endMobileMove(e: PointerEvent): void {
  if (e.pointerId !== mobileMovePointerId) return;
  mobileMovePointerId = null;
  mobileInput.moveX = 0;
  mobileInput.moveForward = 0;
  mobileStickKnobEl.style.transform = 'translate(-50%, -50%)';
}

mobileStickEl.addEventListener('pointerup', endMobileMove);
mobileStickEl.addEventListener('pointercancel', endMobileMove);

mobileLookZoneEl.addEventListener('pointerdown', (e) => {
  if (!touchLikeDevice || !gameActive) return;
  e.preventDefault();
  mobileLookPointerId = e.pointerId;
  mobileLookLastX = e.clientX;
  mobileLookLastY = e.clientY;
  mobileLookZoneEl.setPointerCapture(e.pointerId);
});

mobileLookZoneEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== mobileLookPointerId) return;
  e.preventDefault();
  mobileInput.lookDX += e.clientX - mobileLookLastX;
  mobileInput.lookDY += e.clientY - mobileLookLastY;
  mobileLookLastX = e.clientX;
  mobileLookLastY = e.clientY;
});

function endMobileLook(e: PointerEvent): void {
  if (e.pointerId !== mobileLookPointerId) return;
  mobileLookPointerId = null;
}

mobileLookZoneEl.addEventListener('pointerup', endMobileLook);
mobileLookZoneEl.addEventListener('pointercancel', endMobileLook);

mobileShootEl.addEventListener('pointerdown', (e) => {
  if (!touchLikeDevice || !gameActive) return;
  e.preventDefault();
  shooter.shoot();
});

canvas.addEventListener('click', () => {
  if (!wantReLockAfterWrongModal) return;
  if (!window.isSecureContext) return;
  if (!roundEndEl.classList.contains('hidden')) return;
  canvas.requestPointerLock();
});

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (gameActive && document.pointerLockElement === canvas) {
    if (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

window.addEventListener('resize', () => {
  syncMobileUi();
});

window.addEventListener('orientationchange', () => {
  syncMobileUi();
});

const qEnv = new URLSearchParams(window.location.search).get('env');
if (qEnv) {
  const name = normalizeArenaName(qEnv);
  const card = document.querySelector(`.env-card[data-env="${name}"]`);
  if (card) {
    card.classList.add('sel');
    selectedEnv = name;
    envBtn.disabled = false;
    envBtn.textContent = 'ENTER ' + name.toUpperCase() + ' \u2192';
  }
}

syncTopNav();
syncSoundToggles();
void GameAudio.load().catch(() => { });

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  elapsedTime += dt;
  const gamepads = navigator.getGamepads?.() ?? [];
  const gamepadInput = readGamepadInput(firstUsableGamepad(gamepads));
  const gamepadPrimaryPressed = gamepadButtonJustPressed(
    gamepadInput,
    previousGamepadInput,
    'primary',
  );
  const gamepadMenuPressed = gamepadButtonJustPressed(gamepadInput, previousGamepadInput, 'menu');
  const gamepadShootPressed = gamepadButtonJustPressed(gamepadInput, previousGamepadInput, 'shoot');

  if (gamepadInput.connected) {
    if (gamepadPrimaryPressed) {
      if (!roundEndEl.classList.contains('hidden')) {
        roundEndEl.classList.add('hidden');
        showHuntScreen();
      } else if (!huntScreen.classList.contains('hidden') || !pausedEl.classList.contains('hidden')) {
        enterPlayMode();
      }
    }
    if (gamepadMenuPressed && gameActive) {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      else pauseGamepadPlay();
    }
    if (gamepadShootPressed && gameActive) {
      shooter.shoot();
    }
  }

  const freeze = gameFeedback.paused;
  if (!freeze && gameActive && arena) {
    const KEYBOARD_MOVE_SPEED = 3.85;
    const GAMEPAD_MOVE_SPEED = 3.15;
    const MOBILE_MOVE_SPEED = 2.9;
    const GAMEPAD_LOOK = 0.78;
    const MOBILE_LOOK = 0.0032;
    const GAMEPAD_LOOK_SMOOTHING = 7.5;
    const GAMEPAD_MOVE_SMOOTHING = 9;
    const mobileControlsActive = touchLikeDevice && isLandscapeViewport();
    if (gamepadInput.connected) {
      const lookAlpha = 1 - Math.exp(-GAMEPAD_LOOK_SMOOTHING * dt);
      smoothedGamepadLookX += (gamepadInput.lookX - smoothedGamepadLookX) * lookAlpha;
      smoothedGamepadLookY += (gamepadInput.lookY - smoothedGamepadLookY) * lookAlpha;
      camera.rotation.y += smoothedGamepadLookX * GAMEPAD_LOOK * dt;
      camera.rotation.x += smoothedGamepadLookY * GAMEPAD_LOOK * dt;
      const pitchLimit = (80 * Math.PI) / 180;
      camera.rotation.x = Math.min(pitchLimit, Math.max(-pitchLimit, camera.rotation.x));
      camera.rotation.z = 0;
    } else {
      smoothedGamepadLookX = 0;
      smoothedGamepadLookY = 0;
      smoothedGamepadMoveX = 0;
      smoothedGamepadMoveForward = 0;
    }
    if (mobileControlsActive) {
      camera.rotation.y += mobileInput.lookDX * MOBILE_LOOK;
      camera.rotation.x += mobileInput.lookDY * MOBILE_LOOK;
      mobileInput.lookDX = 0;
      mobileInput.lookDY = 0;
      const pitchLimit = (80 * Math.PI) / 180;
      camera.rotation.x = Math.min(pitchLimit, Math.max(-pitchLimit, camera.rotation.x));
      camera.rotation.z = 0;
    } else {
      mobileInput.lookDX = 0;
      mobileInput.lookDY = 0;
    }

    const forward = camera.getDirection(new Vector3(0, 0, 1));
    forward.y = 0;
    if (forward.lengthSquared() < 1e-10) forward.set(0, 0, 1);
    else forward.normalize();
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();

    let mx = 0;
    let mz = 0;
    const keyboardMove = document.pointerLockElement === canvas;
    if (keyboardMove && (keys['KeyW'] || keys['ArrowUp'])) {
      mx += forward.x;
      mz += forward.z;
    }
    if (keyboardMove && (keys['KeyS'] || keys['ArrowDown'])) {
      mx -= forward.x;
      mz -= forward.z;
    }
    if (keyboardMove && (keys['KeyA'] || keys['ArrowLeft'])) {
      mx -= right.x;
      mz -= right.z;
    }
    if (keyboardMove && (keys['KeyD'] || keys['ArrowRight'])) {
      mx += right.x;
      mz += right.z;
    }
    let analogMove = 1;
    if (gamepadInput.connected) {
      const moveAlpha = 1 - Math.exp(-GAMEPAD_MOVE_SMOOTHING * dt);
      smoothedGamepadMoveX += (gamepadInput.moveX - smoothedGamepadMoveX) * moveAlpha;
      smoothedGamepadMoveForward += (gamepadInput.moveForward - smoothedGamepadMoveForward) * moveAlpha;
      if (gamepadInput.moveX === 0 && Math.abs(smoothedGamepadMoveX) < 0.012) smoothedGamepadMoveX = 0;
      if (gamepadInput.moveForward === 0 && Math.abs(smoothedGamepadMoveForward) < 0.012) {
        smoothedGamepadMoveForward = 0;
      }
      mx += forward.x * smoothedGamepadMoveForward + right.x * smoothedGamepadMoveX;
      mz += forward.z * smoothedGamepadMoveForward + right.z * smoothedGamepadMoveX;
      analogMove = Math.min(1, Math.hypot(smoothedGamepadMoveForward, smoothedGamepadMoveX));
    }
    const mobileMoveMag = Math.hypot(mobileInput.moveForward, mobileInput.moveX);
    if (mobileControlsActive && mobileMoveMag > 0.01) {
      mx += forward.x * mobileInput.moveForward + right.x * mobileInput.moveX;
      mz += forward.z * mobileInput.moveForward + right.z * mobileInput.moveX;
      analogMove = Math.min(1, mobileMoveMag);
    }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      const moveSpeed =
        mobileControlsActive && mobileMoveMag > 0.01 && !keyboardMove
          ? MOBILE_MOVE_SPEED
          : gamepadInput.connected && !keyboardMove
            ? GAMEPAD_MOVE_SPEED
            : KEYBOARD_MOVE_SPEED;
      mx = (mx / len) * moveSpeed * analogMove * dt;
      mz = (mz / len) * moveSpeed * analogMove * dt;
      GameAudio.maybeFootstep(dt, true);
      const bound = xzPlayHalfLimit(arena.envSpawnHalfXZ);
      const cur = camera.position;
      const blocked = (p: Vector3) =>
        hitsWall(p, arena.wallBoxes) || hitsEntity(p, entities);

      const tryMove = (x: number, z: number): boolean => {
        const p = new Vector3(x, 1.7, z);
        p.x = Math.min(bound, Math.max(-bound, p.x));
        p.z = Math.min(bound, Math.max(-bound, p.z));
        if (blocked(p)) return false;
        camera.position.copyFrom(p);
        return true;
      };

      if (tryMove(cur.x + mx, cur.z + mz)) {
        /* full step */
      } else if (tryMove(cur.x + mx, cur.z)) {
        /* slide along X */
      } else {
        tryMove(cur.x, cur.z + mz);
      }
    } else {
      GameAudio.maybeFootstep(dt, false);
    }
  } else {
    GameAudio.maybeFootstep(dt, false);
  }

  if (gameActive && arena && camera.position.y !== 1.7) {
    camera.position.y = 1.7;
  }

  if (devFpsEl) {
    devFpsTimer += dt;
    if (devFpsTimer >= 0.25) {
      devFpsTimer = 0;
      devFpsEl.textContent = `FPS ${Math.round(engine.getFps())}`;
    }
  }

  if (arena) {
    updateGameEntities({
      entities: entities.filter(e => e.alive && e.body && !e.body.isDisposed()),
      wallBoxes: arena.wallBoxes,
      envSpawnHalfXZ: arena.envSpawnHalfXZ,
      feedbackPaused: gameFeedback.paused,
      cameraWorldPosition: camera.position,
      dt,
      t: elapsedTime,
    });
  }
  scene.render();
  previousGamepadInput = gamepadInput;
});

window.addEventListener('resize', () => {
  engine.resize();
});
