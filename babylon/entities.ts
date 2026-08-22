import type { Scene } from '@babylonjs/core';
import {
  Color3,
  Mesh as BabylonMesh,
  MeshBuilder,
  PBRMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import { generateHuntRule, SHAPES } from '@lib/game-rules.js';

import { stylePbrSurfaceMaterial } from './material-style';

export { resolveEntityIdFromChain, resolveEntityIdFromPick } from './entity-pick';

export type SolidShape = (typeof SHAPES)[number];

export type SolidEntityRecord = {
  entityId: number;
  root: TransformNode;
  body: BabylonMesh;
  hitbox: BabylonMesh;
  shape: SolidShape;
  colorName: string;
  isMatch: boolean;
};

/** Paid once per shape now that geometry is shared, so it can afford to be higher. */
const BAR_TESSELLATION = 12;
const RING_TESSELLATION = 48;

export const OUTLINE_BASE_WIDTH = 0.018;
export const OUTLINE_PULSE_WIDTH = 0.004;

/**
 * Ray-catch diameter per shape: the bounding sphere of the drawn cage.
 *
 * These are open cages, so most of the silhouette is the outer edges. A hitbox
 * narrower than the drawn shape means shots that visibly strike the solid pass
 * straight through it. The cube's corners sit at sqrt(3) * 0.44 + 0.06 = 0.82
 * from centre, so anything under 1.64 across is already too small for it.
 * Sphere and cylinder cages really are narrower and get tighter boxes, which is
 * where the accuracy is won without costing hittability.
 */
const HITBOX_DIAMETER: Record<SolidShape, number> = {
  Sphere: 1.05,
  Cube: 1.66,
  Tetrahedron: 1.62,
  Cylinder: 1.3,
};

function rgbToColor3(rgb: number, out: Color3): void {
  out.r = ((rgb >> 16) & 0xff) / 255;
  out.g = ((rgb >> 8) & 0xff) / 255;
  out.b = (rgb & 0xff) / 255;
}



function buildCubeBars(name: string, scene: Scene): BabylonMesh {
  const bars: BabylonMesh[] = [];
  const r = 0.06;
  const s = 0.44; // half size
  const points = [
    [-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s],
    [-s, s, -s], [s, s, -s], [s, s, s], [-s, s, s]
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // bottom
    [4, 5], [5, 6], [6, 7], [7, 4], // top
    [0, 4], [1, 5], [2, 6], [3, 7]  // vertical
  ];
  for (let i = 0; i < edges.length; i++) {
    const [p1x, p1y, p1z] = points[edges[i][0]] as [number, number, number];
    const [p2x, p2y, p2z] = points[edges[i][1]] as [number, number, number];
    const tube = MeshBuilder.CreateTube(`tube_${i}`, {
      path: [new Vector3(p1x, p1y, p1z), new Vector3(p2x, p2y, p2z)],
      radius: r,
      tessellation: BAR_TESSELLATION,
    }, scene);
    bars.push(tube);
  }
  const merged = BabylonMesh.MergeMeshes(bars, true, true, undefined, false, true);
  if (merged) merged.name = name;
  return merged as BabylonMesh || MeshBuilder.CreateBox(name, { size: 0.88 }, scene);
}

function buildTetrahedronBars(name: string, scene: Scene): BabylonMesh {
  const bars: BabylonMesh[] = [];
  /** Thinner than the cube's bars so the triangular profile reads, not the tubes. */
  const r = 0.05;
  const a = 0.58;
  const points = [
    new Vector3(a, a, a),
    new Vector3(-a, -a, a),
    new Vector3(-a, a, -a),
    new Vector3(a, -a, -a)
  ];
  const edges = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

  for (let i = 0; i < edges.length; i++) {
    const p1 = points[edges[i][0]]!;
    const p2 = points[edges[i][1]]!;
    const tube = MeshBuilder.CreateTube(`tube_${i}`, {
      path: [p1, p2],
      radius: r,
      tessellation: BAR_TESSELLATION,
    }, scene);
    bars.push(tube);
  }
  const merged = BabylonMesh.MergeMeshes(bars, true, true, undefined, false, true);
  if (merged) {
    /** 0.58 * 2 * 0.76 ~= 0.88, matching the cube so the smallest-to-read shape is not also the smallest. */
    merged.scaling.setAll(0.76);
    merged.bakeCurrentTransformIntoVertices();
    merged.name = name;
  }
  return merged as BabylonMesh || MeshBuilder.CreatePolyhedron(name, { type: 0, size: 0.58 }, scene);
}

function buildSphereRings(name: string, scene: Scene): BabylonMesh {
  const r = 0.44;
  const t = 0.055;
  const tess = RING_TESSELLATION;
  const opts = { diameter: r * 2, thickness: t * 2, tessellation: tess };

  // Default torus lies in XZ plane (normal = Y)
  const ringXZ = MeshBuilder.CreateTorus(`${name}_xz`, opts, scene);
  // no rotation needed

  // Rotate 90° around X → tips into XY plane (normal = Z)
  const ringXY = MeshBuilder.CreateTorus(`${name}_xy`, opts, scene);
  ringXY.rotation.x = Math.PI / 2;
  ringXY.bakeCurrentTransformIntoVertices();

  // Rotate 90° around Z → tips into YZ plane (normal = X)
  const ringYZ = MeshBuilder.CreateTorus(`${name}_yz`, opts, scene);
  ringYZ.rotation.z = Math.PI / 2;          // ← was rotation.y, which is wrong
  ringYZ.bakeCurrentTransformIntoVertices();

  const merged = BabylonMesh.MergeMeshes(
    [ringXZ, ringXY, ringYZ], true, true, undefined, false, true
  );
  if (merged) merged.name = name;
  return merged ?? MeshBuilder.CreateSphere(name, { diameter: 0.88 }, scene);
}


/**
 * Two end rings joined by vertical bars. The previous solid open-ended tube was
 * the only shape not speaking the wireframe-cage language, and at hunting
 * distance it read as an unidentifiable blob rather than a cylinder.
 */
function buildCylinderCage(name: string, scene: Scene): BabylonMesh {
  const parts: BabylonMesh[] = [];
  const r = 0.055;
  const radius = 0.36;
  const halfH = 0.44;
  const ringOpts = {
    diameter: radius * 2,
    thickness: r * 2,
    tessellation: RING_TESSELLATION,
  };

  for (const y of [-halfH, halfH]) {
    const ring = MeshBuilder.CreateTorus(`${name}_ring_${y}`, ringOpts, scene);
    ring.position.y = y;
    ring.bakeCurrentTransformIntoVertices();
    parts.push(ring);
  }

  const bars = 6;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    parts.push(
      MeshBuilder.CreateTube(`${name}_bar_${i}`, {
        path: [new Vector3(x, -halfH, z), new Vector3(x, halfH, z)],
        radius: r,
        tessellation: BAR_TESSELLATION,
      }, scene),
    );
  }

  const merged = BabylonMesh.MergeMeshes(parts, true, true, undefined, false, true);
  if (merged) merged.name = name;
  return merged ?? MeshBuilder.CreateCylinder(name, { height: 0.88, diameter: 0.72 }, scene);
}

function buildShapeMesh(scene: Scene, shape: SolidShape): BabylonMesh {
  switch (shape) {
    case 'Sphere':
      return buildSphereRings(`ent_tpl_${shape}`, scene);
    case 'Tetrahedron':
      return buildTetrahedronBars(`ent_tpl_${shape}`, scene);
    case 'Cube':
      return buildCubeBars(`ent_tpl_${shape}`, scene);
    case 'Cylinder':
      return buildCylinderCage(`ent_tpl_${shape}`, scene);
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

/**
 * One hidden template mesh per shape, per scene. Every solid is a `clone()` of
 * its template, and Babylon clones share the underlying `Geometry` — so a round
 * costs four geometry builds at most instead of one merge per entity.
 */
const shapeTemplates = new WeakMap<Scene, Map<SolidShape, BabylonMesh>>();

function shapeTemplate(scene: Scene, shape: SolidShape): BabylonMesh {
  let perScene = shapeTemplates.get(scene);
  if (!perScene) {
    perScene = new Map();
    shapeTemplates.set(scene, perScene);
  }
  const cached = perScene.get(shape);
  if (cached && !cached.isDisposed()) return cached;

  const built = buildShapeMesh(scene, shape);
  built.setEnabled(false);
  built.isPickable = false;
  perScene.set(shape, built);
  return built;
}

/** Drop the cached templates for a scene (arena teardown / scene dispose). */
export function disposeShapeTemplates(scene: Scene): void {
  const perScene = shapeTemplates.get(scene);
  if (!perScene) return;
  for (const tpl of perScene.values()) {
    if (!tpl.isDisposed()) tpl.dispose(false, true);
  }
  shapeTemplates.delete(scene);
}

let nextEntityId = 0;

/**
 * One hunt target: colored shape (Lambert-like)
 * — all tagged with `metadata.entityId` on root/hitbox for ray picks.
 * The body itself is unpickable; an invisible spherical hitbox catches rays.
 */
export function createSolidEntity(
  scene: Scene,
  params: {
    position: Vector3;
    shape: SolidShape;
    colorName: string;
    colorHex: number;
    isMatch: boolean;
  },
): SolidEntityRecord {
  const entityId = nextEntityId++;
  const { position, shape, colorName, colorHex, isMatch } = params;

  const root = new TransformNode(`ent_root_${entityId}`, scene);
  root.position.copyFrom(position);

  const body = shapeTemplate(scene, shape).clone(`ent_${shape}_${entityId}_body`);
  body.setEnabled(true);
  const mat = new PBRMaterial(`ent_body_${entityId}`, scene);
  rgbToColor3(colorHex, mat.albedoColor);
  mat.emissiveColor.copyFrom(mat.albedoColor);
  mat.emissiveColor.scaleInPlace(0.18);
  stylePbrSurfaceMaterial(mat, 'huntSolid');
  body.material = mat;
  body.parent = root;
  body.isPickable = false;
  body.renderOutline = true;
  body.outlineColor = new Color3(0.025, 0.035, 0.05);
  /** Width is animated from `updateGameEntities`, alongside the emissive pulse. */
  body.outlineWidth = OUTLINE_BASE_WIDTH;

  /** Default segments: a coarse sphere is faceted inward and quietly picks
   *  smaller than its nominal diameter. */
  const hitbox = MeshBuilder.CreateSphere(
    `ent_hitbox_${entityId}`,
    { diameter: HITBOX_DIAMETER[shape] },
    scene,
  );
  hitbox.parent = root;
  hitbox.visibility = 0; // invisible but pickable
  hitbox.isPickable = true;


  const meta = { entityId, shape, colorName, isMatch };
  root.metadata = meta;
  hitbox.metadata = meta;

  return {
    entityId,
    root,
    body,
    hitbox,
    shape,
    colorName,
    isMatch,
  };
}

/** Dispose one entity. */
export function disposeSolidEntity(e: SolidEntityRecord): void {
  e.hitbox.dispose(false, true);
  e.body.dispose(false, true);
  e.root.dispose();
}

export type HuntRule = ReturnType<typeof generateHuntRule>;
