/**
 * 把一份已经确认的迁移规划写成音频文件、项目库和 .jyd。
 * 失败时删掉这次写出的文件。可由测试导入，也可直接运行：
 * node --experimental-sqlite scripts/apply-legacy-plan.mjs <plan.json> <dest>
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const JYD_APPLICATION_ID = 0x4a594443;
const PROJECT_APPLICATION_ID = 0x4a59504a;

function writeDatabase(file, applicationId, apply) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${applicationId}`);
  db.exec('PRAGMA user_version = 1');
  apply(db);
  db.close();
}

export function applyPlan(plan, dest, { failAfterAudio = false } = {}) {
  fs.mkdirSync(dest, { recursive: true });
  const written = [];
  try {
    for (const audio of plan.audios) {
      const file = path.join(dest, audio.fileName);
      fs.writeFileSync(file, audio.bytes);
      written.push(file);
      const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (hash !== audio.sha256) throw new Error('sha256 mismatch');
    }
    if (failAfterAudio) throw new Error('injected failure');
    const projectFile = path.join(dest, 'project.sqlite');
    writeDatabase(projectFile, PROJECT_APPLICATION_ID, (db) => {
      db.exec('CREATE TABLE audio (id TEXT PRIMARY KEY, relpath TEXT, sha256 TEXT)');
      db.exec('CREATE TABLE project (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
      db.exec('CREATE TABLE speakers (id TEXT PRIMARY KEY, text_id TEXT NOT NULL, name TEXT NOT NULL)');
      const insert = db.prepare('INSERT INTO audio (id, relpath, sha256) VALUES (?, ?, ?)');
      for (const audio of plan.audios) insert.run(audio.audioId, audio.fileName, audio.sha256);
      if (plan.project) {
        db.prepare('INSERT INTO project (id, name) VALUES (?, ?)').run(plan.project.id, plan.project.name);
      }
      const insertSpeaker = db.prepare('INSERT INTO speakers (id, text_id, name) VALUES (?, ?, ?)');
      for (const speaker of plan.speakers ?? []) {
        insertSpeaker.run(speaker.id, speaker.textId, speaker.name);
      }
    });
    written.push(projectFile);
    for (const manuscript of plan.manuscripts) {
      const file = path.join(dest, manuscript.fileName);
      writeDatabase(file, JYD_APPLICATION_ID, (db) => {
        db.exec('CREATE TABLE meta (id TEXT PRIMARY KEY, audio_id TEXT, source_document_id TEXT)');
        db.exec('CREATE TABLE layers (id TEXT PRIMARY KEY, key TEXT NOT NULL)');
        db.exec(
          'CREATE TABLE units (id TEXT PRIMARY KEY, layer_id TEXT, media_id TEXT, parent_unit_id TEXT)',
        );
        db.exec(
          'CREATE TABLE tokens (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, token_index INTEGER NOT NULL, form TEXT NOT NULL)',
        );
        db.exec(
          'CREATE TABLE morphemes (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, token_id TEXT NOT NULL, morpheme_index INTEGER NOT NULL, form TEXT NOT NULL)',
        );
        db.prepare('INSERT INTO meta (id, audio_id, source_document_id) VALUES (?, ?, ?)').run(
          manuscript.id,
          manuscript.audioId,
          manuscript.sourceDocumentId,
        );
        const insertLayer = db.prepare('INSERT INTO layers (id, key) VALUES (?, ?)');
        for (const layer of manuscript.layers ?? []) insertLayer.run(layer.id, layer.key);
        const insert = db.prepare(
          'INSERT INTO units (id, layer_id, media_id, parent_unit_id) VALUES (?, ?, ?, ?)',
        );
        for (const unit of manuscript.units) {
          insert.run(unit.id, unit.layerId ?? null, unit.mediaId ?? null, unit.parentUnitId ?? null);
        }
        const insertToken = db.prepare(
          'INSERT INTO tokens (id, unit_id, token_index, form) VALUES (?, ?, ?, ?)',
        );
        for (const token of manuscript.tokens ?? []) {
          insertToken.run(token.id, token.unitId, token.tokenIndex, token.form);
        }
        const insertMorpheme = db.prepare(
          'INSERT INTO morphemes (id, unit_id, token_id, morpheme_index, form) VALUES (?, ?, ?, ?, ?)',
        );
        for (const morpheme of manuscript.morphemes ?? []) {
          insertMorpheme.run(
            morpheme.id,
            morpheme.unitId,
            morpheme.tokenId,
            morpheme.morphemeIndex,
            morpheme.form,
          );
        }
      });
      written.push(file);
    }
  } catch (error) {
    for (const file of written) fs.rmSync(file, { force: true });
    throw error;
  }
}

export function readProject(dest) {
  const project = new DatabaseSync(path.join(dest, 'project.sqlite'), { readOnly: true });
  const audios = project.prepare('SELECT id, relpath, sha256 FROM audio ORDER BY id').all();
  const projectRow = project.prepare('SELECT id, name FROM project').get();
  const speakers = project.prepare('SELECT id, text_id, name FROM speakers ORDER BY id').all();
  project.close();
  const manuscripts = fs
    .readdirSync(dest)
    .filter((name) => name.endsWith('.jyd'))
    .sort()
    .map((fileName) => {
      const db = new DatabaseSync(path.join(dest, fileName), { readOnly: true });
      const meta = db.prepare('SELECT id, audio_id, source_document_id FROM meta').get();
      const layers = db.prepare('SELECT id, key FROM layers ORDER BY id').all();
      const units = db
        .prepare('SELECT id, layer_id, media_id, parent_unit_id FROM units ORDER BY id')
        .all();
      const tokens = db
        .prepare('SELECT id, unit_id, token_index, form FROM tokens ORDER BY token_index, id')
        .all();
      const morphemes = db
        .prepare(
          'SELECT id, unit_id, token_id, morpheme_index, form FROM morphemes ORDER BY morpheme_index, id',
        )
        .all();
      db.close();
      return {
        fileName,
        id: meta.id,
        audioId: meta.audio_id,
        sourceDocumentId: meta.source_document_id,
        layers: layers.map((layer) => ({ id: layer.id, key: layer.key })),
        tokens: tokens.map((token) => ({
          id: token.id,
          unitId: token.unit_id,
          tokenIndex: token.token_index,
          form: token.form,
        })),
        morphemes: morphemes.map((morpheme) => ({
          id: morpheme.id,
          unitId: morpheme.unit_id,
          tokenId: morpheme.token_id,
          morphemeIndex: morpheme.morpheme_index,
          form: morpheme.form,
        })),
        units: units.map((unit) => ({
          id: unit.id,
          layerId: unit.layer_id,
          mediaId: unit.media_id,
          parentUnitId: unit.parent_unit_id,
        })),
      };
    });
  return {
    project: projectRow ? { id: projectRow.id, name: projectRow.name } : null,
    speakers: speakers.map((speaker) => ({
      id: speaker.id,
      textId: speaker.text_id,
      name: speaker.name,
    })),
    audios: audios.map((audio) => ({
      id: audio.id,
      relPath: audio.relpath,
      sha256: audio.sha256,
    })),
    manuscripts,
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const [planFile, dest] = process.argv.slice(2);
  const raw = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  applyPlan(
    {
      project: raw.project ?? null,
      speakers: raw.speakers ?? [],
      audios: raw.audios.map((audio) => ({ ...audio, bytes: Buffer.from(audio.bytes, 'base64') })),
      manuscripts: raw.manuscripts,
    },
    dest,
  );
  process.stdout.write(JSON.stringify(readProject(dest)));
}
