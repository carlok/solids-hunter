import { Color3, StandardMaterial } from '@babylonjs/core';

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
  | 'ceramic';

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
    default:
      break;
  }
}
