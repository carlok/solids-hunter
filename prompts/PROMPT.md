Create a complete, self-contained browser 3D first-person-view game using 
Three.js (loaded from CDN). All code must be in a single HTML file with 
embedded JS and CSS. No external assets. The game must run immediately on 
page load.

---

## GAME OVERVIEW

A first-person hunt game. The player navigates a 3D environment populated 
by moving geometric entities. Before each round a boolean hunt rule is 
randomly assigned. The player must click (raycast) only on matching targets. 
Wrong clicks penalize the score.

---

## ENVIRONMENT SELECTION

On game start, display a full-screen environment picker (simple 3D preview 
thumbnails or styled cards) showing 4 environments. Each environment is 
procedurally built from primitives (no textures needed, use flat/Lambert 
materials with distinct color palettes):

- ENV_A "Dungeon"   – low ceiling, stone-gray walls, pillars, narrow corridors
- ENV_B "Forest"    – open space, tall vertical cylinder trunks, uneven floor 
                      bumps, fog
- ENV_C "Lab"       – white/steel grid rooms, glass-panel walls 
                      (semi-transparent), overhead lighting strips (emissive)
- ENV_D "Ruins"     – open, scattered wall fragments, collapsed arches, 
                      varied floor height patches

Each environment is built with a fixed seed of BoxGeometry / CylinderGeometry 
/ PlaneGeometry static meshes. Use at least 15 obstacle/wall objects per 
environment. All static meshes have isTrigger=false and block navigation 
(simple AABB collision for player movement).

---

## ENTITIES

Spawn 12–18 entities at random valid floor positions (not inside walls).

Shapes (pick randomly per entity):
  SPHERE | TETRAHEDRON | CUBE | CYLINDER

Colors (pick randomly per entity, one of exactly 7):
  Red (#e74c3c) | Blue (#2980b9) | Green (#27ae60) | Yellow (#f1c40f) |
  Purple (#8e44ad) | Orange (#e67e22) | White (#ecf0f1)

Each entity:
- Floats/bobs slightly (sin wave on Y axis, amplitude 0.2, random phase)
- Moves autonomously: slow random walk, picks a new random target position 
  every 3–6 seconds, lerps toward it at speed 1.5–2.5 units/sec
- Avoids walls with simple steering (reflect direction on AABB collision)
- Has a thin black outline effect (use a slightly scaled inverted-normals 
  clone mesh in black) for legibility
- Has a small floating text label above it showing "Shape / Color" 
  (use a canvas-based sprite or THREE.Sprite) — visible only within 20 units

---

## HUNT RULE

At round start, after environment is loaded, display a full-screen overlay:

  "HUNT: [COLOR] [SHAPE]"

Example: "HUNT: Red Tetrahedron" or "HUNT: Blue Cube"

The rule is generated as:
  color  → random from the 7 colors above
  shape  → random from the 4 shapes above

Guarantee at least 3 matching entities exist in the spawned set 
(re-roll or force-assign if needed).

Button: "START HUNT →"

---

## PLAYER CONTROLS

- WASD / Arrow keys: move (no fly, stay on floor plane + simple gravity)
- Mouse drag (pointer lock): look around (yaw + pitch, clamp pitch ±80°)
- Click (left mouse): shoot raycast forward from camera center
  - Hit a MATCHING entity  → entity dissolves (simple scale-to-zero tween, 
    0.3s) → +10 points → HUD updates
  - Hit a NON-MATCHING entity → red flash overlay (0.2s) → -5 points
  - Hit nothing → no effect
- ESC: release pointer lock / pause

---

## HUD

Always-visible overlay (top of screen):
  Left:  SCORE: [n]   |   REMAINING: [n]  (matching targets left)
  Right: HUNT: [Color] [Shape]  (color-coded badge)
  Center crosshair: simple white + (4 lines, CSS absolute)

---

## ROUND END

When all matching targets are eliminated:
  - Show centered overlay: "ROUND COMPLETE — Score: [n]"
  - Buttons: "NEW ROUND (same env)" | "CHANGE ENVIRONMENT"

---

## TECHNICAL REQUIREMENTS

- Three.js r128 via CDN (unpkg or cdnjs)
- PointerLockControls from Three.js examples (load via importmap or 
  CDN raw URL)
- No React, no build step — pure vanilla JS ES6 modules or classic script
- RequestAnimationFrame game loop with delta-time
- All geometry created programmatically (no loaders, no external files)
- Must work in Chrome/Firefox on desktop without any server 
  (file:// or localhost)
- Keep total code under 800 lines; prefer clarity over micro-optimization

---

## STYLE

- Dark UI theme (#0d0d0d background for overlays, accent color #00e5ff)
- Minimal flat UI — no gradients except subtle vignette on the game canvas
- Entity labels use monospace font
- Environment picker cards show the env name + a one-line flavor description
