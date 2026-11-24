import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { zhCNDictionary } from '../../i18n/dictionaries/zh-CN';

const AUDIO_EXTENSIONS = new Set([
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
  '.aiff',
  '.aif',
  '.caf',
  '.mp4',
]);

export interface CopiedRecording {
  relpath: string;
  sha256: string;
  filename: string;
}

/**
 * Folder for a recording imported with no project open.
 * An existing library that is not the current format is left untouched; the next free name is used.
 */
export function projectFolderForNewImport(
  root: string,
  baseName: string,
  headerMatches: (sqliteFile: string) => boolean,
): string {
  const trimmed = baseName.replace(/[/:]/g, '').trim();
  const safe =
    trimmed.length > 0 && trimmed !== '.' && trimmed !== '..'
      ? trimmed
      : zhCNDictionary['app.desktopRead.audio'];
  const rootResolved = path.resolve(root);
  const base = path.resolve(rootResolved, safe);
  if (base !== rootResolved && !base.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error('project folder escapes the workspace');
  }
  for (let n = 0; n < 100; n += 1) {
    const folder = n === 0 ? base : `${base} ${n + 1}`;
    const sqlite = path.join(folder, 'project.sqlite');
    if (!existsSync(sqlite) || headerMatches(sqlite)) return folder;
  }
  throw new Error('project.sqlite is not a Jieyu project library');
}

/** Copy an audio file into `media/<sha256><ext>`. Same bytes are reused; a hash clash is refused. */
export async function copyRecordingIntoProject(
  folder: string,
  sourcePath: string,
): Promise<CopiedRecording> {
  const source = realpathSync(sourcePath);
  if (!statSync(source).isFile()) throw new Error('media file is missing');
  const ext = path.extname(source).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) throw new Error('media file is missing');
  const sha256 = await hashFile(source);
  const filename = path.basename(source);
  const relpath = `media/${sha256}${ext}`;
  const root = realpathSync(path.resolve(folder));
  const target = path.join(root, 'media', `${sha256}${ext}`);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error('media path escapes the project folder');
  }
  mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target)) {
    if ((await hashFile(target)) !== sha256) throw new Error('media hash does not match');
    return { relpath, sha256, filename };
  }
  const partial = `${target}.partial`;
  await copyFile(source, partial);
  if ((await hashFile(partial)) !== sha256) {
    rmSync(partial, { force: true });
    throw new Error('media hash does not match');
  }
  renameSync(partial, target);
  return { relpath, sha256, filename };
}

function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => {
        hash.update(chunk);
      })
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}
