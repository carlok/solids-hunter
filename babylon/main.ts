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
import { createGamepadMenu } from './gamepad-menu';
import { attachBabylonShooting } from './shoot-input';
import { createRoundDirector, recordRound, tuningForRound } from './round-director';
import { bestSpawnYaw, hitsEntity, hitsWall } from './wall-collision';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Missing #game canvas');
}

const touchLikeDevice =
  navigator.maxTouchPoints > 0 ||
  window.matchMedia?.('(pointer: coarse)').matches === true;

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

/** Hide the boot overlay so whatever we show next is actually visible. */
function dismissBootOverlay(): void {
  document.getElementById('boot-overlay')?.classList.add('hidden');
}

/**
 * The engine constructor throws when WebGL is unavailable — no GPU, a
 * blocklisted driver, hardware acceleration switched off. It runs before all
 * the DOM wiring below, so an uncaught throw left the visitor looking at a
 * fully painted menu where nothing was clickable and no message ever appeared,
 * indistinguishable from the page simply being broken.
 */
let engine: Engine;
try {
  engine = new Engine(canvas, true, {
    adaptToDeviceRatio: true,
  });
} catch (err) {
  dismissBootOverlay();
  document.getElementById('webgl-error')?.classList.remove('hidden');
  throw err;
}
if (touchLikeDevice && window.devicePixelRatio > 2) engine.setHardwareScalingLevel(1.25);
const scene = new Scene(engine);

/**
 * Context loss is routine on mobile: driver resets, sleep, a tab backgrounded
 * too long. Babylon restores what it can by itself, but the player deserves to
 * know why the picture stopped.
 */
engine.onContextLostObservable.add(() => {
  showLockErrBanner('Graphics context lost. Reload the page to keep playing.');
});
engine.onContextRestoredObservable.add(() => {
  hideLockErrBanner();
});

{
  const ipc = scene.imageProcessingConfiguration;
  ipc.toneMappingEnabled = true;
  ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ipc.exposure = 1.06;
  ipc.contrast = 1.04;
}

const iblPath = `${import.meta.env.BASE_URL}assets/textures/environmentSpecular.env`;
/** Without the error callback a failed IBL fetch just leaves every PBR surface
 *  unlit, with nothing anywhere to say why the arenas look flat and dark. */
const envCube = new CubeTexture(
  iblPath,
  scene,
  null,
  false,
  null,
  null,
  () => {
    showLockErrBanner('Could not load the lighting data. The arenas will look flat.');
  },
  undefined,
  /* prefiltered */ true,
);
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
  /** Dev-only handle for poking at the live scene from the console. */
  (window as unknown as { solidsHunterDev?: unknown }).solidsHunterDev = { scene, camera, engine };
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

/**
 * MSAA on top of FXAA. The hunt solids are open wireframe cages, so almost
 * their entire silhouette is thin near-diagonal edges — exactly the case FXAA
 * handles worst and multisampling handles best. Touch devices stay at 1; the
 * quality watchdog drops it back there if a desktop cannot hold the frame rate.
 */
renderPipeline.samples = touchLikeDevice ? 1 : 4;

// Bloom — makes emissive solids & torches glow
renderPipeline.bloomEnabled = true;
renderPipeline.bloomThreshold = 0.62;
renderPipeline.bloomWeight = 0.3;
renderPipeline.bloomKernel = touchLikeDevice ? 32 : 48;
renderPipeline.bloomScale = 0.5;

// Keep colour-identification targets crisp at the screen edge.
renderPipeline.chromaticAberrationEnabled = false;

// Grain — disabled
renderPipeline.grainEnabled = false;

// Depth of field — very subtle, cinematic
renderPipeline.depthOfFieldEnabled = false; // keep off by default, toggle if wanted

// SSAO2 — contact shadows / ambient occlusion
const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
ssao.radius = touchLikeDevice ? 1.15 : 1.45;
ssao.totalStrength = touchLikeDevice ? 0.3 : 0.48;
ssao.base = 0.16;
ssao.maxZ = 80;
ssao.minZAspect = 0.2;

/**
 * Downgrade-only quality watchdog.
 *
 * Higher mesh tessellation and shadows in every arena raise the floor this
 * build needs. Rather than guessing from `touchLikeDevice`, measure: if the
 * frame rate stays under target across a whole sampling window, shed the most
 * expensive effect and re-measure. Never upgrades, so it settles instead of
 * oscillating between two states.
 */
const QUALITY_TARGET_FPS = 45;
const QUALITY_SAMPLE_SECONDS = 2;
/** Skipped after a downgrade so the next window measures the new settings. */
const QUALITY_SETTLE_SECONDS = 3;
/**
 * Shader compilation makes the opening seconds of a round slow on every
 * machine, fast ones included. Measuring through that would strip effects from
 * hardware that never needed it, so the first window is only opened once the
 * round has actually settled.
 */
const QUALITY_WARMUP_SECONDS = 5;

const qualitySteps: readonly (() => void)[] = [
  () => {
    /**
     * Detach, do not dispose. Disposing a render pipeline that is still
     * attached to the active camera tears down the post-process chain
     * mid-frame and the scene renders black from then on.
     */
    scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(ssao.name, [camera]);
  },
  () => {
    renderPipeline.bloomKernel = 16;
    renderPipeline.bloomScale = 0.35;
  },
  () => {
    renderPipeline.samples = 1;
  },
  () => {
    renderPipeline.bloomEnabled = false;
  },
  () => {
    engine.setHardwareScalingLevel(Math.max(engine.getHardwareScalingLevel(), 1.5));
  },
];
let qualityStep = 0;
let qualityWindow = 0;
let qualityFrames = 0;
let qualitySettle = QUALITY_WARMUP_SECONDS;

function updateQualityWatchdog(dt: number): void {
  if (qualityStep >= qualitySteps.length) return;
  /**
   * A hidden tab throttles rAF to roughly 1Hz. Measuring through that would
   * strip every effect from a machine that is perfectly capable of running them.
   */
  if (document.hidden || !gameActive) {
    qualityWindow = 0;
    qualityFrames = 0;
    qualitySettle = QUALITY_WARMUP_SECONDS;
    return;
  }
  if (qualitySettle > 0) {
    qualitySettle -= dt;
    return;
  }
  qualityWindow += dt;
  qualityFrames++;
  if (qualityWindow < QUALITY_SAMPLE_SECONDS) return;

  const averageFps = qualityFrames / qualityWindow;
  qualityWindow = 0;
  qualityFrames = 0;
  if (averageFps >= QUALITY_TARGET_FPS) return;

  qualitySteps[qualityStep]!();
  qualityStep++;
  qualitySettle = QUALITY_SETTLE_SECONDS;
}
// ─────────────────────────────────────────────────────────────────────────────

let arena: ArenaBuildResult | null = null;
let entities: ReturnType<typeof spawnGameEntities> = [];
/** Reused scratch list so the render loop does not allocate an array per frame. */
const liveEntities: ReturnType<typeof spawnGameEntities> = [];
let currentRule: HuntRule | null = null;
let selectedEnv: ArenaName | null = null;
let gameActive = false;
const keys: Record<string, boolean> = {};
let elapsedTime = 0;
let activeRoundSeconds = 0;
let previousGamepadInput: GamepadInputFrame = EMPTY_GAMEPAD_INPUT;
let smoothedGamepadLookX = 0;
let smoothedGamepadLookY = 0;
let smoothedGamepadMoveX = 0;
let smoothedGamepadMoveForward = 0;
let roundDirector = createRoundDirector();
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
  correctHits: 0,
  wrongHits: 0,
};

const releaseVersion = document.querySelector<HTMLMetaElement>('meta[name="application-version"]')?.content ?? 'dev';
req<HTMLElement>('release-version').textContent = releaseVersion;

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
  /** Only `showHuntScreen` cleared this, so leaving an arena mid-round-end left
   *  the flag set and `shoot()` refusing to fire in the next round. */
  shootRuntime.roundEnded = false;
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
  shootRuntime.correctHits = 0;
  shootRuntime.wrongHits = 0;
  const tuning = tuningForRound(roundDirector);
  currentRule = generateHuntRule(Math.random, tuning.allowedRuleFamilies);

  disposeAllGameEntities(entities);
  elapsedTime = 0;
  activeRoundSeconds = 0;

  entities = spawnGameEntities(scene, {
    wallBoxes: arena.wallBoxes,
    envSpawnHalfXZ: arena.envSpawnHalfXZ,
    rule: currentRule,
    count: tuning.count,
    moveModes: tuning.moveModes,
    speedMultiplier: tuning.speedMultiplier,
    nearMissBias: tuning.nearMissBias,
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
    onRoundComplete: (outcome) => {
      roundDirector = recordRound(roundDirector, {
        outcome,
        correctHits: shootRuntime.correctHits,
        wrongHits: shootRuntime.wrongHits,
        elapsedSeconds: activeRoundSeconds,
      });
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
    reticleEl: req('hud-reticle'),
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

const envCards = Array.from(document.querySelectorAll<HTMLElement>('.env-card'));

function selectEnvironmentCard(card: Element): void {
  document.querySelectorAll('.env-card').forEach((c) => c.classList.remove('sel'));
  card.classList.add('sel');
  const env = card.getAttribute('data-env');
  selectedEnv = normalizeArenaName(env);
  envBtn.disabled = false;
  envBtn.textContent = 'ENTER ' + selectedEnv.toUpperCase() + ' \u2192';
}

envCards.forEach((card) => {
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

/** Let the browser paint before a long synchronous task blocks the thread. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Building an arena is one uninterrupted synchronous task — the duomo alone is
 * ~1300 meshes. Called straight from the click handler it froze the picker with
 * the button not even showing a pressed state, so the click looked ignored and
 * players clicked again. Two yielded frames let the browser paint the disabled
 * state and the label change first.
 */
async function enterSelectedArena(): Promise<void> {
  if (!selectedEnv) return;
  const previousLabel = envBtn.textContent;
  envBtn.disabled = true;
  envBtn.textContent = 'BUILDING ARENA…';
  await nextPaint();
  await nextPaint();

  requestBestEffortFullscreen();
  clearWorld();
  arena = buildArenaScene(scene, selectedEnv);
  GameAudio.setArena(selectedEnv);
  camera.position.copyFrom(arena.spawnPosition);
  /** The arena's intended heading, overridden only when it faces geometry. */
  camera.rotation.set(0, bestSpawnYaw(arena.spawnPosition, arena.wallBoxes, arena.spawnYaw), 0);
  if (import.meta.env.DEV) {
    console.assert(
      !hitsWall(arena.spawnPosition, arena.wallBoxes),
      `${selectedEnv} spawn should not intersect wall AABBs`,
    );
  }
  showHuntScreen();
  envBtn.disabled = false;
  envBtn.textContent = previousLabel;
}

envBtn.addEventListener('click', () => {
  void enterSelectedArena();
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

/**
 * Menu layers a gamepad can drive, highest priority first. Order matters: a
 * dialog on top of the pause screen has to own the pad, not the screen behind
 * it. `also` pulls the floating nav button into whichever screen is showing so
 * HELP and CREDITS are reachable without a mouse.
 */
const gamepadMenu = createGamepadMenu([
  {
    root: req<HTMLDivElement>('modal-hit-feedback'),
  },
  {
    root: modalHelp,
    onBack: () => modalHelp.classList.add('hidden'),
  },
  {
    root: modalCredits,
    onBack: () => modalCredits.classList.add('hidden'),
  },
  {
    root: navDropdown,
    also: [topNav],
    onBack: closeNavMenu,
  },
  { root: roundEndEl },
  { root: pausedEl, onBack: () => enterPlayMode() },
  { root: huntScreen, also: [topNav], onBack: goHome },
  { root: envScreen, also: [topNav] },
]);

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
    selectEnvironmentCard(card);
  }
}

syncTopNav();
syncSoundToggles();
void GameAudio.load().catch(() => { });

/** Every listener above is attached, so the menu is now genuinely interactive. */
dismissBootOverlay();

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  elapsedTime += dt;
  /** Coach modals freeze play; charging that time against the director's 60s
   *  "strong round" test would punish players for using the coach. */
  if (gameActive && !gameFeedback.paused) activeRoundSeconds += dt;
  const gamepads = navigator.getGamepads?.() ?? [];
  const gamepadInput = readGamepadInput(firstUsableGamepad(gamepads));
  const gamepadPrimaryPressed = gamepadButtonJustPressed(
    gamepadInput,
    previousGamepadInput,
    'primary',
  );
  const gamepadMenuPressed = gamepadButtonJustPressed(gamepadInput, previousGamepadInput, 'menu');
  const gamepadShootPressed = gamepadButtonJustPressed(gamepadInput, previousGamepadInput, 'shoot');
  const gamepadBackPressed = gamepadButtonJustPressed(gamepadInput, previousGamepadInput, 'back');
  const gamepadStartPressed = gamepadMenuPressed && !gamepadBackPressed;
  const gamepadMenuMoveX = gamepadInput.menuX !== 0 && previousGamepadInput.menuX === 0 ? gamepadInput.menuX : 0;
  const gamepadMenuMoveY = gamepadInput.menuY !== 0 && previousGamepadInput.menuY === 0 ? gamepadInput.menuY : 0;

  if (gamepadInput.connected) {
    const menuOpen = gamepadMenu.isMenuOpen();
    if (menuOpen) {
      if (gamepadMenuMoveX || gamepadMenuMoveY) {
        gamepadMenu.move(gamepadMenuMoveX, gamepadMenuMoveY);
        GameAudio.uiClick();
      }
      if (gamepadPrimaryPressed) {
        gamepadMenu.activate();
        GameAudio.uiClick();
      }
      if (gamepadBackPressed && gamepadMenu.back()) {
        GameAudio.uiClick();
      } else if (gamepadStartPressed) {
        /** Start skips ahead: straight into the round from the rule screen, or
         *  into the chosen arena from the picker. */
        if (!huntScreen.classList.contains('hidden')) enterPlayMode();
        else if (!envScreen.classList.contains('hidden') && !envBtn.disabled) envBtn.click();
      }
    } else {
      gamepadMenu.reset();
      if (gamepadMenuPressed && gameActive) {
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        else pauseGamepadPlay();
      }
      if (gamepadShootPressed && gameActive) {
        shooter.shoot();
      }
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

  updateQualityWatchdog(dt);

  if (devFpsEl) {
    devFpsTimer += dt;
    if (devFpsTimer >= 0.25) {
      devFpsTimer = 0;
      devFpsEl.textContent = `FPS ${Math.round(engine.getFps())}`;
    }
  }

  if (arena) {
    liveEntities.length = 0;
    for (const e of entities) {
      if (e.alive && e.body && !e.body.isDisposed()) liveEntities.push(e);
    }
    updateGameEntities({
      entities: liveEntities,
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
