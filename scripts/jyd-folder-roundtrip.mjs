/**
 * node:sqlite 下的文件夹读写：复制音频并核对 sha256，写入 .jyd 和项目库，
 * 关掉后再读，卡片清单重建后 id 和配对不变。
 * 不是 better-sqlite3 验收。运行：
 * node --experimental-sqlite --experimental-strip-types --test scripts/jyd-folder-roundtrip.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { deriveCards } from '../src/db/projectFiles/deriveCards.ts';
import { createSyntheticDir, syntheticWriteFile } from './lib/synthetic-write-target.mjs';

const JYD_APPLICATION_ID = 0x4a594443;
const PROJECT_APPLICATION_ID = 0x4a59504a;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeDatabase(file, applicationId, statements) {
  const db = new DatabaseSync(syntheticWriteFile(file));
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${applicationId}`);
  db.exec('PRAGMA user_version = 1');
  for (const statement of statements) db.exec(statement);
  db.close();
}

test('rebuilt cards keep manuscript and audio ids, and the copied audio hash matches', () => {
  const dir = createSyntheticDir('jieyu-jyd-');
  try {
    const source = Buffer.from('RIFF....WAVEfmt synthetic');
    const sourceHash = sha256(source);
    const audioPath = path.join(dir, '录音01.wav');
    fs.writeFileSync(audioPath, source);
    assert.equal(sha256(fs.readFileSync(audioPath)), sourceHash);

    writeDatabase(path.join(dir, '录音01.jyd'), JYD_APPLICATION_ID, [
      'CREATE TABLE meta (id TEXT PRIMARY KEY, audio_id TEXT, audio_sha256 TEXT)',
      `INSERT INTO meta (id, audio_id, audio_sha256) VALUES ('doc-1', 'audio-1', '${sourceHash}')`,
    ]);
    writeDatabase(path.join(dir, 'project.sqlite'), PROJECT_APPLICATION_ID, [
      'CREATE TABLE audio (id TEXT PRIMARY KEY, relpath TEXT, sha256 TEXT)',
      `INSERT INTO audio (id, relpath, sha256) VALUES ('audio-1', '录音01.wav', '${sourceHash}')`,
    ]);

    const read = (file) => {
      const db = new DatabaseSync(file, { readOnly: true });
      const applicationId = db.prepare('PRAGMA application_id').get().application_id;
      return { db, applicationId };
    };
    const jyd = read(path.join(dir, '录音01.jyd'));
    const project = read(path.join(dir, 'project.sqlite'));
    assert.equal(jyd.applicationId, JYD_APPLICATION_ID);
    assert.equal(project.applicationId, PROJECT_APPLICATION_ID);
    const meta = jyd.db.prepare('SELECT id, audio_id, audio_sha256 FROM meta').get();
    const audio = project.db.prepare('SELECT id, relpath, sha256 FROM audio').get();
    jyd.db.close();
    project.db.close();
    assert.equal(audio.sha256, sourceHash);

    const manuscripts = [{ id: meta.id, relPath: '录音01.jyd', audioId: meta.audio_id }];
    const audios = [{ id: audio.id, relPath: audio.relpath, sha256: audio.sha256 }];
    const first = deriveCards(manuscripts, audios);
    const rebuilt = deriveCards(manuscripts, audios);
    assert.deepEqual(rebuilt, first);
    assert.deepEqual(rebuilt.cards, [{ manuscriptId: 'doc-1', audioId: 'audio-1', hidden: false }]);
    assert.equal(fs.existsSync(`${path.join(dir, '录音01.jyd')}-wal`), false);
    assert.equal(fs.existsSync(`${path.join(dir, 'project.sqlite')}-journal`), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
