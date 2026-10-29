import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from './openProject';
import {
  buildSyntheticSamplePackage,
  ensureBundledSample,
  ensureSampleProject,
} from './sampleProject';
import { listUnits } from './units';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-sample-project-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('sample project first launch', () => {
  it('imports a synthetic package once, then reads the same sentence and recording', () => {
    const packed = buildSyntheticSamplePackage();
    const sample = folder();
    expect(ensureSampleProject(sample, packed)).toBe('imported');
    const library = readFileSync(join(sample, 'project.sqlite'));
    const audio = readFileSync(join(sample, 'sample.wav'));
    expect(ensureSampleProject(sample, new Uint8Array([1, 2, 3]))).toBe('present');
    expect(readFileSync(join(sample, 'project.sqlite'))).toEqual(library);
    expect(readFileSync(join(sample, 'sample.wav'))).toEqual(audio);

    const reopened = openProject(sample);
    const layer = reopened.db.prepare('SELECT id FROM layers').get() as { id: string };
    const media = reopened.db.prepare('SELECT relpath, sha256 FROM media').get() as {
      relpath: string;
      sha256: string;
    };
    expect(listUnits(reopened.db, layer.id).map((unit) => unit.text)).toEqual(['synthetic sample']);
    expect(
      createHash('sha256')
        .update(readFileSync(join(sample, media.relpath)))
        .digest('hex'),
    ).toBe(media.sha256);
    reopened.close();
  });

  it('imports the bundled sample once and leaves an existing library alone', () => {
    const sample = folder();
    expect(ensureBundledSample(sample)).toBe('imported');
    const library = readFileSync(join(sample, 'project.sqlite'));
    expect(ensureBundledSample(sample)).toBe('present');
    expect(readFileSync(join(sample, 'project.sqlite'))).toEqual(library);
    const reopened = openProject(sample);
    const layer = reopened.db.prepare('SELECT id FROM layers').get() as { id: string };
    expect(listUnits(reopened.db, layer.id).map((unit) => unit.text)).toEqual(['synthetic sample']);
    reopened.close();
  });

  it('does not replace an existing library or damage another project', () => {
    const packed = buildSyntheticSamplePackage();
    const root = folder();
    const neighbor = join(root, 'mine');
    mkdirSync(neighbor);
    const mine = openProject(neighbor);
    mine.close();
    const mineBytes = readFileSync(join(neighbor, 'project.sqlite'));

    const sample = join(root, 'sample');
    mkdirSync(sample);
    expect(() => ensureSampleProject(sample, new Uint8Array([9]))).toThrow(
      'desktop package is unreadable',
    );
    expect(() => readFileSync(join(sample, 'project.sqlite'))).toThrow();
    expect(readFileSync(join(neighbor, 'project.sqlite'))).toEqual(mineBytes);

    const corrupt = folder();
    writeFileSync(join(corrupt, 'project.sqlite'), Buffer.from('not a database'));
    const corruptBytes = readFileSync(join(corrupt, 'project.sqlite'));
    expect(() => ensureSampleProject(corrupt, packed)).toThrow();
    expect(readFileSync(join(corrupt, 'project.sqlite'))).toEqual(corruptBytes);
    expect(readFileSync(join(neighbor, 'project.sqlite'))).toEqual(mineBytes);
  });
});
