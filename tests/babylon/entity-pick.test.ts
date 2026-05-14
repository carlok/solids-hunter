import { describe, expect, it } from 'vitest';

import {
  resolveEntityIdFromPick,
  resolveEntityIdFromChain
} from '../../babylon/entity-pick';

/** Minimal mesh-shaped object for `resolveEntityIdFromPick` (runtime only uses metadata + parent). */
type PickNode = {
  metadata?: { entityId?: number };
  parent: PickNode | null;
};

describe('resolveEntityIdFromPick', () => {
  it('returns entityId from mesh metadata', () => {
    const mesh: PickNode = { metadata: { entityId: 7 }, parent: null };
    expect(resolveEntityIdFromPick(mesh as never)).toBe(7);
  });

  it('walks parents like chain resolution', () => {
    const body: PickNode = { metadata: { entityId: 3 }, parent: null };
    const outline: PickNode = { metadata: {}, parent: body };
    expect(resolveEntityIdFromPick(outline as never)).toBe(3);
  });

  it('returns undefined for null or empty chain', () => {
    expect(resolveEntityIdFromPick(null)).toBeUndefined();
    expect(
      resolveEntityIdFromPick({ metadata: {}, parent: null } as never)
    ).toBeUndefined();
  });
});

describe('resolveEntityIdFromChain', () => {
  it('returns entityId from the starting node', () => {
    const n = { metadata: { entityId: 7 }, parent: null };
    expect(resolveEntityIdFromChain(n)).toBe(7);
  });

  it('walks parent to find entityId (outline → body)', () => {
    const body = { metadata: { entityId: 3 }, parent: null };
    const outline = { metadata: {}, parent: body };
    expect(resolveEntityIdFromChain(outline)).toBe(3);
  });

  it('returns undefined when no entityId in chain', () => {
    expect(resolveEntityIdFromChain({ metadata: {}, parent: null })).toBeUndefined();
    expect(resolveEntityIdFromChain(null)).toBeUndefined();
  });

  it('walks multiple parents to find entityId', () => {
    const root = { metadata: { entityId: 42 }, parent: null };
    const mid = { metadata: {}, parent: root };
    const leaf = { metadata: {}, parent: mid };
    expect(resolveEntityIdFromChain(leaf)).toBe(42);
  });
});
