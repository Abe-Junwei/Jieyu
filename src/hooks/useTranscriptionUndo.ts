import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { LayerLinkDocType, SpeakerDocType, LayerDocType, UtteranceDocType, UtteranceTextDocType, LayerSegmentDocType, LayerSegmentContentDocType, SegmentLinkDocType } from '../db';
import { CommandHistory, type ReversibleCommand } from '../services/CommandService';
import type { SaveState } from './transcriptionTypes';
import type { TimingUndoState } from '../utils/selectionUtils';
import { createLogger } from '../observability/logger';
import { reportActionError } from '../utils/actionErrorReporter';

const log = createLogger('useTranscriptionUndo');

type UndoEntry = {
  label: string;
  utterances: UtteranceDocType[];
  translations: UtteranceTextDocType[];
  layers?: LayerDocType[];
  layerSegments?: LayerSegmentDocType[];
  layerSegmentContents?: LayerSegmentContentDocType[];
  segmentLinks?: SegmentLinkDocType[];
  layerLinks?: LayerLinkDocType[];
  speakers?: SpeakerDocType[];
};

type Params = {
  utterancesRef: MutableRefObject<UtteranceDocType[]>;
  translationsRef: MutableRefObject<UtteranceTextDocType[]>;
  layersRef: MutableRefObject<LayerDocType[]>;
  layerLinksRef: MutableRefObject<LayerLinkDocType[]>;
  speakersRef: MutableRefObject<SpeakerDocType[]>;
  dirtyRef: MutableRefObject<boolean>;
  scheduleRecoverySave: () => void;
  syncToDb: (
    targetUtterances: UtteranceDocType[],
    targetTranslations: UtteranceTextDocType[],
    targetSpeakers: SpeakerDocType[],
    options?: { conflictGuard?: boolean },
  ) => Promise<void>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
  setLayers: React.Dispatch<React.SetStateAction<LayerDocType[]>>;
  setLayerLinks: React.Dispatch<React.SetStateAction<LayerLinkDocType[]>>;
  setSpeakers: React.Dispatch<React.SetStateAction<SpeakerDocType[]>>;
  setSaveState: (s: SaveState) => void;
};

/** 独立边界层 segment 快照/恢复回调 | Segment snapshot/restore callbacks for independent boundary layers */
export type SegmentUndoCallbacks = {
  snapshotLayerSegments: () => { segments: LayerSegmentDocType[]; contents: LayerSegmentContentDocType[]; links: SegmentLinkDocType[] };
  restoreLayerSegments: (segments: LayerSegmentDocType[], contents: LayerSegmentContentDocType[], links: SegmentLinkDocType[]) => Promise<void>;
};

export function useTranscriptionUndo({
  utterancesRef,
  translationsRef,
  layersRef,
  layerLinksRef,
  speakersRef,
  dirtyRef,
  scheduleRecoverySave,
  syncToDb,
  setUtterances,
  setTranslations,
  setLayers,
  setLayerLinks,
  setSpeakers,
  setSaveState,
}: Params) {
  const MAX_UNDO = 50;
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const commandHistoryRef = useRef(new CommandHistory(MAX_UNDO));
  const [_undoRedoVersion, setUndoRedoVersion] = useState(0);
  const timingUndoRef = useRef<TimingUndoState | null>(null);
  const timingGestureRef = useRef<{ active: boolean; utteranceId: string | null }>({ active: false, utteranceId: null });
  // 外部注入：Orchestrator 加载 segment 数据后填充 | External injection: Orchestrator populates after segment hooks are ready
  const segmentUndoRef = useRef<SegmentUndoCallbacks | null>(null);

  const pushUndo = useCallback((label: string) => {
    dirtyRef.current = true;
    const segSnapshot = segmentUndoRef.current?.snapshotLayerSegments();
    undoStackRef.current.push({
      label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
      layers: [...layersRef.current],
      layerLinks: [...layerLinksRef.current],
      speakers: [...speakersRef.current],
      ...(segSnapshot ? { layerSegments: segSnapshot.segments, layerSegmentContents: segSnapshot.contents, segmentLinks: segSnapshot.links } : {}),
    });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoRedoVersion((v) => v + 1);
    scheduleRecoverySave();
  }, [dirtyRef, layerLinksRef, layersRef, scheduleRecoverySave, segmentUndoRef, speakersRef, translationsRef, utterancesRef]);

  const beginTimingGesture = useCallback((utteranceId: string) => {
    const current = timingGestureRef.current;
    if (current.active && current.utteranceId === utteranceId) return;
    timingGestureRef.current = { active: true, utteranceId };
    pushUndo('调整时间区间');
  }, [pushUndo]);

  const endTimingGesture = useCallback((utteranceId?: string) => {
    const current = timingGestureRef.current;
    if (!current.active) return;
    if (utteranceId && current.utteranceId && utteranceId !== current.utteranceId) return;
    timingGestureRef.current = { active: false, utteranceId: null };
  }, []);

  const executeCommand = useCallback(async (cmd: ReversibleCommand) => {
    pushUndo(cmd.label);
    try {
      await cmd.execute();
    } catch (error) {
      // 执行失败，回退 undo 快照 | Execute failed, roll back undo snapshot
      undoStackRef.current.pop();
      throw error;
    }
    try {
      await commandHistoryRef.current.execute({
        label: cmd.label,
        execute: async () => {
          // Snapshot redo is the source of truth; command history tracks labels/undoability.
        },
        undo: async () => {
          await cmd.undo();
        },
      });
    } catch (error) {
      // commandHistory 登记失败但操作已完成，undo 快照仍有效 | commandHistory tracking failed but op completed, undo snapshot still valid
      log.error('Failed to register command in history', { label: cmd.label, error: error instanceof Error ? error.message : String(error) });
    }
  }, [pushUndo]);

  const undo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    const segSnapshot = segmentUndoRef.current?.snapshotLayerSegments();
    const redoEntry: UndoEntry = {
      label: entry.label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
      layers: [...layersRef.current],
      layerLinks: [...layerLinksRef.current],
      speakers: [...speakersRef.current],
      ...(segSnapshot ? { layerSegments: segSnapshot.segments, layerSegmentContents: segSnapshot.contents, segmentLinks: segSnapshot.links } : {}),
    };
    redoStackRef.current.push(redoEntry);
    try {
      await syncToDb(entry.utterances, entry.translations, entry.speakers ?? [], { conflictGuard: true });
      if (entry.layerSegments && segmentUndoRef.current) {
        await segmentUndoRef.current.restoreLayerSegments(entry.layerSegments, entry.layerSegmentContents ?? [], entry.segmentLinks ?? []);
      }
      setUtterances(entry.utterances);
      setTranslations(entry.translations);
      if (entry.layers) setLayers(entry.layers);
      if (entry.layerLinks) setLayerLinks(entry.layerLinks);
      setSpeakers(entry.speakers ?? []);
      await commandHistoryRef.current.undo();
      setUndoRedoVersion((v) => v + 1);
      setSaveState({ kind: 'done', message: `已撤销: ${entry.label}` });
    } catch (error) {
      // 回滚栈状态，避免“UI看起来已撤销但数据库未回写成功” | Rollback stack mutation when persistence failed.
      redoStackRef.current.pop();
      undoStackRef.current.push(entry);
      log.error('Undo failed during persistence', {
        label: entry.label,
        error: error instanceof Error ? error.message : String(error),
      });
      reportActionError({
        actionLabel: '撤销',
        error,
        conflictNames: ['TranscriptionPersistenceConflictError'],
          conflictI18nKey: 'transcription.error.conflict.undo',
          fallbackI18nKey: 'transcription.error.action.undoFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    }
    }, [layerLinksRef, layersRef, segmentUndoRef, setLayerLinks, setLayers, setSaveState, setSpeakers, setTranslations, setUtterances, speakersRef, syncToDb, translationsRef, utterancesRef]);

  const undoToHistoryIndex = useCallback(async (historyIndex: number) => {
    const previousUndoStack = [...undoStackRef.current];
    const previousRedoStack = [...redoStackRef.current];
    const stack = previousUndoStack;
    if (historyIndex < 0 || historyIndex >= stack.length) return;

    const targetStackIndex = stack.length - 1 - historyIndex;
    const targetEntry = stack[targetStackIndex];
    if (!targetEntry) return;

    const redoAdds: UndoEntry[] = [];
    // 首次快照为当前活跃状态；后续取栈中上一条条目的状态 | First snapshot is live state; subsequent ones use the entry above
    const currentSegSnapshot = segmentUndoRef.current?.snapshotLayerSegments();
    for (let j = stack.length - 1; j >= targetStackIndex; j -= 1) {
      const entry = stack[j];
      if (!entry) continue;
      if (j === stack.length - 1) {
        // 第一步：捕获当前活跃状态 | First step: capture current live state
        redoAdds.push({
          label: entry.label,
          utterances: [...utterancesRef.current],
          translations: [...translationsRef.current],
          layers: [...layersRef.current],
          layerLinks: [...layerLinksRef.current],
          speakers: [...speakersRef.current],
          ...(currentSegSnapshot ? { layerSegments: currentSegSnapshot.segments, layerSegmentContents: currentSegSnapshot.contents, segmentLinks: currentSegSnapshot.links } : {}),
        });
      } else {
        // 后续步骤：从栈中上一条条目获取中间状态 | Subsequent: intermediate state from stack entry above
        const above = stack[j + 1]!;
        redoAdds.push({
          label: entry.label,
          utterances: [...above.utterances],
          translations: [...above.translations],
          layers: [...(above.layers ?? layersRef.current)],
          layerLinks: [...(above.layerLinks ?? layerLinksRef.current)],
          speakers: [...(above.speakers ?? speakersRef.current)],
          ...(above.layerSegments ? { layerSegments: above.layerSegments, layerSegmentContents: above.layerSegmentContents ?? [], segmentLinks: above.segmentLinks ?? [] } : {}),
        });
      }
    }

    redoStackRef.current = [...redoStackRef.current, ...redoAdds];
    undoStackRef.current = stack.slice(0, targetStackIndex);

    try {
      await syncToDb(targetEntry.utterances, targetEntry.translations, targetEntry.speakers ?? [], { conflictGuard: true });
      if (targetEntry.layerSegments && segmentUndoRef.current) {
        await segmentUndoRef.current.restoreLayerSegments(targetEntry.layerSegments, targetEntry.layerSegmentContents ?? [], targetEntry.segmentLinks ?? []);
      }
      setUtterances(targetEntry.utterances);
      setTranslations(targetEntry.translations);
      if (targetEntry.layers) setLayers(targetEntry.layers);
      if (targetEntry.layerLinks) setLayerLinks(targetEntry.layerLinks);
      setSpeakers(targetEntry.speakers ?? []);
      await commandHistoryRef.current.undoToIndex(historyIndex);
      setUndoRedoVersion((v) => v + 1);

      const steps = stack.length - targetStackIndex;
      setSaveState({ kind: 'done', message: `已撤销 ${steps} 步: ${targetEntry.label}` });
    } catch (error) {
      // 回滚栈状态，避免批量撤销失败后历史栈损坏 | Roll back stacks when batch undo persistence fails.
      undoStackRef.current = previousUndoStack;
      redoStackRef.current = previousRedoStack;
      log.error('Undo to history index failed during persistence', {
        historyIndex,
        label: targetEntry.label,
        error: error instanceof Error ? error.message : String(error),
      });
      reportActionError({
        actionLabel: '撤销',
        error,
        conflictNames: ['TranscriptionPersistenceConflictError'],
          conflictI18nKey: 'transcription.error.conflict.undo',
          fallbackI18nKey: 'transcription.error.action.undoFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    }
  }, [layerLinksRef, layersRef, segmentUndoRef, setLayerLinks, setLayers, setSaveState, setSpeakers, setTranslations, setUtterances, speakersRef, syncToDb, translationsRef, utterancesRef]);

  const redo = useCallback(async () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    const segSnapshot = segmentUndoRef.current?.snapshotLayerSegments();
    const undoEntry: UndoEntry = {
      label: entry.label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
      layers: [...layersRef.current],
      layerLinks: [...layerLinksRef.current],
      speakers: [...speakersRef.current],
      ...(segSnapshot ? { layerSegments: segSnapshot.segments, layerSegmentContents: segSnapshot.contents, segmentLinks: segSnapshot.links } : {}),
    };
    undoStackRef.current.push(undoEntry);
    try {
      await syncToDb(entry.utterances, entry.translations, entry.speakers ?? [], { conflictGuard: true });
      if (entry.layerSegments && segmentUndoRef.current) {
        await segmentUndoRef.current.restoreLayerSegments(entry.layerSegments, entry.layerSegmentContents ?? [], entry.segmentLinks ?? []);
      }
      setUtterances(entry.utterances);
      setTranslations(entry.translations);
      if (entry.layers) setLayers(entry.layers);
      if (entry.layerLinks) setLayerLinks(entry.layerLinks);
      setSpeakers(entry.speakers ?? []);
      await commandHistoryRef.current.redo();
      setUndoRedoVersion((v) => v + 1);
      setSaveState({ kind: 'done', message: `已重做: ${entry.label}` });
    } catch (error) {
      // 回滚栈状态，避免“UI看起来已重做但数据库未回写成功” | Rollback stack mutation when persistence failed.
      undoStackRef.current.pop();
      redoStackRef.current.push(entry);
      log.error('Redo failed during persistence', {
        label: entry.label,
        error: error instanceof Error ? error.message : String(error),
      });
      reportActionError({
        actionLabel: '重做',
        error,
        conflictNames: ['TranscriptionPersistenceConflictError'],
          conflictI18nKey: 'transcription.error.conflict.redo',
          fallbackI18nKey: 'transcription.error.action.redoFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    }
    }, [layerLinksRef, layersRef, segmentUndoRef, setLayerLinks, setLayers, setSaveState, setSpeakers, setTranslations, setUtterances, speakersRef, syncToDb, translationsRef, utterancesRef]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  const undoLabel = undoStackRef.current[undoStackRef.current.length - 1]?.label ?? '';
  const undoHistory = undoStackRef.current.slice(-15).map((item) => item.label).reverse();

  return {
    segmentUndoRef,
    timingUndoRef,
    timingGestureRef,
    pushUndo,
    executeCommand,
    beginTimingGesture,
    endTimingGesture,
    undo,
    undoToHistoryIndex,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,
  };
}
