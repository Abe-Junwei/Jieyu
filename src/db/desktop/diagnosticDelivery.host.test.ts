import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import {
  configureDesktopDiagnosticStore,
  diagnosticStoreFile,
  useDiagnosticStore,
} from './diagnosticDelivery';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';
import type { SourceReading } from './sourceFields';

const roots: string[] = [];
const T = '2026-10-26T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-diagnostic-host-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  useDiagnosticStore(null);
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function seedSession(): string {
  const dir = folder();
  const project = openProject(dir);
  project.db
    .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('p1', '{"zh":"p"}', T, T);
  project.db
    .prepare(
      'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
  project.db
    .prepare(
      `INSERT INTO sources (id, media_id, label, external_id, created_at, updated_at)
       VALUES ('s1', 'm1', 'tape', 'ext', ?, ?)`,
    )
    .run(T, T);
  project.close();
  return openDesktopSession(dir, [dir]).sessionId;
}

describe('desktop diagnostic store host wiring (#400)', () => {
  it('wires diagnostics.sqlite under userData so patch delivery is confirmed', () => {
    const userData = folder();
    configureDesktopDiagnosticStore(userData);
    expect(diagnosticStoreFile()).toBe(join(userData, 'diagnostics.sqlite'));

    const sessionId = seedSession();
    const reading = callDesktopSession(sessionId, 'sources.patch', {
      operationId: 'op-host-config',
      id: 's1',
      label: { expectedRevision: 0, value: 'tape-b' },
    }) as SourceReading;

    expect(reading.delivery).toBe('confirmed');
  });

  it('stays pending when the host never configures a store', () => {
    useDiagnosticStore(null);
    const sessionId = seedSession();
    const reading = callDesktopSession(sessionId, 'sources.patch', {
      operationId: 'op-host-missing',
      id: 's1',
      label: { expectedRevision: 0, value: 'tape-b' },
    }) as SourceReading;
    expect(reading.delivery).toBe('pending');
  });

  it('electron main configures the diagnostic store on ready', () => {
    const main = readFileSync(join(process.cwd(), 'electron/main.ts'), 'utf8');
    expect(main.includes('configureDesktopDiagnosticStore')).toBe(true);
    expect(main.includes("configureDesktopDiagnosticStore(app.getPath('userData'))")).toBe(true);
  });
});
