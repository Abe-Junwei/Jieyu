import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { DIRECT_DB_IMPORT_RE, evaluateRatchet, listDirectDbModules, readBaseline } from './check-direct-db-imports.mjs';

describe('direct-db import ratchet (#280)', () => {
  it('matches db barrel imports only', () => {
    expect(DIRECT_DB_IMPORT_RE.test("import { db } from '../../db';")).toBe(true);
    expect(DIRECT_DB_IMPORT_RE.test("import { db } from '../db/index';")).toBe(true);
    expect(DIRECT_DB_IMPORT_RE.test("import { x } from '../db/schemas';")).toBe(false);
  });

  it('only allows the count to stay or decrease', () => {
    expect(evaluateRatchet(298, 297).ok).toBe(false);
    expect(evaluateRatchet(297, 297).ok).toBe(true);
    expect(evaluateRatchet(250, 297).ok).toBe(true);
  });

  it('current tree does not exceed the baseline', () => {
    expect(listDirectDbModules().length).toBeLessThanOrEqual(readBaseline());
  });
});
