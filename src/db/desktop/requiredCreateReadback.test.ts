import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { createBridge, createOrthography, ensureProjectLanguage } from './catalog';
import { createDefinition, readFieldValue } from './customFields';
import { createConversation } from './conversations';
import { saveLexemeEntry } from './lexicon';
import { appendMessage } from './messages';
import { createContentNote } from './notes';
import { openProject, type DesktopProject } from './openProject';
import { ensureProjectIdentity } from './projectIdentity';
import { resetDesktopSessions } from './projectSession';

type SqliteDatabase = InstanceType<typeof Database>;

interface Parents {
  mediaId?: string;
  manuscriptId?: string;
  layerId?: string;
  conversationId?: string;
  languageId?: string;
  sourceOrthographyId?: string;
  targetOrthographyId?: string;
}

interface Created {
  id: string;
  lexemeId?: string;
}

interface CreateCase {
  targetType: string;
  table: string;
  prepare: (project: DesktopProject, dir: string) => Parents;
  create: (project: DesktopProject, parents: Parents, fieldId: string | undefined) => Created;
}

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-required-create-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  writeFileSync(join(root, 'b.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function rows(db: SqliteDatabase, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function need(value: string | undefined, label: string): string {
  if (value === undefined) throw new Error(`${label} is missing`);
  return value;
}

function kept(fieldId: string | undefined): { fieldValues: Record<string, unknown> } | undefined {
  if (fieldId === undefined) return undefined;
  return { fieldValues: { [fieldId]: 'kept' } };
}

function media(project: DesktopProject): Parents {
  return {
    mediaId: project.media.create({ relpath: 'a.wav', sha256: 'aa', duration: 1 }).id,
  };
}

function manuscript(project: DesktopProject): Parents {
  const seeded = media(project);
  return {
    ...seeded,
    manuscriptId: project.manuscripts.create({
      title: { zh: '文稿' },
      mediaId: need(seeded.mediaId, 'media'),
    }).id,
  };
}

function layer(project: DesktopProject): Parents {
  const seeded = manuscript(project);
  return {
    ...seeded,
    layerId: project.layers.create({
      manuscriptId: need(seeded.manuscriptId, 'manuscript'),
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }).id,
  };
}

function language(project: DesktopProject): Parents {
  return {
    languageId: ensureProjectLanguage(project.db, {
      name: { zh: '示例' },
      sourceType: 'built-in-reviewed',
      iso6393: 'eng',
    }).id,
  };
}

function orthographies(project: DesktopProject): Parents {
  const seeded = language(project);
  const languageId = need(seeded.languageId, 'language');
  return {
    ...seeded,
    sourceOrthographyId: createOrthography(project.db, {
      languageId,
      name: { zh: '拉丁' },
      scriptTag: 'Latn',
      sourceType: 'built-in-reviewed',
    }).id,
    targetOrthographyId: createOrthography(project.db, {
      languageId,
      name: { zh: '西里尔' },
      scriptTag: 'Cyrl',
      sourceType: 'built-in-reviewed',
    }).id,
  };
}

const cases: CreateCase[] = [
  {
    targetType: 'note',
    table: 'notes',
    prepare: (project, dir) => {
      ensureProjectIdentity(project.db, dir);
      return {};
    },
    create: (project, _parents, fieldId) => ({
      id: createContentNote(project.db, {
        anchor: { kind: 'project' },
        content: { und: '记' },
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'conversation',
    table: 'conversations',
    prepare: () => ({}),
    create: (project, _parents, fieldId) => ({
      id: createConversation(project.db, { title: '谈', ...kept(fieldId) }).id,
    }),
  },
  {
    targetType: 'message',
    table: 'messages',
    prepare: (project) => ({ conversationId: createConversation(project.db, { title: '谈' }).id }),
    create: (project, parents, fieldId) => ({
      id: appendMessage(project.db, {
        conversationId: need(parents.conversationId, 'conversation'),
        role: 'user',
        body: '问',
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'manuscript',
    table: 'manuscripts',
    prepare: (project) => media(project),
    create: (project, parents, fieldId) => ({
      id: project.manuscripts.create({
        title: { zh: '新' },
        mediaId: need(parents.mediaId, 'media'),
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'media',
    table: 'media',
    prepare: () => ({}),
    create: (project, _parents, fieldId) => ({
      id: project.media.create({
        relpath: fieldId === undefined ? 'a.wav' : 'b.wav',
        sha256: fieldId === undefined ? 'aa' : 'bb',
        duration: 1,
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'speaker',
    table: 'speakers',
    prepare: () => ({}),
    create: (project, _parents, fieldId) => ({
      id: project.speakers.create({ name: '甲', ...kept(fieldId) }).id,
    }),
  },
  {
    targetType: 'language',
    table: 'languages',
    prepare: () => ({}),
    create: (project, _parents, fieldId) => ({
      id: ensureProjectLanguage(project.db, {
        name: { zh: '法' },
        sourceType: 'built-in-reviewed',
        iso6393: 'fra',
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'orthography',
    table: 'orthographies',
    prepare: (project) => language(project),
    create: (project, parents, fieldId) => ({
      id: createOrthography(project.db, {
        languageId: need(parents.languageId, 'language'),
        name: { zh: '新' },
        scriptTag: 'Latn',
        sourceType: 'built-in-reviewed',
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'orthography-bridge',
    table: 'orthography_bridges',
    prepare: (project) => orthographies(project),
    create: (project, parents, fieldId) => ({
      id: createBridge(project.db, {
        sourceOrthographyId: need(parents.sourceOrthographyId, 'source orthography'),
        targetOrthographyId: need(parents.targetOrthographyId, 'target orthography'),
        engine: 'manual',
        rules: {},
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'layer',
    table: 'layers',
    prepare: (project) => manuscript(project),
    create: (project, parents, fieldId) => ({
      id: project.layers.create({
        manuscriptId: need(parents.manuscriptId, 'manuscript'),
        key: 'tx',
        name: { zh: '新' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'unit',
    table: 'units',
    prepare: (project) => layer(project),
    create: (project, parents, fieldId) => ({
      id: project.units.create({
        layerId: need(parents.layerId, 'layer'),
        startTime: 0,
        endTime: 1,
        text: 'ka',
        ...kept(fieldId),
      }).id,
    }),
  },
  {
    targetType: 'lexeme',
    table: 'lexemes',
    prepare: () => ({}),
    create: (project, _parents, fieldId) => {
      saveLexemeEntry(project.db, {
        id: 'run',
        entry: { headword: 'run', senses: [{ id: 'move', definitions: [{ text: 'to move' }] }] },
        ...kept(fieldId),
      });
      return { id: 'run' };
    },
  },
  {
    targetType: 'lexeme-sense',
    table: 'lexemes',
    prepare: () => ({}),
    create: (project, _parents, fieldId) => {
      saveLexemeEntry(project.db, {
        id: 'run',
        entry: { headword: 'run', senses: [{ id: 'move', definitions: [{ text: 'to move' }] }] },
        ...(fieldId === undefined ? {} : { senseFieldValues: { move: { [fieldId]: 'kept' } } }),
      });
      return { id: 'move', lexemeId: 'run' };
    },
  },
];

it.each(cases)(
  '$targetType create rejects a missing required value, rolls back, and reads back after reopen',
  (entry) => {
    const dir = folder();
    const project = openProject(dir);
    let created: Created | undefined;
    let fieldId = '';
    try {
      const parents = entry.prepare(project, dir);
      const before = rows(project.db, entry.table);
      fieldId = createDefinition(project.db, {
        targetType: entry.targetType,
        name: { zh: entry.targetType },
        fieldType: 'text',
        required: true,
      }).id;
      expect(() => entry.create(project, parents, undefined)).toThrow(
        `${entry.targetType} is missing a required field`,
      );
      expect(rows(project.db, entry.table)).toBe(before);
      created = entry.create(project, parents, fieldId);
    } finally {
      project.close();
    }
    if (created === undefined) throw new Error('create did not return');
    const reopened = openProject(dir);
    try {
      expect(
        readFieldValue(reopened.db, fieldId, entry.targetType, created.id, created.lexemeId),
      ).toBe('kept');
    } finally {
      reopened.close();
    }
  },
);
