import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { LayerLinkDocType, SpeakerDocType, TranslationLayerDocType, UtteranceDocType, UtteranceTextDocType } from '../../db';
import { CommandHistory, type ReversibleCommand } from '../../services/CommandService';
import type { SaveState } from './transcriptionTypes';
import type { TimingUndoState } from '../utils/selectionUtils';

type UndoEntry = {
  label: string;
  utterances: UtteranceDocType[];
  translations: UtteranceTextDocType[];
  layers?: TranslationLayerDocType[];
  layerLinks?: LayerLinkDocType[];
  speakers?: SpeakerDocType[];
};

type Params = {
  utterancesRef: MutableRefObject<UtteranceDocType[]>;
  translationsRef: MutableRefObject<UtteranceTextDocType[]>;
  layersRef: MutableRefObject<TranslationLayerDocType[]>;
  layerLinksRef: MutableRefObject<LayerLinkDocType[]>;
  speakersRef: MutableRefObject<SpeakerDocType[]>;
  dirtyRef: MutableRefObject<boolean>;
  scheduleRecoverySave: () => void;
  syncToDb: (
    targetUtterances: UtteranceDocType[],
    targetTranslations: UtteranceTextDocType[],
    targetSpeakers: SpeakerDocType[],
  ) => Promise<void>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
  setLayers: React.Dispatch<React.SetStateAction<TranslationLayerDocType[]>>;
  setLayerLinks: React.Dispatch<React.SetStateAction<LayerLinkDocType[]>>;
  setSpeakers: React.Dispatch<React.SetStateAction<SpeakerDocType[]>>;
  setSaveState: (s: SaveState) => void;
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

  const pushUndo = useCallback((label: string) => {
    dirtyRef.current = true;
    undoStackRef.current.push({
      label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
      layers: [...layersRef.current],
      layerLinks: [...layerLinksRef.current],
        speakers: [...speakersRef.current],
    });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoRedoVersion((v) => v + 1);
    scheduleRecoverySave();
  }, [dirtyRef, layerLinksRef, layersRef, scheduleRecoverySave, speakersRef, translationsRef, utterancesRef]);

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
    await cmd.execute();
    await commandHistoryRef.current.execute({
      label: cmd.label,
      execute: async () => {
        // Snapshot redo is the source of truth; command history tracks labels/undoability.
      },
      undo: async () => {
        await cmd.undo();
      },
    });
  }, [pushUndo]);

  const undo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    redoStackRef.current.push({
      label: entry.label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
      layers: [...layersRef.current],
      layerLinks: [...layerLinksRef.current],
        speakers: [...speakersRef.current],
    });
      await syncToDb(entry.utterances, entry.translations, entry.speakers ?? []);
    setUtterances(entry.utterances);
    setTranslations(entry.translations);
    if (entry.layers) setLayers(entry.layers);
    if (entry.layerLinks) setLayerLinks(entry.layerLinks);
      setSpeakers(entry.speakers ?? []);
    await commandHistoryRef.current.undo();
    setUndoRedoVersion((v) => v + 1);
    setSaveState({ kind: 'done', message: `已撤销: ${entry.label}` });
    }, [layerLinksRef, layersRef, setLayerLinks, setLayers, setSaveState, setSpeakers, setTranslations, setUtterances, speakersRef, syncToDb, translationsRef, utterancesRef]);

  const undoToHistoryIndex = useCallback(async (historyIndex: number) => {
    const stack = undoStackRef.current;
    if (historyIndex < 0 || historyIndex >= stack.length) return;

    const targetStackIndex = stack.length - 1 - historyIndex;
    const targetEntry = stack[targetStackIndex];
    if (!targetEntry) return;

    const redoAdds: UndoEntry[] = [];
    for (let j = stack.length - 1; j >= targetStackIndex; j -= 1) {
      const entry = stack[j];
      if (!entry) continue;
      if (j === stack.length - 1) {
        redoAdds.push({
          label: entry.label,
          utterances: [...utterancesRef.current],
          translations: [...translationsRef.current],
          layers: [...layersRef.current],
          layerLinks: [...layerLinksRef.current],
            speakers: [...speakersRef.current],
        });
      } else {
        const newerEntry = stack[j + 1];
        if (!newerEntry) continue;
        redoAdds.push({
          label: entry.label,
          utterances: [...newerEntry.utterances],
          translations: [...newerEntry.translations],
          ...(newerEntry.layers ? { layers: [...newerEntry.layers] } : {}),
          ...(newerEntry.layerLinks ? { layerLinks: [...newerEntry.layerLinks] } : {}),
            ...(newerEntry.speakers ? { speakers: [...newerEntry.speakers] } : {}),
        });
      }
    }

    redoStackRef.current = [...redoStackRef.current, ...redoAdds];
    undoStackRef.current = stack.slice(0, targetStackIndex);

    await syncToDb(targetEntry.utterances, targetEntry.translations, targetEntry.speakers ?? []);
    setUtterances(targetEntry.utterances);
    setTranslations(targetEntry.translations);
    if (targetEntry.layers) setLayers(targetEntry.layers);
    if (targetEntry.layerLinks) setLayerLinks(targetEntry.layerLinks);
    setSpeakers(targetEntry.speakers ?? []);
    await commandHistoryRef.current.undoToIndex(historyIndex);
    setUndoRedoVersion((v) => v + 1);

    const steps = stack.length - targetStackIndex;
    setSaveState({ kind: 'done', message: `已撤销 ${steps} 步: ${targetEntry.label}` });
  }, [layerLinksRef, layersRef, setLayerLinks, setLayers, setSaveState, setSpeakers, setTranslations, setUtterances, speakersRef, syncToDb, translationsRef, utterancesRef]);

  const redo = useCallback(async () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    undoStackRef.current.push({
      label: entry.label,
      utterances: [...utterancesRef.current],
      translations: [...translationsRef.current],
      layers: [...layersRef.current],
      layerLinks: [...layerLinksRef.current],
        speakers: [...speakersRef.current],
    });
      await syncToDb(entry.utterances, entry.translations, entry.speakers ?? []);
    setUtterances(entry.utterances);
    setTranslations(entry.translations);
    if (entry.layers) setLayers(entry.layers);
    if (entry.layerLinks) setLayerLinks(entry.layerLinks);
      setSpeakers(entry.speakers ?? []);
    await commandHistoryRef.current.redo();
    setUndoRedoVersion((v) => v + 1);
    setSaveState({ kind: 'done', message: `已重做: ${entry.label}` });
    }, [layerLinksRef, layersRef, setLayerLinks, setLayers, setSaveState, setSpeakers, setTranslations, setUtterances, speakersRef, syncToDb, translationsRef, utterancesRef]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  const undoLabel = undoStackRef.current[undoStackRef.current.length - 1]?.label ?? '';
  const undoHistory = undoStackRef.current.slice(-15).map((item) => item.label).reverse();

  return {
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
