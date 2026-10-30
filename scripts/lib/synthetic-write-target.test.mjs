import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSyntheticWriteTarget,
  createSyntheticDir,
  syntheticWriteFile,
} from './synthetic-write-target.mjs';

test('a directory this process did not create is refused and left unchanged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jieyu-foreign-'));
  const file = path.join(dir, 'project.sqlite');
  fs.writeFileSync(file, 'keep');
  const before = fs.readFileSync(file);
  assert.throws(
    () => assertSyntheticWriteTarget(dir),
    /synthetic write target was not created by this process/,
  );
  assert.deepEqual(fs.readFileSync(file), before);
  const owned = createSyntheticDir('jieyu-owned-');
  assert.doesNotThrow(() => assertSyntheticWriteTarget(owned));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(owned, { recursive: true, force: true });
});

test('writable connections reject a foreign path and a symlink even inside an owned directory', () => {
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'jieyu-foreign-db-'));
  const owned = createSyntheticDir('jieyu-owned-db-');
  try {
    const file = path.join(foreign, 'project.sqlite');
    fs.writeFileSync(file, 'keep');
    assert.throws(() => syntheticWriteFile(file), /not created by this process/);
    const link = path.join(owned, 'link.sqlite');
    fs.symlinkSync(file, link);
    assert.throws(() => syntheticWriteFile(link), /not regular/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
    assert.equal(
      syntheticWriteFile(path.join(owned, 'new.sqlite')),
      path.join(owned, 'new.sqlite'),
    );
  } finally {
    fs.rmSync(foreign, { recursive: true, force: true });
    fs.rmSync(owned, { recursive: true, force: true });
  }
});
