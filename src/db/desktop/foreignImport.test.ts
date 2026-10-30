import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => { window: { DOMParser: typeof DOMParser } };
};
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { segmentUnitWords } from './analysisRestore';
import { createDefinition } from './customFields';
import { importForeignFile } from './foreignImport';
import { openProject } from './openProject';
import { exportDesktopJym, importDesktopJym } from './projectExchange';
import { listUnits } from './units';

const roots: string[] = [];

beforeAll(() => {
  globalThis.DOMParser = new JSDOM('').window.DOMParser;
});

afterEach(() => {
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('foreign file import', () => {
  it('writes a TextGrid sentence into the open project', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'kept.TextGrid'), textGrid('kept sentence'));
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    expect(
      importForeignFile({
        folder: project,
        file: join(source, 'kept.TextGrid'),
        roles: join(source, 'roles.txt'),
      }),
    ).toMatchObject({ paths: [project], written: 1 });
    expect(texts(project)).toEqual(['kept sentence']);
    expect(
      existsSync(sourceFile(project, readFileSync(join(source, 'kept.TextGrid')), '.textgrid')),
    ).toBe(true);
  });

  it('writes an unmarked TextGrid with default transcription role when media is present (#429)', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    const bytes = Buffer.from(textGrid('kept sentence'));
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'kept.TextGrid'), bytes);
    const result = importForeignFile({ folder: project, file: join(source, 'kept.TextGrid') });
    expect(result.written).toBeGreaterThan(0);
    expect(texts(project)).toEqual(['kept sentence']);
    expect(existsSync(sourceFile(project, bytes, '.textgrid'))).toBe(true);
  });

  it('stores a point tier as the same instant after reopen', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'kept.TextGrid'), pointGrid());
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    importForeignFile({
      folder: project,
      file: join(source, 'kept.TextGrid'),
      roles: join(source, 'roles.txt'),
    });
    const opened = openProject(project);
    const row = opened.db.prepare('SELECT start_time, end_time FROM units').get() as {
      start_time: number;
      end_time: number;
    };
    opened.close();
    expect(row).toEqual({ start_time: 0.5, end_time: 0.5 });
  });

  it('refuses a folder that has no library', () => {
    const root = mkdtempSync(join(tmpdir(), 'jieyu-foreign-import-'));
    roots.push(root);
    const file = join(root, 'kept.TextGrid');
    writeFileSync(file, textGrid('kept sentence'));
    expect(() => importForeignFile({ folder: root, file })).toThrow('project library is missing');
    expect(existsSync(join(root, 'project.sqlite'))).toBe(false);
  });

  it('refuses .txt and a conflicting role list', () => {
    const project = library();
    const file = join(rootOf(project), 'notes.txt');
    writeFileSync(file, 'hello');
    expect(() => importForeignFile({ folder: project, file })).toThrow(
      'import extension is unsupported',
    );
    const source = join(rootOf(project), 'source');
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'kept.TextGrid'), textGrid('kept sentence'));
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\ntx 译文\n');
    expect(() =>
      importForeignFile({
        folder: project,
        file: join(source, 'kept.TextGrid'),
        roles: join(source, 'roles.txt'),
      }),
    ).toThrow('tier role conflicts');
  });

  it('writes an EAF sentence and a LIFT headword', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    writeFileSync(join(source, 'test.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'kept.eaf'), eaf());
    writeFileSync(join(source, 'roles.txt'), 'transcription 转写\n');
    importForeignFile({
      folder: project,
      file: join(source, 'kept.eaf'),
      roles: join(source, 'roles.txt'),
    });
    expect(texts(project)).toEqual(['kept sentence']);

    writeFileSync(join(source, 'kept.lift'), lift());
    importForeignFile({ folder: project, file: join(source, 'kept.lift') });
    const opened = openProject(project);
    const row = opened.db.prepare('SELECT entry_json FROM lexemes').get() as {
      entry_json: string;
    };
    opened.close();
    expect(JSON.parse(row.entry_json)).toMatchObject({ headword: 'kept' });
  });

  it('writes FlexText and plain EAF without a roles file (#429)', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    writeFileSync(join(source, 'phrase.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'phrase.flextext'), flex());
    expect(
      importForeignFile({ folder: project, file: join(source, 'phrase.flextext') }).written,
    ).toBeGreaterThan(0);
    expect(texts(project)).toContain('kept sentence');

    writeFileSync(join(source, 'test.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'plain.eaf'), eaf());
    expect(
      importForeignFile({ folder: project, file: join(source, 'plain.eaf') }).written,
    ).toBeGreaterThan(0);
  });

  it('writes a Toolbox sentence and a FlexText sentence', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(
      join(source, 'kept.toolbox'),
      '\\ref rec1\n\\ts 0.000\n\\te 1.000\n\\tx kept sentence\n\\ft hello\n',
    );
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\nft 译文\n');
    importForeignFile({
      folder: project,
      file: join(source, 'kept.toolbox'),
      roles: join(source, 'roles.txt'),
    });
    expect(texts(project)).toContain('kept sentence');

    writeFileSync(join(source, 'phrase.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'phrase.flextext'), flex());
    writeFileSync(join(source, 'flex-roles.txt'), 'primary 转写\nFLEx Gloss 译文\n');
    importForeignFile({
      folder: project,
      file: join(source, 'phrase.flextext'),
      roles: join(source, 'flex-roles.txt'),
    });
    expect(texts(project)).toContain('kept sentence');
  });

  it('parses flextext/eaf/lift in Node without a preinstalled DOMParser (#427)', () => {
    const saved = globalThis.DOMParser;
    // @ts-expect-error intentional: simulate Electron main
    delete globalThis.DOMParser;
    try {
      const project = library();
      const source = join(rootOf(project), 'source');
      writeFileSync(join(source, 'phrase.wav'), Buffer.from('synthetic-chain'));
      writeFileSync(join(source, 'phrase.flextext'), flex());
      writeFileSync(join(source, 'flex-roles.txt'), 'primary 转写\nFLEx Gloss 译文\n');
      expect(
        importForeignFile({
          folder: project,
          file: join(source, 'phrase.flextext'),
          roles: join(source, 'flex-roles.txt'),
        }).written,
      ).toBeGreaterThan(0);

      writeFileSync(join(source, 'test.wav'), Buffer.from('synthetic-chain'));
      writeFileSync(join(source, 'kept.eaf'), eaf());
      writeFileSync(join(source, 'eaf-roles.txt'), 'transcription 转写\n');
      expect(
        importForeignFile({
          folder: project,
          file: join(source, 'kept.eaf'),
          roles: join(source, 'eaf-roles.txt'),
        }).written,
      ).toBeGreaterThan(0);

      writeFileSync(join(source, 'kept.lift'), lift());
      expect(
        importForeignFile({ folder: project, file: join(source, 'kept.lift') }).written,
      ).toBeGreaterThan(0);
    } finally {
      globalThis.DOMParser = saved;
    }
  });

  it('creates one folder per JYB project and refuses a field that does not fit', () => {
    const parent = mkdtempSync(join(tmpdir(), 'jieyu-foreign-jyb-'));
    roots.push(parent);
    const audio = Buffer.from('synthetic-chain');
    const digest = createHash('sha256').update(audio).digest('hex');
    const packed = jyb({
      name: 'Sample',
      digest,
      audio,
      extra: false,
    });
    expect(importForeignFile({ folder: parent, file: packed }).paths).toEqual([
      join(parent, 'Sample'),
    ]);
    expect(texts(join(parent, 'Sample'))).toEqual(['kept sentence']);

    const bad = jyb({ name: 'Other', digest, audio, extra: true });
    const extra = importForeignFile({ folder: parent, file: bad });
    expect(extra.paths).toEqual([join(parent, 'Other')]);
    expect(extra.unprojected).toContainEqual({
      name: 'Other/media_items.timelineKind',
      reason: 'import field does not fit',
    });
    expect(texts(join(parent, 'Other'))).toEqual(['kept sentence']);
  });

  it('keeps a second copy of the same recording and the first manuscript', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    const audio = Buffer.from('synthetic-chain');
    writeFileSync(join(source, 'kept.wav'), audio);
    writeFileSync(join(source, 'kept.TextGrid'), textGrid('kept sentence'));
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    const input = {
      folder: project,
      file: join(source, 'kept.TextGrid'),
      roles: join(source, 'roles.txt'),
    };
    importForeignFile(input);
    importForeignFile(input);
    expect(texts(project)).toEqual(['kept sentence', 'kept sentence']);
    const opened = openProject(project);
    const media = opened.db.prepare('SELECT relpath FROM media').get() as { relpath: string };
    opened.close();
    expect(readFileSync(join(project, media.relpath)).equals(audio)).toBe(true);
  });

  it('leaves an existing recording in place when the hash does not match', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'kept.TextGrid'), textGrid('kept sentence'));
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    importForeignFile({
      folder: project,
      file: join(source, 'kept.TextGrid'),
      roles: join(source, 'roles.txt'),
    });
    const opened = openProject(project);
    const media = opened.db.prepare('SELECT relpath FROM media').get() as { relpath: string };
    opened.close();
    releaseAllProjectLocks();
    const replaced = Buffer.from('different-bytes');
    writeFileSync(join(project, media.relpath), replaced);
    expect(() =>
      importForeignFile({
        folder: project,
        file: join(source, 'kept.TextGrid'),
        roles: join(source, 'roles.txt'),
      }),
    ).toThrow('media hash does not match');
    expect(readFileSync(join(project, media.relpath)).equals(replaced)).toBe(true);
    expect(texts(project)).toEqual(['kept sentence']);
  });

  it('deletes only the files this import created when a later write fails', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    const audio = Buffer.from('synthetic-chain');
    const grid = textGrid('kept sentence');
    writeFileSync(join(source, 'kept.wav'), audio);
    writeFileSync(join(source, 'kept.TextGrid'), grid);
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    const kept = join(project, 'already.txt');
    writeFileSync(kept, 'stay');
    const opened = openProject(project);
    opened.db.exec(
      `CREATE TEMP TRIGGER abort_import_manuscript BEFORE INSERT ON manuscripts
       BEGIN SELECT RAISE(ABORT, 'injected'); END`,
    );
    expect(() =>
      importForeignFile({
        folder: project,
        file: join(source, 'kept.TextGrid'),
        roles: join(source, 'roles.txt'),
        db: opened.db,
      }),
    ).toThrow('injected');
    opened.close();
    expect(existsSync(join(source, 'kept.wav'))).toBe(true);
    expect(existsSync(join(source, 'kept.TextGrid'))).toBe(true);
    expect(readFileSync(kept, 'utf8')).toBe('stay');
    expect(existsSync(sourceFile(project, Buffer.from(grid), '.textgrid'))).toBe(false);
    expect(
      existsSync(join(project, 'media', `${createHash('sha256').update(audio).digest('hex')}.wav`)),
    ).toBe(false);
    const again = openProject(project);
    expect(again.db.prepare('SELECT COUNT(*) AS n FROM manuscripts').get()).toEqual({ n: 0 });
    expect(again.db.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({ n: 0 });
    again.close();
  });

  it('projects a legal interval and reports the one that does not fit', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    const body = textGrid('kept sentence').replace('intervals: size = 1', 'intervals: size = 2');
    const withBad = `${body}        intervals [2]:
            xmin = 2
            xmax = 1
            text = "dropped"
`;
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'kept.TextGrid'), withBad);
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    const result = importForeignFile({
      folder: project,
      file: join(source, 'kept.TextGrid'),
      roles: join(source, 'roles.txt'),
    });
    expect(result.written).toBe(1);
    expect(result.unprojected).toContainEqual({
      name: 'dropped',
      reason: 'import field does not fit',
    });
    expect(texts(project)).toEqual(['kept sentence']);
  });

  it('keeps imported words after a later segmentation', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(
      join(source, 'kept.toolbox'),
      '\\ref rec1\n\\ts 0.000\n\\te 1.000\n\\tx kept\n\\mb kept\n\\ge hello\n\\ps n\n',
    );
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    importForeignFile({
      folder: project,
      file: join(source, 'kept.toolbox'),
      roles: join(source, 'roles.txt'),
    });
    const opened = openProject(project);
    const unit = opened.db.prepare('SELECT id FROM units').get() as { id: string };
    expect(segmentUnitWords(opened.db, unit.id)).toMatchObject([
      { form: 'kept', gloss: { eng: 'hello' } },
    ]);
    const morpheme = opened.db.prepare('SELECT pos FROM morphemes').get() as { pos: string };
    expect(morpheme.pos).toBe('n');
    opened.close();
  });

  it('reports a unit when a required field has no value', () => {
    const project = library();
    const opened = openProject(project);
    createDefinition(opened.db, {
      targetType: 'unit',
      name: { und: 'needed' },
      fieldType: 'text',
      required: true,
    });
    opened.close();
    releaseAllProjectLocks();
    const source = join(rootOf(project), 'source');
    const bytes = Buffer.from(textGrid('kept sentence'));
    writeFileSync(join(source, 'kept.wav'), Buffer.from('synthetic-chain'));
    writeFileSync(join(source, 'kept.TextGrid'), bytes);
    writeFileSync(join(source, 'roles.txt'), 'tx 转写\n');
    const result = importForeignFile({
      folder: project,
      file: join(source, 'kept.TextGrid'),
      roles: join(source, 'roles.txt'),
    });
    expect(result.written).toBe(0);
    expect(result.unprojected).toContainEqual({
      name: 'kept sentence',
      reason: 'unit is missing a required field',
    });
    expect(texts(project)).toEqual([]);
    expect(existsSync(sourceFile(project, bytes, '.textgrid'))).toBe(true);
  });

  it('keeps two LIFT entries with the same headword and the picture', () => {
    const project = library();
    const source = join(rootOf(project), 'source');
    const picture = Buffer.from('synthetic-picture');
    writeFileSync(join(source, 'kept.png'), picture);
    writeFileSync(join(source, 'kept.lift'), liftPair());
    const result = importForeignFile({ folder: project, file: join(source, 'kept.lift') });
    expect(result.written).toBe(2);
    const opened = openProject(project);
    const rows = opened.db
      .prepare('SELECT entry_json, provenance_json FROM lexemes')
      .all() as Array<{
      entry_json: string;
      provenance_json: string;
    }>;
    const digest = createHash('sha256').update(picture).digest('hex');
    opened.close();
    expect(rows.map((row) => JSON.parse(row.entry_json).headword)).toEqual(['kept', 'kept']);
    expect(rows.map((row) => JSON.parse(row.provenance_json).sourceEntryId).sort()).toEqual([
      'e1',
      'e2',
    ]);
    expect(readFileSync(join(project, 'attachments/objects', digest)).equals(picture)).toBe(true);
  });

  it('keeps each JYB sentence on the manuscript named by its layer', () => {
    const parent = mkdtempSync(join(tmpdir(), 'jieyu-foreign-jyb-'));
    roots.push(parent);
    const first = Buffer.from('synthetic-chain');
    const second = Buffer.from('synthetic-other');
    const firstDigest = createHash('sha256').update(first).digest('hex');
    const secondDigest = createHash('sha256').update(second).digest('hex');
    const library = {
      projects: [
        {
          name: 'Sample',
          collections: {
            media_items: [
              { id: 'media-1', filename: 'a.wav', duration: 1, contentSha256: firstDigest },
              { id: 'media-2', filename: 'b.wav', duration: 1, contentSha256: secondDigest },
            ],
            texts: [
              { id: 'text-1', title: { und: 'One' } },
              { id: 'text-2', title: { und: 'Two' } },
            ],
            tier_definitions: [
              {
                id: 'layer-1',
                textId: 'text-1',
                key: 'tx',
                name: { und: 'A' },
                contentType: 'transcription',
                tierType: 'time-aligned',
              },
              {
                id: 'layer-2',
                textId: 'text-2',
                key: 'tx',
                name: { und: 'B' },
                contentType: 'transcription',
                tierType: 'time-aligned',
              },
            ],
            layer_units: [
              {
                mediaId: 'media-1',
                layerId: 'layer-1',
                startTime: 0,
                endTime: 1,
                text: 'first sentence',
              },
              {
                mediaId: 'media-2',
                layerId: 'layer-2',
                startTime: 0,
                endTime: 1,
                text: 'second sentence',
              },
            ],
          },
        },
      ],
    };
    const packed = join(parent, 'sample.jyb');
    writeFileSync(
      packed,
      zipSync({
        mimetype: strToU8('application/vnd.jieyu.jyb'),
        'data/library.json': strToU8(JSON.stringify(library)),
        'media/media-1': new Uint8Array(first),
        'media/media-2': new Uint8Array(second),
      }),
    );
    expect(importForeignFile({ folder: parent, file: packed }).written).toBe(2);
    const opened = openProject(join(parent, 'Sample'));
    const rows = opened.db
      .prepare(
        `SELECT manuscripts.title_json AS title, unit_texts.body AS text
         FROM manuscripts
         JOIN layers ON layers.manuscript_id = manuscripts.id
         JOIN units ON units.layer_id = layers.id
         JOIN unit_texts ON unit_texts.unit_id = units.id
         ORDER BY manuscripts.title_json`,
      )
      .all() as Array<{ title: string; text: string }>;
    opened.close();
    expect(rows).toEqual([
      { title: JSON.stringify({ und: 'One' }), text: 'first sentence' },
      { title: JSON.stringify({ und: 'Two' }), text: 'second sentence' },
    ]);
  });

  it('does not publish imported sources through a symlink outside the project', () => {
    const root = mkdtempSync(join(tmpdir(), 'jieyu-import-sources-'));
    roots.push(root);
    const folder = join(root, 'project');
    mkdirSync(folder);
    openProject(folder).close();
    const outside = join(root, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(folder, 'sources'));
    const file = join(root, 'test.TextGrid');
    writeFileSync(
      file,
      `File type = "ooTextFile"\nObject class = "TextGrid"\nxmin = 0\nxmax = 1\ntiers? <exists>\nsize = 0\nitem []:\n`,
    );
    try {
      importForeignFile({ folder, file });
    } catch {
      /* rejection is allowed */
    }
    expect(readdirSync(outside)).toEqual([]);
  });

  it('backs up a LIFT source referenced by lexeme provenance', () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-import-lift-'));
    const restored = mkdtempSync(join(tmpdir(), 'jieyu-import-lift-restored-'));
    roots.push(folder, restored);
    const project = openProject(folder);
    try {
      const file = join(folder, 'sample.lift');
      writeFileSync(
        file,
        '<lift version="0.13"><entry id="e1"><lexical-unit><form lang="und"><text>word</text></form></lexical-unit><sense id="s1"><definition><form lang="und"><text>meaning</text></form></definition></sense></entry></lift>',
      );
      expect(importForeignFile({ folder, file, db: project.db }).written).toBe(1);
      const row = project.db
        .prepare('SELECT provenance_json FROM lexemes WHERE provenance_json IS NOT NULL')
        .get() as { provenance_json: string };
      const relpath = (JSON.parse(row.provenance_json) as { relpath: string }).relpath;
      importDesktopJym(restored, exportDesktopJym(project.db, folder));
      expect(readFileSync(join(restored, relpath)).byteLength).toBeGreaterThan(0);
    } finally {
      project.close();
    }
  });

  it('preserves the FLEx phrase speaker or reports it as unprojected', () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-import-flex-'));
    roots.push(folder);
    const project = openProject(folder);
    try {
      const file = join(folder, 'phrase.flextext');
      writeFileSync(join(folder, 'roles.txt'), 'primary 转写\n');
      writeFileSync(join(folder, 'phrase.wav'), 'audio');
      writeFileSync(
        file,
        `<document><interlinear-text><paragraphs><paragraph><phrases>
      <phrase guid="p1" speaker="Alice" begin-time-offset="0" end-time-offset="1000">
        <item type="txt" lang="und">hello</item>
      </phrase></phrases></paragraph></paragraphs></interlinear-text></document>`,
      );
      const result = importForeignFile({ folder, file, db: project.db });
      expect(result.written).toBe(1);
      const row = project.db
        .prepare(
          'SELECT speakers.name FROM units LEFT JOIN speakers ON units.speaker_id = speakers.id',
        )
        .get() as { name: string | null };
      expect(
        row.name === 'Alice' || result.unprojected.some((item) => item.name.includes('Alice')),
      ).toBe(true);
    } finally {
      project.close();
    }
  });

  it('keeps the imported source file referenced by provenance after JYM restore', () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-import-source-'));
    const destination = mkdtempSync(join(tmpdir(), 'jieyu-import-source-restored-'));
    roots.push(folder, destination);
    const project = openProject(folder);
    try {
      const file = join(folder, 'source.TextGrid');
      writeFileSync(join(folder, 'source.wav'), 'audio');
      writeFileSync(join(folder, 'roles.txt'), 'tx 转写\n');
      writeFileSync(
        file,
        `File type = "ooTextFile"\nObject class = "TextGrid"\nxmin = 0\nxmax = 1\ntiers? <exists>\nsize = 1\nitem []:\nitem [1]:\nclass = "IntervalTier"\nname = "tx"\nxmin = 0\nxmax = 1\nintervals: size = 1\nintervals [1]:\nxmin = 0\nxmax = 1\ntext = "sentence"\n`,
      );
      expect(importForeignFile({ folder, file, db: project.db }).written).toBe(1);
      const row = project.db.prepare('SELECT provenance_json FROM unit_texts').get() as {
        provenance_json: string;
      };
      const { relpath } = JSON.parse(row.provenance_json) as { relpath: string };
      expect(existsSync(join(folder, relpath))).toBe(true);
      importDesktopJym(destination, exportDesktopJym(project.db, folder));
      expect(existsSync(join(destination, relpath))).toBe(true);
    } finally {
      project.close();
    }
  });

  it('reports JYB units whose layer cannot be projected', () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-import-jyb-'));
    roots.push(folder);
    const file = join(folder, 'sample.jyb');
    writeFileSync(
      file,
      zipSync({
        mimetype: strToU8('application/vnd.jieyu.jyb'),
        'data/library.json': strToU8(
          JSON.stringify({
            projects: [
              {
                name: 'imported',
                collections: {
                  layer_units: [
                    {
                      id: 'u1',
                      mediaId: 'm1',
                      layerId: 'missing',
                      startTime: 0,
                      endTime: 1,
                      text: 'orphan sentence',
                    },
                  ],
                },
              },
            ],
          }),
        ),
      }),
    );
    const result = importForeignFile({ folder, file });
    expect(result.written).toBe(0);
    expect(result.unprojected.length).toBeGreaterThan(0);
  });
});

function library(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-foreign-import-'));
  roots.push(root);
  const folder = join(root, 'project');
  const source = join(root, 'source');
  writeFileSync(join(root, '.keep'), '');
  const project = openProject(folder);
  project.close();
  releaseAllProjectLocks();
  mkdirSync(source);
  return folder;
}

function rootOf(folder: string): string {
  return join(folder, '..');
}

function sourceFile(folder: string, bytes: Buffer, extension: string): string {
  return join(folder, 'sources', `${createHash('sha256').update(bytes).digest('hex')}${extension}`);
}

function liftPair(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13">
  <entry id="e1">
    <lexical-unit><form lang="und"><text>kept</text></form></lexical-unit>
    <sense id="s1">
      <definition><form lang="und"><text>one</text></form></definition>
      <illustration href="kept.png"/>
    </sense>
  </entry>
  <entry id="e2">
    <lexical-unit><form lang="und"><text>kept</text></form></lexical-unit>
    <sense id="s2"><definition><form lang="und"><text>two</text></form></definition></sense>
  </entry>
</lift>`;
}

function texts(folder: string): string[] {
  const project = openProject(folder);
  try {
    const layers = project.db.prepare('SELECT id FROM layers').all() as Array<{ id: string }>;
    return layers.flatMap((layer) => listUnits(project.db, layer.id).map((unit) => unit.text));
  } finally {
    project.close();
  }
}

function textGrid(text: string): string {
  return `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "tx"
        xmin = 0
        xmax = 1
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 1
            text = "${text}"
`;
}

function pointGrid(): string {
  return `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "PointTier"
        name = "tx"
        xmin = 0
        xmax = 1
        points: size = 1
        points [1]:
            number = 0.5
            mark = "kept sentence"
`;
}

function eaf(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="test.wav" MIME_TYPE="audio/x-wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="transcription" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>kept sentence</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" />
</ANNOTATION_DOCUMENT>`;
}

function lift(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13">
  <entry id="e1">
    <lexical-unit><form lang="und"><text>kept</text></form></lexical-unit>
    <sense id="s1"><definition><form lang="und"><text>kept</text></form></definition></sense>
  </entry>
</lift>`;
}

function flex(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <interlinear-text>
    <paragraphs><paragraph><phrases>
      <phrase begin-time-offset="0" end-time-offset="1000">
        <item type="txt" lang="und">kept sentence</item>
        <item type="gls" lang="en">hello</item>
      </phrase>
    </phrases></paragraph></paragraphs>
  </interlinear-text>
</document>`;
}

function jyb(input: { name: string; digest: string; audio: Buffer; extra: boolean }): string {
  const media: Record<string, unknown> = {
    id: 'media-1',
    filename: 'clip.wav',
    duration: 1,
    contentSha256: input.digest,
  };
  if (input.extra) media.timelineKind = 'acoustic';
  const library = {
    projects: [
      {
        name: input.name,
        collections: {
          media_items: [media],
          texts: [{ title: { und: 'Clip' } }],
          tier_definitions: [
            {
              id: 'layer-1',
              key: 'tx',
              name: { und: 'Transcription' },
              contentType: 'transcription',
              tierType: 'time-aligned',
            },
          ],
          layer_units: [
            {
              mediaId: 'media-1',
              layerId: 'layer-1',
              startTime: 0,
              endTime: 1,
              text: 'kept sentence',
            },
          ],
        },
      },
    ],
  };
  const bytes = zipSync({
    mimetype: strToU8('application/vnd.jieyu.jyb'),
    'data/library.json': strToU8(JSON.stringify(library)),
    'media/media-1': new Uint8Array(input.audio),
  });
  const root = roots[roots.length - 1] ?? tmpdir();
  const file = join(root, `${input.name}.jyb`);
  writeFileSync(file, bytes);
  return file;
}
