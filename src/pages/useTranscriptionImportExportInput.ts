import { useMemo } from 'react';
import type { UseImportExportInput } from '../hooks/useImportExport';

export function useTranscriptionImportExportInput(
  input: UseImportExportInput,
): UseImportExportInput {
  return useMemo(() => ({
    activeTextId: input.activeTextId,
    getActiveTextId: input.getActiveTextId,
    selectedUnitMedia: input.selectedUnitMedia,
    unitsOnCurrentMedia: input.unitsOnCurrentMedia,
    anchors: input.anchors,
    layers: input.layers,
    translations: input.translations,
    defaultTranscriptionLayerId: input.defaultTranscriptionLayerId,
    loadSnapshot: input.loadSnapshot,
    setSaveState: input.setSaveState,
  }), [
    input.activeTextId,
    input.anchors,
    input.defaultTranscriptionLayerId,
    input.getActiveTextId,
    input.layers,
    input.loadSnapshot,
    input.selectedUnitMedia,
    input.setSaveState,
    input.translations,
    input.unitsOnCurrentMedia,
  ]);
}
