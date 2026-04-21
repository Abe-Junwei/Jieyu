import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIMELINE_PARITY_MATRIX, TIMELINE_PARITY_MATRIX_VERSION, type TimelineParityRow } from './timelineParityMatrix';

const ROOT = process.cwd();

function assertAnchorExists(rel: string): void {
  const abs = path.resolve(ROOT, rel);
  expect(existsSync(abs), `missing parity test anchor: ${rel}`).toBe(true);
}

describe('timelineParityMatrix', () => {
  it('exports a positive matrix version for docs/CI drift detection', () => {
    expect(TIMELINE_PARITY_MATRIX_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('has unique ids and non-empty human labels', () => {
    const ids = new Set<string>();
    for (const row of TIMELINE_PARITY_MATRIX) {
      expect(row.id.length).toBeGreaterThan(0);
      expect(row.labelZh.length).toBeGreaterThan(0);
      expect(ids.has(row.id), `duplicate parity row id: ${row.id}`).toBe(false);
      ids.add(row.id);
    }
  });

  it('keeps parity keys for every shell column', () => {
    const shells = ['waveform', 'textOnly', 'vertical'] as const;
    for (const row of TIMELINE_PARITY_MATRIX) {
      for (const shell of shells) {
        const level = row.parity[shell];
        expect(level === 'full' || level === 'partial' || level === 'none', `${row.id}.${shell}`).toBe(true);
      }
    }
  });

  it('anchors every row to existing regression files (推进第二条线：矩阵→主测门禁)', () => {
    for (const row of TIMELINE_PARITY_MATRIX as readonly TimelineParityRow[]) {
      expect(row.testAnchors.length, `${row.id} must list at least one test anchor`).toBeGreaterThan(0);
      for (const rel of row.testAnchors) {
        assertAnchorExists(rel);
      }
    }
  });
});
