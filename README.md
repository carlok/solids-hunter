# Solids Hunter

First-person hunt built with [Babylon.js](https://www.babylonjs.com/). Pick an arena, read the round rule, then shoot only solids that satisfy the rule with desktop, gamepad, or mobile controls.

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

Environments use a **sky dome** with a vertical gradient, directional sun, and balanced lighting. **Forest** uses darker floors than perimeter walls; **dungeon**, **lab**, **duomo**, and stone use **`envTintHex`** for stable per-surface variation. The renderer uses antialiasing, fog where appropriate, and **ACES-style tone mapping** for readability.

## Run locally (Podman only — no host Node/npm)

The game needs HTTP (`fetch` for sounds).

```bash
cd solidshunter
make dev
# or: ./scripts/podman dev
```

Open **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)** (add `?env=lab`, `dungeon`, `forest`, or `duomo` if you like).

First time (or after `compose.yaml` / `Containerfile` changes): `./scripts/podman compose-build && ./scripts/podman install`.

**Pointer lock:** Desktop mouse play needs a **secure context** (`https://` or `http://localhost` / `http://127.0.0.1`). Mobile play does not rely on pointer lock: rotate to landscape, use the left thumb pad to move, drag the right side to look, and tap **FIRE** to shoot.

### Tests and coverage

```bash
make test           # unit tests
make coverage       # tests + V8 coverage report under coverage/
make dist           # production build → dist-babylon/
make lock           # refresh package-lock.json after editing package.json
make clean          # remove dist-babylon/, coverage/, and compose volumes
```

## Project layout

| Path | Role |
|------|------|
| `compose.yaml` | Podman Compose: **dev** (Vite 5173), **test** / **test-cov**, **build** |
| `Makefile` | `dev`, `test`, `coverage`, `dist`, `lock`, `clean` — Podman |
| `index.html` | App shell; Vite entry → `babylon/main.ts` |
| `babylon/` | Scene, arenas, entities, input, audio, coach |
| `lib/` | Pure hunt rules + 2D collision helpers (unit-tested) |
| `css/main.css` | UI and overlay styles |
| `assets/sounds/*.wav` | Short mono SFX (regenerate with `tools/generate_sounds.py`) |
| `tools/generate_sounds.py` | Writes procedural WAVs into `assets/sounds/` |
| `LICENSE` | MIT |

## Audio

- **General:** `ui_click.wav` for buttons and menu actions.
- **Actions:** `shoot.wav`, `hit_correct.wav` / `hit_wrong.wav`, `round_win.wav`, `footstep.wav` while moving.

If WAVs fail to decode, the game falls back to short synthesized tones where implemented.

## Controls

- **Move:** WASD / arrow keys, gamepad left stick, or mobile left thumb pad  
- **Look:** mouse (after pointer lock), gamepad right stick, or mobile right-side drag  
- **Shoot:** left-click, gamepad RT/R2, or mobile **FIRE** button — tracer from view to hit (or max range), then green/red flash on targets.  
- **Gamepad:** A / bottom face button starts or resumes, Start/Menu pauses, RT/R2 shoots.
- **Mobile:** rotate to landscape before playing; portrait shows a rotate prompt.
- **Pause:** Esc  
- **Menu:** top-left hamburger  

## License

This project is released under the [MIT License](LICENSE).
