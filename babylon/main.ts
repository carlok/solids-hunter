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
/** Keyboard walking is custom (constant speed). Built-in FreeCamera keyboard uses acceleration — stacks with arrows/WASD. */
const kbInput = camera.inputs.attached.keyboard;
if (kbInput) camera.inputs.remove(kbInput);
camera.minZ = 0.05;
camera.fov = (68 * Math.PI) / 180;
const mouseInput = camera.inputs.attached.mouse as { angularSensibility?: number } | undefined;
if (mouseInput && typeof mouseInput.angularSensibility === 'number') {
  mouseInput.angularSensibility = 3400;
}
scene.activeCamera = camera;

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

function closeModals(): void {
  modalHelp.classList.add('hidden');
  modalCredits.classList.add('hidden');
  resetHitFeedbackState();
}

function closeNavMenu(): void {
  navDropdown.classList.add('hidden');
  navToggle.setAttribute('aria-expanded', 'false');
}

function goHome(): void {
  resetHitFeedbackState();
  closeModals();
  closeNavMenu();
  gameActive = false;
  roundEndEl.classList.add('hidden');
  pausedEl.classList.add('hidden');
  huntScreen.classList.add('hidden');
  hudEl.classList.add('hidden');
  vigEl.classList.add('hidden');
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
      syncTopNav();
      syncSoundToggles();
    },
  },
  hud: {
    scoreEl: req('score-el'),
    targetsEl: req('targets-el'),
    flashEl: req('flash'),
    roundEndEl,
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

document.querySelectorAll('.env-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.env-card').forEach((c) => c.classList.remove('sel'));
    card.classList.add('sel');
    const env = card.getAttribute('data-env');
    selectedEnv = normalizeArenaName(env);
    envBtn.disabled = false;
    envBtn.textContent = 'ENTER ' + selectedEnv.toUpperCase() + ' \u2192';
  });
});

envBtn.addEventListener('click', () => {
  if (!selectedEnv) return;
  clearWorld();
  arena = buildArenaScene(scene, selectedEnv);
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
    syncTopNav();
    syncSoundToggles();
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
  GameAudio.onEnterPlay();
}

function pauseGamepadPlay(): void {
  if (!gameActive) return;
  if (!roundEndEl.classList.contains('hidden')) return;
  if (isHitFeedbackModalVisible()) return;
  gameActive = false;
  GameAudio.onLeavePlay();
  pausedEl.classList.remove('hidden');
  hudEl.classList.add('hidden');
  vigEl.classList.add('hidden');
  syncTopNav();
  syncSoundToggles();
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
    const MV = 3.85;
    const GAMEPAD_LOOK = 1.25;
    if (gamepadInput.connected) {
      camera.rotation.y += gamepadInput.lookX * GAMEPAD_LOOK * dt;
      camera.rotation.x += gamepadInput.lookY * GAMEPAD_LOOK * dt;
      const pitchLimit = (80 * Math.PI) / 180;
      camera.rotation.x = Math.min(pitchLimit, Math.max(-pitchLimit, camera.rotation.x));
      camera.rotation.z = 0;
    }

    const forward = camera.getDirection(new Vector3(0, 0, 1));
    forward.y = 0;
    if (forward.lengthSquared() < 1e-10) forward.set(0, 0, 1);
    else forward.normalize();
    const right = Vector3.Cross(forward, Vector3.Up()).normalize();

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
      mx += forward.x * gamepadInput.moveForward + right.x * gamepadInput.moveX;
      mz += forward.z * gamepadInput.moveForward + right.z * gamepadInput.moveX;
      analogMove = Math.min(1, Math.hypot(gamepadInput.moveForward, gamepadInput.moveX));
    }
    const len = Math.hypot(mx, mz);
    if (len > 1e-10) {
      mx = (mx / len) * MV * analogMove * dt;
      mz = (mz / len) * MV * analogMove * dt;
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
