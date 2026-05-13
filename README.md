# HUNT — 3D Shape Hunter

First-person shape hunt built with [Three.js](https://threejs.org/) r128 and `PointerLockControls`. Pick an arena, learn your target rule (color + shape), then lock the pointer and shoot only matching entities.

## Run locally

Because the game loads scripts and WAVs with `fetch`, use a **local static server** (not `file://`):

```bash
cd solidshunter
python3 -m http.server 8080
```

Open `http://localhost:8080/`.

## Project layout

| Path | Role |
|------|------|
| `index.html` | Shell markup, CDN Three + PointerLock, then `js/audio.js` and `js/main.js` |
| `css/main.css` | All UI and overlay styles |
| `js/main.js` | Scene, environments, entities, input, raycast |
| `js/audio.js` | Web Audio: UI, shoot, hits, round win, footsteps, ambient loop |
| `assets/sounds/*.wav` | Short mono SFX (regenerate with `tools/generate_sounds.py`) |
| `tools/generate_sounds.py` | Writes procedural WAVs into `assets/sounds/` |

## Audio

- **General:** `ambient.wav` (looped quietly while pointer-locked in play), `ui_click.wav` for buttons and menu actions.
- **Actions:** `shoot.wav` on each in-game click, `hit_correct.wav` / `hit_wrong.wav` on valid targets, `round_win.wav` when the round ends, `footstep.wav` throttled while moving.

If WAVs are missing or fail to decode, `js/audio.js` falls back to short synthesized tones and noise.

## Controls

- **Move:** WASD or arrow keys  
- **Look:** mouse (after pointer lock)  
- **Shoot:** left-click on a shape  
- **Pause:** Esc  
- **Menu:** top-left hamburger — Help, Credits, Main menu  

## License

Personal / educational use unless you specify otherwise.
