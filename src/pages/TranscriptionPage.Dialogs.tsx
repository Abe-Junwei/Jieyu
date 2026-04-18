import type { RefObject } from 'react';
import { SpeakerActionDialog } from '../components/transcription/SpeakerActionDialog';
import { ProjectSetupDialog } from '../components/ProjectSetupDialog';
import { AudioImportDialog } from '../components/AudioImportDialog';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { ShortcutsPanel } from '../components/ShortcutsPanel';
import { normalizeLocale, t, tf } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import type { SpeakerActionDialogState } from '../hooks/speakerManagement/types';
import type { AudioImportDisposition, TranscriptionAudioImportOptions } from './transcriptionAudioImportTypes';

export type { AudioImportDisposition, TranscriptionAudioImportOptions } from './transcriptionAudioImportTypes';

export type TranscriptionPageDialogsProps = {
  locale: string;
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
  onSubmitProjectSetup: (input: { primaryTitle: string; englishFallbackTitle: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
  // Audio import
  showAudioImport: boolean;
  onCloseAudioImport: () => void;
  audioImportDisposition: AudioImportDisposition;
  onImportAudio: (file: File, duration: number, options?: TranscriptionAudioImportOptions) => Promise<void>;
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
};

export function TranscriptionPageDialogs({
  locale,
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
  audioImportDisposition,
  onImportAudio,
  mediaFileInputRef: _mediaFileInputRef,
  onDirectMediaImport: _onDirectMediaImport,
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
}: TranscriptionPageDialogsProps) {
  const uiLocale = normalizeLocale(locale) ?? 'zh-CN';

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

      <ProjectSetupDialog
        isOpen={showProjectSetup}
        onClose={onCloseProjectSetup}
        onSubmit={onSubmitProjectSetup}
      />

      <AudioImportDialog
        isOpen={showAudioImport}
        onClose={onCloseAudioImport}
        disposition={audioImportDisposition}
        onImport={onImportAudio}
      />

      {/* Audio delete confirmation dialog */}
      <ConfirmDeleteDialog
        locale={uiLocale}
        open={audioDeleteConfirm !== null}
        title={t(uiLocale, 'transcription.dialog.deleteAudioTitle')}
        description={audioDeleteConfirm
          ? tf(uiLocale, 'transcription.dialog.deleteAudioDescription', { filename: audioDeleteConfirm.filename })
          : ''}
        onCancel={onCancelAudioDelete}
        onConfirm={onConfirmAudioDelete}
      />

      {/* Project delete confirmation dialog */}
      <ConfirmDeleteDialog
        locale={uiLocale}
        open={projectDeleteConfirm}
        title={t(uiLocale, 'transcription.dialog.deleteProjectTitle')}
        description={t(uiLocale, 'transcription.action.confirmDeleteProject')}
        onCancel={onCancelProjectDelete}
        onConfirm={onConfirmProjectDelete}
      />

      {/* Focus mode exit badge */}
      {isFocusMode && (
        <div className="focus-mode-badge" onClick={onExitFocusMode}>
          {t(uiLocale, 'transcription.dialog.focusModeExitBadge')}
        </div>
      )}

      {/* Keyboard shortcuts panel */}
      {showShortcuts && (
        <ShortcutsPanel onClose={onCloseShortcuts} />
      )}
    </>
  );
}
