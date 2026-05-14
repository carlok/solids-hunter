/**
 * Hit coach: Web Speech, modal, localStorage — parity with `js/main.js`.
 */

import type { GameEntity } from './entity-motion';
import { gameFeedback } from './entity-motion';
import { GameAudio } from './game-audio';

const LS_HIT_CONFIRM = 'solidsHunterHitConfirm';
const LS_HIT_CONFIRM_N = 'solidsHunterHitConfirmN';

export type HitConfirmMode = 'off' | 'voice' | 'modal';

const COACH_SPEECH_LANG = 'en-US';
const COACH_SPEECH_RATE = 0.95;

let copyPoolIdx = 0;
let wrongVoiceTimer: ReturnType<typeof setTimeout> | null = null;
let hudToastTimer: ReturnType<typeof setTimeout> | null = null;
let pendingEndRoundTimer: ReturnType<typeof setTimeout> | null = null;
export let wantReLockAfterWrongModal = false;

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function getHitConfirmMode(): HitConfirmMode {
  try {
    const v = localStorage.getItem(LS_HIT_CONFIRM);
    if (v === 'voice' || v === 'modal') return v;
  } catch {
    /* ignore */
  }
  return 'off';
}

export function setHitConfirmMode(mode: HitConfirmMode): void {
  try {
    if (mode === 'off' || mode === 'voice' || mode === 'modal') {
      localStorage.setItem(LS_HIT_CONFIRM, mode);
    }
  } catch {
    /* ignore */
  }
  syncCoachButtons();
}

export function cycleHitConfirmMode(): void {
  const o = getHitConfirmMode();
  const next: HitConfirmMode = o === 'off' ? 'voice' : o === 'voice' ? 'modal' : 'off';
  setHitConfirmMode(next);
}

export function getHitConfirmFirstN(): number {
  try {
    const n = parseInt(localStorage.getItem(LS_HIT_CONFIRM_N) || '0', 10);
    if (n > 0 && n < 500) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

/** Call with `shotsThisRound` **before** incrementing (Three.js parity). */
export function coachAppliesThisShot(shotsThisRound: number): boolean {
  if (getHitConfirmMode() === 'off') return false;
  const cap = getHitConfirmFirstN();
  if (cap <= 0) return true;
  return shotsThisRound < cap;
}

export function syncCoachButtons(): void {
  const mode = getHitConfirmMode();
  const cap = getHitConfirmFirstN();
  let label = 'Coach: OFF';
  if (mode === 'voice') label = 'Coach: VOICE';
  if (mode === 'modal') label = 'Coach: MODAL';
  if (cap > 0) label += ' · first ' + cap;
  for (const id of ['menu-coach-btn', 'hunt-coach-btn', 'pause-coach-btn']) {
    const b = el<HTMLButtonElement>(id);
    if (!b) continue;
    b.textContent = label;
  }
}

export function hideLockErrBanner(): void {
  const b = el('lock-err-banner');
  if (!b) return;
  b.classList.add('hidden');
  b.textContent = '';
}

export function showLockErrBanner(text: string): void {
  const b = el('lock-err-banner');
  if (!b) return;
  b.textContent = text;
  b.classList.remove('hidden');
}

function enableHitFeedbackOkButton(): void {
  const hitFeedbackOk = el<HTMLButtonElement>('hit-feedback-ok');
  if (!hitFeedbackOk) return;
  hitFeedbackOk.disabled = false;
  hitFeedbackOk.removeAttribute('aria-busy');
}

export function cancelHitSpeech(): void {
  try {
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.cancel) {
      speechSynthesis.cancel();
    }
  } catch {
    /* ignore */
  }
  if (hitFeedbackModalVisible()) {
    enableHitFeedbackOkButton();
  }
}

export function resetHitFeedbackState(): void {
  gameFeedback.paused = false;
  wantReLockAfterWrongModal = false;
  if (wrongVoiceTimer) {
    clearTimeout(wrongVoiceTimer);
    wrongVoiceTimer = null;
  }
  if (hudToastTimer) {
    clearTimeout(hudToastTimer);
    hudToastTimer = null;
  }
  if (pendingEndRoundTimer) {
    clearTimeout(pendingEndRoundTimer);
    pendingEndRoundTimer = null;
  }
  cancelHitSpeech();
  enableHitFeedbackOkButton();
  const modalHitFeedback = el('modal-hit-feedback');
  if (modalHitFeedback) modalHitFeedback.classList.add('hidden');
  const hudCoachToast = el('hud-coach-toast');
  if (hudCoachToast) {
    hudCoachToast.classList.add('hidden');
    hudCoachToast.textContent = '';
  }
}

function hitFeedbackModalVisible(): boolean {
  const modalHitFeedback = el('modal-hit-feedback');
  return modalHitFeedback !== null && !modalHitFeedback.classList.contains('hidden');
}

export function isHitFeedbackModalVisible(): boolean {
  return hitFeedbackModalVisible();
}

function pickWrongIntro(color: string, shape: string): string {
  const pool = [
    () => `That solid is a ${color} ${shape}.`,
    () => `You tagged a ${color} ${shape}.`,
    () => `This one reads ${color} ${shape} on the label.`,
    () => `${color} ${shape} — noted.`,
  ];
  const f = pool[copyPoolIdx % pool.length]!;
  copyPoolIdx++;
  return f();
}

function pickWrongBridge(): string {
  const pool = [
    () => "It doesn’t match the rule shown at the top of the HUD right now.",
    () => 'Compare it to the rule strip: it doesn’t satisfy that boolean.',
    () => 'The on-screen rule is what counts; this pick doesn’t fit it.',
    () => 'Re-read the target rule — this shape isn’t in the solution set.',
  ];
  const f = pool[copyPoolIdx % pool.length]!;
  copyPoolIdx++;
  return f();
}

function pickWrongTask(): string {
  const pool = [
    () => 'Keep scanning for solids that make the rule true.',
    () => 'Look for another solid that satisfies the boolean expression.',
    () => 'Next click: aim for a solid that fits the rule text.',
    () => 'Stay with the rule at the top — hunt targets that satisfy it.',
  ];
  const f = pool[copyPoolIdx % pool.length]!;
  copyPoolIdx++;
  return f();
}

function buildWrongCoachText(color: string, shape: string): string {
  return `${pickWrongIntro(color, shape)}\n\n${pickWrongBridge()}\n\n${pickWrongTask()}`;
}

function pickCorrectToast(color: string, shape: string): string {
  const pool = [
    `Locked in — ${color} ${shape}.`,
    `That one satisfies the rule: ${color} ${shape}.`,
    `Clean pick: ${color} ${shape}.`,
    `Rule satisfied — ${color} ${shape}.`,
    `Yes — ${color} ${shape} matches the target rule.`,
  ];
  const line = pool[copyPoolIdx % pool.length]!;
  copyPoolIdx++;
  return line;
}

function showHudToast(text: string, ms: number): void {
  const hudCoachToast = el('hud-coach-toast');
  if (!hudCoachToast) return;
  hudCoachToast.textContent = text;
  hudCoachToast.classList.remove('hidden');
  if (hudToastTimer) clearTimeout(hudToastTimer);
  hudToastTimer = setTimeout(() => {
    hudToastTimer = null;
    hudCoachToast.classList.add('hidden');
  }, ms || 2400);
}

function coachSpokenFromBody(body: string, maxLen?: number): string {
  const max = maxLen == null ? 400 : maxLen;
  const paras = String(body)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  let out = paras.slice(0, 2).join(' ');
  if (out.length > max) out = out.slice(0, max - 1).trimEnd() + '…';
  return out;
}

function getPreferredEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const list = speechSynthesis.getVoices();
  if (!list.length) return null;
  const normLang = (s: string) => (s || '').toLowerCase().replace('_', '-');
  const en = list.filter((v) => /^en\b/i.test(normLang(v.lang)));
  if (!en.length) return null;

  function score(v: SpeechSynthesisVoice): number {
    const n = (v.name || '').toLowerCase();
    let s = 0;
    if (v.default === true) s += 85;
    if (/\bgoogle us english\b/.test(n)) s += 50;
    if (/\bgoogle uk english (female|male)\b/.test(n)) s += 42;
    if (/\bsamantha\b/.test(n)) s += 42;
    if (/\b(victoria|karen|fiona|allison|serena|moira|tessa|daniel|martha|arthur|oliver)\b/.test(n)) s += 28;
    if (/\b(natural|premium|enhanced|neural)\b/.test(n)) s += 34;
    if (/\bgoogle\b/.test(n)) s += 20;
    if (/\bmicrosoft\b/.test(n) && /\b(aria|jenny|guy|zira|mark|susan|andrew|sonia)\b/.test(n)) s += 30;
    const L = normLang(v.lang);
    if (L === 'en-us' || L.startsWith('en-us')) s += 12;
    if (/\b(zarvox|fred|albert|bad news|cellos|kathy|agnes|vicki)\b/.test(n)) s -= 50;
    if (/\b(whisper|croak|rocko)\b/.test(n)) s -= 40;
    if (/\bcompact\b/.test(n)) s -= 18;
    return s;
  }

  let best = en[0]!;
  let bestS = score(best);
  for (let i = 1; i < en.length; i++) {
    const t = score(en[i]!);
    if (t > bestS) {
      bestS = t;
      best = en[i]!;
    }
  }
  return best;
}

export function speakCoachLine(text: string, onEnd?: () => void): number {
  const done = () => {
    if (typeof onEnd === 'function') {
      try {
        onEnd();
      } catch {
        /* ignore */
      }
    }
  };
  if (!text) {
    queueMicrotask(done);
    return 400;
  }
  if (typeof speechSynthesis === 'undefined') {
    queueMicrotask(done);
    return 600;
  }
  if (!GameAudio.isSpeechAllowed()) {
    queueMicrotask(done);
    return 600;
  }
  try {
    try {
      if (speechSynthesis.paused) speechSynthesis.resume();
    } catch {
      /* ignore */
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = getPreferredEnglishVoice();
    if (voice) {
      u.voice = voice;
      const vl = (voice.lang || '').toLowerCase().replace('_', '-');
      if (/^en-us/.test(vl)) u.lang = 'en-US';
      else if (/^en-gb/.test(vl)) u.lang = 'en-GB';
      else if (/^en/.test(vl)) u.lang = (voice.lang || COACH_SPEECH_LANG).replace('_', '-');
      else u.lang = COACH_SPEECH_LANG;
    } else {
      u.lang = COACH_SPEECH_LANG;
    }
    u.rate = COACH_SPEECH_RATE;
    u.pitch = 1;
    u.volume = 1;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
    const w = text.length;
    return Math.min(4200, 520 + w * 48);
  } catch {
    queueMicrotask(done);
    return 600;
  }
}

if (typeof speechSynthesis !== 'undefined') {
  try {
    void speechSynthesis.getVoices();
  } catch {
    /* ignore */
  }
  speechSynthesis.addEventListener('voiceschanged', () => {
    try {
      void speechSynthesis.getVoices();
    } catch {
      /* ignore */
    }
  });
}

export function scheduleEndRoundAfterMs(ms: number, endRound: () => void, matchLeft: number): void {
  if (matchLeft > 0) return;
  if (pendingEndRoundTimer) clearTimeout(pendingEndRoundTimer);
  pendingEndRoundTimer = setTimeout(() => {
    pendingEndRoundTimer = null;
    endRound();
  }, Math.max(700, ms | 0));
}

export function finishWrongModalAndResume(): void {
  const hitFeedbackOk = el<HTMLButtonElement>('hit-feedback-ok');
  if (hitFeedbackOk?.disabled) return;
  const modalHitFeedback = el('modal-hit-feedback');
  if (modalHitFeedback) modalHitFeedback.classList.add('hidden');
  cancelHitSpeech();
  gameFeedback.paused = false;
  wantReLockAfterWrongModal = true;
  showLockErrBanner('Click the arena to capture the mouse again and continue hunting.');
}

function beginWrongCoachVoiceOnly(color: string, shape: string): void {
  const body = buildWrongCoachText(color, shape);
  const parts = body.split('\n\n');
  showHudToast((parts[0] || '') + ' — check the rule strip.', 2800);
  const spoken = coachSpokenFromBody(body);
  gameFeedback.paused = true;
  if (wrongVoiceTimer) {
    clearTimeout(wrongVoiceTimer);
    wrongVoiceTimer = null;
  }
  speakCoachLine(spoken, () => {
    gameFeedback.paused = false;
  });
}

function beginWrongCoachModal(color: string, shape: string): void {
  const body = buildWrongCoachText(color, shape);
  const hitFeedbackBody = el('hit-feedback-body');
  if (hitFeedbackBody) hitFeedbackBody.textContent = body;
  gameFeedback.paused = true;
  const modalHitFeedback = el('modal-hit-feedback');
  if (modalHitFeedback) modalHitFeedback.classList.remove('hidden');
  const hitFeedbackOk = el<HTMLButtonElement>('hit-feedback-ok');
  if (hitFeedbackOk) {
    hitFeedbackOk.disabled = true;
    hitFeedbackOk.setAttribute('aria-busy', 'true');
  }
  try {
    document.exitPointerLock();
  } catch {
    /* ignore */
  }
  const spoken = coachSpokenFromBody(body);
  speakCoachLine(spoken, () => {
    enableHitFeedbackOkButton();
  });
}

/** After the last correct hit, delay round end until coach speech ends (if any). */
export function scheduleEndRoundAfterCorrectCoach(
  ent: GameEntity,
  coachThis: boolean,
  matchLeft: number,
  endRound: () => void,
): void {
  if (matchLeft > 0) return;
  const mode = getHitConfirmMode();
  if (!coachThis || mode === 'off' || !GameAudio.isSpeechAllowed()) {
    scheduleEndRoundAfterMs(700, endRound, 0);
    return;
  }
  const tip = pickCorrectToast(ent.colorName, ent.shape);
  showHudToast(tip, 2200);
  speakCoachLine(tip, () => {
    scheduleEndRoundAfterMs(700, endRound, 0);
  });
}

export function onHitWrongAfterScoring(ent: GameEntity, coachThis: boolean): void {
  if (!coachThis) return;
  const mode = getHitConfirmMode();
  if (mode === 'voice') beginWrongCoachVoiceOnly(ent.colorName, ent.shape);
  else if (mode === 'modal') beginWrongCoachModal(ent.colorName, ent.shape);
}

/** Clear re-lock flag when pointer lock succeeds (Three `controls` lock). */
export function onPointerLockAcquired(): void {
  wantReLockAfterWrongModal = false;
}

export function syncSoundToggles(): void {
  const m = GameAudio.isMuted();
  const hudSoundToggle = el<HTMLButtonElement>('hud-sound-toggle');
  if (hudSoundToggle) {
    hudSoundToggle.setAttribute('aria-pressed', m ? 'true' : 'false');
    hudSoundToggle.textContent = m ? '🔇' : '🔊';
    hudSoundToggle.title = m ? 'Sound off — click or M to enable' : 'Sound on — click or M to mute';
  }
  for (const id of ['menu-sound-toggle', 'hunt-sound-toggle', 'pause-sound-toggle']) {
    const b = el<HTMLButtonElement>(id);
    if (!b) continue;
    b.setAttribute('aria-pressed', m ? 'true' : 'false');
    b.textContent = m ? 'Sound: OFF' : 'Sound: ON';
  }
}

export function wireCoachAndSoundUi(canvas: HTMLCanvasElement): void {
  const hitFeedbackOk = el<HTMLButtonElement>('hit-feedback-ok');
  if (hitFeedbackOk) {
    hitFeedbackOk.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hitFeedbackOk.disabled) return;
      finishWrongModalAndResume();
    });
  }
  for (const id of ['menu-coach-btn', 'hunt-coach-btn', 'pause-coach-btn']) {
    const b = el<HTMLButtonElement>(id);
    if (!b) continue;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleHitConfirmMode();
    });
  }
  const onSoundToggleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (e.currentTarget === el('hud-sound-toggle')) e.preventDefault();
    GameAudio.toggleMuted();
    cancelHitSpeech();
    syncSoundToggles();
  };
  for (const id of ['hud-sound-toggle', 'menu-sound-toggle', 'hunt-sound-toggle', 'pause-sound-toggle']) {
    const b = el<HTMLButtonElement>(id);
    if (b) b.addEventListener('click', onSoundToggleClick);
  }

  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      if (e.target === canvas && document.pointerLockElement === canvas) return;
      if (
        (e.target as Element | null)?.closest(
          '#hud-sound-toggle, #menu-sound-toggle, #hunt-sound-toggle, #pause-sound-toggle, #menu-coach-btn, #hunt-coach-btn, #pause-coach-btn',
        )
      )
        return;
      if ((e.target as Element | null)?.closest('button, .env-card, .modal-close, a')) {
        GameAudio.uiClick();
      }
    },
    true,
  );

  syncCoachButtons();
  syncSoundToggles();

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      const modalHelp = el('modal-help');
      if (modalHelp && !modalHelp.classList.contains('hidden')) {
        modalHelp.classList.add('hidden');
        e.preventDefault();
        return;
      }
      const modalCredits = el('modal-credits');
      if (modalCredits && !modalCredits.classList.contains('hidden')) {
        modalCredits.classList.add('hidden');
        e.preventDefault();
        return;
      }
      if (hitFeedbackModalVisible()) {
        e.preventDefault();
        const ok = el<HTMLButtonElement>('hit-feedback-ok');
        if (!ok || !ok.disabled) {
          finishWrongModalAndResume();
        }
        return;
      }
    }
    if (e.code === 'KeyM' && !e.repeat) {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          (typeof t.isContentEditable === 'boolean' && t.isContentEditable));
      if (!typing) {
        GameAudio.toggleMuted();
        cancelHitSpeech();
        syncSoundToggles();
        e.preventDefault();
      }
    }
  });
}
