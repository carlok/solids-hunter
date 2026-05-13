# Solids Hunter → Babylon.js porting brief

This document is meant for **another LLM or engineer** rebuilding the project in **Babylon.js** without reading every line of the Three.js implementation. It captures **product intent**, **architecture**, **data contracts**, and **1:1 engine mappings**.

---

## 1. What the game is

- **Genre:** First-person “hunt” — pointer-locked walk, ray-based shooting (not projectile physics).
- **Core loop:** Pick arena → see a **boolean rule** on text (colors, shapes, AND/OR/NOT) → lock pointer → **shoot only solids that satisfy the rule** with LMB. Correct match **+10**, wrong **−5**, clear all matching targets to end the round.
- **Solids:** Colored 3D shapes (sphere, tetrahedron, cube, cylinder) with a small **black backface outline** mesh parented as child, plus a **billboard text label** (sprite) above.
- **Motion modes (per entity):** `drift`, `bounce` (seek random open XZ targets), `orbit` (circle in XZ), `slide` (constant XZ velocity with wall bounces).
- **Environments:** Procedural “arenas” — `dungeon`, `forest`, `lab`, `ruins` — built from boxes/planes, trees, etc. **Axis-aligned wall boxes** are collected for **player capsule-ish AABB** and **entity foot AABB** checks.
- **Audio:** Web Audio buffers for shoot / hit / UI (see `js/audio.js`). During play, the **HUD** includes a **sound toggle** (top-left): mutes all one-shots (shoot, hits, footsteps, UI beeps from the global click handler) while **persisting** choice in `localStorage` under key **`solidsHunterMute`** (`'1'` = muted). API: `GameAudio.isMuted()`, `GameAudio.setMuted(boolean)`, `GameAudio.toggleMuted()`. The toggle button uses **`pointer-events: auto`** inside an otherwise `pointer-events: none` HUD overlay. **UX parity:** **`M`** toggles mute from the keyboard (skip when typing in inputs); **pre-game** labeled buttons on the arena picker, hunt/rule screen, and pause overlay (`Sound: ON` / `Sound: OFF`) mirror the same state and call `toggleMuted()`.

---

## 2. Repository map (keep as logic modules)

| Path | Role | Babylon port |
|------|------|----------------|
| `js/main.js` | Scene, renderer, env builders, entities, loop, ray pick, shot VFX | Becomes `Scene`, `Engine`, thin game class; **split** into `ArenaBuilder`, `EntitySpawner`, `GameLoop` |
| `js/lib/game-rules.js` | **Pure JS** — rules, `COLORS`, `SHAPES`, `MOVE_MODES`, `generateHuntRule`, `ensureMinimumMatches` | **Import unchanged** or copy verbatim |
| `js/lib/entity-collision-2d.js` | **Pure JS** — XZ circle overlap separation | **Import unchanged** |
| `js/audio.js` | Loader + one-shots + **mute flag** (`isMuted` / `toggleMuted`) + `localStorage` | Babylon `Sound` / `Sound.setVolume(0)` on a **master bus**, or mirror the same mute contract for parity |
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
6. **Hit:** if picked entity `isMatch` → score, mark dying animation; else penalty. When `matchLeft === 0` → end round UI.

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
  GameApp.ts               # engine + scene + loop
index.html
```

---

## 11. Acceptance checklist (parity)

- [ ] Same rule types and `ensureMinimumMatches` behavior as tests.
- [ ] Four envs selectable; pointer lock same UX (body vs canvas lock quirks documented in current `main.js` comments).
- [ ] Entity motion modes visually similar; **no long-term embedding** inside wall boxes.
- [ ] LMB ray: **visible tracer** muzzle → hit or max range; audio hooks.
- [ ] **Sound toggle** in HUD: mute/unmute all gameplay + UI sounds; persist preference (`solidsHunterMute`); no spurious UI click when pressing the toggle (document-level UI click handler should **exclude** that control).
- [ ] Score / wrong hit / round end flow unchanged.

---

## 12. Pitfalls to avoid

- **HUD over WebGL:** fullscreen HUD with `pointer-events: none` except **interactive controls** (`pointer-events: auto`); otherwise pointer-lock + invisible overlay blocks clicks to the canvas.
- **Pointer lock + “click”:** browser may not synthesize `click` reliably; **use `pointerdown` / `mousedown`** for firing (this repo was updated accordingly).
- **Tone mapping + additive VFX:** additive laser on bright sky can **vanish**; keep a **non-additive** wide halo.
- **Scale:** Babylon default units are also meters-like; keep **1 unit ≈ 1 meter** for parity.

---

*Generated as a handoff artifact for Solids Hunter. Source of truth for rules and collision pure functions remains `js/lib/*.js` and tests.*
