import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openProject } from './openProject';
import { exportDesktopJym, importDesktopJym } from './projectExchange';

export const SAMPLE_PROJECT_DIRNAME = 'sample-project';
const SAMPLE_TEXT = 'synthetic sample';

export function buildSyntheticSamplePackage(): Uint8Array {
  const dir = mkdtempSync(path.join(tmpdir(), 'jieyu-synthetic-sample-'));
  try {
    const body = Buffer.from('sample-wav');
    writeFileSync(path.join(dir, 'sample.wav'), body);
    const sha256 = createHash('sha256').update(body).digest('hex');
    const project = openProject(dir);
    try {
      project.db
        .prepare(
          'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('media-sample', 'sample.wav', sha256, 'sample.wav', 1, '2026-10-27T00:00:00.000Z');
      const manuscript = project.manuscripts.create({
        title: { zh: 'Sample' },
        mediaId: 'media-sample',
      });
      const layer = project.layers.create({
        manuscriptId: manuscript.id,
        key: 'tx',
        name: { zh: 'Transcription' },
        tierType: 'time-aligned',
        contentType: 'transcription',
      });
      project.units.create({
        layerId: layer.id,
        startTime: 0,
        endTime: 1,
        text: SAMPLE_TEXT,
      });
      return exportDesktopJym(project.db, dir);
    } finally {
      project.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function ensureBundledSample(folder: string): 'present' | 'imported' {
  const bytes = existsSync(path.join(folder, 'project.sqlite'))
    ? new Uint8Array()
    : buildSyntheticSamplePackage();
  return ensureSampleProject(folder, bytes);
}

export function ensureSampleProject(folder: string, bytes: Uint8Array): 'present' | 'imported' {
  if (existsSync(path.join(folder, 'project.sqlite'))) {
    const project = openProject(folder);
    project.close();
    return 'present';
  }
  importDesktopJym(folder, bytes);
  return 'imported';
}
