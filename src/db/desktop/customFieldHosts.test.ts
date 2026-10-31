import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { createBridge, createOrthography, ensureProjectLanguage } from './catalog';
import { createDesktopClient } from './client';
import {
  createDefinition,
  locateCustomFieldValues,
  missingFields,
  readFieldValue,
  removeFieldValue,
  setFieldValue,
} from './customFields';
import { callDesktopSession } from './desktopCall';
import { setManuscriptTimeMapping } from './manuscripts';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';
import { replaceSettings } from './settings';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-custom-hosts-'));
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

function count(db: InstanceType<typeof Database>, sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

describe('custom field hosts', () => {
  it('keeps an existing host editable and requires the value on the next one', () => {
    const dir = folder();
    const project = openProject(dir);
    const db = project.db;
    db.prepare(
      'INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run('p1', '{"zh":"项目"}', T, T);
    const media = project.media.create({ relpath: 'a.wav', sha256: 'aa', duration: 1 });
    const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: media.id });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const speaker = project.speakers.create({ name: 'A' });
    const language = ensureProjectLanguage(db, {
      name: { zh: '示例' },
      sourceType: 'built-in-reviewed',
      iso6393: 'eng',
    });
    const orthography = createOrthography(db, {
      languageId: language.id,
      name: { zh: '拉丁' },
      scriptTag: 'Latn',
      sourceType: 'built-in-reviewed',
    });
    const otherOrthography = createOrthography(db, {
      languageId: language.id,
      name: { zh: '另一' },
      scriptTag: 'Cyrl',
      sourceType: 'built-in-reviewed',
    });
    const bridge = createBridge(db, {
      sourceOrthographyId: orthography.id,
      targetOrthographyId: otherOrthography.id,
      engine: 'manual',
      rules: {},
    });
    const hosts = [
      ['project', 'p1'],
      ['manuscript', manuscript.id],
      ['layer', layer.id],
      ['media', media.id],
      ['speaker', speaker.id],
      ['language', language.id],
      ['orthography', orthography.id],
      ['orthography-bridge', bridge.id],
    ] as const;
    const definitions = hosts.map(([targetType, targetId]) => {
      const defined = createDefinition(db, {
        targetType,
        name: { zh: targetType },
        fieldType: 'text',
        required: true,
        defaultValue: 'hello',
      });
      expect(readFieldValue(db, defined.id, targetType, targetId)).toBeNull();
      expect(missingFields(db, targetType, targetId)).toEqual([defined.id]);
      return defined;
    });
    expect(
      setManuscriptTimeMapping(db, {
        manuscriptId: manuscript.id,
        expectedRevision: 0,
        offsetSec: 0,
        scale: 1,
      }).timeMappingRevision,
    ).toBe(1);
    expect(replaceSettings(db, 'p1', { characterVariantLines: 'keep' })).toEqual({
      characterVariantLines: 'keep',
    });
    expect(
      ensureProjectLanguage(db, {
        name: { zh: '再来' },
        sourceType: 'built-in-reviewed',
        iso6393: 'eng',
      }).id,
    ).toBe(language.id);

    expect(() => project.manuscripts.create({ title: { zh: '新' }, mediaId: media.id })).toThrow(
      'manuscript is missing a required field',
    );
    expect(() =>
      project.layers.create({
        manuscriptId: manuscript.id,
        key: 'tx2',
        name: { zh: '新' },
        tierType: 'time-aligned',
        contentType: 'transcription',
      }),
    ).toThrow('layer is missing a required field');
    expect(() => project.media.create({ relpath: 'b.wav', sha256: 'bb', duration: 1 })).toThrow(
      'media is missing a required field',
    );
    expect(() => project.speakers.create({ name: 'B' })).toThrow(
      'speaker is missing a required field',
    );
    expect(() =>
      ensureProjectLanguage(db, {
        name: { zh: '法' },
        sourceType: 'built-in-reviewed',
        iso6393: 'fra',
      }),
    ).toThrow('language is missing a required field');
    expect(() =>
      createOrthography(db, {
        languageId: language.id,
        name: { zh: '新' },
        scriptTag: 'Latn2',
        sourceType: 'built-in-reviewed',
      }),
    ).toThrow('orthography is missing a required field');
    expect(() =>
      createBridge(db, {
        sourceOrthographyId: orthography.id,
        targetOrthographyId: otherOrthography.id,
        engine: 'manual',
        rules: {},
      }),
    ).toThrow('orthography-bridge is missing a required field');
    expect(count(db, 'SELECT COUNT(*) AS n FROM manuscripts')).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM languages')).toBe(1);

    const manuscriptField = definitions[1];
    const createdManuscript = project.manuscripts.create({
      title: { zh: '新' },
      mediaId: media.id,
      fieldValues: manuscriptField === undefined ? {} : { [manuscriptField.id]: 'kept' },
    });
    const languageField = definitions[5];
    const createdLanguage = ensureProjectLanguage(db, {
      name: { zh: '法' },
      sourceType: 'built-in-reviewed',
      iso6393: 'fra',
      fieldValues: languageField === undefined ? {} : { [languageField.id]: 'kept' },
    });
    expect(readFieldValue(db, languageField?.id ?? '', 'language', createdLanguage.id)).toBe(
      'kept',
    );
    expect(
      count(db, "SELECT COUNT(*) AS n FROM custom_field_values WHERE target_type = 'language'"),
    ).toBe(0);
    expect(locateCustomFieldValues(db, languageField?.id ?? '')).toEqual([
      { targetType: 'language', targetId: createdLanguage.id },
    ]);
    expect(locateCustomFieldValues(db, manuscriptField?.id ?? '')).toEqual([
      { targetType: 'manuscript', targetId: createdManuscript.id },
    ]);

    const ref = createDefinition(db, {
      targetType: 'manuscript',
      name: { zh: '引' },
      fieldType: 'ref',
      cardinality: 'one',
      targetTypes: hosts.map(([targetType]) => targetType),
    });
    for (const [targetType, targetId] of hosts) {
      setFieldValue(db, {
        definitionId: ref.id,
        targetType: 'manuscript',
        targetId: manuscript.id,
        value: { targetType, targetId },
        expectedRevision: 1,
      });
    }
    expect(() =>
      setFieldValue(db, {
        definitionId: ref.id,
        targetType: 'manuscript',
        targetId: manuscript.id,
        value: { targetType: 'speaker', targetId: 'missing' },
        expectedRevision: 1,
      }),
    ).toThrow('custom field value is invalid');

    const speakerField = definitions[4];
    const createdSpeaker = project.speakers.create({
      name: 'B',
      fieldValues: speakerField === undefined ? {} : { [speakerField.id]: 'kept' },
    });
    removeFieldValue(db, {
      definitionId: speakerField?.id ?? '',
      targetType: 'speaker',
      targetId: createdSpeaker.id,
    });
    expect(missingFields(db, 'speaker', createdSpeaker.id)).toEqual([speakerField?.id]);
    expect(locateCustomFieldValues(db, speakerField?.id ?? '')).toEqual([]);
    project.close();

    const reopened = openProject(dir);
    expect(
      readFieldValue(reopened.db, manuscriptField?.id ?? '', 'manuscript', createdManuscript.id),
    ).toBe('kept');
    expect(
      readFieldValue(reopened.db, languageField?.id ?? '', 'language', createdLanguage.id),
    ).toBe('kept');
    expect(reopened.settings.get('p1')).toEqual({ characterVariantLines: 'keep' });
    reopened.close();
  });

  it('rolls back a host value when the write fails', () => {
    const { project, speaker } = speakerProject();
    const field = createDefinition(project.db, {
      targetType: 'speaker',
      name: { zh: '注' },
      fieldType: 'text',
    });
    expect(() =>
      setFieldValue(
        project.db,
        {
          definitionId: field.id,
          targetType: 'speaker',
          targetId: speaker.id,
          value: 'x',
          expectedRevision: 1,
        },
        () => {
          throw new Error('injected');
        },
      ),
    ).toThrow('injected');
    project.close();
    const reopened = openProject(speaker.dir);
    expect(readFieldValue(reopened.db, field.id, 'speaker', speaker.id)).toBeNull();
    reopened.close();
  });

  it('sets a media value through one desktop call', async () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const client = createDesktopClient({
      desktopCall: (sessionId, method, args) =>
        Promise.resolve(callDesktopSession(sessionId, method, args)),
    });
    const field = await client.createCustomFieldDefinition(session.sessionId, {
      targetType: 'media',
      name: { zh: '备注' },
      fieldType: 'text',
      required: true,
    });
    await expect(
      client.createMedia(session.sessionId, { relpath: 'a.wav', sha256: 'aa', duration: 1 }),
    ).rejects.toThrow('media is missing a required field');
    const media = await client.createMedia(session.sessionId, {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 1,
      fieldValues: { [field.id]: 'kept' },
    });
    expect(await client.missingFields(session.sessionId, 'media', media.id)).toEqual([]);
    const stored = await client.setFieldValue(session.sessionId, {
      definitionId: field.id,
      targetType: 'media',
      targetId: media.id,
      value: 'next',
      expectedRevision: 1,
    });
    expect(stored.value).toBe('next');
    expect(await client.locateFieldValues(session.sessionId, field.id)).toEqual([
      { targetType: 'media', targetId: media.id },
    ]);
    const db = requireDesktopSession(session.sessionId).db;
    expect(readFieldValue(db, field.id, 'media', media.id)).toBe('next');
  });
});

function speakerProject() {
  const dir = folder();
  const project = openProject(dir);
  const speaker = project.speakers.create({ name: 'A' });
  return { project, speaker: { ...speaker, dir } };
}
