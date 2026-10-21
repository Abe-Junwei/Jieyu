import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planLegacyMigration } from './planLegacyMigration';

const audioA = { id: 'audio-a', filename: '录音01.wav', bytes: new Uint8Array([1, 2, 3]) };
const audioB = { id: 'audio-b', filename: '录音02.wav', bytes: new Uint8Array([4, 5]) };
const emptyDefinitions = {
  languages: [],
  displayNames: [],
  aliases: [],
  orthographies: [],
  speakers: [],
};

function library() {
  return {
    documents: [{ id: 'doc-1', name: '录音01' }],
    layers: [{ id: 'layer-1', documentId: 'doc-1' }],
    units: [
      { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
      { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a', parentUnitId: 'u-1' },
    ],
    audios: [audioA],
  };
}

describe('planLegacyMigration', () => {
  it('plans one audio file and one manuscript without changing the source', () => {
    const source = library();
    const before = structuredClone(source);
    const plan = planLegacyMigration(source);
    expect(source).toEqual(before);
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.audios.map((audio) => audio.fileName)).toEqual(['录音01.wav']);
    expect(plan.audios[0]?.sha256).toHaveLength(64);
    expect(plan.manuscripts).toEqual([
      {
        id: 'doc-1',
        sourceDocumentId: 'doc-1',
        fileName: '录音01.jyd',
        audioId: 'audio-a',
        layers: [{ id: 'layer-1', key: 'layer-1' }],
        tokens: [],
        morphemes: [],
        definitions: emptyDefinitions,
        missingDefinitions: [],
        sourceIds: [],
        missingSourceIds: [],
        lexemeLinks: [],
        anchors: [],
        missingAnchors: [],
        contents: [],
        relations: [],
        notes: [],
        layerLinks: [],
        tracks: [],
        annotations: [],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a', parentUnitId: 'u-1' },
        ],
      },
    ]);
  });

  it('does not plan files when one document has two audios and the split is not confirmed', () => {
    const plan = planLegacyMigration({
      ...library(),
      audios: [audioA, audioB],
      units: [
        { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
        { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
      ],
    });
    expect(plan).toEqual({
      status: 'needs-confirm',
      documents: [
        {
          documentId: 'doc-1',
          audioIds: ['audio-a', 'audio-b'],
          droppedUnits: [],
          droppedLinks: [],
        },
      ],
    });
  });

  it('splits a confirmed document into two manuscripts and reports a parent link that would cross them', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b', parentUnitId: 'u-1' },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.manuscripts.map((manuscript) => manuscript.id).sort()).toEqual([
      'doc-1--audio-a',
      'doc-1--audio-b',
    ]);
    expect(
      plan.manuscripts.map((manuscript) => manuscript.layers.map((layer) => layer.id)),
    ).toEqual([['layer-1'], ['layer-1']]);
    expect(plan.droppedLinks).toEqual([{ unitId: 'u-2', parentUnitId: 'u-1' }]);
    expect(
      plan.manuscripts.every((manuscript) =>
        manuscript.units.every((unit) => unit.parentUnitId === undefined),
      ),
    ).toBe(true);
  });

  it('records a unit whose layer is missing, and the token and morpheme on it', () => {
    const plan = planLegacyMigration({
      ...library(),
      units: [
        { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
        { id: 'u-missing', layerId: 'missing', mediaId: 'audio-a' },
        { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a', parentUnitId: 'u-missing' },
      ],
      tokens: [
        { id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' },
        { id: 't-missing', unitId: 'u-missing', tokenIndex: 0, form: 'x' },
      ],
      morphemes: [
        { id: 'm-1', unitId: 'u-1', tokenId: 't-1', morphemeIndex: 0, form: 'ta' },
        { id: 'm-missing', unitId: 'u-missing', tokenId: 't-missing', morphemeIndex: 0, form: 'x' },
      ],
      contents: [{ id: 'c-missing', unitId: 'u-missing', role: 'note', text: 'x' }],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.droppedUnits).toEqual([
      { id: 'u-missing', layerId: 'missing', reason: 'missing-layer' },
    ]);
    expect(plan.droppedTokens).toEqual([{ id: 't-missing', unitId: 'u-missing' }]);
    expect(plan.droppedMorphemes).toEqual([{ id: 'm-missing', tokenId: 't-missing' }]);
    expect(plan.droppedContents).toEqual([{ id: 'c-missing', unitId: 'u-missing' }]);
    expect(plan.droppedLinks).toEqual([{ unitId: 'u-2', parentUnitId: 'u-missing' }]);
    expect(plan.manuscripts[0]?.units).toEqual([
      { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
      { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a' },
    ]);
    expect(plan.manuscripts[0]?.tokens.map((token) => token.id)).toEqual(['t-1']);
    expect(plan.manuscripts[0]?.morphemes.map((morpheme) => morpheme.id)).toEqual(['m-1']);
  });

  it('rejects a parent link that already crosses documents and plans nothing', () => {
    const plan = planLegacyMigration({
      documents: [
        { id: 'doc-1', name: '甲' },
        { id: 'doc-2', name: '乙' },
      ],
      layers: [
        { id: 'layer-1', documentId: 'doc-1' },
        { id: 'layer-2', documentId: 'doc-2' },
      ],
      units: [
        { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
        { id: 'u-2', layerId: 'layer-2', mediaId: 'audio-b', parentUnitId: 'u-1' },
      ],
      audios: [audioA, audioB],
    });
    expect(plan.status).toBe('rejected');
    if (plan.status !== 'rejected') return;
    expect(plan.reason).toBe('cross-manuscript-parent');
  });

  it('keeps a token and its morpheme with the unit, and reports a morpheme whose token is missing', () => {
    const plan = planLegacyMigration({
      ...library(),
      tokens: [{ id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' }],
      morphemes: [
        { id: 'm-1', unitId: 'u-1', tokenId: 't-1', morphemeIndex: 0, form: 't' },
        { id: 'm-2', unitId: 'u-1', tokenId: 'missing', morphemeIndex: 1, form: 'a' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.manuscripts[0]?.tokens).toEqual([
      { id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' },
    ]);
    expect(plan.manuscripts[0]?.morphemes).toEqual([
      { id: 'm-1', unitId: 'u-1', tokenId: 't-1', morphemeIndex: 0, form: 't' },
    ]);
    expect(plan.droppedMorphemes).toEqual([{ id: 'm-2', tokenId: 'missing' }]);
  });

  it('keeps the project row and speakers in the project plan, not on the manuscript', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      speakers: [
        { id: 's-1', textId: 'p-1', name: '甲' },
        { id: 's-2', textId: 'other', name: '乙' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.project).toEqual({ id: 'p-1', name: '项目' });
    expect(plan.speakers).toEqual([{ id: 's-1', textId: 'p-1', name: '甲' }]);
    expect(plan.droppedSpeakers).toEqual([{ id: 's-2', textId: 'other' }]);
    expect(plan.manuscripts[0]).not.toHaveProperty('speakers');
  });

  it('copies only the definitions a manuscript references, and keeps the rest in the project plan', () => {
    const plan = planLegacyMigration({
      ...library(),
      layers: [
        { id: 'layer-1', documentId: 'doc-1', languageId: 'lang-1', orthographyId: 'orth-1' },
        {
          id: 'layer-2',
          documentId: 'doc-1',
          languageId: 'lang-other',
          orthographyId: 'orth-missing',
        },
      ],
      units: [
        { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a', speakerId: 's-1' },
        { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a', parentUnitId: 'u-1' },
      ],
      project: { id: 'p-1', name: '项目' },
      speakers: [
        { id: 's-1', textId: 'p-1', name: '甲' },
        { id: 's-unused', textId: 'p-1', name: '丙' },
      ],
      languages: [
        { id: 'lang-1', textId: 'p-1', name: '语言甲' },
        { id: 'lang-unused', textId: 'p-1', name: '语言乙' },
        { id: 'lang-other', textId: 'other', name: '别处' },
      ],
      displayNames: [
        { id: 'dn-1', textId: 'p-1', languageId: 'lang-1', locale: 'zh', value: '语言甲显示名' },
        {
          id: 'dn-unused',
          textId: 'p-1',
          languageId: 'lang-unused',
          locale: 'zh',
          value: '语言乙显示名',
        },
        {
          id: 'dn-other',
          textId: 'p-1',
          languageId: 'lang-other',
          locale: 'zh',
          value: '别处显示名',
        },
        {
          id: 'dn-foreign',
          textId: 'other',
          languageId: 'lang-1',
          locale: 'zh',
          value: '同号异项',
        },
      ],
      aliases: [
        { id: 'al-1', textId: 'p-1', languageId: 'lang-1', alias: 'LangA' },
        { id: 'al-missing', textId: 'p-1', languageId: 'missing', alias: 'nope' },
        { id: 'al-foreign', textId: 'other', languageId: 'lang-1', alias: 'foreign' },
      ],
      orthographies: [
        { id: 'orth-1', textId: 'p-1', name: '正字甲', languageId: 'lang-1' },
        { id: 'orth-other', textId: 'other', name: '别处字' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.languages.map((language) => language.id)).toEqual(['lang-1', 'lang-unused']);
    expect(plan.displayNames.map((row) => row.id)).toEqual(['dn-1', 'dn-unused']);
    expect(plan.aliases).toEqual([
      { id: 'al-1', textId: 'p-1', languageId: 'lang-1', alias: 'LangA' },
    ]);
    expect(plan.orthographies).toEqual([
      { id: 'orth-1', textId: 'p-1', name: '正字甲', languageId: 'lang-1' },
    ]);
    expect(plan.droppedDefinitions).toEqual([
      { kind: 'language', id: 'lang-other', ref: 'other' },
      { kind: 'orthography', id: 'orth-other', ref: 'other' },
      { kind: 'display-name', id: 'dn-foreign', ref: 'other' },
      { kind: 'alias', id: 'al-foreign', ref: 'other' },
      { kind: 'display-name', id: 'dn-other', ref: 'lang-other' },
      { kind: 'alias', id: 'al-missing', ref: 'missing' },
    ]);
    expect(plan.manuscripts[0]?.definitions).toEqual({
      languages: [{ id: 'lang-1', name: '语言甲' }],
      displayNames: [{ id: 'dn-1', languageId: 'lang-1', locale: 'zh', value: '语言甲显示名' }],
      aliases: [{ id: 'al-1', languageId: 'lang-1', alias: 'LangA' }],
      orthographies: [{ id: 'orth-1', name: '正字甲', languageId: 'lang-1' }],
      speakers: [{ id: 's-1', name: '甲' }],
    });
    expect(plan.manuscripts[0]?.missingDefinitions).toEqual([
      { kind: 'language', id: 'lang-other' },
      { kind: 'orthography', id: 'orth-missing' },
    ]);
    expect(plan.speakers.map((speaker) => speaker.id)).toEqual(['s-1', 's-unused']);
  });

  it('puts a speaker only on the split manuscript that references them', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        layers: [{ id: 'layer-1', documentId: 'doc-1', languageId: 'lang-1' }],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a', speakerId: 's-1' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
        ],
        project: { id: 'p-1', name: '项目' },
        speakers: [{ id: 's-1', textId: 'p-1', name: '甲' }],
        languages: [{ id: 'lang-1', textId: 'p-1', name: '语言甲' }],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.definitions.speakers).toEqual([{ id: 's-1', name: '甲' }]);
    expect(byId.get('doc-1--audio-b')?.definitions.speakers).toEqual([]);
    expect(byId.get('doc-1--audio-a')?.definitions.languages).toEqual([
      { id: 'lang-1', name: '语言甲' },
    ]);
    expect(byId.get('doc-1--audio-b')?.definitions.languages).toEqual([
      { id: 'lang-1', name: '语言甲' },
    ]);
  });

  it('keeps source records in the project plan and only the ids a manuscript references', () => {
    const plan = planLegacyMigration({
      ...library(),
      documents: [
        { id: 'doc-1', name: '录音01', sourceIds: ['src-1', 'src-other-audio', 'src-missing'] },
      ],
      project: { id: 'p-1', name: '项目' },
      sourceRecords: [
        {
          id: 'src-1',
          textId: 'p-1',
          originalName: 'a.eaf',
          displayName: '甲',
          format: 'eaf',
        },
        {
          id: 'src-unused',
          textId: 'p-1',
          originalName: 'b.eaf',
          displayName: '乙',
          format: 'eaf',
        },
        {
          id: 'src-other-audio',
          textId: 'p-1',
          originalName: 'c.wav',
          displayName: '另一条',
          format: 'wav',
          mediaId: 'audio-b',
        },
        {
          id: 'src-foreign',
          textId: 'other',
          originalName: 'd.eaf',
          displayName: '别处',
          format: 'eaf',
        },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.sourceRecords.map((source) => source.id)).toEqual([
      'src-1',
      'src-unused',
      'src-other-audio',
    ]);
    expect(plan.droppedSourceRecords).toEqual([{ id: 'src-foreign', textId: 'other' }]);
    expect(plan.manuscripts[0]?.sourceIds).toEqual(['src-1']);
    expect(plan.manuscripts[0]?.missingSourceIds).toEqual(['src-missing']);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('assigns a linked source to the split manuscript of that audio', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        documents: [{ id: 'doc-1', name: '录音01', sourceIds: ['src-a', 'src-open'] }],
        audios: [audioA, audioB],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
        ],
        project: { id: 'p-1', name: '项目' },
        sourceRecords: [
          {
            id: 'src-a',
            textId: 'p-1',
            originalName: 'a.eaf',
            displayName: '甲',
            format: 'eaf',
            mediaId: 'audio-a',
          },
          {
            id: 'src-open',
            textId: 'p-1',
            originalName: 'open.txt',
            displayName: '未挂录音',
            format: 'text',
          },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.sourceIds).toEqual(['src-a', 'src-open']);
    expect(byId.get('doc-1--audio-b')?.sourceIds).toEqual([]);
  });

  it('rejects source records when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      sourceRecords: [
        {
          id: 'src-1',
          textId: 'p-1',
          originalName: 'a.eaf',
          displayName: '甲',
          format: 'eaf',
        },
      ],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'sources-without-project' });
  });

  it('keeps a lexeme in the project plan and only the link on the manuscript that holds the token', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      tokens: [{ id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' }],
      morphemes: [{ id: 'm-1', unitId: 'u-1', tokenId: 't-1', morphemeIndex: 0, form: 't' }],
      lexemes: [
        { id: 'lex-1', textId: 'p-1', headword: 'ta' },
        { id: 'lex-unused', textId: 'p-1', headword: 'unused' },
        { id: 'lex-other', textId: 'other', headword: '别处' },
      ],
      lexemeLinks: [
        { id: 'link-1', targetType: 'token', targetId: 't-1', lexemeId: 'lex-1' },
        { id: 'link-missing', targetType: 'token', targetId: 't-1', lexemeId: 'lex-other' },
        { id: 'link-orphan', targetType: 'morpheme', targetId: 'missing', lexemeId: 'lex-1' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.lexemes.map((lexeme) => lexeme.id)).toEqual(['lex-1', 'lex-unused']);
    expect(plan.droppedLexemes).toEqual([{ id: 'lex-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.lexemeLinks).toEqual([
      { id: 'link-1', targetType: 'token', targetId: 't-1', lexemeId: 'lex-1' },
    ]);
    expect(plan.droppedLexemeLinks).toEqual([
      { id: 'link-missing', targetId: 't-1', lexemeId: 'lex-other', reason: 'missing-lexeme' },
      { id: 'link-orphan', targetId: 'missing', lexemeId: 'lex-1', reason: 'missing-target' },
    ]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('puts a lexeme link only on the split manuscript that holds its token', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
        ],
        tokens: [
          { id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' },
          { id: 't-2', unitId: 'u-2', tokenIndex: 0, form: 'ka' },
        ],
        project: { id: 'p-1', name: '项目' },
        lexemes: [{ id: 'lex-1', textId: 'p-1', headword: 'ta' }],
        lexemeLinks: [
          { id: 'link-1', targetType: 'token', targetId: 't-1', lexemeId: 'lex-1' },
          { id: 'link-2', targetType: 'token', targetId: 't-2', lexemeId: 'lex-1' },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.lexemeLinks.map((link) => link.id)).toEqual(['link-1']);
    expect(byId.get('doc-1--audio-b')?.lexemeLinks.map((link) => link.id)).toEqual(['link-2']);
    expect(plan.lexemes).toEqual([{ id: 'lex-1', textId: 'p-1', headword: 'ta' }]);
  });

  it('keeps an anchor on the manuscript of its audio and drops one for another audio', () => {
    const plan = planLegacyMigration({
      ...library(),
      units: [
        {
          id: 'u-1',
          layerId: 'layer-1',
          mediaId: 'audio-a',
          startAnchorId: 'anchor-1',
          endAnchorId: 'anchor-missing',
        },
        { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a', parentUnitId: 'u-1' },
      ],
      anchors: [
        { id: 'anchor-1', mediaId: 'audio-a', time: 1.25 },
        { id: 'anchor-other', mediaId: 'audio-b', time: 2 },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.manuscripts[0]?.anchors).toEqual([
      { id: 'anchor-1', mediaId: 'audio-a', time: 1.25 },
    ]);
    expect(plan.manuscripts[0]?.units[0]).toEqual({
      id: 'u-1',
      layerId: 'layer-1',
      mediaId: 'audio-a',
      startAnchorId: 'anchor-1',
    });
    expect(plan.manuscripts[0]?.missingAnchors).toEqual([
      { unitId: 'u-1', anchorId: 'anchor-missing' },
    ]);
    expect(plan.droppedAnchors).toEqual([{ id: 'anchor-other', mediaId: 'audio-b' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('puts an anchor only on the split manuscript of that audio', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a', startAnchorId: 'anchor-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b', startAnchorId: 'anchor-a' },
        ],
        anchors: [
          { id: 'anchor-a', mediaId: 'audio-a', time: 0.5 },
          { id: 'anchor-b', mediaId: 'audio-b', time: 1 },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.anchors.map((anchor) => anchor.id)).toEqual(['anchor-a']);
    expect(byId.get('doc-1--audio-a')?.units[0]?.startAnchorId).toBe('anchor-a');
    expect(byId.get('doc-1--audio-b')?.anchors.map((anchor) => anchor.id)).toEqual(['anchor-b']);
    expect(byId.get('doc-1--audio-b')?.missingAnchors).toEqual([
      { unitId: 'u-2', anchorId: 'anchor-a' },
    ]);
    expect(plan.droppedAnchors).toEqual([]);
  });

  it('keeps unit content on the manuscript that holds the unit', () => {
    const plan = planLegacyMigration({
      ...library(),
      contents: [
        { id: 'c-1', unitId: 'u-1', role: 'primary_text', text: 'ta' },
        { id: 'c-missing', unitId: 'missing', role: 'note', text: 'gone' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.manuscripts[0]?.contents).toEqual([
      { id: 'c-1', unitId: 'u-1', role: 'primary_text', text: 'ta' },
    ]);
    expect(plan.droppedContents).toEqual([{ id: 'c-missing', unitId: 'missing' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('puts unit content only on the split manuscript that holds its unit', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
        ],
        contents: [
          { id: 'c-1', unitId: 'u-1', role: 'primary_text', text: 'ta' },
          { id: 'c-2', unitId: 'u-2', role: 'translation', text: '他' },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.contents.map((content) => content.id)).toEqual(['c-1']);
    expect(byId.get('doc-1--audio-b')?.contents.map((content) => content.id)).toEqual(['c-2']);
    expect(plan.droppedContents).toEqual([]);
  });

  it('keeps a unit relation whose ends are in one manuscript and drops one that crosses', () => {
    const plan = planLegacyMigration({
      documents: [
        { id: 'doc-1', name: '甲' },
        { id: 'doc-2', name: '乙' },
      ],
      layers: [
        { id: 'layer-1', documentId: 'doc-1' },
        { id: 'layer-2', documentId: 'doc-2' },
      ],
      units: [
        { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
        { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a' },
        { id: 'u-3', layerId: 'layer-2', mediaId: 'audio-b' },
      ],
      audios: [audioA, audioB],
      relations: [
        { id: 'rel-1', sourceUnitId: 'u-1', targetUnitId: 'u-2', relationType: 'aligned_to' },
        {
          id: 'rel-cross',
          sourceUnitId: 'u-1',
          targetUnitId: 'u-3',
          relationType: 'linked_reference',
        },
        {
          id: 'rel-missing',
          sourceUnitId: 'u-1',
          targetUnitId: 'missing',
          relationType: 'derived_from',
        },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1')?.relations).toEqual([
      { id: 'rel-1', sourceUnitId: 'u-1', targetUnitId: 'u-2', relationType: 'aligned_to' },
    ]);
    expect(byId.get('doc-2')?.relations).toEqual([]);
    expect(plan.droppedRelations).toEqual([
      {
        id: 'rel-cross',
        sourceUnitId: 'u-1',
        targetUnitId: 'u-3',
        reason: 'cross-manuscript',
      },
      {
        id: 'rel-missing',
        sourceUnitId: 'u-1',
        targetUnitId: 'missing',
        reason: 'missing-target',
      },
    ]);
  });

  it('drops a unit relation when a split puts its ends on different manuscripts', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
          { id: 'u-3', layerId: 'layer-1', mediaId: 'audio-a' },
        ],
        relations: [
          { id: 'rel-cross', sourceUnitId: 'u-1', targetUnitId: 'u-2', relationType: 'aligned_to' },
          {
            id: 'rel-same',
            sourceUnitId: 'u-1',
            targetUnitId: 'u-3',
            relationType: 'derived_from',
          },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.relations.map((relation) => relation.id)).toEqual([
      'rel-same',
    ]);
    expect(byId.get('doc-1--audio-b')?.relations).toEqual([]);
    expect(plan.droppedRelations).toEqual([
      {
        id: 'rel-cross',
        sourceUnitId: 'u-1',
        targetUnitId: 'u-2',
        reason: 'cross-manuscript',
      },
    ]);
  });

  it('keeps a unit note on the manuscript and a speaker note in the project plan', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      speakers: [
        { id: 's-1', textId: 'p-1', name: '甲' },
        { id: 's-other', textId: 'other', name: '乙' },
      ],
      tokens: [{ id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' }],
      notes: [
        { id: 'n-unit', textId: 'p-1', targetType: 'unit', targetId: 'u-1', text: '语段备注' },
        { id: 'n-token', textId: 'p-1', targetType: 'token', targetId: 't-1', text: '词备注' },
        {
          id: 'n-speaker',
          textId: 'p-1',
          targetType: 'speaker',
          targetId: 's-1',
          text: '说话人备注',
        },
        {
          id: 'n-foreign',
          textId: 'other',
          targetType: 'speaker',
          targetId: 's-other',
          text: '别处',
        },
        {
          id: 'n-missing',
          textId: 'p-1',
          targetType: 'unit',
          targetId: 'missing',
          text: '没有语段',
        },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.manuscripts[0]?.notes).toEqual([
      { id: 'n-unit', targetType: 'unit', targetId: 'u-1', text: '语段备注' },
      { id: 'n-token', targetType: 'token', targetId: 't-1', text: '词备注' },
    ]);
    expect(plan.notes).toEqual([
      { id: 'n-speaker', targetType: 'speaker', targetId: 's-1', text: '说话人备注' },
    ]);
    expect(plan.droppedNotes).toEqual([{ id: 'n-foreign', textId: 'other' }]);
    expect(plan.droppedNoteTargets).toEqual([
      { id: 'n-missing', targetType: 'unit', targetId: 'missing' },
    ]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('puts a unit note only on the split manuscript that holds that unit', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
        ],
        project: { id: 'p-1', name: '项目' },
        speakers: [{ id: 's-1', textId: 'p-1', name: '甲' }],
        notes: [
          { id: 'n-a', textId: 'p-1', targetType: 'unit', targetId: 'u-1', text: '甲' },
          {
            id: 'n-speaker',
            textId: 'p-1',
            targetType: 'speaker',
            targetId: 's-1',
            text: '说话人',
          },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.notes.map((note) => note.id)).toEqual(['n-a']);
    expect(byId.get('doc-1--audio-b')?.notes).toEqual([]);
    expect(plan.notes.map((note) => note.id)).toEqual(['n-speaker']);
  });

  it('keeps a layer link when both layers are in the manuscript', () => {
    const plan = planLegacyMigration({
      ...library(),
      layers: [
        { id: 'layer-1', documentId: 'doc-1' },
        { id: 'layer-2', documentId: 'doc-1' },
      ],
      layerLinks: [
        {
          id: 'll-1',
          hostLayerId: 'layer-1',
          layerId: 'layer-2',
          linkType: 'literal',
          isPreferred: true,
        },
        {
          id: 'll-missing',
          hostLayerId: 'layer-1',
          layerId: 'missing',
          linkType: 'direct',
          isPreferred: false,
        },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.manuscripts[0]?.layerLinks).toEqual([
      {
        id: 'll-1',
        hostLayerId: 'layer-1',
        layerId: 'layer-2',
        linkType: 'literal',
        isPreferred: true,
      },
    ]);
    expect(plan.droppedLayerLinks).toEqual([
      { id: 'll-missing', hostLayerId: 'layer-1', layerId: 'missing', reason: 'missing-target' },
    ]);
  });

  it('drops a layer link when a split leaves its layers in different manuscripts', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        layers: [
          { id: 'layer-1', documentId: 'doc-1' },
          { id: 'layer-2', documentId: 'doc-1' },
          { id: 'layer-3', documentId: 'doc-1' },
        ],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-3', layerId: 'layer-3', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-2', mediaId: 'audio-b' },
        ],
        layerLinks: [
          {
            id: 'll-same',
            hostLayerId: 'layer-1',
            layerId: 'layer-3',
            linkType: 'direct',
            isPreferred: true,
          },
          {
            id: 'll-cross',
            hostLayerId: 'layer-1',
            layerId: 'layer-2',
            linkType: 'free',
            isPreferred: false,
          },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.layerLinks.map((link) => link.id)).toEqual(['ll-same']);
    expect(byId.get('doc-1--audio-b')?.layerLinks).toEqual([]);
    expect(plan.droppedLayerLinks).toEqual([
      { id: 'll-cross', hostLayerId: 'layer-1', layerId: 'layer-2', reason: 'cross-manuscript' },
    ]);
  });

  it('keeps a track on the manuscript of its audio', () => {
    const plan = planLegacyMigration({
      ...library(),
      tracks: [
        { id: 'track-1', mediaId: 'audio-a', mode: 'single' },
        { id: 'track-other', mediaId: 'audio-b', mode: 'multi-auto' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.manuscripts[0]?.tracks).toEqual([
      { id: 'track-1', mediaId: 'audio-a', mode: 'single' },
    ]);
    expect(plan.droppedTracks).toEqual([{ id: 'track-other', mediaId: 'audio-b' }]);
  });

  it('puts a track only on the split manuscript of that audio', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
        ],
        tracks: [
          { id: 'track-a', mediaId: 'audio-a', mode: 'single' },
          { id: 'track-b', mediaId: 'audio-b', mode: 'multi-locked' },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.tracks).toEqual([
      { id: 'track-a', mediaId: 'audio-a', mode: 'single' },
    ]);
    expect(byId.get('doc-1--audio-b')?.tracks).toEqual([
      { id: 'track-b', mediaId: 'audio-b', mode: 'multi-locked' },
    ]);
    expect(plan.droppedTracks).toEqual([]);
  });

  it('keeps an annotation on the only manuscript that contains its layer', () => {
    const plan = planLegacyMigration({
      ...library(),
      annotations: [
        {
          id: 'ann-1',
          tierId: 'layer-1',
          value: 'ta',
          isVerified: true,
          startTime: 0,
          endTime: 1.5,
        },
        { id: 'ann-missing', tierId: 'layer-missing', value: 'x', isVerified: false },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.manuscripts[0]?.annotations).toEqual([
      {
        id: 'ann-1',
        tierId: 'layer-1',
        value: 'ta',
        isVerified: true,
        startTime: 0,
        endTime: 1.5,
      },
    ]);
    expect(plan.droppedAnnotations).toEqual([
      { id: 'ann-missing', tierId: 'layer-missing', reason: 'missing-target' },
    ]);
  });

  it('does not copy an annotation when its layer is split into two manuscripts', () => {
    const plan = planLegacyMigration(
      {
        ...library(),
        audios: [audioA, audioB],
        layers: [
          { id: 'layer-1', documentId: 'doc-1' },
          { id: 'layer-2', documentId: 'doc-1' },
        ],
        units: [
          { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a' },
          { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-b' },
          { id: 'u-3', layerId: 'layer-2', mediaId: 'audio-b' },
        ],
        annotations: [
          { id: 'ann-shared', tierId: 'layer-1', value: 'shared', isVerified: false },
          { id: 'ann-b', tierId: 'layer-2', value: 'b', isVerified: true },
        ],
      },
      { confirmSplit: true },
    );
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('doc-1--audio-a')?.annotations).toEqual([]);
    expect(byId.get('doc-1--audio-b')?.annotations).toEqual([
      { id: 'ann-b', tierId: 'layer-2', value: 'b', isVerified: true },
    ]);
    expect(plan.droppedAnnotations).toEqual([
      { id: 'ann-shared', tierId: 'layer-1', reason: 'shared-layer' },
    ]);
  });

  it('rejects notes when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      notes: [{ id: 'n-1', textId: 'p-1', targetType: 'unit', targetId: 'u-1', text: '甲' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'notes-without-project' });
  });

  it('keeps a phoneme in the project plan and leaves it out of the definition snapshot', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      phonemes: [
        { id: 'ph-1', textId: 'p-1', languageId: 'lang-1', ipa: 't', type: 'consonant' },
        { id: 'ph-other', textId: 'other', languageId: 'lang-1', ipa: 'a', type: 'vowel' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.phonemes).toEqual([
      { id: 'ph-1', textId: 'p-1', languageId: 'lang-1', ipa: 't', type: 'consonant' },
    ]);
    expect(plan.droppedPhonemes).toEqual([{ id: 'ph-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.definitions.languages).toEqual([]);
  });

  it('keeps an abbreviation in the project plan and leaves it out of the definition snapshot', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      abbreviations: [
        { id: 'ab-1', textId: 'p-1', abbreviation: 'PST', category: 'tense' },
        { id: 'ab-2', textId: 'p-1', abbreviation: 'TOP' },
        { id: 'ab-other', textId: 'other', abbreviation: 'SG', category: 'number' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.abbreviations).toEqual([
      { id: 'ab-1', textId: 'p-1', abbreviation: 'PST', category: 'tense' },
      { id: 'ab-2', textId: 'p-1', abbreviation: 'TOP' },
    ]);
    expect(plan.droppedAbbreviations).toEqual([{ id: 'ab-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('keeps a tag definition in the project plan and leaves it out of the definition snapshot', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      tagDefinitions: [
        { id: 'tag-1', textId: 'p-1', key: 'check', scope: 'unit', color: '#c33' },
        { id: 'tag-2', textId: 'p-1', key: 'loan' },
        { id: 'tag-other', textId: 'other', key: 'x' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.tagDefinitions).toEqual([
      { id: 'tag-1', textId: 'p-1', key: 'check', scope: 'unit', color: '#c33' },
      { id: 'tag-2', textId: 'p-1', key: 'loan' },
    ]);
    expect(plan.droppedTagDefinitions).toEqual([{ id: 'tag-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('keeps a bibliographic source in the project plan and leaves it out of the definition snapshot', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      bibliographicSources: [
        {
          id: 'bib-1',
          textId: 'p-1',
          title: '语法概要',
          year: 1999,
          sourceType: 'grammar',
          citationKey: 'g1999',
          accessRights: 'restricted',
        },
        { id: 'bib-2', textId: 'p-1', title: '田野笔记' },
        { id: 'bib-other', textId: 'other', title: '别处' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.bibliographicSources.map((source) => source.id)).toEqual(['bib-1', 'bib-2']);
    expect(plan.droppedBibliographicSources).toEqual([{ id: 'bib-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('keeps a location in the project plan and leaves it out of the definition snapshot', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      locations: [
        {
          id: 'loc-1',
          textId: 'p-1',
          latitude: 29.5,
          longitude: 101.9,
          region: '甲地',
          country: 'CN',
        },
        { id: 'loc-2', textId: 'p-1' },
        { id: 'loc-other', textId: 'other' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.locations.map((location) => location.id)).toEqual(['loc-1', 'loc-2']);
    expect(plan.droppedLocations).toEqual([{ id: 'loc-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('keeps a grammar doc in the project and drops a parent that is not kept', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      grammarDocs: [
        {
          id: 'g-1',
          textId: 'p-1',
          title: '甲',
          content: '合成',
          sortOrder: 0,
          accessRights: 'restricted',
        },
        { id: 'g-2', textId: 'p-1', title: '乙', content: '合成段', parentId: 'g-1', sortOrder: 1 },
        { id: 'g-3', textId: 'p-1', title: '丙', content: '合成', parentId: 'missing' },
        { id: 'g-other', textId: 'other', title: '别处', content: '合成' },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.grammarDocs).toEqual([
      {
        id: 'g-1',
        textId: 'p-1',
        title: '甲',
        content: '合成',
        sortOrder: 0,
        accessRights: 'restricted',
      },
      { id: 'g-2', textId: 'p-1', title: '乙', content: '合成段', parentId: 'g-1', sortOrder: 1 },
      { id: 'g-3', textId: 'p-1', title: '丙', content: '合成' },
    ]);
    expect(plan.droppedGrammarDocs).toEqual([{ id: 'g-other', textId: 'other' }]);
    expect(plan.droppedGrammarParents).toEqual([{ id: 'g-3', parentId: 'missing' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('keeps an orthography bridge in the project plan and leaves it out of the definition snapshot', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      orthographyBridges: [
        {
          id: 'br-1',
          textId: 'p-1',
          sourceOrthographyId: 'orth-1',
          targetOrthographyId: 'orth-2',
          engine: 'table-map',
          status: 'active',
          isReversible: false,
        },
        {
          id: 'br-2',
          textId: 'p-1',
          sourceOrthographyId: 'orth-2',
          targetOrthographyId: 'orth-1',
          engine: 'manual',
        },
        {
          id: 'br-other',
          textId: 'other',
          sourceOrthographyId: 'orth-1',
          targetOrthographyId: 'orth-2',
          engine: 'icu-rule',
        },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.orthographyBridges.map((bridge) => bridge.id)).toEqual(['br-1', 'br-2']);
    expect(plan.droppedOrthographyBridges).toEqual([{ id: 'br-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('keeps a custom field in the project plan and leaves it out of the definition snapshot', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      customFields: [
        {
          id: 'cf-2',
          textId: 'p-1',
          fieldType: 'number',
          sortOrder: 2,
          required: false,
          minValue: 0,
          maxValue: 10,
        },
        { id: 'cf-1', textId: 'p-1', fieldType: 'text', sortOrder: 0, pattern: '^.$' },
        { id: 'cf-other', textId: 'other', fieldType: 'url', sortOrder: 1 },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.customFields.map((field) => field.id)).toEqual(['cf-2', 'cf-1']);
    expect(plan.droppedCustomFields).toEqual([{ id: 'cf-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('keeps catalog history in the project plan and leaves it out of the definition snapshot', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      catalogHistory: [
        {
          id: 'hist-1',
          textId: 'p-1',
          languageId: 'lang-1',
          action: 'update',
          summary: '改了名称',
          reason: '审校',
          reasonCode: 'review',
          actorId: 'user-1',
          actorType: 'human',
          sourceType: 'user-override',
          sourceRef: 'note-1',
        },
        { id: 'hist-2', textId: 'p-1', languageId: 'lang-1', action: 'create', summary: '新建' },
        {
          id: 'hist-other',
          textId: 'other',
          languageId: 'lang-1',
          action: 'delete',
          summary: '删',
        },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.catalogHistory.map((entry) => entry.id)).toEqual(['hist-1', 'hist-2']);
    expect(plan.droppedCatalogHistory).toEqual([{ id: 'hist-other', textId: 'other' }]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('rejects catalog history when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      catalogHistory: [
        { id: 'hist-1', textId: 'p-1', languageId: 'lang-1', action: 'create', summary: '新建' },
      ],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'catalog-history-without-project' });
  });

  it('rejects custom fields when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      customFields: [{ id: 'cf-1', textId: 'p-1', fieldType: 'text', sortOrder: 0 }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'custom-fields-without-project' });
  });

  it('rejects orthography bridges when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      orthographyBridges: [
        {
          id: 'br-1',
          textId: 'p-1',
          sourceOrthographyId: 'orth-1',
          targetOrthographyId: 'orth-2',
          engine: 'manual',
        },
      ],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'bridges-without-project' });
  });

  it('rejects grammar docs when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      grammarDocs: [{ id: 'g-1', textId: 'p-1', title: '甲', content: '合成' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'grammar-without-project' });
  });

  it('rejects locations when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      locations: [{ id: 'loc-1', textId: 'p-1' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'locations-without-project' });
  });

  it('rejects bibliographic sources when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      bibliographicSources: [{ id: 'bib-1', textId: 'p-1', title: '语法概要' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'bibliography-without-project' });
  });

  it('rejects tag definitions when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      tagDefinitions: [{ id: 'tag-1', textId: 'p-1', key: 'check' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'tags-without-project' });
  });

  it('rejects abbreviations when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      abbreviations: [{ id: 'ab-1', textId: 'p-1', abbreviation: 'PST' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'abbreviations-without-project' });
  });

  it('rejects phonemes when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      phonemes: [{ id: 'ph-1', textId: 'p-1', languageId: 'lang-1', ipa: 't', type: 'consonant' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'phonemes-without-project' });
  });

  it('rejects lexemes when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      lexemes: [{ id: 'lex-1', textId: 'p-1', headword: 'ta' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'lexemes-without-project' });
  });

  it('rejects languages when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      languages: [{ id: 'lang-1', textId: 'p-1', name: '语言甲' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'definitions-without-project' });
  });

  it('rejects speakers when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      speakers: [{ id: 's-1', textId: 'p-1', name: '甲' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'speakers-without-project' });
  });

  it('keeps language scalars out of the snapshot and drops AI that has no home', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      languages: [
        { id: 'lang-1', textId: 'p-1', name: '语言甲', iso6393: 'zzz', speakerCountL1: 0 },
      ],
      layers: [{ id: 'layer-1', documentId: 'doc-1', languageId: 'lang-1' }],
      lexemeAssets: [
        {
          id: 'asset-1',
          textId: 'p-1',
          kind: 'image',
          mimeType: 'image/png',
          displayName: '图',
          byteSize: 1,
          refCount: 0,
        },
        {
          id: 'asset-other',
          textId: 'other',
          kind: 'audio',
          mimeType: 'audio/wav',
          displayName: '别处',
          byteSize: 1,
          refCount: 0,
        },
      ],
      lexemeAssetLinks: [{ id: 'link-ok', textId: 'p-1', lexemeId: 'missing', assetId: 'asset-1' }],
      structuralRules: [
        {
          id: 'rule-1',
          projectId: 'p-1',
          scope: 'language',
          languageId: 'lang-1',
          enabled: false,
          priority: 0,
        },
        { id: 'rule-other', projectId: 'other', scope: 'project', enabled: true, priority: 2 },
      ],
      conversations: [
        {
          id: 'conv-1',
          textId: 'p-1',
          title: '会话',
          mode: 'review',
          providerId: 'local',
          model: 'none',
        },
        {
          id: 'conv-other',
          textId: 'other',
          title: '别处',
          mode: 'assistant',
          providerId: 'local',
          model: 'none',
        },
      ],
      aiMessages: [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'assistant',
          content: '合成',
          status: 'done',
        },
        {
          id: 'msg-lost',
          conversationId: 'conv-other',
          role: 'user',
          content: '合成',
          status: 'done',
        },
      ],
      aiTasks: [
        {
          id: 'task-1',
          taskType: 'transcribe',
          status: 'failed',
          targetId: 'u-1',
          errorMessage: '停',
        },
      ],
      aiTaskSnapshots: [
        {
          id: 'snap-1',
          taskId: 'task-1',
          taskType: 'transcribe',
          status: 'failed',
          targetId: 'u-1',
          hasError: true,
          isTerminal: true,
          durationMs: 1,
        },
        {
          id: 'snap-lost',
          taskId: 'missing',
          taskType: 'gloss',
          status: 'done',
          targetId: 'u-1',
          hasError: false,
          isTerminal: false,
          durationMs: 0,
        },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.languages).toEqual([
      { id: 'lang-1', textId: 'p-1', name: '语言甲', iso6393: 'zzz', speakerCountL1: 0 },
    ]);
    expect(plan.manuscripts[0]?.definitions.languages).toEqual([{ id: 'lang-1', name: '语言甲' }]);
    expect(plan.lexemeAssets.map((asset) => asset.id)).toEqual(['asset-1']);
    expect(plan.droppedLexemeAssets).toEqual([{ id: 'asset-other', textId: 'other' }]);
    expect(plan.lexemeAssetLinks).toEqual([]);
    expect(plan.droppedLexemeAssetLinks).toEqual([
      { id: 'link-ok', lexemeId: 'missing', assetId: 'asset-1', reason: 'missing-target' },
    ]);
    expect(plan.structuralRules).toEqual([
      {
        id: 'rule-1',
        projectId: 'p-1',
        scope: 'language',
        languageId: 'lang-1',
        enabled: false,
        priority: 0,
      },
    ]);
    expect(plan.droppedStructuralRules).toEqual([{ id: 'rule-other', projectId: 'other' }]);
    expect(plan.conversations.map((conversation) => conversation.id)).toEqual(['conv-1']);
    expect(plan.aiMessages.map((message) => message.id)).toEqual(['msg-1']);
    expect(plan.droppedAiMessages).toEqual([{ id: 'msg-lost', conversationId: 'conv-other' }]);
    expect(plan.aiTaskSnapshots.map((snapshot) => snapshot.id)).toEqual(['snap-1']);
    expect(plan.droppedAiTaskSnapshots).toEqual([{ id: 'snap-lost', taskId: 'missing' }]);
  });

  it('rejects project AI when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      aiTasks: [{ id: 'task-1', taskType: 'gloss', status: 'pending', targetId: 'u-1' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'ai-without-project' });
  });

  it('rejects session memory and model runs when the library has no project row', () => {
    expect(
      planLegacyMigration({
        ...library(),
        sessionMemories: [
          {
            id: 'conv-1',
            conversationId: 'conv-1',
            payload: {},
            updatedAt: '2026-10-21T00:00:00.000Z',
          },
        ],
      }),
    ).toEqual({ status: 'rejected', reason: 'ai-without-project' });
    expect(
      planLegacyMigration({
        ...library(),
        modelRuns: [
          {
            id: 'run-1',
            textId: 'p-1',
            modelId: 'example.whisper',
            modelVersion: '1',
            manifestSha256: 'abc',
            capability: 'transcribe',
            params: {},
            mediaId: 'audio-a',
            rangeStart: 0,
            rangeEnd: 1,
            startedAt: '2026-10-21T00:00:00.000Z',
            status: 'running',
            chunkCount: 1,
            acceptedCount: 0,
            rejectedCount: 0,
            pendingCount: 1,
          },
        ],
      }),
    ).toEqual({ status: 'rejected', reason: 'model-runs-without-project' });
  });

  it('keeps a session-memory payload and a transcribe run, and drops rows that do not fit', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      conversations: [
        {
          id: 'conv-1',
          textId: 'p-1',
          title: '会话',
          mode: 'assistant',
          providerId: 'local',
          model: 'none',
        },
      ],
      sessionMemories: [
        {
          id: 'conv-1',
          conversationId: 'conv-1',
          payload: { lastLanguage: 'zh', nested: { ok: true } },
          updatedAt: '2026-10-21T00:00:00.000Z',
        },
        {
          id: 'other',
          conversationId: 'missing',
          payload: {},
          updatedAt: '2026-10-21T00:00:00.000Z',
        },
        {
          id: 'gone',
          conversationId: 'gone',
          payload: {},
          updatedAt: '2026-10-21T00:00:00.000Z',
        },
        {
          id: 'conv-1',
          conversationId: 'conv-1',
          payload: [],
          updatedAt: '2026-10-21T00:00:00.000Z',
        },
        {
          id: 'conv-1',
          conversationId: 'conv-1',
          payload: { dropped: true },
          updatedAt: '',
        },
      ],
      modelRuns: [
        {
          id: 'run-1',
          textId: 'p-1',
          modelId: 'example.whisper',
          modelVersion: '1',
          manifestSha256: 'abc',
          capability: 'transcribe',
          params: { chunkSec: 30 },
          mediaId: 'audio-a',
          rangeStart: 0,
          rangeEnd: 1.5,
          startedAt: '2026-10-21T00:00:00.000Z',
          finishedAt: '2026-10-21T00:00:02.000Z',
          status: 'ok',
          chunkCount: 1,
          acceptedCount: 1,
          rejectedCount: 0,
          pendingCount: 0,
        },
        {
          id: 'run-other',
          textId: 'other',
          modelId: 'example.whisper',
          modelVersion: '1',
          manifestSha256: 'abc',
          capability: 'transcribe',
          params: {},
          mediaId: 'audio-a',
          rangeStart: 0,
          rangeEnd: 1,
          startedAt: '2026-10-21T00:00:00.000Z',
          status: 'ok',
          chunkCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          pendingCount: 0,
        },
        {
          id: 'run-align',
          textId: 'p-1',
          modelId: 'example.whisper',
          modelVersion: '1',
          manifestSha256: 'abc',
          capability: 'align',
          params: {},
          mediaId: 'audio-a',
          rangeStart: 0,
          rangeEnd: 1,
          startedAt: '2026-10-21T00:00:00.000Z',
          status: 'ok',
          chunkCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          pendingCount: 0,
        },
      ],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.sessionMemories).toEqual([
      {
        id: 'conv-1',
        conversationId: 'conv-1',
        payload: { lastLanguage: 'zh', nested: { ok: true } },
        updatedAt: '2026-10-21T00:00:00.000Z',
      },
    ]);
    expect(plan.droppedSessionMemories).toEqual([
      { id: 'other', reason: 'id-mismatch' },
      { id: 'gone', reason: 'missing-conversation' },
      { id: 'conv-1', reason: 'payload' },
      { id: 'conv-1', reason: 'updated-at' },
    ]);
    expect(plan.modelRuns).toEqual([
      {
        id: 'run-1',
        textId: 'p-1',
        modelId: 'example.whisper',
        modelVersion: '1',
        manifestSha256: 'abc',
        capability: 'transcribe',
        params: { chunkSec: 30 },
        mediaId: 'audio-a',
        rangeStart: 0,
        rangeEnd: 1.5,
        startedAt: '2026-10-21T00:00:00.000Z',
        finishedAt: '2026-10-21T00:00:02.000Z',
        status: 'ok',
        chunkCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        pendingCount: 0,
      },
    ]);
    expect(plan.droppedModelRuns).toEqual([
      { id: 'run-other', reason: 'wrong-project' },
      { id: 'run-align', reason: 'shape' },
    ]);
    expect(plan.manuscripts[0]?.definitions).toEqual(emptyDefinitions);
  });

  it('writes a ready plan and reads the same ids back', () => {
    const plan = planLegacyMigration({
      ...library(),
      documents: [{ id: 'doc-1', name: '录音01', sourceIds: ['src-1'] }],
      project: { id: 'p-1', name: '项目' },
      speakers: [{ id: 's-1', textId: 'p-1', name: '甲' }],
      sourceRecords: [
        {
          id: 'src-1',
          textId: 'p-1',
          originalName: 'a.eaf',
          displayName: '甲',
          format: 'eaf',
          mediaId: 'audio-a',
        },
      ],
      layers: [
        { id: 'layer-1', documentId: 'doc-1', languageId: 'lang-1', orthographyId: 'orth-1' },
        { id: 'layer-2', documentId: 'doc-1' },
      ],
      layerLinks: [
        {
          id: 'll-1',
          hostLayerId: 'layer-1',
          layerId: 'layer-2',
          linkType: 'literal',
          isPreferred: true,
        },
      ],
      tracks: [{ id: 'track-1', mediaId: 'audio-a', mode: 'single' }],
      annotations: [
        {
          id: 'ann-1',
          tierId: 'layer-1',
          value: 'ta',
          isVerified: true,
          startTime: 0,
          endTime: 1.5,
        },
      ],
      units: [
        {
          id: 'u-1',
          layerId: 'layer-1',
          mediaId: 'audio-a',
          speakerId: 's-1',
          startAnchorId: 'anchor-1',
        },
        { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a', parentUnitId: 'u-1' },
      ],
      anchors: [{ id: 'anchor-1', mediaId: 'audio-a', time: 1.25 }],
      contents: [{ id: 'c-1', unitId: 'u-1', role: 'primary_text', text: 'ta' }],
      relations: [
        { id: 'rel-1', sourceUnitId: 'u-1', targetUnitId: 'u-2', relationType: 'aligned_to' },
      ],
      notes: [
        { id: 'n-unit', textId: 'p-1', targetType: 'unit', targetId: 'u-1', text: '语段备注' },
        {
          id: 'n-speaker',
          textId: 'p-1',
          targetType: 'speaker',
          targetId: 's-1',
          text: '说话人备注',
        },
      ],
      languages: [
        {
          id: 'lang-1',
          textId: 'p-1',
          name: '语言甲',
          iso6393: 'zzz',
          glottocode: 'abcd1234',
          speakerCountL1: 0,
        },
      ],
      displayNames: [
        { id: 'dn-1', textId: 'p-1', languageId: 'lang-1', locale: 'zh', value: '语言甲显示名' },
      ],
      aliases: [{ id: 'al-1', textId: 'p-1', languageId: 'lang-1', alias: 'LangA' }],
      orthographies: [{ id: 'orth-1', textId: 'p-1', name: '正字甲', languageId: 'lang-1' }],
      lexemes: [
        {
          id: 'lex-1',
          textId: 'p-1',
          headword: 'ta',
          kind: 'entry',
          usageCount: 2,
          accessRights: 'restricted',
        },
      ],
      phonemes: [{ id: 'ph-1', textId: 'p-1', languageId: 'lang-1', ipa: 't', type: 'consonant' }],
      abbreviations: [
        { id: 'ab-1', textId: 'p-1', abbreviation: 'PST', category: 'tense' },
        { id: 'ab-2', textId: 'p-1', abbreviation: 'TOP' },
      ],
      tagDefinitions: [
        { id: 'tag-1', textId: 'p-1', key: 'check', scope: 'unit', color: '#c33' },
        { id: 'tag-2', textId: 'p-1', key: 'loan' },
      ],
      bibliographicSources: [
        {
          id: 'bib-1',
          textId: 'p-1',
          title: '语法概要',
          year: 1999,
          sourceType: 'grammar',
          citationKey: 'g1999',
          accessRights: 'restricted',
        },
        { id: 'bib-2', textId: 'p-1', title: '田野笔记' },
      ],
      locations: [
        {
          id: 'loc-1',
          textId: 'p-1',
          latitude: 29.5,
          longitude: 101.9,
          region: '甲地',
          country: 'CN',
        },
        { id: 'loc-2', textId: 'p-1' },
      ],
      grammarDocs: [
        {
          id: 'g-1',
          textId: 'p-1',
          title: '甲',
          content: '合成',
          sortOrder: 0,
          accessRights: 'restricted',
        },
        { id: 'g-2', textId: 'p-1', title: '乙', content: '合成段', parentId: 'g-1', sortOrder: 1 },
      ],
      orthographyBridges: [
        {
          id: 'br-1',
          textId: 'p-1',
          sourceOrthographyId: 'orth-1',
          targetOrthographyId: 'orth-2',
          engine: 'table-map',
          status: 'active',
          isReversible: false,
        },
        {
          id: 'br-2',
          textId: 'p-1',
          sourceOrthographyId: 'orth-2',
          targetOrthographyId: 'orth-1',
          engine: 'manual',
        },
      ],
      customFields: [
        {
          id: 'cf-2',
          textId: 'p-1',
          fieldType: 'number',
          sortOrder: 2,
          required: false,
          minValue: 0,
          maxValue: 10,
        },
        { id: 'cf-1', textId: 'p-1', fieldType: 'text', sortOrder: 0, pattern: '^.$' },
      ],
      catalogHistory: [
        {
          id: 'hist-1',
          textId: 'p-1',
          languageId: 'lang-1',
          action: 'update',
          summary: '改了名称',
          reason: '审校',
          reasonCode: 'review',
          actorId: 'user-1',
          actorType: 'human',
          sourceType: 'user-override',
          sourceRef: 'note-1',
        },
        { id: 'hist-2', textId: 'p-1', languageId: 'lang-1', action: 'create', summary: '新建' },
      ],
      lexemeAssets: [
        {
          id: 'asset-1',
          textId: 'p-1',
          kind: 'document',
          mimeType: 'text/plain',
          displayName: '合成附件',
          byteSize: 4,
          refCount: 1,
          blobExportOmitted: true,
        },
      ],
      lexemeAssetLinks: [{ id: 'al-1', textId: 'p-1', lexemeId: 'lex-1', assetId: 'asset-1' }],
      structuralRules: [
        { id: 'rule-1', projectId: 'p-1', scope: 'project', enabled: true, priority: 1 },
      ],
      conversations: [
        {
          id: 'conv-1',
          textId: 'p-1',
          title: '会话',
          mode: 'assistant',
          providerId: 'local',
          model: 'none',
          archived: false,
        },
      ],
      aiMessages: [
        { id: 'msg-1', conversationId: 'conv-1', role: 'user', content: '合成', status: 'done' },
      ],
      aiTasks: [{ id: 'task-1', taskType: 'gloss', status: 'done', targetId: 'u-1' }],
      aiTaskSnapshots: [
        {
          id: 'snap-1',
          taskId: 'task-1',
          taskType: 'gloss',
          status: 'done',
          targetId: 'u-1',
          hasError: false,
          isTerminal: true,
          durationMs: 3,
        },
      ],
      projectMemories: [{ id: 'mem-1', projectId: 'p-1', fact: '合成事实', confidence: 0.5 }],
      agentArtifacts: [
        {
          id: 'art-1',
          schemaVersion: 0,
          kind: 'workflow_output',
          uri: 'memory://art-1',
          title: '产物',
          mimeType: 'application/json',
          bodyJson: '{}',
        },
      ],
      aiSourceSets: [
        { id: 'set-1', projectId: 'p-1', name: '当前', scope: 'project', status: 'active' },
      ],
      sessionMemories: [
        {
          id: 'conv-1',
          conversationId: 'conv-1',
          payload: { lastLanguage: 'zh' },
          updatedAt: '2026-10-21T00:00:00.000Z',
        },
      ],
      modelRuns: [
        {
          id: 'run-1',
          textId: 'p-1',
          modelId: 'example.whisper',
          modelVersion: '1',
          manifestSha256: 'abc',
          capability: 'transcribe',
          params: { chunkSec: 30 },
          mediaId: 'audio-a',
          rangeStart: 0,
          rangeEnd: 1.5,
          startedAt: '2026-10-21T00:00:00.000Z',
          finishedAt: '2026-10-21T00:00:02.000Z',
          status: 'ok',
          chunkCount: 1,
          acceptedCount: 1,
          rejectedCount: 0,
          pendingCount: 0,
        },
      ],
      lexemeLinks: [{ id: 'link-1', targetType: 'token', targetId: 't-1', lexemeId: 'lex-1' }],
      tokens: [{ id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' }],
      morphemes: [{ id: 'm-1', unitId: 'u-1', tokenId: 't-1', morphemeIndex: 0, form: 't' }],
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    const dir = mkdtempSync(join(tmpdir(), 'jieyu-plan-'));
    try {
      const planFile = join(dir, 'plan.json');
      const dest = join(dir, 'project');
      writeFileSync(
        planFile,
        JSON.stringify({
          status: plan.status,
          project: plan.project,
          speakers: plan.speakers,
          languages: plan.languages,
          displayNames: plan.displayNames,
          aliases: plan.aliases,
          orthographies: plan.orthographies,
          sourceRecords: plan.sourceRecords,
          lexemes: plan.lexemes,
          phonemes: plan.phonemes,
          abbreviations: plan.abbreviations,
          tagDefinitions: plan.tagDefinitions,
          bibliographicSources: plan.bibliographicSources,
          locations: plan.locations,
          grammarDocs: plan.grammarDocs,
          orthographyBridges: plan.orthographyBridges,
          customFields: plan.customFields,
          catalogHistory: plan.catalogHistory,
          lexemeAssets: plan.lexemeAssets,
          lexemeAssetLinks: plan.lexemeAssetLinks,
          structuralRules: plan.structuralRules,
          conversations: plan.conversations,
          aiMessages: plan.aiMessages,
          aiTasks: plan.aiTasks,
          aiTaskSnapshots: plan.aiTaskSnapshots,
          projectMemories: plan.projectMemories,
          agentArtifacts: plan.agentArtifacts,
          aiSourceSets: plan.aiSourceSets,
          sessionMemories: plan.sessionMemories,
          modelRuns: plan.modelRuns,
          notes: plan.notes,
          audios: plan.audios.map((audio) => ({
            audioId: audio.audioId,
            fileName: audio.fileName,
            sha256: audio.sha256,
            bytes: Buffer.from(audio.bytes).toString('base64'),
          })),
          manuscripts: plan.manuscripts,
        }),
      );
      const result = spawnSync(
        process.execPath,
        [
          '--experimental-sqlite',
          join(process.cwd(), 'scripts/apply-legacy-plan.mjs'),
          planFile,
          dest,
        ],
        { encoding: 'utf8' },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        project: { id: 'p-1', name: '项目' },
        speakers: [{ id: 's-1', textId: 'p-1', name: '甲' }],
        languages: [
          {
            id: 'lang-1',
            textId: 'p-1',
            name: '语言甲',
            iso6393: 'zzz',
            glottocode: 'abcd1234',
            speakerCountL1: 0,
          },
        ],
        displayNames: [
          { id: 'dn-1', textId: 'p-1', languageId: 'lang-1', locale: 'zh', value: '语言甲显示名' },
        ],
        aliases: [{ id: 'al-1', textId: 'p-1', languageId: 'lang-1', alias: 'LangA' }],
        orthographies: [{ id: 'orth-1', textId: 'p-1', name: '正字甲', languageId: 'lang-1' }],
        sourceRecords: [
          {
            id: 'src-1',
            textId: 'p-1',
            originalName: 'a.eaf',
            displayName: '甲',
            format: 'eaf',
            mediaId: 'audio-a',
          },
        ],
        lexemes: [
          {
            id: 'lex-1',
            textId: 'p-1',
            headword: 'ta',
            kind: 'entry',
            usageCount: 2,
            accessRights: 'restricted',
          },
        ],
        phonemes: [
          { id: 'ph-1', textId: 'p-1', languageId: 'lang-1', ipa: 't', type: 'consonant' },
        ],
        abbreviations: [
          { id: 'ab-1', textId: 'p-1', abbreviation: 'PST', category: 'tense' },
          { id: 'ab-2', textId: 'p-1', abbreviation: 'TOP' },
        ],
        tagDefinitions: [
          { id: 'tag-1', textId: 'p-1', key: 'check', scope: 'unit', color: '#c33' },
          { id: 'tag-2', textId: 'p-1', key: 'loan' },
        ],
        bibliographicSources: [
          {
            id: 'bib-1',
            textId: 'p-1',
            title: '语法概要',
            year: 1999,
            sourceType: 'grammar',
            citationKey: 'g1999',
            accessRights: 'restricted',
          },
          { id: 'bib-2', textId: 'p-1', title: '田野笔记' },
        ],
        locations: [
          {
            id: 'loc-1',
            textId: 'p-1',
            latitude: 29.5,
            longitude: 101.9,
            region: '甲地',
            country: 'CN',
          },
          { id: 'loc-2', textId: 'p-1' },
        ],
        grammarDocs: [
          {
            id: 'g-1',
            textId: 'p-1',
            title: '甲',
            content: '合成',
            sortOrder: 0,
            accessRights: 'restricted',
          },
          {
            id: 'g-2',
            textId: 'p-1',
            title: '乙',
            content: '合成段',
            parentId: 'g-1',
            sortOrder: 1,
          },
        ],
        orthographyBridges: [
          {
            id: 'br-1',
            textId: 'p-1',
            sourceOrthographyId: 'orth-1',
            targetOrthographyId: 'orth-2',
            engine: 'table-map',
            status: 'active',
            isReversible: false,
          },
          {
            id: 'br-2',
            textId: 'p-1',
            sourceOrthographyId: 'orth-2',
            targetOrthographyId: 'orth-1',
            engine: 'manual',
          },
        ],
        customFields: [
          {
            id: 'cf-1',
            textId: 'p-1',
            fieldType: 'text',
            sortOrder: 0,
            pattern: '^.$',
          },
          {
            id: 'cf-2',
            textId: 'p-1',
            fieldType: 'number',
            sortOrder: 2,
            required: false,
            minValue: 0,
            maxValue: 10,
          },
        ],
        catalogHistory: [
          {
            id: 'hist-1',
            textId: 'p-1',
            languageId: 'lang-1',
            action: 'update',
            summary: '改了名称',
            reason: '审校',
            reasonCode: 'review',
            actorId: 'user-1',
            actorType: 'human',
            sourceType: 'user-override',
            sourceRef: 'note-1',
          },
          { id: 'hist-2', textId: 'p-1', languageId: 'lang-1', action: 'create', summary: '新建' },
        ],
        lexemeAssets: [
          {
            id: 'asset-1',
            textId: 'p-1',
            kind: 'document',
            mimeType: 'text/plain',
            displayName: '合成附件',
            byteSize: 4,
            refCount: 1,
            blobExportOmitted: true,
          },
        ],
        lexemeAssetLinks: [{ id: 'al-1', textId: 'p-1', lexemeId: 'lex-1', assetId: 'asset-1' }],
        structuralRules: [
          { id: 'rule-1', projectId: 'p-1', scope: 'project', enabled: true, priority: 1 },
        ],
        conversations: [
          {
            id: 'conv-1',
            textId: 'p-1',
            title: '会话',
            mode: 'assistant',
            providerId: 'local',
            model: 'none',
            archived: false,
          },
        ],
        aiMessages: [
          { id: 'msg-1', conversationId: 'conv-1', role: 'user', content: '合成', status: 'done' },
        ],
        aiTasks: [{ id: 'task-1', taskType: 'gloss', status: 'done', targetId: 'u-1' }],
        aiTaskSnapshots: [
          {
            id: 'snap-1',
            taskId: 'task-1',
            taskType: 'gloss',
            status: 'done',
            targetId: 'u-1',
            hasError: false,
            isTerminal: true,
            durationMs: 3,
          },
        ],
        projectMemories: [{ id: 'mem-1', projectId: 'p-1', fact: '合成事实', confidence: 0.5 }],
        agentArtifacts: [
          {
            id: 'art-1',
            schemaVersion: 0,
            kind: 'workflow_output',
            uri: 'memory://art-1',
            title: '产物',
            mimeType: 'application/json',
            bodyJson: '{}',
          },
        ],
        aiSourceSets: [
          { id: 'set-1', projectId: 'p-1', name: '当前', scope: 'project', status: 'active' },
        ],
        sessionMemories: [
          {
            id: 'conv-1',
            conversationId: 'conv-1',
            payload: { lastLanguage: 'zh' },
            updatedAt: '2026-10-21T00:00:00.000Z',
          },
        ],
        modelRuns: [
          {
            id: 'run-1',
            textId: 'p-1',
            modelId: 'example.whisper',
            modelVersion: '1',
            manifestSha256: 'abc',
            capability: 'transcribe',
            params: { chunkSec: 30 },
            mediaId: 'audio-a',
            rangeStart: 0,
            rangeEnd: 1.5,
            startedAt: '2026-10-21T00:00:00.000Z',
            finishedAt: '2026-10-21T00:00:02.000Z',
            status: 'ok',
            chunkCount: 1,
            acceptedCount: 1,
            rejectedCount: 0,
            pendingCount: 0,
          },
        ],
        notes: [{ id: 'n-speaker', targetType: 'speaker', targetId: 's-1', text: '说话人备注' }],
        audios: [{ id: 'audio-a', relPath: '录音01.wav', sha256: plan.audios[0]?.sha256 }],
        manuscripts: [
          {
            id: 'doc-1',
            audioId: 'audio-a',
            layers: [
              { id: 'layer-1', key: 'layer-1', languageId: 'lang-1', orthographyId: 'orth-1' },
              { id: 'layer-2', key: 'layer-2' },
            ],
            layerLinks: [
              {
                id: 'll-1',
                hostLayerId: 'layer-1',
                layerId: 'layer-2',
                linkType: 'literal',
                isPreferred: true,
              },
            ],
            tracks: [{ id: 'track-1', mediaId: 'audio-a', mode: 'single' }],
            annotations: [
              {
                id: 'ann-1',
                tierId: 'layer-1',
                value: 'ta',
                isVerified: true,
                startTime: 0,
                endTime: 1.5,
              },
            ],
            definitions: {
              languages: [{ id: 'lang-1', name: '语言甲' }],
              displayNames: [
                { id: 'dn-1', languageId: 'lang-1', locale: 'zh', value: '语言甲显示名' },
              ],
              aliases: [{ id: 'al-1', languageId: 'lang-1', alias: 'LangA' }],
              orthographies: [{ id: 'orth-1', name: '正字甲', languageId: 'lang-1' }],
              speakers: [{ id: 's-1', name: '甲' }],
            },
            sourceIds: ['src-1'],
            lexemeLinks: [
              { id: 'link-1', targetType: 'token', targetId: 't-1', lexemeId: 'lex-1' },
            ],
            anchors: [{ id: 'anchor-1', mediaId: 'audio-a', time: 1.25 }],
            contents: [{ id: 'c-1', unitId: 'u-1', role: 'primary_text', text: 'ta' }],
            relations: [
              {
                id: 'rel-1',
                sourceUnitId: 'u-1',
                targetUnitId: 'u-2',
                relationType: 'aligned_to',
              },
            ],
            notes: [{ id: 'n-unit', targetType: 'unit', targetId: 'u-1', text: '语段备注' }],
            tokens: [{ id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' }],
            morphemes: [{ id: 'm-1', unitId: 'u-1', tokenId: 't-1', morphemeIndex: 0, form: 't' }],
            units: [
              {
                id: 'u-1',
                layerId: 'layer-1',
                mediaId: 'audio-a',
                parentUnitId: null,
                startAnchorId: 'anchor-1',
              },
              { id: 'u-2', layerId: 'layer-1', mediaId: 'audio-a', parentUnitId: 'u-1' },
            ],
          },
        ],
      });
      expect(readFileSync(join(dest, '录音01.wav'))).toEqual(Buffer.from([1, 2, 3]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
