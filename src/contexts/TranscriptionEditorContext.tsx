import {
  createContext,
  useContext,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { TranslationLayerDocType, UtteranceDocType, UtteranceTextDocType } from '../../db';

export type TranscriptionEditorContextValue = {
  utteranceDrafts: Record<string, string>;
  setUtteranceDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  translationDrafts: Record<string, string>;
  setTranslationDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  translationTextByLayer: Map<string, Map<string, UtteranceTextDocType>>;
  focusedTranslationDraftKeyRef: MutableRefObject<string | null>;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
  getUtteranceTextForLayer: (utt: UtteranceDocType, layerId?: string) => string;
  renderLaneLabel: (layer: TranslationLayerDocType) => ReactNode;
};

export const TranscriptionEditorContext =
  createContext<TranscriptionEditorContextValue | null>(null);

export function useTranscriptionEditorContext(): TranscriptionEditorContextValue {
  const ctx = useContext(TranscriptionEditorContext);
  if (!ctx) {
    throw new Error(
      'useTranscriptionEditorContext must be used within a TranscriptionEditorContext.Provider',
    );
  }
  return ctx;
}
