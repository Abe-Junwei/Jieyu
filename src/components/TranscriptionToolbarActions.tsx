import { memo, type RefObject } from 'react';

interface ExportCallbacks {
  onToggleExportMenu: () => void;
  onExportEaf: () => void;
  onExportTextGrid: () => void;
  onExportTrs: () => void;
  onExportFlextext: () => void;
  onExportToolbox: () => void;
  onExportJyt: () => Promise<void>;
  onExportJym: () => Promise<void>;
  onImportFile: (file: File) => void;
}

interface TranscriptionToolbarActionsProps {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  canDeleteAudio: boolean;
  canDeleteProject: boolean;
  canToggleNotes: boolean;
  canOpenUttOpsMenu: boolean;
  notePopoverOpen: boolean;
  showExportMenu: boolean;
  importFileRef: RefObject<HTMLInputElement | null>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  exportCallbacks: ExportCallbacks;
  onRefresh: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProjectSetup: () => void;
  onOpenAudioImport: () => void;
  onDeleteCurrentAudio: () => void;
  onDeleteCurrentProject: () => void;
  onToggleNotes: () => void;
  onOpenUttOpsMenu: (x: number, y: number) => void;
}

function TranscriptionToolbarActionsInner(props: TranscriptionToolbarActionsProps) {
  void props;
  return null;
}

export const TranscriptionToolbarActions = memo(TranscriptionToolbarActionsInner);
