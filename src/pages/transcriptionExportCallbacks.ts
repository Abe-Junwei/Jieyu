import type { Dispatch, SetStateAction } from 'react';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';
import { recordTranscriptionKeyboardAction } from '../services/transcriptionKeyboardActionTelemetry';

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
    onToggleExportMenu: () => {
      recordTranscriptionKeyboardAction('toolbarExportMenuToggle');
      input.setShowExportMenu((value) => !value);
    },
    onExportEaf: () => {
      recordTranscriptionKeyboardAction('toolbarExportEaf');
      input.handleExportEaf();
    },
    onExportTextGrid: () => {
      recordTranscriptionKeyboardAction('toolbarExportTextGrid');
      input.handleExportTextGrid();
    },
    onExportTrs: () => {
      recordTranscriptionKeyboardAction('toolbarExportTrs');
      input.handleExportTrs();
    },
    onExportFlextext: () => {
      recordTranscriptionKeyboardAction('toolbarExportFlextext');
      input.handleExportFlextext();
    },
    onExportToolbox: () => {
      recordTranscriptionKeyboardAction('toolbarExportToolbox');
      input.handleExportToolbox();
    },
    onExportJyt: async () => {
      recordTranscriptionKeyboardAction('toolbarExportJyt');
      await input.handleExportJyt();
    },
    onExportJym: async () => {
      recordTranscriptionKeyboardAction('toolbarExportJym');
      await input.handleExportJym();
    },
    onImportFile: (file: File) => {
      recordTranscriptionKeyboardAction('toolbarImportAnnotationFile');
      void input.handleImportFile(file);
    },
  };
}