import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const owned = new Set();

/** A directory this process just created. Synthetic SQL writes stay inside it. */
export function createSyntheticDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  owned.add(fs.realpathSync(dir));
  return dir;
}

/**
 * Refuse a path this process did not create. Does not create, move, or rewrite it.
 * Coverage is the directory identity only; it does not inspect database pages.
 */
export function assertSyntheticWriteTarget(dir) {
  let real;
  try {
    real = fs.realpathSync(dir);
  } catch {
    throw new Error('synthetic write target is missing');
  }
  if (!owned.has(real)) {
    throw new Error('synthetic write target was not created by this process');
  }
}

/** Refuse a file outside a directory this process created. The file need not exist yet. */
export function assertInsideSyntheticDir(dir, file) {
  const root = fs.realpathSync(dir);
  if (!owned.has(root)) {
    throw new Error('synthetic write target was not created by this process');
  }
  const parent = fs.realpathSync(path.dirname(path.resolve(file)));
  const relative = path.relative(root, path.join(parent, path.basename(file)));
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('synthetic write target was not created by this process');
  }
}

/** Validate at the SQLite constructor, including an existing final-file symlink. */
export function syntheticWriteFile(file) {
  const absolute = path.resolve(file);
  const parent = fs.realpathSync(path.dirname(absolute));
  const root = [...owned].find((dir) => {
    const relative = path.relative(dir, parent);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  if (root === undefined) throw new Error('synthetic write target was not created by this process');
  assertInsideSyntheticDir(root, absolute);
  try {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('synthetic write file is not regular');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return absolute;
}
