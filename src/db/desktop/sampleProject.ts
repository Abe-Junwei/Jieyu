import { existsSync } from 'node:fs';
import path from 'node:path';
import { openProject } from './openProject';
import { importDesktopJym } from './projectExchange';

export function ensureSampleProject(folder: string, bytes: Uint8Array): 'present' | 'imported' {
  if (existsSync(path.join(folder, 'project.sqlite'))) {
    const project = openProject(folder);
    project.close();
    return 'present';
  }
  importDesktopJym(folder, bytes);
  return 'imported';
}
