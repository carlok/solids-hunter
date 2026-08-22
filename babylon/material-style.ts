import { Color3, PBRMaterial, StandardMaterial } from '@babylonjs/core';

/** Cheap Lambert-ish polish: ambient fill + mild specular (no textures). */
export type MaterialSurfaceRole =
  | 'floorMain'
  | 'floorPatch'
  | 'wall'
  | 'glass'
  | 'ceiling'
  | 'foliage'
  | 'trunk'
  | 'canopy'
  | 'huntSolid'
  | 'prop'
  | 'metal'
  | 'stone'
  | 'wood'
  | 'ceramic'
  | 'tiles'
  | 'bricks'
  | 'grass'
  | 'earth'
  | 'sand'
  | 'water';

export function styleSurfaceMaterial(mat: StandardMaterial, role: MaterialSurfaceRole): void {
  mat.ambientColor.copyFrom(mat.diffuseColor);
  switch (role) {
    case 'floorMain':
      mat.ambientColor.scaleInPlace(0.22);
      mat.specularColor = Color3.FromInts(22, 24, 26);
      mat.specularPower = 48;
      break;
    case 'floorPatch':
      mat.ambientColor.scaleInPlace(0.28);
      mat.specularColor = Color3.FromInts(18, 20, 22);
      mat.specularPower = 32;
      break;
    case 'wall':
      mat.ambientColor.scaleInPlace(0.18);
      mat.specularColor = Color3.FromInts(16, 18, 20);
      mat.specularPower = 22;
      break;
    case 'glass':
      mat.ambientColor.scaleInPlace(0.14);
      mat.specularColor = Color3.FromInts(55, 62, 70);
      mat.specularPower = 96;
      break;
    case 'ceiling':
      mat.ambientColor.scaleInPlace(0.2);
      mat.specularColor = Color3.FromInts(12, 14, 16);
      mat.specularPower = 16;
      break;
    case 'foliage':
    case 'canopy':
      mat.ambientColor.scaleInPlace(0.3);
      mat.specularColor = Color3.FromInts(10, 18, 12);
      mat.specularPower = 14;
      break;
    case 'trunk':
      mat.ambientColor.scaleInPlace(0.22);
      mat.specularColor = Color3.FromInts(12, 10, 8);
      mat.specularPower = 10;
      break;
    case 'huntSolid':
      mat.ambientColor.copyFrom(mat.diffuseColor);
      mat.ambientColor.scaleInPlace(0.14);
      mat.specularColor = Color3.FromInts(40, 42, 48);
      mat.specularPower = 56;
      break;
    case 'prop':
      mat.ambientColor.scaleInPlace(0.21);
      mat.specularColor = Color3.FromInts(20, 22, 26);
      mat.specularPower = 26;
      break;
    case 'metal':
      mat.ambientColor.scaleInPlace(0.12);
      mat.specularColor = Color3.FromInts(90, 94, 102);
      mat.specularPower = 118;
      break;
    case 'stone':
      mat.ambientColor.scaleInPlace(0.32);
      mat.specularColor = Color3.FromInts(28, 30, 32);
      mat.specularPower = 12;
      break;
    case 'wood':
      mat.ambientColor.scaleInPlace(0.26);
      mat.specularColor = Color3.FromInts(38, 32, 26);
      mat.specularPower = 18;
      break;
    case 'ceramic':
      mat.ambientColor.scaleInPlace(0.24);
      mat.specularColor = Color3.FromInts(48, 50, 54);
      mat.specularPower = 58;
      break;
    case 'tiles':
      mat.ambientColor.scaleInPlace(0.22);
      mat.specularColor = Color3.FromInts(40, 42, 45);
      mat.specularPower = 64;
      break;
    case 'bricks':
      mat.ambientColor.scaleInPlace(0.28);
      mat.specularColor = Color3.FromInts(24, 22, 20);
      mat.specularPower = 16;
      break;
    case 'grass':
      mat.ambientColor.scaleInPlace(0.35);
      mat.specularColor = Color3.FromInts(15, 20, 15);
      mat.specularPower = 8;
      break;
    case 'earth':
      mat.ambientColor.scaleInPlace(0.3);
      mat.specularColor = Color3.FromInts(20, 18, 16);
      mat.specularPower = 10;
      break;
    case 'sand':
      mat.ambientColor.scaleInPlace(0.4);
      mat.specularColor = Color3.FromInts(30, 28, 25);
      mat.specularPower = 12;
      break;
    case 'water':
      mat.ambientColor.scaleInPlace(0.1);
      mat.specularColor = Color3.FromInts(180, 200, 220);
      mat.specularPower = 128;
      mat.alpha = 0.8;
      break;
    default:
      break;
  }
}

/** PBR tuning for image-based lighting (paired with `scene.environmentTexture`). */
export function stylePbrSurfaceMaterial(mat: PBRMaterial, role: MaterialSurfaceRole): void {
  mat.metallic = 0;
  mat.roughness = 0.72;
  switch (role) {
    case 'floorMain':
      mat.metallic = 0.025;
      mat.roughness = 0.91;
      break;
    case 'floorPatch':
      mat.metallic = 0.025;
      mat.roughness = 0.88;
      break;
    case 'wall':
      mat.metallic = 0;
      mat.roughness = 0.86;
      break;
    case 'glass':
      mat.metallic = 0.07;
      mat.roughness = 0.16;
      break;
    case 'ceiling':
      mat.metallic = 0;
      mat.roughness = 0.9;
      break;
    case 'foliage':
    case 'canopy':
      mat.metallic = 0;
      mat.roughness = 0.96;
      break;
    case 'trunk':
      mat.metallic = 0;
      mat.roughness = 0.9;
      break;
    case 'huntSolid':
      mat.metallic = 0.06;
      mat.roughness = 0.42;
      break;
    case 'prop':
      mat.metallic = 0.035;
      mat.roughness = 0.78;
      break;
    case 'metal':
      mat.metallic = 0.9;
      mat.roughness = 0.33;
      break;
    case 'stone':
      mat.metallic = 0;
      mat.roughness = 0.95;
      break;
    case 'wood':
      mat.metallic = 0;
      mat.roughness = 0.82;
      break;
    case 'ceramic':
      mat.metallic = 0.04;
      mat.roughness = 0.37;
      break;
    case 'tiles':
      mat.metallic = 0.05;
      mat.roughness = 0.25;
      break;
    case 'bricks':
      mat.metallic = 0.02;
      mat.roughness = 0.85;
      break;
    case 'grass':
      mat.metallic = 0.0;
      mat.roughness = 0.98;
      break;
    case 'earth':
      mat.metallic = 0.01;
      mat.roughness = 0.95;
      break;
    case 'sand':
      mat.metallic = 0.0;
      mat.roughness = 0.88;
      break;
    case 'water':
      mat.metallic = 0.1;
      mat.roughness = 0.05;
      mat.alpha = 0.8;
      break;
    default:
      break;
  }
}
