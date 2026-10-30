/**
 * .jyd 在回滚日志下的四件事：关闭后复制、一万句写入、写到一半被杀掉、
 * 磁盘满时导入失败。默认用 node:sqlite。
 * 本机若有 better-sqlite3，再跑一遍：JIEYU_BETTER_SQLITE=/path/to/better-sqlite3
 * 运行：node --experimental-sqlite --test scripts/jyd-failure-roundtrip.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { killWhenReady } from './lib/sigkill-harness.mjs';
import {
  assertInsideSyntheticDir,
  createSyntheticDir,
  syntheticWriteFile,
} from './lib/synthetic-write-target.mjs';

const SENTENCE_COUNT = 10_000;
const SPEED_LIMIT_MS = 2_000;

function openNode(file) {
  const db = new DatabaseSync(syntheticWriteFile(file));
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, ...params) {
      return db.prepare(sql).run(...params);
    },
    get(sql, ...params) {
      return db.prepare(sql).get(...params);
    },
    close() {
      db.close();
    },
  };
}

function openBetter(file) {
  const Database = createRequire(import.meta.url)(process.env.JIEYU_BETTER_SQLITE);
  const db = new Database(syntheticWriteFile(file));
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, ...params) {
      return db.prepare(sql).run(...params);
    },
    get(sql, ...params) {
      return db.prepare(sql).get(...params);
    },
    close() {
      db.close();
    },
  };
}

function drivers() {
  const list = [{ name: 'node:sqlite', open: openNode }];
  if (process.env.JIEYU_BETTER_SQLITE) list.push({ name: 'better-sqlite3', open: openBetter });
  return list;
}

function errorCode(error) {
  return `${error?.code ?? ''} ${error?.errcode ?? ''} ${error?.message ?? ''}`;
}

for (const driver of drivers()) {
  test(`${driver.name}: a closed .jyd copies as one file and keeps ids`, () => {
    const dir = createSyntheticDir('jieyu-copy-');
    try {
      const file = path.join(dir, 'doc.jyd');
      const db = driver.open(file);
      db.exec('PRAGMA journal_mode = DELETE');
      db.exec('CREATE TABLE units (id TEXT PRIMARY KEY)');
      db.exec("INSERT INTO units (id) VALUES ('u-1'), ('u-2'), ('u-3')");
      db.close();
      assert.equal(fs.existsSync(`${file}-journal`), false);
      assert.equal(fs.existsSync(`${file}-wal`), false);
      const copy = path.join(dir, 'copy.jyd');
      fs.copyFileSync(file, copy);
      const again = driver.open(copy);
      const ids = [again.get('SELECT id FROM units WHERE id = ?', 'u-1').id];
      ids.push(again.get('SELECT id FROM units WHERE id = ?', 'u-2').id);
      ids.push(again.get('SELECT id FROM units WHERE id = ?', 'u-3').id);
      assert.equal(again.get('PRAGMA integrity_check').integrity_check, 'ok');
      again.close();
      assert.deepEqual(ids, ['u-1', 'u-2', 'u-3']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`${driver.name}: ten thousand sentence writes finish within ${SPEED_LIMIT_MS}ms`, () => {
    const dir = createSyntheticDir('jieyu-speed-');
    try {
      const file = path.join(dir, 'doc.jyd');
      const db = driver.open(file);
      db.exec('PRAGMA journal_mode = DELETE');
      db.exec('CREATE TABLE units (id INTEGER PRIMARY KEY, body TEXT)');
      const started = performance.now();
      db.exec('BEGIN');
      for (let index = 0; index < SENTENCE_COUNT; index += 1) {
        db.run('INSERT INTO units (body) VALUES (?)', `sentence-${index}`);
      }
      db.exec('COMMIT');
      const elapsed = performance.now() - started;
      const count = db.get('SELECT count(*) AS n FROM units').n;
      db.close();
      assert.equal(count, SENTENCE_COUNT);
      assert.equal(elapsed < SPEED_LIMIT_MS, true, `${driver.name} took ${elapsed.toFixed(1)}ms`);
      console.log(`${driver.name} ${SENTENCE_COUNT} inserts ${elapsed.toFixed(1)}ms`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`${driver.name}: a killed write reopens as the committed state`, async () => {
    const dir = createSyntheticDir('jieyu-kill-');
    try {
      const file = path.join(dir, 'doc.jyd');
      const child = path.join(dir, 'child.mjs');
      const openLine =
        process.env.JIEYU_BETTER_SQLITE && driver.name === 'better-sqlite3'
          ? `import { createRequire } from 'node:module'; const Database = createRequire(import.meta.url)(${JSON.stringify(process.env.JIEYU_BETTER_SQLITE)}); const db = new Database(process.env.DB);`
          : `import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync(process.env.DB);`;
      fs.writeFileSync(
        child,
        `${openLine}
db.exec('PRAGMA journal_mode = DELETE');
db.exec('CREATE TABLE units (id INTEGER PRIMARY KEY, body TEXT)');
db.exec("INSERT INTO units (body) VALUES ('before')");
db.exec('BEGIN');
for (let index = 0; index < 20; index += 1) db.prepare('INSERT INTO units (body) VALUES (?)').run('after-' + index);
console.log('ready');
setInterval(() => {}, 1000);
`,
      );
      assertInsideSyntheticDir(dir, file);
      await killWhenReady(child, { env: { DB: file } });
      const db = driver.open(file);
      const count = db.get('SELECT count(*) AS n FROM units').n;
      const before = db.get("SELECT count(*) AS n FROM units WHERE body = 'before'").n;
      assert.equal(db.get('PRAGMA integrity_check').integrity_check, 'ok');
      db.close();
      assert.equal(before, 1);
      assert.equal(count, 1, `torn write left ${count} rows`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`${driver.name}: a full disk import removes the partial project files and keeps the original`, () => {
    const dir = createSyntheticDir('jieyu-full-');
    try {
      const source = path.join(dir, 'outside.wav');
      const original = Buffer.from('original-audio');
      fs.writeFileSync(source, original);
      const project = path.join(dir, 'project');
      fs.mkdirSync(project);
      const wav = path.join(project, '录音01.wav');
      const jyd = path.join(project, '录音01.jyd');
      fs.copyFileSync(source, wav);
      const db = driver.open(jyd);
      try {
        db.exec('PRAGMA journal_mode = DELETE');
        db.exec('CREATE TABLE units (id INTEGER PRIMARY KEY, body TEXT)');
        db.run('INSERT INTO units (body) VALUES (?)', 'kept');
        const pages = db.get('PRAGMA page_count').page_count;
        db.exec(`PRAGMA max_page_count = ${pages}`);
        db.exec('BEGIN');
        for (let index = 0; index < 2000; index += 1) {
          db.run('INSERT INTO units (body) VALUES (?)', 'x'.repeat(4000));
        }
        db.exec('COMMIT');
        throw new Error('expected the import to run out of pages');
      } catch (error) {
        const description = errorCode(error);
        if (!/full/i.test(description)) throw error;
        try {
          db.exec('ROLLBACK');
        } catch {
          // 满页时回滚语句本身也可能失败，文件仍要清掉。
        }
        try {
          db.close();
        } catch {
          // 关掉失败也要把半截文件删掉。
        }
        fs.rmSync(wav, { force: true });
        fs.rmSync(jyd, { force: true });
        fs.rmSync(`${jyd}-journal`, { force: true });
      }
      assert.equal(fs.existsSync(wav), false);
      assert.equal(fs.existsSync(jyd), false);
      assert.equal(fs.readFileSync(source).equals(original), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
