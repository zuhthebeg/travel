import { describe, it, expect, beforeEach } from 'vitest';
import { genTempId, isTempId, resetTempId } from '../../src/lib/offline/tempId';
import { getDB } from '../../src/lib/db';

// Reset DB between tests
beforeEach(async () => {
  const db = await getDB();
  await db.clear('syncMeta');
});

describe('genTempId', () => {
  it('generates negative IDs starting from -1', async () => {
    const id1 = await genTempId();
    const id2 = await genTempId();
    const id3 = await genTempId();
    expect(id1).toBe(-1);
    expect(id2).toBe(-2);
    expect(id3).toBe(-3);
  });

  it('persists counter across calls', async () => {
    await genTempId(); // -1
    await genTempId(); // -2
    const db = await getDB();
    const row = await db.get('syncMeta', 'nextTempId');
    expect(row?.value).toBe(-3); // next to allocate
  });
});

describe('isTempId', () => {
  it('returns true for negative numbers', () => {
    expect(isTempId(-1)).toBe(true);
    expect(isTempId(-100)).toBe(true);
  });

  it('returns false for positive numbers', () => {
    expect(isTempId(1)).toBe(false);
    expect(isTempId(0)).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isTempId('abc')).toBe(false);
  });
});

describe('resetTempId', () => {
  it('resets counter to -1', async () => {
    await genTempId();
    await genTempId();
    await resetTempId();
    const id = await genTempId();
    expect(id).toBe(-1);
  });
});
