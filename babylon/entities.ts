import type { Scene } from '@babylonjs/core';
import {
  Color3,
  DynamicTexture,
  Mesh as BabylonMesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import { COLORS, generateHuntRule, SHAPES } from '@lib/game-rules.js';

export { resolveEntityIdFromChain, resolveEntityIdFromPick } from './entity-pick';

const outlineMatByScene = new WeakMap<Scene, StandardMaterial>();

export type SolidShape = (typeof SHAPES)[number];

export type SolidEntityRecord = {
  entityId: number;
  root: TransformNode;
  body: BabylonMesh;
  outline: BabylonMesh;
  label: BabylonMesh;
  shape: SolidShape;
  colorName: string;
  isMatch: boolean;
};

function rgbToColor3(rgb: number, out: Color3): void {
  out.r = ((rgb >> 16) & 0xff) / 255;
  out.g = ((rgb >> 8) & 0xff) / 255;
  out.b = (rgb & 0xff) / 255;
}

function getSharedOutlineMaterial(scene: Scene): StandardMaterial {
  let m = outlineMatByScene.get(scene);
  if (!m) {
    m = new StandardMaterial(`entityOutline_shared_${scene.uid}`, scene);
    m.diffuseColor = Color3.Black();
    m.emissiveColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.disableLighting = true;
    outlineMatByScene.set(scene, m);
  }
  return m;
}

function buildShapeMesh(scene: Scene, shape: SolidShape, suffix: string): BabylonMesh {
  switch (shape) {
    case 'Sphere':
      return MeshBuilder.CreateSphere(`ent_${shape}_${suffix}`, { diameter: 0.96, segments: 28 }, scene);
    case 'Tetrahedron':
      return MeshBuilder.CreatePolyhedron(`ent_${shape}_${suffix}`, { type: 0, size: 0.58 }, scene);
    case 'Cube':
      return MeshBuilder.CreateBox(`ent_${shape}_${suffix}`, { width: 0.88, height: 0.88, depth: 0.88 }, scene);
    case 'Cylinder':
      return MeshBuilder.CreateCylinder(`ent_${shape}_${suffix}`, {
        height: 0.88,
        diameter: 0.64,
        tessellation: 16,
      }, scene);
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

function makeLabelMesh(
  scene: Scene,
  entityId: number,
  text: string,
  hexCss: string,
): BabylonMesh {
  const w = 288;
  const h = 64;
  const tex = new DynamicTexture(`ent_lbl_${entityId}`, { width: w, height: h }, scene, false);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.fillRect(0, 0, w, h);
  ctx.font = 'bold 17px Courier New';
  ctx.fillStyle = hexCss;
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, 40);
  tex.update(true);

  const plane = MeshBuilder.CreatePlane(`ent_lbl_plane_${entityId}`, { width: 2.3, height: 0.52 }, scene);
  plane.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
  const mat = new StandardMaterial(`ent_lbl_mat_${entityId}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.disableLighting = true;
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  mat.useAlphaFromDiffuseTexture = true;
  plane.material = mat;
  plane.isPickable = false;
  return plane;
}

let nextEntityId = 0;

/**
 * One hunt target: colored shape (Lambert-like), black **outline** child at 1.1 scale (Three.js parity),
 * billboard label above — all tagged with `metadata.entityId` on root/body/outline for ray picks.
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
  const mat = new StandardMaterial(`ent_body_${entityId}`, scene);
  mat.specularColor = Color3.Black();
  rgbToColor3(colorHex, mat.diffuseColor);
  mat.emissiveColor.copyFrom(mat.diffuseColor);
  mat.emissiveColor.scaleInPlace(0.14);
  body.material = mat;
  body.parent = root;

  const outline = body.clone(`ent_outline_${entityId}`, body);
  outline.material = getSharedOutlineMaterial(scene);
  outline.scaling.setAll(1.1);
  outline.flipFaces(true);

  const hexCss = '#' + colorHex.toString(16).padStart(6, '0');
  const label = makeLabelMesh(scene, entityId, `${colorName} ${shape}`, hexCss);
  label.parent = root;
  label.position.set(0, 1.15, 0);

  const meta = { entityId, shape, colorName, isMatch };
  root.metadata = meta;
  body.metadata = meta;
  outline.metadata = meta;

  return {
    entityId,
    root,
    body,
    outline,
    label,
    shape,
    colorName,
    isMatch,
  };
}

/** Dispose one entity; outline uses a **shared** material — not disposed here. */
export function disposeSolidEntity(e: SolidEntityRecord): void {
  e.label.dispose(false, true);
  e.outline.dispose(false, false);
  e.body.dispose(false, true);
  e.root.dispose();
}

export type HuntRule = ReturnType<typeof generateHuntRule>;
