import type { Scene } from '@babylonjs/core';
import {
  Color3,
  Mesh as BabylonMesh,
  MeshBuilder,
  PBRMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import { COLORS, generateHuntRule, SHAPES } from '@lib/game-rules.js';

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
      tessellation: 8,
    }, scene);
    bars.push(tube);
  }
  const merged = BabylonMesh.MergeMeshes(bars, true, true, undefined, false, true);
  if (merged) merged.name = name;
  return merged as BabylonMesh || MeshBuilder.CreateBox(name, { size: 0.88 }, scene);
}

function buildTetrahedronBars(name: string, scene: Scene): BabylonMesh {
  const bars: BabylonMesh[] = [];
  const r = 0.06;
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
      tessellation: 8,
    }, scene);
    bars.push(tube);
  }
  const merged = BabylonMesh.MergeMeshes(bars, true, true, undefined, false, true);
  if (merged) {
    merged.scaling.setAll(0.65);
    merged.bakeCurrentTransformIntoVertices();
    merged.name = name;
  }
  return merged as BabylonMesh || MeshBuilder.CreatePolyhedron(name, { type: 0, size: 0.58 }, scene);
}

function buildSphereRings(name: string, scene: Scene): BabylonMesh {
  const r = 0.44;
  const t = 0.055;
  const tess = 32;
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

/*function buildSphereRings(name: string, scene: Scene): BabylonMesh {
  const r = 0.44;  // orbit radius of the ring
  const t = 0.055; // tube radius
  const tess = 32;

  // XY plane (no rotation)
  const ringXY = MeshBuilder.CreateTorus(`${name}_xy`, {
    diameter: r * 2, thickness: t * 2, tessellation: tess,
  }, scene);

  // XZ plane (rotate 90° around X)
  const ringXZ = MeshBuilder.CreateTorus(`${name}_xz`, {
    diameter: r * 2, thickness: t * 2, tessellation: tess,
  }, scene);
  ringXZ.rotation.x = Math.PI / 2;
  ringXZ.bakeCurrentTransformIntoVertices();

  // YZ plane (rotate 90° around Y)
  const ringYZ = MeshBuilder.CreateTorus(`${name}_yz`, {
    diameter: r * 2, thickness: t * 2, tessellation: tess,
  }, scene);
  ringYZ.rotation.y = Math.PI / 2;
  ringYZ.bakeCurrentTransformIntoVertices();

  const merged = BabylonMesh.MergeMeshes(
    [ringXY, ringXZ, ringYZ], true, true, undefined, false, true
  );
  if (merged) merged.name = name;
  return merged ?? MeshBuilder.CreateSphere(name, { diameter: 0.88 }, scene);
}*/


function buildShapeMesh(scene: Scene, shape: SolidShape, suffix: string): BabylonMesh {
  switch (shape) {
    case 'Sphere':
      return buildSphereRings(`ent_${shape}_${suffix}`, scene);
    case 'Tetrahedron':
      return buildTetrahedronBars(`ent_${shape}_${suffix}`, scene);
    case 'Cube':
      return buildCubeBars(`ent_${shape}_${suffix}`, scene);
    case 'Cylinder':
      return MeshBuilder.CreateCylinder(`ent_${shape}_${suffix}`, {
        height: 0.88,
        diameter: 0.64,
        tessellation: 16,
        cap: BabylonMesh.NO_CAP,
        sideOrientation: BabylonMesh.DOUBLESIDE,
      }, scene);
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
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

  const body = buildShapeMesh(scene, shape, `${entityId}_body`);
  const mat = new PBRMaterial(`ent_body_${entityId}`, scene);
  rgbToColor3(colorHex, mat.albedoColor);
  mat.emissiveColor.copyFrom(mat.albedoColor);
  mat.emissiveColor.scaleInPlace(0.14);
  stylePbrSurfaceMaterial(mat, 'huntSolid');
  body.material = mat;
  body.parent = root;
  body.isPickable = false;

  const hitbox = MeshBuilder.CreateSphere(`ent_hitbox_${entityId}`, { diameter: 1.6 }, scene);
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
