import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => { window: { DOMParser: typeof DOMParser } };
};
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { importForeignFile } from './foreignImport';
import { openProject } from './openProject';
import { openDesktopSession, reopenDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

beforeAll(() => {
  globalThis.DOMParser = new JSDOM('').window.DOMParser;
});

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('desktop exchange', () => {
  it('imports into the open project and writes the export beside it', () => {
    const dir = tempFolder();
    const audio = Buffer.from('synthetic-chain');
    writeFileSync(join(dir, 'a.wav'), audio);
    const session = openDesktopSession(dir, [dir]);
    const seeded = seedUnit(
      session.sessionId,
      'before',
      createHash('sha256').update(audio).digest('hex'),
    );
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: seeded.id,
      text: 'after',
    });
    const exported = join(dir, 'out.jyt');
    callDesktopSession(session.sessionId, 'exchange.exportJyt', { file: exported });
    callDesktopSession(session.sessionId, 'units.undo', {});
    expect(unitText(session.sessionId, seeded.id)).toBe('before');

    const source = join(dir, 'source');
    mkdirSync(source);
    const file = join(source, 'kept.eaf');
    writeFileSync(file, eaf());
    writeFileSync(join(source, 'test.wav'), Buffer.from('synthetic-chain'));
    expect(() => importForeignFile({ folder: dir, file })).toThrow('project folder is busy');
    expect(listed(join(dir, 'sources'))).toEqual([]);

    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: seeded.id,
      text: 'later',
    });
    const imported = callDesktopSession(session.sessionId, 'exchange.importFile', { file }) as {
      written: number;
    };
    expect(imported.written).toBe(1);
    expect(() => openProject(dir)).toThrow('project folder is busy');
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );
    expect(unitText(session.sessionId, seeded.id)).toBe('later');
    expect(texts(session.sessionId).sort()).toEqual(['kept sentence', 'later']);

    const manuscripts = callDesktopSession(session.sessionId, 'manuscripts.list', {}) as {
      id: string;
    }[];
    const importedManuscript = manuscripts.find((item) => item.id !== seeded.manuscriptId);
    if (importedManuscript === undefined) throw new Error('imported manuscript is missing');
    const jym = join(dir, 'out.jym');
    const manuscriptPackage = join(dir, 'manuscript.jyt');
    callDesktopSession(session.sessionId, 'exchange.exportJym', { file: jym });
    callDesktopSession(session.sessionId, 'exchange.exportManuscript', {
      file: manuscriptPackage,
      manuscriptId: importedManuscript.id,
    });
    expect(statSync(exported).size).toBeGreaterThan(0);
    expect(statSync(jym).size).toBeGreaterThan(0);
    expect(statSync(manuscriptPackage).size).toBeGreaterThan(0);

    reopenDesktopSession(session.sessionId);
    expect(texts(session.sessionId).sort()).toEqual(['kept sentence', 'later']);
  });

  it('removes the copied source when the audio is missing and keeps the session', () => {
    const dir = tempFolder();
    const session = openDesktopSession(dir, [dir]);
    const source = join(dir, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'kept.eaf'), eaf());
    expect(() =>
      callDesktopSession(session.sessionId, 'exchange.importFile', {
        file: join(source, 'kept.eaf'),
      }),
    ).toThrow('media file is missing');
    expect(listed(join(dir, 'sources'))).toEqual([]);
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([]);
  });

  it('refuses a bundle import into the open project', () => {
    const dir = tempFolder();
    const session = openDesktopSession(dir, [dir]);
    const file = join(dir, 'kept.jyb');
    writeFileSync(file, 'not a bundle');
    expect(() => callDesktopSession(session.sessionId, 'exchange.importFile', { file })).toThrow(
      'import extension is unsupported',
    );
    expect(callDesktopSession(session.sessionId, 'project.get', {})).toMatchObject({
      id: expect.any(String),
    });
  });
});

function texts(sessionId: string): string[] {
  const manuscripts = callDesktopSession(sessionId, 'manuscripts.list', {}) as { id: string }[];
  const found: string[] = [];
  for (const manuscript of manuscripts) {
    const layers = callDesktopSession(sessionId, 'layers.list', {
      manuscriptId: manuscript.id,
    }) as { id: string }[];
    for (const layer of layers) {
      const units = callDesktopSession(sessionId, 'units.list', { layerId: layer.id }) as {
        text: string;
      }[];
      found.push(...units.map((unit) => unit.text));
    }
  }
  return found;
}

function unitText(sessionId: string, unitId: string): string {
  const unit = callDesktopSession(sessionId, 'units.get', { id: unitId }) as { text: string };
  return unit.text;
}

function seedUnit(
  sessionId: string,
  text: string,
  sha256: string,
): { id: string; manuscriptId: string } {
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256,
    duration: 3,
  }) as { id: string };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  const unit = callDesktopSession(sessionId, 'units.create', {
    layerId: layer.id,
    startTime: 0,
    endTime: 1,
    text,
  }) as { id: string };
  return { id: unit.id, manuscriptId: manuscript.id };
}

function listed(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir) : [];
}

function tempFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-exchange-'));
  roots.push(root);
  return root;
}

function eaf(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="test.wav" MIME_TYPE="audio/x-wav" />
    <PROPERTY NAME="jieyu:layer-meta:transcription">{"role":"transcription"}</PROPERTY>
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
