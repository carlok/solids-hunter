# Solids Hunter

First-person hunt by **Carlo Perassi**. Built with [Three.js](https://threejs.org/) r128 and `PointerLockControls`. Pick an arena, read the round rule, lock the pointer, then shoot only solids that satisfy the rule.

## Hunt rules

Each round draws a **random boolean rule** over the same seven colors and four shapes. Rules are always **satisfiable** (at least three matching solids are forced into the spawn set). Examples of what you might see:

- Simple: one color, one shape, or `NOT` on a single attribute  
- Compound: `AND`, `OR`, and nested combinations (e.g. color `AND NOT` shape)

The pre-round screen and in-game HUD show the rule in plain language.

## How solids move

Each solid picks one of four **movement modes**:

| Mode   | Behaviour |
|--------|-----------|
| **drift** | Slow walk toward random floor targets (classic wander). |
| **bounce** | Same horizontal motion with a stronger vertical bob and snappier spin. |
| **orbit** | Circles a fixed point on the ground with a gentle bob. |
| **slide** | Constant velocity on the XZ plane; reflects off arena bounds like a puck. |

## Look and render quality

Environments use a **sky-colored dome**, directional sun, and softer global lighting so scenes stay readable instead of overly dark.

The renderer uses **antialiasing**, **soft shadows** (`PCFSoftShadowMap`), optional **sRGB output**, **physically correct lights**, and **tone mapping** (ACES Filmic when available in r128, otherwise Reinhard). **Pixel ratio** is capped at 2 (or 1 when the user prefers reduced motion) to balance sharpness and GPU load.

To tune further: in `js/main.js` adjust `renderer.toneMappingExposure`, shadow map sizes on the sun light, `_dprCap`, or mesh segment counts in `makeEntityGeo()`.

## Run locally (Podman only — no host Node/npm)

The game needs HTTP (`fetch` for scripts/sounds). Use **Podman Compose** with the stock **nginx** image; the project directory is **bind-mounted** read-only (nothing is copied into a custom image).

```bash
cd solidshunter
make dev
# or: podman compose up web
```

Open [http://localhost:8080/](http://localhost:8080/).

### Tests and coverage (still Podman)

`test` and `build` services use the official **Node** image with the repo mounted at `/app`. Dependencies install into **named volumes** (`node_modules`, npm cache), not into your host tree. **`package-lock.json` is committed on purpose** so `npm ci` in those containers pins exact versions and stays reproducible.

```bash
make test       # unit tests
make coverage   # tests + V8 coverage report under coverage/
make dist       # minified dist/ on the host (written via bind mount)
make lock       # refresh package-lock.json after editing package.json
make clean      # remove dist/, coverage/, and compose volumes (node_modules volume)
```

You do **not** need `npm` or `node` installed on the host.

## Project layout

| Path | Role |
|------|------|
| `compose.yaml` | Podman Compose: nginx (dev), Node for `test` / `build` — volumes only, no app Dockerfile |
| `Makefile` | `dev`, `test`, `coverage`, `dist`, `lock`, `clean` — all delegate to Podman |
| `index.html` | Shell markup, CDN Three + PointerLock, `js/audio.js`, `js/main.js` (ES module) |
| `css/main.css` | All UI and overlay styles |
| `js/lib/game-rules.js` | Pure hunt-rule logic (unit-tested) |
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
