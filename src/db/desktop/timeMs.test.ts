import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { openProject } from './openProject';
import { msToSec, secToMs } from './timeMs';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-time-ms-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('timeMs', () => {
  it('rounds a half millisecond toward later time', () => {
    expect(secToMs(1.5 / 1000)).toBe(2);
    expect(secToMs(1 / 1000)).toBe(1);
    expect(msToSec(1500)).toBe(1.5);
  });

  it('reads stored milliseconds back after the project is reopened', () => {
    const dir = folder();
    const opened = openProject(dir);
    const now = '2026-11-19T00:00:00.000Z';
    opened.db
      .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('p', '{"zh":"项目"}', now, now);
    opened.db
      .prepare(
        'INSERT INTO manuscripts (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
      )
      .run('ms', '{"zh":"文稿"}', now, now);
    opened.db
      .prepare(
        `INSERT INTO layers (
          id, manuscript_id, key, name_json, tier_type, content_type, sort_order, created_at, updated_at
        ) VALUES ('ly', 'ms', 'tx', '{}', 'time-aligned', 'transcription', 0, ?, ?)`,
      )
      .run(now, now);
    opened.db
      .prepare(
        `INSERT INTO units (
          id, layer_id, start_ms, end_ms, sort_order, created_at, updated_at
        ) VALUES ('u', 'ly', ?, ?, 0, ?, ?)`,
      )
      .run(secToMs(1.5), secToMs(2.25), now, now);
    opened.close();

    const again = openProject(dir);
    const row = again.db.prepare('SELECT start_ms, end_ms FROM units WHERE id = ?').get('u') as {
      start_ms: number;
      end_ms: number;
    };
    expect(row).toEqual({ start_ms: 1500, end_ms: 2250 });
    again.close();
  });
});
