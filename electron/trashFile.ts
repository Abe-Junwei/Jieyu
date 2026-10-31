import { shell } from 'electron';
import { existsSync } from 'node:fs';
import { trashOutcome } from '../src/db/desktop/trashOutcome';

export function trashFile(absolutePath: string): Promise<'moved' | 'unknown'> {
  return trashOutcome(absolutePath, (file) => shell.trashItem(file), existsSync);
}
