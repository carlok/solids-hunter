import type { AbstractMesh, Node, Nullable } from '@babylonjs/core';

/** Walk `parent` links to find Babylon `metadata.entityId` (picking may hit body or outline). */
export function resolveEntityIdFromPick(
  mesh: Nullable<AbstractMesh>,
): number | undefined {
  let cur: Nullable<Node> = mesh;
  while (cur) {
    const id = (cur.metadata as { entityId?: number } | undefined)?.entityId;
    if (typeof id === 'number') return id;
    cur = cur.parent;
  }
  return undefined;
}

/** Same logic as `resolveEntityIdFromPick`, testable without Babylon meshes. */
export function resolveEntityIdFromChain(
  start: { metadata?: { entityId?: number }; parent: typeof start | null } | null,
): number | undefined {
  let cur = start;
  while (cur) {
    const id = cur.metadata?.entityId;
    if (typeof id === 'number') return id;
    cur = cur.parent;
  }
  return undefined;
}
