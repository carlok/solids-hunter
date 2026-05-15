# Solids Hunter → Babylon.js porting brief

This document is meant for **another LLM or engineer** rebuilding the project in **Babylon.js** without reading every line of the Three.js implementation. It captures **product intent**, **architecture**, **data contracts**, and **1:1 engine mappings**.

---

## 1. What the game is

- **Genre:** First-person “hunt” — pointer-locked walk, ray-based shooting (not projectile physics).
- **Core loop:** Pick arena → see a **boolean rule** on text (colors, shapes, AND/OR/NOT) → lock pointer → **shoot only solids that satisfy the rule** with LMB. Correct match **+10**, wrong **−5**, clear all matching targets to end the round.
- **Solids:** Colored 3D shapes (sphere, tetrahedron, cube, cylinder) with a small **black backface outline** mesh parented as child, plus a **billboard text label** (sprite) above.
- **Motion modes (per entity):** `drift`, `bounce` (seek random open XZ targets), `orbit` (circle in XZ), `slide` (constant XZ velocity with wall bounces).
- **Environments:** Procedural “arenas” — `dungeon`, `forest`, `lab`, `ruins` — built from boxes/planes, trees, etc. **Axis-aligned wall boxes** are collected for **player capsule-ish AABB** and **entity foot AABB** checks.
- **Audio:** Web Audio buffers for shoot / hit / UI (see `js/audio.js`). During play, the **HUD** includes a **sound toggle** (top-left): mutes all one-shots (shoot, hits, footsteps, UI beeps from the global click handler) while **persisting** choice in `localStorage` under key **`solidsHunterMute`** (`'1'` = muted). API: `GameAudio.isMuted()`, `GameAudio.setMuted(boolean)`, `GameAudio.toggleMuted()`. **`GameAudio.isSpeechAllowed()`** is `!muted` — when muted, **Web Speech coach lines** must not run; toggling mute should **cancel** any in-flight `speechSynthesis` (see `cancelHitSpeech` pattern in `main.js`). The toggle button uses **`pointer-events: auto`** inside an otherwise `pointer-events: none` HUD overlay. **UX parity:** **`M`** toggles mute from the keyboard (skip when typing in inputs); **pre-game** labeled buttons on the arena picker, hunt/rule screen, and pause overlay (`Sound: ON` / `Sound: OFF`) mirror the same state and call `toggleMuted()`.
- **Hit coach (optional):** Three modes, cycled by **`Coach: OFF / VOICE / MODAL`** buttons on arena, hunt, and pause screens. Persisted in **`localStorage.solidsHunterHitConfirm`**: `'off'`, `'voice'`, or `'modal'`. Optional cap **`localStorage.solidsHunterHitConfirmN`**: parse as integer; if `1 ≤ N < 500`, coach applies only for the **first N solid hits** in the round (`shotsThisRound`); **`0` or missing** = unlimited. Coach copy is built from **rotating phrase pools** in `main.js` (`pickWrongIntro` / `pickWrongBridge` / `pickWrongTask`, `pickCorrectToast`) — not in `game-rules.js`. **Web Speech:** `SpeechSynthesisUtterance` with **`en-US`** (or voice-native `en-*`) language, **rate ~0.95**, best **English** voice chosen from `speechSynthesis.getVoices()` via heuristics (default / Google / Samantha / neural-ish names, penalties for novelty voices). Spoken text is a **short excerpt** (`coachSpokenFromBody`: first paragraphs, max ~400 chars); **full** wrong-hit copy lives in the **modal** (`#hit-feedback-body`) or a one-line **HUD toast** (`#hud-coach-toast`). **Wrong hit + `voice`:** set **`feedbackPaused`** so **entity motion and player movement** are skipped in the main loop until TTS ends; show toast; no pointer unlock. **Wrong hit + `modal`:** `feedbackPaused = true`, show `#modal-hit-feedback`, **`controls.unlock()`**, **`#hit-feedback-ok` disabled** until `utterance.onend` / `onerror`, then enable OK; on OK/Escape (when enabled), hide modal, cancel speech, clear `feedbackPaused`, set **`wantReLockAfterWrongModal`** and show banner to **click canvas** to `controls.lock()` again. **Correct hit clearing the round:** if coach applies and speech allowed, **`scheduleEndRoundAfterCorrectCoach`** shows a short correct toast + speaks one line, then **`scheduleEndRoundAfterMs(700)`** before **`endRound()`**; otherwise round end uses the same minimum delay without speech. **`spawnEntities()`** calls **`resetHitFeedbackState()`** then **`shotsThisRound = 0`**.

---

## 2. Repository map (keep as logic modules)

| Path | Role | Babylon port |
|------|------|----------------|
| `js/main.js` | Scene, renderer, env builders, entities, loop, ray pick, shot VFX | Becomes `Scene`, `Engine`, thin game class; **split** into `ArenaBuilder`, `EntitySpawner`, `GameLoop` |
| `js/lib/game-rules.js` | **Pure JS** — rules, `COLORS`, `SHAPES`, `MOVE_MODES`, `generateHuntRule`, `ensureMinimumMatches` | **Import unchanged** or copy verbatim |
| `js/lib/entity-collision-2d.js` | **Pure JS** — XZ circle overlap separation | **Import unchanged** |
| `js/audio.js` | Loader + one-shots + **mute flag** (`isMuted` / `toggleMuted` / **`isSpeechAllowed`**) + `localStorage` | Babylon `Sound` / `Sound.setVolume(0)` on a **master bus**, or mirror the same mute contract; **gate** any Babylon `TextToSpeech`/plugin speech on the same predicate as `isSpeechAllowed` |
| `tests/*.test.js` | Vitest against pure modules | **Keep**; add Babylon-only tests separately if needed |

**Non-negotiable:** Do not re-encode rule semantics in Babylon; **reuse `game-rules.js`** so behavior matches tests.

---

## 3. Three.js → Babylon.js concept map

| Concept (Three / this repo) | Babylon equivalent |
|-----------------------------|---------------------|
| `THREE.Scene` | `BABYLON.Scene` |
| `THREE.PerspectiveCamera` + `PointerLockControls` | `UniversalCamera` or `FreeCamera` with **attached control** — use `camera.attachControl(canvas, true)` and pointer lock via browser API as today, or Babylon’s pointer lock patterns |
| `THREE.WebGLRenderer` | `BABYLON.Engine` + `scene.render()` |
| `THREE.Raycaster` + `intersectObjects` | `scene.pickWithRay` / `scene.pick` / `Ray` + `scene.multiPickWithRay` — pick **meshes** that represent entity **colliders** or the visible mesh; ensure **metadata** links pick result → entity id |
| `MeshLambertMaterial` + `DirectionalLight` | `StandardMaterial` or `PBRMaterial` + `DirectionalLight` — tune metallic/roughness to match flat-ish look |
| `MeshBasicMaterial` (sky, UI-ish quads) | `StandardMaterial` with **unlit** tricks or `BackgroundMaterial` / **HDRI** / simple unlit + `disableLighting` on material where applicable |
| `THREE.Box3` wall list | Babylon `BoundingBox` on meshes, or maintain your own **min/max vectors** per wall (this repo stores AABBs explicitly) |
| `Sprite` + canvas texture for labels | `DynamicTexture` + `Plane` with **billboard mode**, or `GUI` AdvancedDynamicTexture in 3D |
| `Clock.getDelta()` / `elapsedTime` | `engine.getDeltaTime()` / `scene.getEngine().getDeltaTime()` and accumulated time |
| Shot “tracer” (two cylinders, no depth test, high `renderOrder`) | Two `Mesh` cylinders with `material.disableDepthWrite = true`, `material.depthFunction = ALWAYS` (or material Z-offset), **renderingGroupId** high; or `CreateLines` + **ShaderMaterial** for thickness; or short-lived **ParticleSystem** along segment |

---

## 4. Game state machine (reimplement the same UX)

1. **Env screen:** user selects `selectedEnv` string.
2. **`buildEnv(name)`:** clear meshes + wall list; set fog/sky tint per env; **set `envSpawnHalfXZ`** (half-width of safe XZ play volume for spawns / AI targets — values used today: dungeon `32`, forest `40`, lab `28`, ruins `40`).
3. **Hunt screen:** `generateHuntRule()` → display `rule.lines`, `rule.badge`, `rule.accent`.
4. **Start:** pointer lock, show HUD, `spawnEntities()`:
   - For each entity: pick `(shape, color)` from catalogs; `ensureMinimumMatches(list, rule, 3)`; spawn at **`freeSpawn()`** — random XZ in `[-envSpawnHalfXZ, envSpawnHalfXZ]` excluding small origin box, **reject** points where entity foot AABB intersects any wall box; assign `moveMode`, velocities, orbit params, drift `target`.
5. **Loop (while `gameActive`):** player WASD on XZ; **ray shoot** on LMB; update entities (motion + wall slide for `slide`); **pairwise XZ separation** (`xzOverlapSeparation`, **multi-pass** so 3+ bodies relax; **min center distance** must cover worst-case XZ footprint of rotated **cube + 1.1 outline shell** ≈ **1.38**); **`separateEntityFromWalls`**; optional **extra pairwise passes** after walls if wall push re-overlaps; clamp XZ to `entXZLim = min(29.8, envSpawnHalfXZ - 1.2)` (or re-tune with Babylon scale). **HUD:** **viewfinder reticle** (SVG: outer ring, dashed inner ring, corner brackets, fine cross, center aim dot), **lower-center simple cone** (single symmetric SVG triangle, gradient fill), **upper-center rule strip** (`rule.lines` joined, accent border/color), score, hint text, **sound toggle** (must remain clickable with pointer lock — same pattern: isolated `pointer-events: auto` control).
6. **Hit:** if picked entity `isMatch` → score, mark dying animation; else penalty. **`coachAppliesThisShot()`** runs before incrementing **`shotsThisRound`** (increment after resolving the hit). When `matchLeft === 0` after a correct hit → **`scheduleEndRoundAfterCorrectCoach`** (speech + delay) or immediate **`scheduleEndRoundAfterMs`**. Wrong hit with coach → **`onHitWrongAfterScoring`** (`voice` vs `modal` branches above). While **`feedbackPaused`**, skip player WASD and the **entity motion** block (rendering / dying animation can still run as today).
7. **Round end UI:** `endRound()` unlocks pointer, hides HUD, shows round-end overlay — same as before; ensure coach timers do not double-fire `endRound`.

---

## 5. Ray pick contract (critical)

- **Ray origin:** camera world position + **muzzle offset** `+ direction * 0.22` (same idea as Three: start slightly in front of the camera).
- **Ray direction:** forward from camera (center-screen pick).
- **Targets:** only entities with `alive && !dying`.
- **Resolve mesh → entity:** inner colored mesh is `entity.mesh`; outline is **child** mesh. Picked mesh may be child — walk `.parent` until you find the node tagged as the **entity root** (in Three, code promotes `obj.parent` when it matches `e.mesh`).

**Babylon:** set `mesh.metadata = { entityId }` on creation; on pick, read `pickedMesh.metadata`.

---

## 6. Shot tracer (visible “line to target”)

The Three.js fix uses **two coaxial cylinders** between muzzle and hit (or max range):

1. **Outer “halo”:** large radius, **opaque-ish warm color** (`#ff7722`), `NormalBlending`, `depthTest` off, `depthWrite` off, **high render order**, ~240 ms quadratic fade.
2. **Inner “core”:** smaller radius, **white**, `AdditiveBlending`, same depth/render settings, slightly higher render order.

**Babylon implementation sketch:**

- Compute `mid = (start + end) * 0.5`, `length = distance(start, end)`, `dir = normalize(end - start)`.
- `BABYLON.MeshBuilder.CreateCylinder('beam', { height: length, diameterTop: …, diameterBottom: …, tessellation: 12 }, scene)`  
- Align cylinder default **Y-up** to `dir` using `Quaternion.FromUnitVectorsToRef(Vector3.Up, dir, …)` and set `mesh.rotationQuaternion`.
- Position = `mid`.
- Materials: `standardMaterial.emissiveColor` for glow, or unlit; set **`disableDepthWrite = true`** and depth function so it draws on top of scene like a HUD element in world space.
- Remove meshes after timeout; `dispose()` geometry/material.

**Do not** rely on WebGL `LineRenderer` line width — still unreliable cross-GPU.

---

## 7. Wall collision model

- **`wallBoxes`:** array of AABBs `{ min: Vector3, max: Vector3 }` (Three `Box3`). Built whenever a wall/plank/filler is added.
- **Player:** AABB ~ `(0.5, 1.8, 0.5)` at eye-ish Y — test **candidate position** before applying movement.
- **Entities:** foot AABB ~ `(0.48, 0.88, 0.48)` at mesh position — `entityHitsWallAt`, `separateEntityFromWalls`, slide/drift resolution.

**Babylon:** either keep the same **numeric AABB list** (simplest port) or build invisible `box.checkCollisions = true` physics impostors — the **pure AABB** approach matches current tests and is easier to verify.

---

## 8. Environment-specific notes (art direction)

Each env has:

- Floor + accents, fog color/distance, optional **sky sphere** / clouds.
- **Wall color:** palette jitter between `colorLo` and `colorHi` hex anchors (see `wallColorInPalette` / `addWallBox` in `main.js`) — preserve **per-env palettes**, not fully random RGB.

Reproduce **feel** first, then optimize draw calls (merge geometries, freeze world matrices).

---

## 9. Build & quality bar

- **Tests:** `npm run test` — must pass without a GPU (pure logic).
- **Distribution:** Current repo uses **esbuild** optional bundle + raw ES modules from `index.html`; Babylon often uses **Vite** + `@babylonjs/core` — fine to change build, **keep** `game-rules` tests green.

---

## 10. Suggested Babylon file layout (new project)

```
src/
  game-rules.ts          # copied from game-rules.js or import as JS
  entity-collision-2d.ts
  aabb.ts                # hit / separate (from main.js collision block)
  arenas/
    dungeon.ts
    forest.ts
    lab.ts
    ruins.ts
  entities/
    spawn.ts
    motion.ts
  shooting/
    rayPick.ts
    shotTracer.ts
  ui/
    hudSoundToggle.ts      # optional: mute bus + AdvancedDynamicTexture control
    hitCoach.ts            # modes, localStorage, toast + modal DOM or ADT; Web Speech or engine TTS
  GameApp.ts               # engine + scene + loop
index.html
```

---

## 11. Acceptance checklist (parity)

- [x] Same rule types and `ensureMinimumMatches` behavior as tests.
- [x] Four envs selectable; pointer lock same UX (body vs canvas lock quirks documented in current `main.js` comments).
- [x] Entity motion modes visually similar; **no long-term embedding** inside wall boxes.
- [x] LMB ray: **visible tracer** muzzle → hit or max range; audio hooks.
- [x] **Sound toggle** in HUD: mute/unmute all gameplay + UI sounds; persist preference (`solidsHunterMute`); no spurious UI click when pressing the toggle (document-level UI click handler should **exclude** that control).
- [x] **Coach:** `solidsHunterHitConfirm` + optional `solidsHunterHitConfirmN`; OFF / VOICE / MODAL behavior; freeze during wrong-hit coach; modal OK gated on speech end; re-pointer-lock after modal; correct final hit can delay round end until coach line finishes when speech allowed.
- [x] **Speech vs mute:** `isSpeechAllowed()` mirrors mute; cancel speech on mute toggle.
- [x] Score / wrong hit / round end flow unchanged (including delayed round end when coach speaks on last correct hit).

**Default playable path:** Vite uses root `index.html` → `babylon/main.ts`. After `./scripts/podman build`, serve **`dist-babylon/`** as the HTTP root and open **`/index.html`** (`assets/sounds/*.wav` are copied into the dist by the build).

**Milestone — DOM / audio / coach (done):** Wire DOM HUD, coach/Web Speech, GameAudio + `localStorage`; pointer lock modal flows (`babylon/coach.ts`, `babylon/game-audio.ts`, `index.html`, `babylon/main.ts`, `babylon/shoot-input.ts`).

---

## 12. Pitfalls to avoid

- **HUD over WebGL:** fullscreen HUD with `pointer-events: none` except **interactive controls** (`pointer-events: auto`); otherwise pointer-lock + invisible overlay blocks clicks to the canvas.
- **Pointer lock + “click”:** browser may not synthesize `click` reliably; **use `pointerdown` / `mousedown`** for firing (this repo was updated accordingly).
- **Pointer lock + coach modal:** unlocking for the wrong-hit modal must not show the pause overlay as “primary” unlock — `controls` `unlock` handler treats **hit-feedback modal visible** as a special case (see `main.js` `unlock` listener). After OK, user **clicks canvas** to lock again (`wantReLockAfterWrongModal`).
- **Tone mapping + additive VFX:** additive laser on bright sky can **vanish**; keep a **non-additive** wide halo.
- **Scale:** Babylon default units are also meters-like; keep **1 unit ≈ 1 meter** for parity.

---

*Handoff for Solids Hunter. Rules and collision pure functions: `lib/*.js` and tests. Hit-coach copy pools and Web Speech live under `babylon/` (not `game-rules.js`).*
