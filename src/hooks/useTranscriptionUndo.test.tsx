// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import type {
  LayerLinkDocType,
  SpeakerDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import { useTranscriptionUndo } from './useTranscriptionUndo';

type StateRefHarness<T> = {
  ref: { current: T };
  setState: React.Dispatch<React.SetStateAction<T>>;
  get: () => T;
  setDirect: (next: T) => void;
};

function createStateRefHarness<T>(initial: T): StateRefHarness<T> {
  let value = initial;
  const ref = { current: value };
  const setState = vi.fn((next: React.SetStateAction<T>) => {
    value = typeof next === 'function'
      ? (next as (prev: T) => T)(value)
      : next;
    ref.current = value;
  });

  return {
    ref,
    setState,
    get: () => value,
    setDirect: (next: T) => {
      value = next;
      ref.current = next;
    },
  };
}

function makeUtterance(id: string, speakerId?: string, speaker?: string): UtteranceDocType {
  const now = new Date().toISOString();
  return {
    id,
    mediaId: 'm1',
    textId: 't1',
    startTime: 0,
    endTime: 1,
    transcription: { default: id },
    ...(speakerId !== undefined && { speakerId }),
    ...(speaker !== undefined && { speaker }),
    createdAt: now,
    updatedAt: now,
  } as UtteranceDocType;
}

function makeSpeaker(id: string, name: string): SpeakerDocType {
  const now = new Date().toISOString();
  return {
    id,
    projectId: 'proj-1',
    name,
    createdAt: now,
    updatedAt: now,
  } as SpeakerDocType;
}

function setupHarness(input: {
  utterances: UtteranceDocType[];
  speakers: SpeakerDocType[];
  syncToDbImpl?: (...args: unknown[]) => Promise<void>;
}) {
  const utterances = createStateRefHarness<UtteranceDocType[]>(input.utterances);
  const translations = createStateRefHarness<UtteranceTextDocType[]>([]);
  const layers = createStateRefHarness<LayerDocType[]>([]);
  const layerLinks = createStateRefHarness<LayerLinkDocType[]>([]);
  const speakers = createStateRefHarness<SpeakerDocType[]>(input.speakers);
  const dirtyRef = { current: false };
  const syncToDb = vi.fn(input.syncToDbImpl ?? (async () => undefined));
  const setSaveState = vi.fn();
  const scheduleRecoverySave = vi.fn();

  const hook = renderHook(() => useTranscriptionUndo({
    utterancesRef: utterances.ref,
    translationsRef: translations.ref,
    layersRef: layers.ref,
    layerLinksRef: layerLinks.ref,
    speakersRef: speakers.ref,
    dirtyRef,
    scheduleRecoverySave,
    syncToDb,
    setUtterances: utterances.setState,
    setTranslations: translations.setState,
    setLayers: layers.setState,
    setLayerLinks: layerLinks.setState,
    setSpeakers: speakers.setState,
    setSaveState,
  }));

  return {
    hook,
    syncToDb,
    setSaveState,
    utterances,
    speakers,
  };
}

describe('useTranscriptionUndo - speaker snapshot coverage', () => {
  it('rename speaker: undo/redo should restore both speaker collection and utterance speaker fields', async () => {
    const initialSpeaker = makeSpeaker('spk-1', 'Alice');
    const renamedSpeaker = makeSpeaker('spk-1', 'Alice Renamed');

    const harness = setupHarness({
      utterances: [makeUtterance('utt-1', 'spk-1', 'Alice')],
      speakers: [initialSpeaker],
    });

    await act(async () => {
      harness.hook.result.current.pushUndo('重命名说话人');
    });

    harness.speakers.setDirect([renamedSpeaker]);
    harness.utterances.setDirect([makeUtterance('utt-1', 'spk-1', 'Alice Renamed')]);

    await act(async () => {
      await harness.hook.result.current.undo();
    });

    expect(harness.speakers.get()[0]?.name).toBe('Alice');
    expect(harness.utterances.get()[0]?.speaker).toBe('Alice');
    expect(harness.syncToDb).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ id: 'utt-1', speaker: 'Alice' })]),
      expect.any(Array),
      expect.arrayContaining([expect.objectContaining({ id: 'spk-1', name: 'Alice' })]),
      expect.objectContaining({ conflictGuard: true }),
    );

    await act(async () => {
      await harness.hook.result.current.redo();
    });

    expect(harness.speakers.get()[0]?.name).toBe('Alice Renamed');
    expect(harness.utterances.get()[0]?.speaker).toBe('Alice Renamed');
    expect(harness.syncToDb).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([expect.objectContaining({ id: 'utt-1', speaker: 'Alice Renamed' })]),
      expect.any(Array),
      expect.arrayContaining([expect.objectContaining({ id: 'spk-1', name: 'Alice Renamed' })]),
      expect.objectContaining({ conflictGuard: true }),
    );
  });

  it('merge speakers: undo/redo should recover merged/deleted speaker set and assignments', async () => {
    const s1 = makeSpeaker('spk-1', 'Alice');
    const s2 = makeSpeaker('spk-2', 'Bob');

    const harness = setupHarness({
      utterances: [
        makeUtterance('utt-1', 'spk-1', 'Alice'),
        makeUtterance('utt-2', 'spk-2', 'Bob'),
      ],
      speakers: [s1, s2],
    });

    await act(async () => {
      harness.hook.result.current.pushUndo('合并说话人');
    });

    harness.speakers.setDirect([s1]);
    harness.utterances.setDirect([
      makeUtterance('utt-1', 'spk-1', 'Alice'),
      makeUtterance('utt-2', 'spk-1', 'Alice'),
    ]);

    await act(async () => {
      await harness.hook.result.current.undo();
    });

    expect(harness.speakers.get()).toHaveLength(2);
    expect(harness.utterances.get().find((u) => u.id === 'utt-2')?.speakerId).toBe('spk-2');
    expect(harness.syncToDb).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ id: 'utt-2', speakerId: 'spk-2' })]),
      expect.any(Array),
      expect.arrayContaining([expect.objectContaining({ id: 'spk-2', name: 'Bob' })]),
      expect.objectContaining({ conflictGuard: true }),
    );

    await act(async () => {
      await harness.hook.result.current.redo();
    });

    expect(harness.speakers.get()).toHaveLength(1);
    expect(harness.utterances.get().find((u) => u.id === 'utt-2')?.speakerId).toBe('spk-1');
    expect(harness.syncToDb).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([expect.objectContaining({ id: 'utt-2', speakerId: 'spk-1' })]),
      expect.any(Array),
      expect.arrayContaining([expect.objectContaining({ id: 'spk-1', name: 'Alice' })]),
      expect.objectContaining({ conflictGuard: true }),
    );
  });

  it('create and assign speaker: undo/redo should remove and restore created speaker entity', async () => {
    const createdSpeaker = makeSpeaker('spk-new', 'New Speaker');

    const harness = setupHarness({
      utterances: [makeUtterance('utt-1')],
      speakers: [],
    });

    await act(async () => {
      harness.hook.result.current.pushUndo('新建并分配说话人');
    });

    harness.speakers.setDirect([createdSpeaker]);
    harness.utterances.setDirect([makeUtterance('utt-1', 'spk-new', 'New Speaker')]);

    await act(async () => {
      await harness.hook.result.current.undo();
    });

    expect(harness.speakers.get()).toHaveLength(0);
    expect(harness.utterances.get()[0]?.speakerId).toBeUndefined();
    expect(harness.syncToDb).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ id: 'utt-1' })]),
      expect.any(Array),
      [],
      expect.objectContaining({ conflictGuard: true }),
    );

    await act(async () => {
      await harness.hook.result.current.redo();
    });

    expect(harness.speakers.get()).toHaveLength(1);
    expect(harness.speakers.get()[0]?.id).toBe('spk-new');
    expect(harness.utterances.get()[0]?.speakerId).toBe('spk-new');
    expect(harness.syncToDb).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([expect.objectContaining({ id: 'utt-1', speakerId: 'spk-new' })]),
      expect.any(Array),
      expect.arrayContaining([expect.objectContaining({ id: 'spk-new', name: 'New Speaker' })]),
      expect.objectContaining({ conflictGuard: true }),
    );
  });

  it('undo conflict: should keep ui state and show user-friendly conflict message', async () => {
    const conflict = new Error('utterances conflict: row utt-1 changed externally');
    conflict.name = 'TranscriptionPersistenceConflictError';

    const harness = setupHarness({
      utterances: [makeUtterance('utt-1', 'spk-1', 'Alice')],
      speakers: [makeSpeaker('spk-1', 'Alice')],
      syncToDbImpl: async () => {
        throw conflict;
      },
    });

    await act(async () => {
      harness.hook.result.current.pushUndo('测试冲突撤销');
    });

    harness.utterances.setDirect([makeUtterance('utt-1', 'spk-1', 'Alice Edited')]);

    await act(async () => {
      await harness.hook.result.current.undo();
    });

    expect(harness.utterances.get()[0]?.speaker).toBe('Alice Edited');
    expect(harness.setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '撤销失败：检测到数据已被其他操作更新，请刷新后重试',
      errorMeta: expect.objectContaining({ category: 'conflict', action: '撤销' }),
    }));
  });
});
