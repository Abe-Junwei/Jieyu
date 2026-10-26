import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from '../../db/desktop/openProject';
import { releaseAllProjectLocks } from './projectLock';
import { fileContainsProbeTable, probeDatabasePath, writeSkeletonProbe } from './probeStore';

const roots: string[] = [];

function folder(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(() => {
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('skeleton probe', () => {
  it('writes the probe outside an opened project and leaves that library unchanged', () => {
    const projectDir = folder('jieyu-probe-project-');
    const tempRoot = folder('jieyu-probe-temp-');
    const project = openProject(projectDir);
    project.close();
    const library = path.join(projectDir, 'project.sqlite');
    const before = readFileSync(library);

    const row = writeSkeletonProbe(tempRoot, 'ping');

    expect(row).toEqual({ id: 1, note: 'ping' });
    expect(readFileSync(library)).toEqual(before);
    expect(fileContainsProbeTable(library)).toBe(false);
    expect(fileContainsProbeTable(probeDatabasePath(tempRoot))).toBe(true);
    const relative = path.relative(path.resolve(projectDir), probeDatabasePath(tempRoot));
    expect(relative.startsWith('..') || path.isAbsolute(relative)).toBe(true);
  });
});
