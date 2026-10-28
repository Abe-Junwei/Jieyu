import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureProjectLanguage,
  listBridges,
  listOrthographies,
  listProjectLanguages,
  updateBridge,
  updateOrthography,
  updateProjectLanguage,
} from './catalog';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-catalog-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('project catalog', () => {
  it('reuses a template row, keeps a glottocode language, and rejects a bad bridge', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const first = language(session.sessionId, {
      name: { zh: '示例', en: 'Example' },
      sourceType: 'built-in-reviewed',
      iso6393: 'eng',
      aliases: [{ alias: 'Example Language', aliasType: 'display' }],
    });
    const again = language(session.sessionId, {
      name: { en: 'Other' },
      sourceType: 'built-in-reviewed',
      iso6393: 'ENG',
    });
    expect(again.id).toBe(first.id);
    expect(again.name).toEqual({ zh: '示例', en: 'Example' });
    expect(again.history).toEqual(['create']);

    const glottocodeOnly = language(session.sessionId, {
      name: { zh: '仅代码', en: 'Code only' },
      sourceType: 'user-custom',
      glottocode: 'demo1234',
    });
    expect(glottocodeOnly.iso6393).toBeNull();

    const orthography = callDesktopSession(session.sessionId, 'orthographies.create', {
      languageId: first.id,
      name: { en: 'Latin' },
      scriptTag: 'Latn',
      sourceType: 'built-in-reviewed',
    }) as { id: string };
    const other = callDesktopSession(session.sessionId, 'orthographies.create', {
      languageId: first.id,
      name: { en: 'Other script' },
      scriptTag: 'Cyrl',
      sourceType: 'built-in-generated',
    }) as { id: string };
    const bridge = callDesktopSession(session.sessionId, 'bridges.create', {
      sourceOrthographyId: orthography.id,
      targetOrthographyId: other.id,
      engine: 'table-map',
      rules: { mappings: [{ from: 'a', to: 'b' }] },
      sampleInput: 'a',
      sampleOutput: 'b',
      sampleCases: [{ input: 'a', expectedOutput: 'b' }],
    }) as { id: string; sampleCases: { input: string }[] };
    expect(bridge.sampleCases).toEqual([{ input: 'a', expectedOutput: 'b' }]);
    expect(() =>
      callDesktopSession(session.sessionId, 'bridges.create', {
        sourceOrthographyId: orthography.id,
        targetOrthographyId: other.id,
        engine: 'table-map',
        rules: [],
      }),
    ).toThrow('bridge rules must be an object');
    expect(() =>
      language(session.sessionId, {
        name: { en: 'Empty' },
        sourceType: 'user-custom',
        iso6393: '',
      }),
    ).toThrow('iso6393 is empty');
    expect(() =>
      language(session.sessionId, {
        name: { en: 'Bad' },
        sourceType: 'user-custom',
        iso6393: 'english',
      }),
    ).toThrow('iso6393 is invalid');
    expect(() =>
      language(session.sessionId, {
        name: { en: 'Conflict' },
        sourceType: 'user-custom',
        iso6393: 'eng',
        glottocode: 'demo1234',
      }),
    ).toThrow('language identity conflicts');

    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 1,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { en: 'Clip' },
      mediaId: media.id,
    }) as { id: string };
    expect(() =>
      callDesktopSession(session.sessionId, 'layers.create', {
        manuscriptId: manuscript.id,
        key: 'bad',
        name: { en: 'Bad' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        languageId: 'missing',
      }),
    ).toThrow('FOREIGN KEY constraint failed');
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { en: 'Transcription' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      languageId: first.id,
      orthographyId: orthography.id,
    }) as { languageId: string; orthographyId: string };

    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(languageById(reopened.sessionId, first.id)).toMatchObject({
      name: { zh: '示例', en: 'Example' },
      names: [
        { locale: 'zh', value: '示例', isPreferred: true },
        { locale: 'en', value: 'Example', isPreferred: false },
      ],
      aliases: [{ alias: 'Example Language', normalizedAlias: 'example language' }],
    });
    expect(languageById(reopened.sessionId, glottocodeOnly.id).glottocode).toBe('demo1234');
    const layers = callDesktopSession(reopened.sessionId, 'layers.list', {
      manuscriptId: manuscript.id,
    }) as { languageId: string; orthographyId: string }[];
    expect(layers).toEqual([
      expect.objectContaining({ languageId: layer.languageId, orthographyId: layer.orthographyId }),
    ]);
    expect(callDesktopSession(reopened.sessionId, 'bridges.get', { id: bridge.id })).toMatchObject({
      rules: { mappings: [{ from: 'a', to: 'b' }] },
      sampleInput: 'a',
      sampleOutput: 'b',
    });
  });

  it('does not keep a language when the following history write fails', () => {
    const dir = folder();
    const project = openProject(dir);
    expect(() => failHistory(project.db)).toThrow('history failed');
    const count = project.db.prepare('SELECT count(*) AS n FROM languages').get() as { n: number };
    expect(count.n).toBe(0);
    project.close();
  });
});

describe('catalog list and edit', () => {
  it('lists languages and edits one name without dropping the other locale', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const created = language(session.sessionId, {
      name: { zh: '示例', en: 'Example' },
      sourceType: 'user-custom',
      iso6393: 'eng',
    });
    expect(callDesktopSession(session.sessionId, 'catalog.listLanguages', {})).toEqual([
      expect.objectContaining({ id: created.id, name: { zh: '示例', en: 'Example' } }),
    ]);
    const db = requireDesktopSession(session.sessionId).db;
    expect(() =>
      updateProjectLanguage(db, { id: created.id, locale: 'zh', value: '木雅' }, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect(languageById(session.sessionId, created.id).name).toEqual({ zh: '示例', en: 'Example' });
    expect(languageById(session.sessionId, created.id).history).toEqual(['create']);

    const updated = callDesktopSession(session.sessionId, 'catalog.updateLanguage', {
      id: created.id,
      locale: 'zh',
      value: '木雅',
    }) as { name: Record<string, string>; history: string[] };
    expect(updated.name).toEqual({ zh: '木雅', en: 'Example' });
    expect(updated.history).toContain('update');
    callDesktopSession(session.sessionId, 'reopen', {});
    expect(languageById(session.sessionId, created.id).name.zh).toBe('木雅');
    expect(() =>
      callDesktopSession(session.sessionId, 'catalog.updateLanguage', {
        id: 'missing',
        locale: 'zh',
        value: '木雅',
      }),
    ).toThrow('language is missing');
  });

  it('lists orthographies for one language and edits the script', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const created = language(session.sessionId, {
      name: { zh: '示例' },
      sourceType: 'user-custom',
      iso6393: 'eng',
    });
    const orthography = callDesktopSession(session.sessionId, 'orthographies.create', {
      languageId: created.id,
      name: { en: 'Latin' },
      scriptTag: 'Latn',
      sourceType: 'user-custom',
    }) as { id: string };
    expect(
      callDesktopSession(session.sessionId, 'orthographies.list', { languageId: created.id }),
    ).toEqual([
      expect.objectContaining({ id: orthography.id, scriptTag: 'Latn', name: { en: 'Latin' } }),
    ]);
    const db = requireDesktopSession(session.sessionId).db;
    expect(() =>
      updateOrthography(db, { id: orthography.id, scriptTag: 'Cyrl' }, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect((listOrthographies(db, created.id)[0] ?? { scriptTag: '' }).scriptTag).toBe('Latn');
    expect(
      callDesktopSession(session.sessionId, 'orthographies.update', {
        id: orthography.id,
        scriptTag: 'Cyrl',
      }),
    ).toMatchObject({ scriptTag: 'Cyrl', name: { en: 'Latin' } });
    expect(() =>
      callDesktopSession(session.sessionId, 'orthographies.list', { languageId: 'missing' }),
    ).toThrow('language is missing');
  });

  it('lists bridges and edits the rules', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const created = language(session.sessionId, {
      name: { zh: '示例' },
      sourceType: 'user-custom',
      iso6393: 'eng',
    });
    const source = callDesktopSession(session.sessionId, 'orthographies.create', {
      languageId: created.id,
      name: { en: 'Latin' },
      scriptTag: 'Latn',
      sourceType: 'user-custom',
    }) as { id: string };
    const target = callDesktopSession(session.sessionId, 'orthographies.create', {
      languageId: created.id,
      name: { en: 'Cyrillic' },
      scriptTag: 'Cyrl',
      sourceType: 'user-custom',
    }) as { id: string };
    const bridge = callDesktopSession(session.sessionId, 'bridges.create', {
      sourceOrthographyId: source.id,
      targetOrthographyId: target.id,
      engine: 'table-map',
      rules: { mappings: [{ from: 'a', to: 'b' }] },
    }) as { id: string };
    expect(listBridges(requireDesktopSession(session.sessionId).db)).toEqual([
      expect.objectContaining({ id: bridge.id, rules: { mappings: [{ from: 'a', to: 'b' }] } }),
    ]);
    const db = requireDesktopSession(session.sessionId).db;
    expect(() =>
      updateBridge(db, { id: bridge.id, rules: { mappings: [{ from: 'a', to: 'c' }] } }, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect(listBridges(db)[0]?.rules).toEqual({ mappings: [{ from: 'a', to: 'b' }] });
    expect(
      callDesktopSession(session.sessionId, 'bridges.update', {
        id: bridge.id,
        rules: { mappings: [{ from: 'a', to: 'c' }] },
      }),
    ).toMatchObject({ rules: { mappings: [{ from: 'a', to: 'c' }] } });
    expect(listProjectLanguages(db)).toHaveLength(1);
    expect(() =>
      callDesktopSession(session.sessionId, 'bridges.update', { id: bridge.id, rules: [] }),
    ).toThrow('bridge rules must be an object');
  });
});

function language(
  sessionId: string,
  input: unknown,
): {
  id: string;
  name: Record<string, string>;
  iso6393: string | null;
  glottocode: string | null;
  history: string[];
  names: { locale: string; value: string; isPreferred: boolean }[];
  aliases: { alias: string; normalizedAlias: string }[];
} {
  return callDesktopSession(sessionId, 'catalog.ensureProjectDefinition', input) as never;
}

function languageById(sessionId: string, id: string): ReturnType<typeof language> {
  return callDesktopSession(sessionId, 'catalog.getLanguage', { id }) as never;
}

function failHistory(db: ReturnType<typeof openProject>['db']): void {
  db.prepare(
    `CREATE TRIGGER fail_history BEFORE INSERT ON language_catalog_history
     BEGIN SELECT RAISE(ABORT, 'history failed'); END`,
  ).run();
  ensureProjectLanguage(db, {
    name: { en: 'Example' },
    sourceType: 'user-custom',
    iso6393: 'eng',
  });
}
