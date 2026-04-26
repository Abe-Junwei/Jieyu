import { createContext, useContext, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import type { LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import type { LayerMetadataUpdateInput } from '../types/layerMetadata';

export type TranscriptionEditorContextValue = {
  unitDrafts: Record<string, string>;
  setUnitDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  translationDrafts: Record<string, string>;
  setTranslationDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  translationTextByLayer: Map<string, Map<string, LayerUnitContentDocType>>;
  focusedTranslationDraftKeyRef: MutableRefObject<string | null>;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  saveUnitText: (unitId: string, text: string, layerId?: string) => Promise<void>;
  saveUnitLayerText: (unitId: string, text: string, layerId: string) => Promise<void>;
  getUnitTextForLayer: (utt: LayerUnitDocType, layerId?: string) => string;
  renderLaneLabel: (layer: LayerDocType) => ReactNode;
  // Layer management
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  updateLayerMetadata?: (layerId: string, input: LayerMetadataUpdateInput) => Promise<boolean>;
  deleteLayer: (layerId: string, options?: { keepUnits?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm: (layerId: string) => Promise<void>;
  checkLayerHasContent: (layerId: string) => Promise<number>;
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
