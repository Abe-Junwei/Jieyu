import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTurn } from './aiRuntimeV2TurnStore';
import { db } from './engine';
import type {
  AuditLogDocType,
  LayerUnitDocType,
  MediaItemDocType,
  SegmentMetaDocType,
  SourceRecordDocType,
} from './types';
import {
  dexieStoragePort,
  installStoragePort,
  recordingRemovalBlockReason,
  StorageReadbackError,
  type StoragePort,
} from './storagePort';
import { describeStoragePortContract } from './storagePortContract';

const NOW = '2026-10-15T00:00:00.000Z';

function emptyRecording(id: string, filename: string): MediaItemDocType {
  return {
    id,
    textId: 'text-a',
    filename,
    duration: 10,
    isOfflineCached: false,
    createdAt: NOW,
    timelineKind: 'acoustic',
    byteLocation: 'none',
    availability: 'missing',
  };
}

async function clearDb() {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
}

describeStoragePortContract('dexie', () => dexieStoragePort, clearDb);

describe('dexie storage port', () => {
  beforeEach(clearDb);
  afterEach(() => {
    vi.restoreAllMocks();
    installStoragePort(dexieStoragePort);
  });

  it('fingerprints a segment with its content rows', async () => {
    await db.layer_units.put({
      id: 'unit-1',
      textId: 'text-a',
      layerId: 'layer-a',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerUnitDocType);
    await db.layer_unit_contents.put({
      id: 'content-1',
      unitId: 'unit-1',
      text: 'hello',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(dexieStoragePort.fingerprintTarget('unit-1')).resolves.toBe(
      `layer_units:${NOW}|content-1@${NOW}`,
    );
  });

  it('keeps the written turn when read-back fails', async () => {
    vi.spyOn(db.ai_runtime_v2_turns, 'get').mockResolvedValueOnce(undefined);
    await expect(
      dexieStoragePort.turns.putTurn({ conversationId: 'c-miss', createdAt: 1, expiresAt: 50 }),
    ).rejects.toBeInstanceOf(StorageReadbackError);
    vi.restoreAllMocks();
    await expect(db.ai_runtime_v2_turns.get('c-miss')).resolves.toMatchObject({
      conversationId: 'c-miss',
    });
  });

  it('reports a missing audit row after insert as read-back failure', async () => {
    const row: AuditLogDocType = {
      id: 'audit-miss',
      collection: 'ai_messages',
      documentId: 'doc-1',
      action: 'update',
      source: 'ai',
      timestamp: NOW,
    };
    vi.spyOn(db.audit_logs, 'get').mockResolvedValueOnce(undefined);
    await expect(dexieStoragePort.audit.insertAuditLog(row)).rejects.toBeInstanceOf(
      StorageReadbackError,
    );
    vi.restoreAllMocks();
    await expect(db.audit_logs.get('audit-miss')).resolves.toMatchObject({ id: 'audit-miss' });
  });

  it('commits a regex split and reads the rows back', async () => {
    await dexieStoragePort.commitRegexSplit({
      anchors: [{ id: 'anc-1', mediaId: 'm1', time: 1, createdAt: NOW }],
      units: [
        {
          id: 'u1',
          textId: 'text-a',
          mediaId: 'm1',
          unitType: 'unit',
          startTime: 0,
          endTime: 1,
          createdAt: NOW,
          updatedAt: NOW,
        } as LayerUnitDocType,
      ],
      contents: [
        {
          id: 'c1',
          textId: 'text-a',
          unitId: 'u1',
          text: 'left',
          contentRole: 'primary_text',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    await expect(db.layer_units.get('u1')).resolves.toMatchObject({ endTime: 1 });
    await expect(db.layer_unit_contents.get('c1')).resolves.toMatchObject({ text: 'left' });
    await expect(db.anchors.get('anc-1')).resolves.toMatchObject({ time: 1 });
  });

  it('writes nothing when a regex split mixes two projects', async () => {
    await expect(
      dexieStoragePort.commitRegexSplit({
        anchors: [],
        units: [
          {
            id: 'u1',
            textId: 'a',
            startTime: 0,
            endTime: 1,
            createdAt: NOW,
            updatedAt: NOW,
          } as LayerUnitDocType,
          {
            id: 'u2',
            textId: 'b',
            startTime: 0,
            endTime: 1,
            createdAt: NOW,
            updatedAt: NOW,
          } as LayerUnitDocType,
        ],
        contents: [],
      }),
    ).rejects.toThrow(/belongs to project/);
    await expect(db.layer_units.get('u1')).resolves.toBeUndefined();
  });

  it('writes nothing when a regex split overwrites a row stored for another project', async () => {
    await db.layer_units.put({
      id: 'u-other',
      textId: 'project-b',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerUnitDocType);
    await expect(
      dexieStoragePort.commitRegexSplit({
        anchors: [{ id: 'anc-x', mediaId: 'm1', time: 1, createdAt: NOW }],
        units: [
          {
            id: 'u-other',
            textId: 'project-a',
            startTime: 0,
            endTime: 0.5,
            createdAt: NOW,
            updatedAt: '2026-10-16T00:00:00.000Z',
          } as LayerUnitDocType,
        ],
        contents: [],
      }),
    ).rejects.toThrow(/belongs to project/);
    await expect(db.layer_units.get('u-other')).resolves.toMatchObject({
      textId: 'project-b',
      endTime: 1,
    });
    await expect(db.anchors.get('anc-x')).resolves.toBeUndefined();
  });

  it('moves the split unit segments to its new bounds in the same commit', async () => {
    await db.layer_units.bulkPut([
      {
        id: 'seg-1',
        textId: 'text-a',
        unitType: 'segment',
        parentUnitId: 'u1',
        startTime: 0,
        endTime: 3,
        createdAt: NOW,
        updatedAt: NOW,
      } as LayerUnitDocType,
      {
        id: 'seg-other',
        textId: 'text-a',
        unitType: 'segment',
        parentUnitId: 'u2',
        startTime: 3,
        endTime: 4,
        createdAt: NOW,
        updatedAt: NOW,
      } as LayerUnitDocType,
    ]);
    const later = '2026-10-16T00:00:00.000Z';
    const { resizedSegmentIds } = await dexieStoragePort.commitRegexSplit({
      anchors: [],
      units: [
        {
          id: 'u1',
          textId: 'text-a',
          unitType: 'unit',
          startTime: 0,
          endTime: 1.2,
          createdAt: NOW,
          updatedAt: later,
        } as LayerUnitDocType,
      ],
      contents: [],
      resizeSegmentsOf: ['u1'],
    });
    expect(resizedSegmentIds).toEqual(['seg-1']);
    await expect(db.layer_units.get('seg-1')).resolves.toMatchObject({
      startTime: 0,
      endTime: 1.2,
      updatedAt: later,
    });
    await expect(db.layer_units.get('seg-other')).resolves.toMatchObject({ endTime: 4 });
  });

  it('keeps the regex split when read-back fails', async () => {
    vi.spyOn(db.layer_units, 'get').mockResolvedValueOnce(undefined);
    await expect(
      dexieStoragePort.commitRegexSplit({
        anchors: [],
        units: [
          {
            id: 'u-miss',
            textId: 'text-a',
            startTime: 0,
            endTime: 1,
            createdAt: NOW,
            updatedAt: NOW,
          } as LayerUnitDocType,
        ],
        contents: [],
      }),
    ).rejects.toBeInstanceOf(StorageReadbackError);
    vi.restoreAllMocks();
    await expect(db.layer_units.get('u-miss')).resolves.toMatchObject({ id: 'u-miss' });
  });

  it('removes one empty recording, unbinds its source, and leaves the same-named sibling', async () => {
    const blob = new Blob(['wav']);
    await db.texts.put({
      id: 'text-a',
      title: { default: 'text-a' },
      metadata: { timelineMode: 'media', logicalDurationSec: 10, timebaseLabel: 'logical-second' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.media_items.bulkPut([
      emptyRecording('media-empty', 'same.wav'),
      {
        ...emptyRecording('media-sibling', 'same.wav'),
        byteLocation: 'managed',
        availability: 'available',
        contentSize: blob.size,
        details: { audioBlob: blob },
      },
    ] as MediaItemDocType[]);
    await db.source_records.put({
      id: 'src-1',
      textId: 'text-a',
      originalName: 'notes.eaf',
      displayName: 'notes.eaf',
      format: 'eaf',
      importedAt: NOW,
      importBatchId: 'batch-1',
      storedBytes: false,
      mediaId: 'media-empty',
      updatedAt: NOW,
    } as SourceRecordDocType);
    await db.segment_meta.put({
      id: 'meta-empty',
      segmentId: 'seg-1',
      textId: 'text-a',
      mediaId: 'media-empty',
      layerId: 'layer-1',
      startTime: 0,
      endTime: 1,
      text: '',
      normalizedText: '',
      hasText: false,
      createdAt: NOW,
      updatedAt: NOW,
    } as SegmentMetaDocType);

    await expect(dexieStoragePort.removeEmptyRecording('media-empty')).resolves.toEqual({
      unboundSourceIds: ['src-1'],
    });

    await expect(db.media_items.get('media-empty')).resolves.toBeUndefined();
    await expect(db.media_items.get('media-sibling')).resolves.toMatchObject({
      id: 'media-sibling',
    });
    await expect(db.source_records.get('src-1')).resolves.toMatchObject({
      id: 'src-1',
      displayName: 'notes.eaf',
    });
    expect((await db.source_records.get('src-1'))?.mediaId).toBeUndefined();
    await expect(db.segment_meta.get('meta-empty')).resolves.toBeUndefined();
  });

  it('refuses a recording that still has playable bytes', async () => {
    const blob = new Blob(['wav']);
    await db.media_items.put({
      ...emptyRecording('media-bytes', 'speech.wav'),
      byteLocation: 'managed',
      availability: 'available',
      contentSize: blob.size,
      details: { audioBlob: blob },
    } as MediaItemDocType);
    await expect(dexieStoragePort.removeEmptyRecording('media-bytes')).rejects.toSatisfy(
      (error: unknown) => recordingRemovalBlockReason(error) === 'has-bytes',
    );
    await expect(db.media_items.get('media-bytes')).resolves.toMatchObject({ id: 'media-bytes' });
  });

  it('removes a byteless card and keeps its segments and anchors in the project', async () => {
    await db.media_items.put(emptyRecording('media-unit', 'speech.wav'));
    await db.layer_units.put({
      id: 'unit-1',
      textId: 'text-a',
      mediaId: 'media-unit',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerUnitDocType);
    await db.anchors.put({ id: 'anchor-1', mediaId: 'media-unit', time: 0, createdAt: NOW });

    await expect(dexieStoragePort.removeEmptyRecording('media-unit')).resolves.toEqual({
      unboundSourceIds: [],
    });
    await expect(db.media_items.get('media-unit')).resolves.toBeUndefined();
    await expect(db.layer_units.get('unit-1')).resolves.toMatchObject({
      id: 'unit-1',
      mediaId: '__unknown_media__',
    });
    await expect(db.anchors.get('anchor-1')).resolves.toMatchObject({
      id: 'anchor-1',
      mediaId: '__unknown_media__',
    });
  });

  it('removes a row that still claims managed bytes when the blob is empty', async () => {
    await db.media_items.put({
      ...emptyRecording('media-stale', 'speech.wav'),
      byteLocation: 'managed',
      availability: 'available',
      contentSize: 0,
      contentSha256: 'ab'.repeat(32),
      details: { audioBlob: new Blob([]) },
    } as MediaItemDocType);
    await expect(dexieStoragePort.removeEmptyRecording('media-stale')).resolves.toEqual({
      unboundSourceIds: [],
    });
    await expect(db.media_items.get('media-stale')).resolves.toBeUndefined();
  });

  it('routes the turn store through the installed implementation', async () => {
    const fake: StoragePort = {
      ...dexieStoragePort,
      turns: { ...dexieStoragePort.turns, getTurn: async <T>() => ({ from: 'fake' }) as T },
    };
    installStoragePort(fake);
    await expect(getTurn('any')).resolves.toEqual({ from: 'fake' });
  });
});
