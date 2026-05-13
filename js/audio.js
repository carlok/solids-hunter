/**
 * Web Audio: WAV assets in assets/sounds/ with procedural fallbacks.
 * Exposes global GameAudio for main.js (loaded before main.js).
 */
(function (global) {
  'use strict';

  const AC = global.AudioContext || global.webkitAudioContext;
  const names = [
    'ui_click',
    'shoot',
    'hit_correct',
    'hit_wrong',
    'round_win',
    'footstep',
    'ambient',
  ];

  let ctx = null;
  /** @type {Record<string, AudioBuffer|null>} */
  const buffers = {};
  let ambientNode = null;
  let footCooldown = 0;

  function getCtx() {
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  }

  function resume() {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function playBuffer(name, vol, rate) {
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
    src.playbackRate.value = rate || 1;
    src.connect(g);
    g.connect(c.destination);
    src.start(0);
  }

  function beep(freq, dur, vol, type) {
    const c = getCtx();
    if (!c) return;
    resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol) {
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

  function fallback(name, vol) {
    const v = vol || 0.25;
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

  function stopAmbient() {
    try {
      if (ambientNode) {
        ambientNode.stop();
        ambientNode.disconnect();
      }
    } catch (e) {}
    ambientNode = null;
  }

  function startAmbient() {
    const c = getCtx();
    if (!c) return;
    resume();
    stopAmbient();
    const buf = buffers.ambient;
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = c.createGain();
    g.gain.value = 0.12;
    src.connect(g);
    g.connect(c.destination);
    src.start(0);
    ambientNode = src;
  }

  async function load() {
    const c = getCtx();
    if (!c) return;
    for (const n of names) buffers[n] = null;
    await Promise.all(
      names.map(async (n) => {
        try {
          const r = await fetch('assets/sounds/' + n + '.wav', { cache: 'force-cache' });
          if (!r.ok) return;
          const arr = await r.arrayBuffer();
          buffers[n] = await c.decodeAudioData(arr.slice(0));
        } catch (e) {
          buffers[n] = null;
        }
      })
    );
  }

  global.GameAudio = {
    load,
    resume,
    uiClick() {
      playBuffer('ui_click', 0.35, 1);
    },
    shoot() {
      playBuffer('shoot', 0.45, 1);
    },
    hitCorrect() {
      playBuffer('hit_correct', 0.42, 1);
    },
    hitWrong() {
      playBuffer('hit_wrong', 0.42, 1);
    },
    roundWin() {
      playBuffer('round_win', 0.4, 1);
    },
    maybeFootstep(dt, moving) {
      if (!moving) {
        footCooldown = 0;
        return;
      }
      footCooldown -= dt;
      if (footCooldown > 0) return;
      footCooldown = 0.32;
      playBuffer('footstep', 0.22, 0.85 + Math.random() * 0.2);
    },
    onEnterPlay() {
      startAmbient();
    },
    onLeavePlay() {
      stopAmbient();
    },
  };

  document.body.addEventListener(
    'click',
    () => {
      resume();
    },
    { once: true }
  );
})(typeof window !== 'undefined' ? window : globalThis);
