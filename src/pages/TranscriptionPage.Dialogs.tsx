import type { RefObject } from 'react';
import { SpeakerActionDialog } from '../components/transcription/SpeakerActionDialog';
import { ProjectSetupDialog } from '../components/ProjectSetupDialog';
import { AudioImportDialog } from '../components/AudioImportDialog';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { ShortcutsPanel } from '../components/ShortcutsPanel';
import { PdfPreviewSection } from '../components/PdfPreviewSection';
import { fireAndForget } from '../utils/fireAndForget';
import type { SpeakerActionDialogState } from '../hooks/speakerManagement/types';
import type { Locale } from '../i18n';

export type TranscriptionPageDialogsProps = {
  // Speaker dialog
  speakerDialogState: SpeakerActionDialogState | null;
  speakerSaving: boolean;
  onCloseSpeakerDialog: () => void;
  onConfirmSpeakerDialog: () => Promise<void>;
  onDraftNameChange: (name: string) => void;
  onTargetSpeakerChange: (key: string) => void;
  // Project setup
  showProjectSetup: boolean;
  onCloseProjectSetup: () => void;
  onSubmitProjectSetup: (input: { titleZh: string; titleEn: string; primaryLanguageId: string }) => Promise<void>;
  // Audio import
  showAudioImport: boolean;
  onCloseAudioImport: () => void;
  onImportAudio: (file: File, duration: number) => Promise<void>;
  // File input ref
  mediaFileInputRef: RefObject<HTMLInputElement | null>;
  onDirectMediaImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // Confirm delete audio
  audioDeleteConfirm: { filename: string } | null;
  onCancelAudioDelete: () => void;
  onConfirmAudioDelete: () => void;
  // Confirm delete project
  projectDeleteConfirm: boolean;
  onCancelProjectDelete: () => void;
  onConfirmProjectDelete: () => void;
  // Shortcuts
  showShortcuts: boolean;
  onCloseShortcuts: () => void;
  // Focus mode
  isFocusMode: boolean;
  onExitFocusMode: () => void;
  // PDF preview
  locale: Locale;
  pdfPreview: { url: string; title: string; page: number | null; navToken: number; searchSnippet?: string } | null;
  pdfPreviewDragging: boolean;
  pdfPreviewPos: { right: number; bottom: number };
  pdfPreviewRef: RefObject<HTMLElement | null>;
  onPdfPreviewDragStart: (e: React.PointerEvent<HTMLElement>) => void;
  onPdfPreviewPageChange: (delta: number) => void;
  onPdfPreviewOpenExternal: () => void;
  onPdfPreviewClose: () => void;
};

export function TranscriptionPageDialogs({
  speakerDialogState,
  speakerSaving,
  onCloseSpeakerDialog,
  onConfirmSpeakerDialog,
  onDraftNameChange,
  onTargetSpeakerChange,
  showProjectSetup,
  onCloseProjectSetup,
  onSubmitProjectSetup,
  showAudioImport,
  onCloseAudioImport,
  onImportAudio,
  mediaFileInputRef,
  onDirectMediaImport,
  audioDeleteConfirm,
  onCancelAudioDelete,
  onConfirmAudioDelete,
  projectDeleteConfirm,
  onCancelProjectDelete,
  onConfirmProjectDelete,
  showShortcuts,
  onCloseShortcuts,
  isFocusMode,
  onExitFocusMode,
  locale,
  pdfPreview,
  pdfPreviewDragging,
  pdfPreviewPos,
  pdfPreviewRef,
  onPdfPreviewDragStart,
  onPdfPreviewPageChange,
  onPdfPreviewOpenExternal,
  onPdfPreviewClose,
}: TranscriptionPageDialogsProps) {
  return (
    <>
      <SpeakerActionDialog
        state={speakerDialogState}
        busy={speakerSaving}
        onClose={onCloseSpeakerDialog}
        onConfirm={() => { fireAndForget(onConfirmSpeakerDialog()); }}
        onDraftNameChange={onDraftNameChange}
        onTargetSpeakerChange={onTargetSpeakerChange}
      />

      <PdfPreviewSection
        locale={locale}
        pdfPreview={pdfPreview}
        pdfPreviewDragging={pdfPreviewDragging}
        pdfPreviewPos={pdfPreviewPos}
        pdfPreviewRef={pdfPreviewRef}
        onDragStart={onPdfPreviewDragStart}
        onChangePage={onPdfPreviewPageChange}
        onOpenExternal={onPdfPreviewOpenExternal}
        onClose={onPdfPreviewClose}
      />

      <ProjectSetupDialog
        isOpen={showProjectSetup}
        onClose={onCloseProjectSetup}
        onSubmit={onSubmitProjectSetup}
      />

      <AudioImportDialog
        isOpen={showAudioImport}
        onClose={onCloseAudioImport}
        onImport={onImportAudio}
      />

      {/* Hidden file input for direct media import from empty state button */}
      <input
        ref={mediaFileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.webm,.m4a,.flac,.aac,.mp4,.webm,.mov,.avi,.mkv"
        style={{ display: 'none' }}
        onChange={onDirectMediaImport}
      />

      {/* Audio delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={audioDeleteConfirm !== null}
        title="删除音频"
        description={audioDeleteConfirm ? `确定删除音频「${audioDeleteConfirm.filename}」及其所有句段？此操作不可撤销。` : ''}
        onCancel={onCancelAudioDelete}
        onConfirm={onConfirmAudioDelete}
      />

      {/* Project delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={projectDeleteConfirm}
        title="删除项目"
        description="确定删除当前项目及其所有数据（音频、句段、翻译）？此操作不可撤销。"
        onCancel={onCancelProjectDelete}
        onConfirm={onConfirmProjectDelete}
      />

      {/* Focus mode exit badge */}
      {isFocusMode && (
        <div className="focus-mode-badge" onClick={onExitFocusMode}>
          焦点模式 — 点击或 ⌘⇧F 退出
        </div>
      )}

      {/* Keyboard shortcuts panel */}
      {showShortcuts && (
        <ShortcutsPanel onClose={onCloseShortcuts} />
      )}
    </>
  );
}
