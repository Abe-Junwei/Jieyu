import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('keeps an unmarked TextGrid in the source file and writes nothing', () => {
    const project = library();
    const file = join(rootOf(project), 'kept.TextGrid');
    const bytes = Buffer.from(textGrid('kept sentence'));
    writeFileSync(file, bytes);
    const result = importForeignFile({ folder: project, file });
    expect(result.written).toBe(0);
    expect(result.unprojected).toContainEqual({ name: 'tx', reason: 'tier role is missing' });
    expect(texts(project)).toEqual([]);
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
      expect(importForeignFile({ folder: project, file: join(source, 'kept.lift') }).written).toBeGreaterThan(
        0,
      );
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
