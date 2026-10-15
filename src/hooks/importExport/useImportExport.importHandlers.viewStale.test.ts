// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { t } from '../../i18n';
import {
  ensureDefaultAnnotationDocument,
  runInNewAnnotationDocument,
} from '../../services/annotationDocumentService';
import * as repairedConstraintModule from '../../services/persistRepairedLayerConstraints';
import type { LoadTranscriptionSnapshot } from '../transcription/workspaceSnapshotLoad';
import { createImportExportImportHandlers } from './useImportExport.importHandlers';
import type { SaveState } from '../transcription/transcriptionTypes';

const textId = 'text-import-view-stale';
const NOW = '2026-10-15T00:00:00.000Z';

const EAF = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="test" DATE="2026-01-01" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="speech.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./speech.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="phrase" LINGUISTIC_TYPE_REF="default-lt" PARTICIPANT="Ada">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true"/>
</ANNOTATION_DOCUMENT>`;

function eafFile(): File {
  return new File([EAF], 'speech.eaf', { type: 'application/xml' });
}

function handlers(
  loadSnapshot: LoadTranscriptionSnapshot,
  setSaveState: Dispatch<SetStateAction<SaveState>>,
) {
  return createImportExportImportHandlers({
    activeTextId: textId,
    getActiveTextId: async () => textId,
    selectedUnitMedia: undefined,
    layers: [],
    defaultTranscriptionLayerId: undefined,
    loadSnapshot,
    setSaveState,
    locale: 'zh-CN',
    normalizeSpeakerLookupKey: (value) => value?.trim().toLowerCase() ?? '',
  });
}

async function contentText(): Promise<string> {
  const rows = await db.layer_unit_contents.where('textId').equals(textId).toArray();
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.put({
    id: textId,
    title: { default: 'Import' },
    createdAt: NOW,
    updatedAt: NOW,
  });
});

describe('annotation import keeps a written document when the view fails to refresh', () => {
  it('keeps the new document and its rows when the snapshot rejects after the write', async () => {
    const previous = await ensureDefaultAnnotationDocument(textId);
    const states: SaveState[] = [];
    let reportedError = false;
    const setSaveState: Dispatch<SetStateAction<SaveState>> = (next) => {
      if (typeof next === 'function') return;
      if (next.kind === 'error') reportedError = true;
      states.push(next);
    };
    const loadSnapshot = vi.fn<LoadTranscriptionSnapshot>(async () => {
      throw new Error('snapshot down');
    });
    const { handleImportFile } = handlers(loadSnapshot, setSaveState);
    const outcome = await runInNewAnnotationDocument(
      textId,
      () => handleImportFile(eafFile()),
      () => reportedError,
    );

    expect(outcome.kept).toBe(true);
    expect(reportedError).toBe(false);
    expect((await db.texts.get(textId))?.defaultDocumentId).not.toBe(previous);
    expect(await db.layer_units.where('textId').equals(textId).count()).toBeGreaterThan(0);
    expect(await contentText()).toContain('hello');
    expect(states.some((state) => state.kind === 'error')).toBe(false);
    expect(states.at(-1)).toMatchObject({
      kind: 'viewStale',
      message: t('zh-CN', 'transcription.importExport.writtenViewStale'),
      actionLabel: t('zh-CN', 'transcription.toast.segmentViewRetry'),
    });

    loadSnapshot.mockResolvedValueOnce(undefined);
    const stale = states.at(-1);
    if (stale?.kind === 'viewStale') stale.onAction();
    await vi.waitFor(() => {
      expect(states.at(-1)).toEqual({ kind: 'idle' });
    });
  });

  it('keeps the new document when post-commit constraint repair throws', async () => {
    const previous = await ensureDefaultAnnotationDocument(textId);
    const states: SaveState[] = [];
    let reportedError = false;
    const setSaveState: Dispatch<SetStateAction<SaveState>> = (next) => {
      if (typeof next === 'function') return;
      if (next.kind === 'error') reportedError = true;
      states.push(next);
    };
    const repairSpy = vi
      .spyOn(repairedConstraintModule, 'persistRepairedLayerConstraints')
      .mockRejectedValueOnce(new Error('repair failed'));
    const loadSnapshot = vi.fn<LoadTranscriptionSnapshot>(async () => undefined);
    const { handleImportFile } = handlers(loadSnapshot, setSaveState);
    try {
      const outcome = await runInNewAnnotationDocument(
        textId,
        () => handleImportFile(eafFile()),
        () => reportedError,
      );

      expect(outcome.kept).toBe(true);
      expect(reportedError).toBe(false);
      expect((await db.texts.get(textId))?.defaultDocumentId).not.toBe(previous);
      expect(await db.layer_units.where('textId').equals(textId).count()).toBeGreaterThan(0);
      expect(await contentText()).toContain('hello');
      expect(loadSnapshot).toHaveBeenCalledWith(textId);
      expect(states.at(-1)).toMatchObject({
        kind: 'done',
        message: expect.stringContaining(
          t('zh-CN', 'transcription.importExport.importDone.followUpIncomplete'),
        ),
      });
    } finally {
      repairSpy.mockRestore();
    }
  });

  it('keeps the current document when the snapshot rejects after the write', async () => {
    const current = await ensureDefaultAnnotationDocument(textId);
    const states: SaveState[] = [];
    const loadSnapshot = vi.fn<LoadTranscriptionSnapshot>(async () => {
      throw new Error('snapshot down');
    });
    const { handleImportFile } = handlers(loadSnapshot, (next) => {
      if (typeof next === 'function') return;
      states.push(next);
    });
    await handleImportFile(eafFile());

    expect((await db.texts.get(textId))?.defaultDocumentId).toBe(current);
    expect(await db.layer_units.where('textId').equals(textId).count()).toBeGreaterThan(0);
    expect(await contentText()).toContain('hello');
    expect(states.some((state) => state.kind === 'error')).toBe(false);
    expect(states.at(-1)?.kind).toBe('viewStale');
  });

  it('still discards a new document when the import itself fails', async () => {
    const previous = await ensureDefaultAnnotationDocument(textId);
    let reportedError = false;
    const setSaveState: Dispatch<SetStateAction<SaveState>> = (next) => {
      if (typeof next === 'function') return;
      if (next.kind === 'error') reportedError = true;
    };
    const { handleImportFile } = handlers(async () => undefined, setSaveState);
    const outcome = await runInNewAnnotationDocument(
      textId,
      () => handleImportFile(new File(['nope'], 'notes.docx')),
      () => reportedError,
    );

    expect(outcome.kept).toBe(false);
    expect(reportedError).toBe(true);
    expect((await db.texts.get(textId))?.defaultDocumentId).toBe(previous);
    expect(await db.layer_units.where('textId').equals(textId).count()).toBe(0);
  });
});
