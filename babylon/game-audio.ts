/**
 * Web Audio: WAV in /assets/sounds/ with procedural fallbacks.
 * Parity with `js/audio.js`, as an ES module for the Babylon build.
 */

const AC = typeof window !== 'undefined' ? window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;

const names = ['ui_click', 'shoot', 'hit_correct', 'hit_wrong', 'round_win', 'footstep'] as const;

type SoundName = (typeof names)[number];

let ctx: AudioContext | null = null;
const buffers: Partial<Record<SoundName, AudioBuffer | null>> = {};
let footCooldown = 0;

let muted = false;
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('solidsHunterMute') === '1') muted = true;
} catch {
  /* ignore */
}

function persistMuted(value: boolean): void {
  muted = !!value;
  try {
    localStorage.setItem('solidsHunterMute', muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function getCtx(): AudioContext | null {
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function resume(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

function playBuffer(name: SoundName, vol: number, rate?: number): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  resume();
  const buf = buffers[name];
  if (!buf) {
    fallback(name, vol);
    return;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  src.playbackRate.value = rate ?? 1;
  src.connect(g);
  g.connect(c.destination);
  src.start(0);
}

function beep(freq: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  resume();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

function noiseBurst(dur: number, vol: number): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  resume();
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / c.sampleRate;
    const env = Math.exp(-18 * t);
    d[i] = (Math.random() * 2 - 1) * vol * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = 0.9;
  src.connect(g);
  g.connect(c.destination);
  src.start(0);
}

function fallback(name: SoundName, vol?: number): void {
  const v = vol ?? 0.25;
  switch (name) {
    case 'ui_click':
      beep(880, 0.04, v * 0.3, 'square');
      break;
    case 'shoot':
      noiseBurst(0.05, v * 0.4);
      break;
    case 'hit_correct':
      beep(523, 0.08, v * 0.2);
      setTimeout(() => beep(784, 0.12, v * 0.18), 60);
      break;
    case 'hit_wrong':
      beep(120, 0.2, v * 0.25, 'sawtooth');
      break;
    case 'round_win':
      beep(392, 0.1, v * 0.2);
      setTimeout(() => beep(523, 0.12, v * 0.22), 90);
      setTimeout(() => beep(659, 0.2, v * 0.18), 200);
      break;
    case 'footstep':
      noiseBurst(0.04, v * 0.15);
      break;
    default:
      break;
  }
}

async function load(): Promise<void> {
  const c = getCtx();
  if (!c) return;
  for (const n of names) buffers[n] = null;
  await Promise.all(
    names.map(async (n) => {
      try {
        const r = await fetch('/assets/sounds/' + n + '.wav', { cache: 'force-cache' });
        if (!r.ok) return;
        const arr = await r.arrayBuffer();
        buffers[n] = await c.decodeAudioData(arr.slice(0));
      } catch {
        buffers[n] = null;
      }
    }),
  );
}

export const GameAudio = {
  load,
  resume,
  isMuted(): boolean {
    return muted;
  },
  isSpeechAllowed(): boolean {
    return !muted;
  },
  setMuted(on: boolean): void {
    persistMuted(on);
  },
  toggleMuted(): void {
    persistMuted(!muted);
  },
  uiClick(): void {
    playBuffer('ui_click', 0.35, 1);
  },
  shoot(): void {
    playBuffer('shoot', 0.45, 1);
  },
  hitCorrect(): void {
    playBuffer('hit_correct', 0.42, 1);
  },
  hitWrong(): void {
    playBuffer('hit_wrong', 0.42, 1);
  },
  roundWin(): void {
    playBuffer('round_win', 0.4, 1);
  },
  maybeFootstep(dt: number, moving: boolean): void {
    if (!moving) {
      footCooldown = 0;
      return;
    }
    footCooldown -= dt;
    if (footCooldown > 0) return;
    footCooldown = 0.32;
    playBuffer('footstep', 0.22, 0.85 + Math.random() * 0.2);
  },
  onEnterPlay(): void {},
  onLeavePlay(): void {},
};

if (typeof window !== 'undefined') {
  (window as typeof window & { GameAudio?: typeof GameAudio }).GameAudio = GameAudio;
  document.body.addEventListener(
    'click',
    () => {
      resume();
    },
    { once: true },
  );
}
