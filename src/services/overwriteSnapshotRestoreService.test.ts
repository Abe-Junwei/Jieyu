/**
 * 从覆盖前快照与整库快照恢复（用户决定 2026-10-09）：列表、预览、恢复、先存当前状态、读回核对、
 * 协作过或会丢本机字节时拒绝。
 * Restoring pre-overwrite and library snapshots (user decision 2026-10-09): list, preview, restore,
 * pre-restore snapshot, read-back, refusal when collaborated or local bytes would be lost.
 */
import 'fake-indexeddb/auto';
import { strFromU8, strToU8 } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { ProjectOverwriteBlockedError } from '../db/snapshotFormatError';
import { disasterRestoreFromJyb, exportDatabaseToJyb } from './JybService';
import { exportProjectToJyt, overwriteProjectWithJyt } from './JytService';
import { sha256Hex } from './projectArchiveContainer';
import {
  listOverwriteSnapshots,
  previewOverwriteSnapshot,
  restoreOverwriteSnapshot,
} from './overwriteSnapshotRestoreService';

const flags = vi.hoisted(() => ({ collaborated: new Set<string>() }));
vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: (id: string) => !flags.collaborated.has(id),
  listCollaboratedIds: (ids: readonly string[]) =>
    [...new Set(ids)].filter((id) => flags.collaborated.has(id)),
}));

// node 环境（jsdom 的 Blob 与 fake-indexeddb 不兼容）；偏好用内存 localStorage
// Node environment (jsdom Blobs do not survive fake-indexeddb); in-memory localStorage for prefs
const memoryStorage = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
});
vi.stubGlobal('localStorage', memoryStorage);

const NOW = '2026-10-09T01:00:00.000Z';
const AUDIO = 'RIFF-field-audio-bytes';
const IMAGE = 'png-attachment-bytes';

async function blobText(blob: unknown): Promise<string> {
  expect(blob).toBeInstanceOf(Blob);
  return strFromU8(new Uint8Array(await (blob as Blob).arrayBuffer()));
}

async function putMedia(p: string, id: string, audio: string | null): Promise<void> {
  const blob = audio === null ? null : new Blob([audio], { type: 'audio/wav' });
  await db.media_items.put({
    id,
    textId: p,
    filename: `${id}.wav`,
    duration: 2,
    ...(blob ? { details: { audioBlob: blob } } : {}),
    isOfflineCached: blob !== null,
    timelineKind: 'acoustic',
    byteLocation: blob ? 'managed' : 'none',
    availability: blob ? 'available' : 'missing',
    ...(blob ? { contentSize: blob.size, contentSha256: await sha256Hex(strToU8(audio!)) } : {}),
    createdAt: NOW,
  });
}

async function seedProject(p: string): Promise<void> {
  const doc = `${p}-doc`;
  const layer = `${p}-layer`;
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
  await putMedia(p, `${p}-media`, AUDIO);
  await db.layer_units.put({
    id: `${p}-unit`,
    textId: p,
    mediaId: `${p}-media`,
    layerId: layer,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.lexeme_assets.put({
    id: `${p}-asset`,
    textId: p,
    kind: 'image',
    mimeType: 'image/png',
    displayName: 'photo.png',
    byteSize: IMAGE.length,
    refCount: 1,
    blob: new Blob([IMAGE], { type: 'image/png' }),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function clearAll(): Promise<void> {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
}

async function blockedErrorOf(run: () => Promise<unknown>): Promise<ProjectOverwriteBlockedError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ProjectOverwriteBlockedError) return error;
    throw error;
  }
  throw new Error('expected a blocked error');
}

/** 覆盖 pA：快照里是“Edited”，覆盖后标题回到“Project pA” | Overwrite pA; the snapshot holds "Edited" */
async function overwriteEditedProject(): Promise<number> {
  await seedProject('pA');
  const jyt = await exportProjectToJyt('pA');
  await db.texts.update('pA', { title: { default: 'Edited' } });
  const result = await overwriteProjectWithJyt(jyt, { targetProjectId: 'pA' });
  expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Project pA' });
  return result.snapshotSeq;
}

beforeEach(async () => {
  flags.collaborated.clear();
  localStorage.clear();
  await clearAll();
});

describe('recovery snapshots: project pre-overwrite snapshot', () => {
  it('lists the snapshot with time, project and size', async () => {
    const seq = await overwriteEditedProject();
    const entry = (await listOverwriteSnapshots()).find((s) => s.seq === seq);
    expect(entry).toMatchObject({
      scope: 'project',
      projectId: 'pA',
      projectTitle: { default: 'Edited' },
      packageKind: 'jyt',
      projectCount: 1,
    });
    expect(entry!.sizeBytes).toBeGreaterThan(100);
    expect(entry!.rowCount).toBeGreaterThan(3);
    expect(Number.isNaN(Date.parse(entry!.createdAt))).toBe(false);
  });

  it('previews, restores, keeps local bytes, snapshots the current state first and reads back', async () => {
    const seq = await overwriteEditedProject();
    const preview = await previewOverwriteSnapshot(seq);
    expect(preview).toMatchObject({ available: true, bytesAtRisk: [] });
    expect(preview.collections.find((c) => c.name === 'texts')).toMatchObject({
      snapshotRows: 1,
      currentRows: 1,
    });

    const result = await restoreOverwriteSnapshot(seq);
    expect(result).toMatchObject({ restoredSeq: seq, scope: 'project', projectId: 'pA' });
    expect(result.verifiedRows).toBeGreaterThan(3);
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Edited' });
    expect(await blobText((await db.media_items.get('pA-media'))?.details?.['audioBlob'])).toBe(
      AUDIO,
    );
    expect(await blobText((await db.lexeme_assets.get('pA-asset'))?.blob)).toBe(IMAGE);
    // 恢复前的状态也能再恢复回去 | The pre-restore state can itself be restored
    const pre = (await listOverwriteSnapshots()).find(
      (s) => s.seq === result.preRestoreSnapshotSeq,
    );
    expect(pre).toMatchObject({
      packageKind: 'snapshot-restore',
      projectTitle: { default: 'Project pA' },
    });
    await restoreOverwriteSnapshot(result.preRestoreSnapshotSeq);
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Project pA' });
  });

  it('refuses a collaborated project without writing anything', async () => {
    const seq = await overwriteEditedProject();
    flags.collaborated.add('pA');
    const before = (await listOverwriteSnapshots()).length;
    expect(await previewOverwriteSnapshot(seq)).toMatchObject({
      available: false,
      reason: 'collaborated',
    });
    const error = await blockedErrorOf(() => restoreOverwriteSnapshot(seq));
    expect(error.reason).toBe('not-allowed');
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Project pA' });
    expect(await listOverwriteSnapshots()).toHaveLength(before);
  });

  it('aborts when a local byte row is not in the snapshot (never loses local bytes)', async () => {
    const seq = await overwriteEditedProject();
    await putMedia('pA', 'pA-new-media', 'new-recording');
    const preview = await previewOverwriteSnapshot(seq);
    expect(preview).toMatchObject({ available: false, reason: 'local-bytes-would-be-lost' });
    expect(preview.bytesAtRisk).toEqual(['media_items:pA-new-media']);
    const error = await blockedErrorOf(() => restoreOverwriteSnapshot(seq));
    expect(error.reason).toBe('local-bytes-would-be-lost');
    expect(await blobText((await db.media_items.get('pA-new-media'))?.details?.['audioBlob'])).toBe(
      'new-recording',
    );
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Project pA' });
  });
});

describe('recovery snapshots: whole-database pre-restore snapshot', () => {
  it('restores the library and the recorded preferences', async () => {
    await seedProject('pA');
    localStorage.setItem('jieyu.locale', 'zh-CN');
    const archive = await exportDatabaseToJyb({ includeMedia: false });
    // 备份之后：改标题、换语言、加一条项目 AI 记忆 | After the backup: edits, locale, AI memory
    await db.texts.update('pA', { title: { default: 'Edited' } });
    await db.project_ai_memories.put({
      id: 'pA-mem',
      projectId: 'pA',
      fact: 'later-fact',
      confidence: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    localStorage.setItem('jieyu.locale', 'en-US');

    const restored = await disasterRestoreFromJyb(archive, { restorePreferences: true });
    expect(localStorage.getItem('jieyu.locale')).toBe('zh-CN');
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Project pA' });
    expect(await db.project_ai_memories.count()).toBe(0);

    const entry = (await listOverwriteSnapshots()).find((s) => s.seq === restored.snapshotSeq);
    expect(entry).toMatchObject({ scope: 'library', projectId: null, projectCount: 1 });
    const preview = await previewOverwriteSnapshot(restored.snapshotSeq);
    expect(preview.available).toBe(true);
    expect(preview.preferenceKeys).toEqual(['jieyu.locale']);

    const result = await restoreOverwriteSnapshot(restored.snapshotSeq);
    expect(result.restoredPreferenceKeys).toEqual(['jieyu.locale']);
    expect(localStorage.getItem('jieyu.locale')).toBe('en-US');
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Edited' });
    expect((await db.project_ai_memories.get('pA-mem'))?.fact).toBe('later-fact');
    expect(await blobText((await db.media_items.get('pA-media'))?.details?.['audioBlob'])).toBe(
      AUDIO,
    );
    // 恢复前的整库状态又存了一份，偏好也记下 | The state before is kept, preferences included
    const pre = (await listOverwriteSnapshots()).find(
      (s) => s.seq === result.preRestoreSnapshotSeq,
    );
    expect(pre).toMatchObject({ scope: 'library', packageKind: 'snapshot-restore' });
    expect((await previewOverwriteSnapshot(result.preRestoreSnapshotSeq)).preferenceKeys).toEqual([
      'jieyu.locale',
    ]);
  });
});
