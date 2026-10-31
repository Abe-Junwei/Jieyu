/**
 * 操作记录写进项目库。关掉再打开，同一个操作 id 接着做，不另造一份文件。
 * 运行：node --experimental-sqlite --experimental-strip-types --test scripts/operation-log-roundtrip.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { importFiles, trashNext } from '../src/db/projectFiles/fileOps.ts';
import { createSyntheticDir, syntheticWriteFile } from './lib/synthetic-write-target.mjs';

const PROJECT_APPLICATION_ID = 0x4a59504a;

function createProjectDb(file) {
  const db = new DatabaseSync(syntheticWriteFile(file));
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${PROJECT_APPLICATION_ID}`);
  db.exec('PRAGMA user_version = 1');
  db.exec(`
    CREATE TABLE files (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      relpath TEXT NOT NULL,
      sha256 TEXT,
      presence TEXT NOT NULL,
      audio_id TEXT
    );
    CREATE TABLE operations (
      op_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      allocated_ids TEXT NOT NULL,
      paths TEXT NOT NULL,
      done_paths TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
  return db;
}

function save(db, project) {
  db.exec('DELETE FROM files');
  db.exec('DELETE FROM operations');
  const file = db.prepare(
    'INSERT INTO files (id, kind, relpath, sha256, presence, audio_id) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const row of project.files) {
    file.run(row.id, row.kind, row.relPath, row.sha256, row.presence, row.audioId);
  }
  const op = db.prepare(
    'INSERT INTO operations (op_id, action, allocated_ids, paths, done_paths, status) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const row of project.ops) {
    op.run(
      row.opId,
      row.action,
      JSON.stringify(row.allocatedIds),
      JSON.stringify(row.paths),
      JSON.stringify(row.donePaths),
      row.status,
    );
  }
}

function load(db) {
  const files = db.prepare('SELECT id, kind, relpath, sha256, presence, audio_id FROM files').all();
  const ops = db
    .prepare('SELECT op_id, action, allocated_ids, paths, done_paths, status FROM operations')
    .all();
  return {
    files: files.map((row) => ({
      id: row.id,
      kind: row.kind,
      relPath: row.relpath,
      sha256: row.sha256,
      presence: row.presence,
      audioId: row.audio_id,
    })),
    ops: ops.map((row) => ({
      opId: row.op_id,
      action: row.action,
      allocatedIds: JSON.parse(row.allocated_ids),
      paths: JSON.parse(row.paths),
      donePaths: JSON.parse(row.done_paths),
      status: row.status,
    })),
  };
}

test('an interrupted delete resumes after the project database is reopened', () => {
  const dir = createSyntheticDir('jieyu-op-');
  try {
    const audioBytes = Buffer.from('synthetic-wav');
    const imported = importFiles(
      { files: [], ops: [] },
      {
        opId: 'op-import',
        audioId: 'audio-1',
        manuscriptId: 'doc-1',
        audioName: '录音01.wav',
        manuscriptName: '录音01.jyd',
        sha256: 'abc',
      },
    );
    fs.writeFileSync(path.join(dir, '录音01.wav'), audioBytes);
    fs.writeFileSync(path.join(dir, '录音01.jyd'), '');
    const halfway = trashNext(imported.project, {
      opId: 'op-trash',
      paths: ['录音01.wav', '录音01.jyd'],
    });
    assert.equal(halfway.status, 'incomplete');

    const dbFile = path.join(dir, 'project.sqlite');
    const writing = createProjectDb(dbFile);
    save(writing, halfway.project);
    writing.close();

    const reading = new DatabaseSync(syntheticWriteFile(dbFile));
    const reopened = load(reading);
    reading.close();
    const done = trashNext(reopened, { opId: 'op-trash', paths: ['别的.wav'] });
    assert.equal(done.status, 'complete');
    assert.deepEqual(
      done.project.files.map((file) => [file.id, file.presence]),
      [
        ['audio-1', 'trashed'],
        ['doc-1', 'trashed'],
      ],
    );
    assert.equal(done.project.ops.filter((op) => op.opId === 'op-trash').length, 1);
    assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.wav')).length, 1);
    assert.equal(fs.readFileSync(path.join(dir, '录音01.wav')).equals(audioBytes), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
