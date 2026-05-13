#!/usr/bin/env python3
"""Write tiny mono WAV SFX into assets/sounds/ (no third-party deps)."""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path


def write_wav(path: Path, samples: list[float], sample_rate: int = 22050) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        for s in samples:
            v = max(-1.0, min(1.0, s))
            w.writeframes(struct.pack("<h", int(v * 32767)))


def tone(freq: float, dur: float, sr: int, vol: float, decay: float = 6.0) -> list[float]:
    n = int(sr * dur)
    out: list[float] = []
    for i in range(n):
        t = i / sr
        env = math.exp(-decay * t / max(dur, 1e-6))
        out.append(vol * env * math.sin(2 * math.pi * freq * t))
    return out


def noise_burst(dur: float, sr: int, vol: float) -> list[float]:
    import random

    n = int(sr * dur)
    random.seed(42)
    out: list[float] = []
    for i in range(n):
        t = i / sr
        env = math.exp(-18 * t)
        out.append(vol * env * (random.random() * 2 - 1))
    return out


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_dir = root / "assets" / "sounds"
    sr = 22050

    write_wav(out_dir / "ui_click.wav", tone(880, 0.04, sr, 0.22, decay=20))

    write_wav(out_dir / "shoot.wav", noise_burst(0.06, sr, 0.35))

    hit_ok = []
    for f, v, d in ((523, 0.2, 0.12), (659, 0.18, 0.14), (784, 0.16, 0.16)):
        hit_ok += tone(f, d, sr, v, decay=5)
    write_wav(out_dir / "hit_correct.wav", hit_ok)

    hit_bad = tone(120, 0.22, sr, 0.35, decay=4) + tone(90, 0.15, sr, 0.25, decay=5)
    write_wav(out_dir / "hit_wrong.wav", hit_bad)

    win = tone(392, 0.15, sr, 0.25) + tone(523, 0.2, sr, 0.28) + tone(659, 0.35, sr, 0.22, decay=3)
    write_wav(out_dir / "round_win.wav", win)

    write_wav(out_dir / "footstep.wav", noise_burst(0.05, sr, 0.12) + [0.0] * int(sr * 0.01))

    # Short ambient loop: low beating tones
    amb: list[float] = []
    loop_s = 2.5
    n = int(sr * loop_s)
    for i in range(n):
        t = i / sr
        amb.append(
            0.08 * math.sin(2 * math.pi * 55 * t)
            + 0.05 * math.sin(2 * math.pi * 82 * t + 0.7 * math.sin(2 * math.pi * 0.4 * t))
        )
    write_wav(out_dir / "ambient.wav", amb, sr)

    print("Wrote:", out_dir)


if __name__ == "__main__":
    main()
