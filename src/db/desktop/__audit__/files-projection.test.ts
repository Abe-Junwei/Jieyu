import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { openProject } from '../openProject';
import { importForeignFile } from '../foreignImport';
import { zipSync, strToU8 } from 'fflate';
import { exportDesktopJym, importDesktopJym } from '../projectExchange';

it('preserves the FLEx phrase speaker or reports it as unprojected', () => {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  globalThis.DOMParser = new JSDOM('').window.DOMParser;
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-audit-flex-'));
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
    rmSync(folder, { recursive: true, force: true });
  }
});

it('keeps the imported source file referenced by provenance after JYM restore', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-audit-source-'));
  const destination = mkdtempSync(join(tmpdir(), 'jieyu-audit-restored-'));
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
    rmSync(folder, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

it('reports JYB units whose layer cannot be projected', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-audit-jyb-'));
  try {
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
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
