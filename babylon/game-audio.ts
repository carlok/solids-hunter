/**
 * Web Audio: WAV in /assets/sounds/ with procedural fallbacks.
 * Parity with `js/audio.js`, as an ES module for the Babylon build.
 */

const AC = typeof window !== 'undefined' ? window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;

const names = ['ui_click', 'shoot', 'hit_correct', 'hit_wrong', 'round_win', 'footstep'] as const;

type SoundName = (typeof names)[number];
type AmbientArena = 'lab' | 'dungeon' | 'forest' | 'duomo';
type AmbientNode = {
  stop: (when: number) => void;
};

let ctx: AudioContext | null = null;
const buffers: Partial<Record<SoundName, AudioBuffer | null>> = {};
let footCooldown = 0;
let currentArena: AmbientArena = 'lab';
let ambientGain: GainNode | null = null;
let ambientNodes: AmbientNode[] = [];
let ambientPlaying = false;
let ambientWanted = false;
let ambientEnabled = false;

let muted = false;
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('solidsHunterMute') === '1') muted = true;
  if (typeof localStorage !== 'undefined' && localStorage.getItem('solidsHunterAmbient') === '1') ambientEnabled = true;
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
  if (!muted && ambientEnabled && ambientWanted && !ambientPlaying) startAmbient();
  updateAmbientMute();
}

function persistAmbientEnabled(value: boolean): void {
  ambientEnabled = !!value;
  try {
    localStorage.setItem('solidsHunterAmbient', ambientEnabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (ambientEnabled) {
    if (ambientWanted && !ambientPlaying) startAmbient();
    updateAmbientMute();
  } else {
    stopAmbient(false);
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

function updateAmbientMute(): void {
  const c = ctx;
  if (!c || !ambientGain) return;
  ambientGain.gain.cancelScheduledValues(c.currentTime);
  ambientGain.gain.setTargetAtTime(muted || !ambientEnabled ? 0 : 0.11, c.currentTime, 0.3);
}

function playBuffer(name: SoundName, vol: number, rate?: number, maxDuration?: number): void {
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
  if (maxDuration !== undefined) {
    const stopAt = c.currentTime + maxDuration;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.linearRampToValueAtTime(0.001, stopAt);
    src.stop(stopAt + 0.02);
  }
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
      {
        const rate = hitPlaybackRate('correct', Math.random());
        beep(523 * rate, 0.08, v * 0.2);
        setTimeout(() => beep(784 * rate, 0.12, v * 0.18), 60);
      }
      break;
    case 'hit_wrong':
      beep(120 * hitPlaybackRate('wrong', Math.random()), 0.2, v * 0.25, 'sawtooth');
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

export function hitPlaybackRate(kind: 'correct' | 'wrong', random: number): number {
  const variation = Math.max(0, Math.min(1, random));
  return kind === 'correct' ? 0.96 + variation * 0.08 : 0.94 + variation * 0.1;
}

function createLoopingNoise(c: AudioContext): AudioBufferSourceNode {
  const seconds = 2;
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function connectDroneOsc(
  c: AudioContext,
  dest: AudioNode,
  freq: number,
  type: OscillatorType,
  gain: number,
  detune = 0,
): AmbientNode {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(dest);
  osc.start();
  return { stop: (when) => osc.stop(when) };
}

function startAmbient(): void {
  ambientWanted = true;
  if (ambientPlaying || muted || !ambientEnabled) return;
  const c = getCtx();
  if (!c) return;
  resume();
  ambientPlaying = true;
  ambientNodes = [];
  ambientGain = c.createGain();
  ambientGain.gain.setValueAtTime(0.0001, c.currentTime);
  ambientGain.gain.exponentialRampToValueAtTime(0.11, c.currentTime + 1.6);
  ambientGain.connect(c.destination);

  const filter = c.createBiquadFilter();
  filter.connect(ambientGain);

  switch (currentArena) {
    case 'dungeon': {
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      ambientNodes.push(connectDroneOsc(c, filter, 41.2, 'sawtooth', 0.055, -6));
      ambientNodes.push(connectDroneOsc(c, filter, 55, 'triangle', 0.045, 4));
      ambientNodes.push(connectDroneOsc(c, filter, 82.4, 'sine', 0.035));
      break;
    }
    case 'forest': {
      filter.type = 'bandpass';
      filter.frequency.value = 980;
      filter.Q.value = 0.65;
      const noise = createLoopingNoise(c);
      const g = c.createGain();
      g.gain.value = 0.045;
      noise.connect(g);
      g.connect(filter);
      noise.start();
      ambientNodes.push({ stop: (when) => noise.stop(when) });
      ambientNodes.push(connectDroneOsc(c, filter, 146.8, 'sine', 0.025, -8));
      ambientNodes.push(connectDroneOsc(c, filter, 220, 'sine', 0.018, 7));
      break;
    }
    case 'duomo': {
      filter.type = 'lowpass';
      filter.frequency.value = 760;
      ambientNodes.push(connectDroneOsc(c, filter, 65.4, 'sine', 0.052, -4));
      ambientNodes.push(connectDroneOsc(c, filter, 98, 'triangle', 0.038, 5));
      ambientNodes.push(connectDroneOsc(c, filter, 130.8, 'sine', 0.03, -9));
      break;
    }
    case 'lab':
    default: {
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      ambientNodes.push(connectDroneOsc(c, filter, 61.7, 'triangle', 0.04, -3));
      ambientNodes.push(connectDroneOsc(c, filter, 123.5, 'sine', 0.026, 4));
      ambientNodes.push(connectDroneOsc(c, filter, 185, 'sine', 0.018, -7));
      break;
    }
  }

  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = currentArena === 'lab' ? 0.09 : 0.045;
  lfoGain.gain.value = currentArena === 'forest' ? 140 : 55;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();
  ambientNodes.push({ stop: (when) => lfo.stop(when) });
}

function stopAmbient(clearWanted = true): void {
  if (clearWanted) ambientWanted = false;
  const c = ctx;
  if (!c || !ambientPlaying) return;
  ambientPlaying = false;
  const stopAt = c.currentTime + 0.85;
  if (ambientGain) {
    ambientGain.gain.cancelScheduledValues(c.currentTime);
    ambientGain.gain.setTargetAtTime(0.0001, c.currentTime, 0.22);
  }
  for (const n of ambientNodes) {
    try {
      n.stop(stopAt);
    } catch {
      /* ignore already stopped nodes */
    }
  }
  ambientNodes = [];
  window.setTimeout(() => {
    ambientGain?.disconnect();
    ambientGain = null;
  }, 1000);
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
  isAmbientEnabled(): boolean {
    return ambientEnabled;
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
  setAmbientEnabled(on: boolean): void {
    persistAmbientEnabled(on);
  },
  toggleAmbientEnabled(): void {
    persistAmbientEnabled(!ambientEnabled);
  },
  uiClick(): void {
    playBuffer('ui_click', 0.35, 1);
  },
  shoot(): void {
    playBuffer('shoot', 0.45, 1);
  },
  hitCorrect(): void {
    playBuffer('hit_correct', 0.42, hitPlaybackRate('correct', Math.random()));
  },
  hitWrong(): void {
    playBuffer('hit_wrong', 0.42, hitPlaybackRate('wrong', Math.random()));
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
    playBuffer('footstep', 0.22, 0.85 + Math.random() * 0.2, 0.09);
  },
  setArena(arena: string): void {
    if (arena === 'dungeon' || arena === 'forest' || arena === 'duomo' || arena === 'lab') {
      currentArena = arena;
    } else {
      currentArena = 'lab';
    }
  },
  onEnterPlay(): void {
    startAmbient();
  },
  onLeavePlay(): void {
    stopAmbient();
  },
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
