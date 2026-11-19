import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openProject, projectLibraryHeaderMatches } from './openProject';
import { exportDesktopJym, importDesktopJym } from './projectExchange';

export const SAMPLE_PROJECT_DIRNAME = 'sample-project';
const SAMPLE_TEXT = 'synthetic sample';

export function buildSyntheticSamplePackage(): Uint8Array {
  const dir = mkdtempSync(path.join(tmpdir(), 'jieyu-synthetic-sample-'));
  try {
    const body = silentWav();
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
        startMs: 0,
        endMs: 1,
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
  const library = path.join(folder, 'project.sqlite');
  if (existsSync(library) && !projectLibraryHeaderMatches(library)) {
    rmSync(folder, { recursive: true, force: true });
  }
  const bytes = existsSync(library) ? new Uint8Array() : buildSyntheticSamplePackage();
  return ensureSampleProject(folder, bytes);
}

function silentWav(seconds = 1, sampleRate = 8000): Buffer {
  const dataBytes = sampleRate * seconds * 2;
  const body = Buffer.alloc(44 + dataBytes);
  body.write('RIFF', 0);
  body.writeUInt32LE(36 + dataBytes, 4);
  body.write('WAVE', 8);
  body.write('fmt ', 12);
  body.writeUInt32LE(16, 16);
  body.writeUInt16LE(1, 20);
  body.writeUInt16LE(1, 22);
  body.writeUInt32LE(sampleRate, 24);
  body.writeUInt32LE(sampleRate * 2, 28);
  body.writeUInt16LE(2, 32);
  body.writeUInt16LE(16, 34);
  body.write('data', 36);
  body.writeUInt32LE(dataBytes, 40);
  return body;
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
