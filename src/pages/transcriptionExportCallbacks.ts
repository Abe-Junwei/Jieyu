import type { Dispatch, SetStateAction } from 'react';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';
import type { ActionId } from '../types/intentActionId';
import type { TranscriptionOutboundExportFormat } from '../utils/transcriptionLiteExport';

export function outboundExportActionId(format: TranscriptionOutboundExportFormat): ActionId {
  switch (format) {
    case 'srt':
      return 'toolbarExportSrt';
    case 'vtt':
      return 'toolbarExportVtt';
    case 'csv':
      return 'toolbarExportCsv';
    case 'tsv':
      return 'toolbarExportTsv';
    case 'tex':
      return 'toolbarExportTex';
  }
}

interface CreateTranscriptionExportCallbacksInput {
  setShowExportMenu: Dispatch<SetStateAction<boolean>>;
  handleExportEaf: () => void;
  handleExportTextGrid: () => void;
  handleExportTrs: () => void;
  handleExportFlextext: () => void;
  handleExportToolbox: () => void;
  handleExportJyt: () => Promise<void>;
  handleExportJym: () => Promise<void>;
  handleExportLite: (format: TranscriptionOutboundExportFormat) => Promise<void>;
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
    onExportLite: async (format) => {
      recordTranscriptionKeyboardAction(outboundExportActionId(format));
      await input.handleExportLite(format);
    },
    onImportFile: (file: File) => {
      recordTranscriptionKeyboardAction('toolbarImportAnnotationFile');
      void input.handleImportFile(file);
    },
  };
}
