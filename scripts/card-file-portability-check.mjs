/**
 * 用 Node 自带的 node:sqlite 看文件行为，不是 better-sqlite3 或 Electron 验收。
 * 桌面产品驱动仍是 ADR-0048 定的 better-sqlite3。
 * 覆盖三件事：WAL 下关闭后才能单文件搬走；回滚日志写入过程中有 -journal；
 * 相同内容哈希不能自动当成同一条音频。
 *
 * 运行：node --experimental-sqlite --test scripts/card-file-portability-check.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as sqlite from 'node:sqlite';
import { createSyntheticDir, syntheticWriteFile } from './lib/synthetic-write-target.mjs';

const { DatabaseSync } = sqlite;
const backupSkip =
  typeof sqlite.backup === 'function'
    ? false
    : `node:sqlite on Node ${process.version} has no backup(); use a Node 22 release that exports it (22.16+)`;

test(
  'a card file is portable only after a consistent backup and close',
  { skip: backupSkip },
  async () => {
    const { backup } = sqlite;
    const dir = createSyntheticDir('jieyu-card-');
    try {
      const src = path.join(dir, 'card.sqlite');
      const db = new DatabaseSync(syntheticWriteFile(src));
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('CREATE TABLE blob (id TEXT PRIMARY KEY, bytes BLOB)');
      db.prepare('INSERT INTO blob (id, bytes) VALUES (?, ?)').run('a', Buffer.from('audio-bytes'));

      const naive = path.join(dir, 'naive.sqlite');
      fs.copyFileSync(src, naive);
      const naiveDb = new DatabaseSync(naive, { readOnly: true });
      assert.throws(() => naiveDb.prepare('SELECT id FROM blob').get());
      naiveDb.close();

      const backed = path.join(dir, 'backed.sqlite');
      await backup(db, backed);
      db.close();
      const backedDb = new DatabaseSync(syntheticWriteFile(backed));
      backedDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      backedDb.close();
      assert.equal(fs.existsSync(`${backed}-wal`), false);
      assert.equal(fs.existsSync(`${backed}-shm`), false);

      const alone = path.join(dir, 'alone.sqlite');
      fs.copyFileSync(backed, alone);
      const read = new DatabaseSync(alone, { readOnly: true });
      const row = read.prepare('SELECT bytes FROM blob WHERE id = ?').get('a');
      read.close();
      assert.equal(Buffer.from(row.bytes).toString(), 'audio-bytes');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test('a rollback-journal write is not a single file until it commits and closes', () => {
  const dir = createSyntheticDir('jieyu-journal-');
  try {
    const src = path.join(dir, 'doc.sqlite');
    const db = new DatabaseSync(syntheticWriteFile(src));
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec('CREATE TABLE row (id INTEGER PRIMARY KEY)');
    db.exec('BEGIN');
    db.exec('INSERT INTO row (id) VALUES (1)');
    assert.equal(fs.existsSync(`${src}-journal`), true);
    db.exec('COMMIT');
    db.close();
    assert.equal(fs.existsSync(`${src}-journal`), false);
    assert.equal(fs.existsSync(`${src}-wal`), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 哈希相同只说明内容相同。零条、一条、多条候选的结果不同。 */
function rebindByContent(candidates, sha256) {
  const hits = candidates.filter((row) => row.sha256 === sha256);
  if (hits.length === 1) return { kind: 'rebind', audioId: hits[0].audioId };
  if (hits.length > 1) return { kind: 'ask' };
  return { kind: 'unknown' };
}

test('identical content hashes do not pick an audio id', () => {
  const rows = [
    { audioId: 'a', sha256: 'same' },
    { audioId: 'b', sha256: 'same' },
  ];
  assert.deepEqual(rebindByContent(rows, 'same'), { kind: 'ask' });
  assert.deepEqual(rebindByContent([rows[0]], 'same'), { kind: 'rebind', audioId: 'a' });
  assert.deepEqual(rebindByContent(rows, 'other'), { kind: 'unknown' });
});
