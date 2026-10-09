/**
 * 覆盖当前项目（rev5 D5、7.4-3，T33 的单元部分）。
 * Overwrite the current project (rev5 D5, 7.4-3; unit part of T33).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { ProjectOverwriteBlockedError } from '../db/snapshotFormatError';
import { entryDoc } from '../utils/dmlexEntry';
import { exportProjectToJyt, overwriteProjectWithJyt, previewJytRestore } from './JytService';

const flags = vi.hoisted(() => ({ neverCollaborated: true, failSnapshot: false }));

vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: () => flags.neverCollaborated,
  listCollaboratedIds: (ids: readonly string[]) =>
    flags.neverCollaborated ? [] : [...new Set(ids)],
}));

vi.mock('../db/projectOverwriteSnapshotStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/projectOverwriteSnapshotStore')>();
  return {
    ...actual,
    saveProjectOverwriteSnapshot: (
      input: Parameters<typeof actual.saveProjectOverwriteSnapshot>[0],
    ) =>
      flags.failSnapshot
        ? Promise.reject(new Error('QuotaExceededError'))
        : actual.saveProjectOverwriteSnapshot(input),
  };
});

const { listProjectOverwriteSnapshots } = await import('../db/projectOverwriteSnapshotStore');

const NOW = '2026-10-09T01:00:00.000Z';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AUDIO = 'field-audio-bytes';

async function seedProject(p: string, withBytes: boolean): Promise<void> {
  const doc = `${p}-doc`;
  const layer = `${p}-layer`;
  const unit = `${p}-unit`;
  await db.texts.put({
    id: p,
    title: { default: `Project ${p}` },
    defaultDocumentId: doc,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.annotation_documents.put({
    id: doc,
    textId: p,
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.tier_definitions.put({
    id: layer,
    textId: p,
    documentId: doc,
    key: `bridge_trc_${p}`,
    name: { default: 'Transcription' },
    tierType: 'time-aligned',
    contentType: 'transcription',
    languageId: 'user:demo',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  const audio = new Blob([AUDIO], { type: 'audio/wav' });
  await db.media_items.put({
    id: `${p}-media`,
    textId: p,
    filename: 'field.wav',
    duration: 2,
    ...(withBytes ? { details: { audioBlob: audio } } : {}),
    isOfflineCached: withBytes,
    timelineKind: 'acoustic',
    byteLocation: withBytes ? 'managed' : 'none',
    availability: withBytes ? 'available' : 'missing',
    contentSize: audio.size,
    createdAt: NOW,
  });
  await db.layer_units.put({
    id: unit,
    textId: p,
    mediaId: `${p}-media`,
    layerId: layer,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.layer_unit_contents.put({
    id: `${p}-content`,
    textId: p,
    unitId: unit,
    layerId: layer,
    contentRole: 'primary_text',
    modality: 'text',
    text: `text of ${p}`,
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.lexemes.put(
    entryDoc({
      id: `${p}-lex`,
      headword: 'dog',
      createdAt: NOW,
      updatedAt: NOW,
      textId: p,
    }) as never,
  );
}

async function blockedReason(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ProjectOverwriteBlockedError) return error.reason;
    throw error;
  }
  throw new Error('expected the overwrite to be blocked');
}

describe('JYT overwrite of the current project (D5, T33)', () => {
  beforeEach(async () => {
    flags.neverCollaborated = true;
    flags.failSnapshot = false;
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('T33(a): same project keeps ids and local bytes, snapshots first, leaves other projects alone', async () => {
    await seedProject('pA', true);
    await seedProject('pB', true);
    const archive = await exportProjectToJyt('pA');
    // 导出后又改了内容、加了新单元（无字节）| Edit after export
    await db.layer_unit_contents.update('pA-content', { text: 'edited later' });
    await db.layer_units.put({
      id: 'pA-unit-2',
      textId: 'pA',
      mediaId: 'pA-media',
      layerId: 'pA-layer',
      unitType: 'unit',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    const preview = await previewJytRestore(archive, { overwriteTargetProjectId: 'pA' });
    expect(preview.overwrite).toMatchObject({
      targetProjectId: 'pA',
      keepsIds: true,
      available: true,
      bytesAtRisk: [],
    });

    const result = await overwriteProjectWithJyt(archive, { targetProjectId: 'pA' });
    expect(result).toMatchObject({ projectId: 'pA', keptIds: true, sourceProjectId: 'pA' });
    expect((await db.layer_unit_contents.get('pA-content'))?.text).toBe('text of pA');
    expect(await db.layer_units.get('pA-unit-2')).toBeUndefined();
    const media = await db.media_items.get('pA-media');
    expect(media).toMatchObject({ byteLocation: 'managed', availability: 'available' });
    expect((media?.details as Record<string, unknown>)['audioBlob']).toBeInstanceOf(Blob);
    expect((await db.texts.get('pA'))?.restoredFrom).toMatchObject({
      projectId: 'pA',
      packageKind: 'jyt',
    });

    const snapshots = await listProjectOverwriteSnapshots('pA');
    expect(snapshots[0]?.seq).toBe(result.snapshotSeq);
    expect(snapshots[0]?.snapshotJson).toContain('edited later');
    expect(snapshots[0]?.snapshotJson).toContain('pA-unit-2');

    expect((await db.layer_unit_contents.get('pB-content'))?.text).toBe('text of pB');
    expect((await db.media_items.get('pB-media'))?.byteLocation).toBe('managed');
  });

  it('a package from another project is remapped into the current project id', async () => {
    await seedProject('pA', false);
    await seedProject('pB', true);
    const archive = await exportProjectToJyt('pB');
    const result = await overwriteProjectWithJyt(archive, { targetProjectId: 'pA' });
    expect(result.keptIds).toBe(false);
    expect(await db.layer_units.get('pA-unit')).toBeUndefined();
    const units = await db.layer_units.where('textId').equals('pA').toArray();
    expect(units).toHaveLength(1);
    expect(units[0]!.id).toMatch(UUID_RE);
    const content = (await db.layer_unit_contents.toArray()).find((c) => c.unitId === units[0]!.id);
    expect(content?.text).toBe('text of pB');
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Project pB' });
    // pB 原样 | pB untouched
    expect(await db.layer_units.get('pB-unit')).toBeDefined();
    expect((await db.media_items.get('pB-media'))?.byteLocation).toBe('managed');
  });

  it('4.2-7: aborts with nothing changed when local bytes would be lost', async () => {
    await seedProject('pA', true);
    await seedProject('pB', true);
    const archive = await exportProjectToJyt('pB');
    const snapshotsBefore = (await listProjectOverwriteSnapshots('pA')).length;
    const preview = await previewJytRestore(archive, { overwriteTargetProjectId: 'pA' });
    expect(preview.overwrite).toMatchObject({
      available: false,
      bytesAtRisk: ['media_items:pA-media'],
    });
    expect(
      await blockedReason(() => overwriteProjectWithJyt(archive, { targetProjectId: 'pA' })),
    ).toBe('local-bytes-would-be-lost');
    expect(await db.layer_units.get('pA-unit')).toBeDefined();
    expect(await listProjectOverwriteSnapshots('pA')).toHaveLength(snapshotsBefore);
  });

  it('T33(b): a collaborated (or unknown) project offers no overwrite and refuses it', async () => {
    await seedProject('pA', false);
    const archive = await exportProjectToJyt('pA');
    flags.neverCollaborated = false;
    const preview = await previewJytRestore(archive, { overwriteTargetProjectId: 'pA' });
    expect(preview.overwrite).toBeUndefined();
    expect(
      await blockedReason(() => overwriteProjectWithJyt(archive, { targetProjectId: 'pA' })),
    ).toBe('not-allowed');
  });

  it('7.4-3: a failed snapshot aborts the overwrite', async () => {
    await seedProject('pA', false);
    const archive = await exportProjectToJyt('pA');
    await db.layer_unit_contents.update('pA-content', { text: 'edited later' });
    flags.failSnapshot = true;
    expect(
      await blockedReason(() => overwriteProjectWithJyt(archive, { targetProjectId: 'pA' })),
    ).toBe('snapshot-failed');
    expect((await db.layer_unit_contents.get('pA-content'))?.text).toBe('edited later');
  });

  it('keeps only the latest snapshots per project', async () => {
    await seedProject('pA', false);
    const archive = await exportProjectToJyt('pA');
    for (let i = 0; i < 4; i += 1) {
      await overwriteProjectWithJyt(archive, { targetProjectId: 'pA' });
    }
    expect(await listProjectOverwriteSnapshots('pA')).toHaveLength(3);
  });
});
