import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { listDailyBackupDays, restoreDailyBackup } from './dailyBackup';
import { openProject } from './openProject';
import { exportDesktopJyt, importDesktopJyt } from './projectExchange';
import {
  openDesktopSession,
  reopenDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';
import { ensureBundledSample } from './sampleProject';
import { listUnits } from './units';

const roots: string[] = [];

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('single library release chain', () => {
  it('keeps one sentence across lexicon, corpus, a run, exchange, backup, and the sample', () => {
    const root = mkdtempSync(join(tmpdir(), 'jieyu-release-chain-'));
    roots.push(root);
    const dir = join(root, 'project');
    const backupDir = join(root, 'backups');
    const exchanged = join(root, 'exchanged');
    const restored = join(root, 'restored');
    const sample = join(root, 'sample');
    for (const path of [dir, exchanged, restored, sample]) mkdirSync(path);
    const audio = Buffer.from('synthetic-chain');
    writeFileSync(join(dir, 'clip.wav'), audio);

    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'clip.wav',
      sha256: createHash('sha256').update(audio).digest('hex'),
      duration: 1,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { und: 'Clip' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { und: 'Transcription' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'kept sentence',
    });
    callDesktopSession(session.sessionId, 'lexicon.saveEntry', {
      id: 'lex',
      entry: { headword: 'kept', senses: [{ id: 'sense', definitions: [{ text: 'kept' }] }] },
    });
    const run = callDesktopSession(session.sessionId, 'modelRuns.start', {
      manuscriptId: manuscript.id,
      layerId: layer.id,
      modelId: 'local.whisper',
      modelVersion: '1',
      manifestSha256: 'abc',
      params: { language: 'und' },
      rangeStart: 0,
      rangeEnd: 1,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: run.id,
      status: 'ok',
      chunkCount: 1,
    });
    expect(
      callDesktopSession(session.sessionId, 'corpus.query', { text: 'kept', limit: 10 }),
    ).toMatchObject({
      items: [expect.objectContaining({ text: 'kept sentence' })],
    });

    reopenDesktopSession(session.sessionId);
    const packed = exportDesktopJyt(requireDesktopSession(session.sessionId).db);
    resetDesktopSessions();
    releaseAllProjectLocks();

    const backed = openDesktopSession(dir, [dir], {
      dir: backupDir,
      now: new Date('2026-10-28T12:00:00.000Z'),
    });
    expect(listDailyBackupDays(backupDir)).toEqual(['2026-10-28']);
    expect(callDesktopSession(backed.sessionId, 'lexicon.getEntry', { id: 'lex' })).toMatchObject({
      entry: { headword: 'kept' },
    });
    expect(callDesktopSession(backed.sessionId, 'modelRuns.get', { runId: run.id })).toMatchObject({
      status: 'ok',
    });
    resetDesktopSessions();
    releaseAllProjectLocks();

    importDesktopJyt(exchanged, packed);
    expect(texts(exchanged)).toEqual(['kept sentence']);
    releaseAllProjectLocks();

    restoreDailyBackup({ backupDir, day: '2026-10-28', destination: restored });
    expect(texts(restored)).toEqual(['kept sentence']);
    releaseAllProjectLocks();

    expect(ensureBundledSample(sample)).toBe('imported');
    expect(texts(sample)).toEqual(['synthetic sample']);
  });
});

function texts(folder: string): string[] {
  const project = openProject(folder);
  try {
    const layer = project.db.prepare('SELECT id FROM layers').get() as { id: string };
    return listUnits(project.db, layer.id).map((unit) => unit.text);
  } finally {
    project.close();
  }
}
