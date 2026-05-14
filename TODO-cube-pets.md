# TODO: Kenney Cube Pets (GLB)

**Source:** [Kenney — Cube Pets](https://kenney.nl/assets/cube-pets) (CC0; includes animations per asset page).

## Goals (pick one or combine)

- [ ] **Option A — Ambient movers:** Load selected GLB(s) with `THREE.GLTFLoader` (r128 CDN or bundled), spawn a few non-interactive “cube pets” that wander with simple motion (reuse drift/slide patterns or nav-lite), no raycast scoring.
- [ ] **Option B — Replace hunt solids:** Swap `makeEntityGeo` / primitive meshes for instanced or cloned GLTF scenes; keep `rule.matches({ color, shape })` contract by mapping each pet variant to a logical `(color, shape)` or extend `game-rules` if shapes become named variants.
- [ ] **Option C — Hybrid:** Keep primitives for targets; add pets as decorative / distraction layer with cheaper LOD or count cap.

## Technical notes

- [ ] Add `GLTFLoader` from Three examples path consistent with existing `PointerLockControls` script tag (or npm build later).
- [ ] Normalize scale + Y offset per model; cache clips if using `AnimationMixer` (idle/walk).
- [ ] **Collision:** Current entity logic uses XZ disc + wall AABB; either keep proxy radius per pet or expand `ENTITY_PAIR_SEP` / per-mesh bounds after measuring GLB bounds.
- [ ] **Performance:** Prefer cloning one loaded scene vs reloading; cap simultaneous animated skins if Option B.
- [ ] **Licensing:** Ship only assets allowed by [CC0](https://creativecommons.org/publicdomain/zero/1.0/); document attribution optional for CC0 but good practice in `README` if bundled.

## Acceptance (when done)

- [ ] Game runs without GLB in dev (fallback to primitives) **or** single code path with assets in `public/` / `assets/`.
- [ ] `make test` still green (`game-rules` / collision tests unchanged unless rules extended).
