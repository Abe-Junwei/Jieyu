import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planLegacyMigration } from './planLegacyMigration';

const audioA = { id: 'audio-a', filename: '录音01.wav', bytes: new Uint8Array([1, 2, 3]) };
const audioB = { id: 'audio-b', filename: '录音02.wav', bytes: new Uint8Array([4, 5]) };

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
      documents: [{ documentId: 'doc-1', audioIds: ['audio-a', 'audio-b'] }],
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

  it('rejects speakers when the library has no project row', () => {
    const plan = planLegacyMigration({
      ...library(),
      speakers: [{ id: 's-1', textId: 'p-1', name: '甲' }],
    });
    expect(plan).toEqual({ status: 'rejected', reason: 'speakers-without-project' });
  });

  it('writes a ready plan and reads the same ids back', () => {
    const plan = planLegacyMigration({
      ...library(),
      project: { id: 'p-1', name: '项目' },
      speakers: [{ id: 's-1', textId: 'p-1', name: '甲' }],
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
          project: plan.project,
          speakers: plan.speakers,
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
        audios: [{ id: 'audio-a', relPath: '录音01.wav', sha256: plan.audios[0]?.sha256 }],
        manuscripts: [
          {
            id: 'doc-1',
            audioId: 'audio-a',
            layers: [{ id: 'layer-1', key: 'layer-1' }],
            tokens: [{ id: 't-1', unitId: 'u-1', tokenIndex: 0, form: 'ta' }],
            morphemes: [{ id: 'm-1', unitId: 'u-1', tokenId: 't-1', morphemeIndex: 0, form: 't' }],
            units: [
              { id: 'u-1', layerId: 'layer-1', mediaId: 'audio-a', parentUnitId: null },
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
