import type { Dispatch, SetStateAction } from 'react';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';

interface CreateTranscriptionExportCallbacksInput {
  setShowExportMenu: Dispatch<SetStateAction<boolean>>;
  handleExportEaf: () => void;
  handleExportTextGrid: () => void;
  handleExportTrs: () => void;
  handleExportFlextext: () => void;
  handleExportToolbox: () => void;
  handleExportJyt: () => Promise<void>;
  handleExportJym: () => Promise<void>;
  handleImportFile: (file: File) => Promise<void>;
}

export function createTranscriptionExportCallbacks(
  input: CreateTranscriptionExportCallbacksInput,
): TranscriptionPageToolbarProps['exportCallbacks'] {
  return {
    onToggleExportMenu: () => input.setShowExportMenu((value) => !value),
    onExportEaf: input.handleExportEaf,
    onExportTextGrid: input.handleExportTextGrid,
    onExportTrs: input.handleExportTrs,
    onExportFlextext: input.handleExportFlextext,
    onExportToolbox: input.handleExportToolbox,
    onExportJyt: input.handleExportJyt,
    onExportJym: input.handleExportJym,
    onImportFile: (file: File) => {
      void input.handleImportFile(file);
    },
  };
}