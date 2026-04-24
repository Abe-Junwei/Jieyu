import { useEffect, useRef, useState } from 'react';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_HERO } from '../utils/jieyuMaterialIcon';
import { t, tf, useLocale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { ModalPanel, PanelButton, PanelFeedback } from './ui';
import type { AudioImportDisposition, TranscriptionAudioImportOptions } from '../pages/transcriptionAudioImportTypes';

type AudioImportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  disposition: AudioImportDisposition;
  onImport: (file: File, duration: number, options?: TranscriptionAudioImportOptions) => Promise<void>;
};

const ACCEPTED_AUDIO_FORMATS = '.mp3,.wav,.ogg,.webm,.m4a,.flac,.aac';
const ACCEPTED_VIDEO_FORMATS = '.mp4,.webm,.mov,.avi,.mkv';
const ALL_ACCEPTED_FORMATS = `${ACCEPTED_AUDIO_FORMATS},${ACCEPTED_VIDEO_FORMATS}`;

export function AudioImportDialog({ isOpen, onClose, disposition, onImport }: AudioImportDialogProps) {
  const locale = useLocale();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importModeChoice, setImportModeChoice] = useState<'replace' | 'add'>('replace');

  useEffect(() => {
    if (isOpen) setImportModeChoice('replace');
  }, [isOpen]);

  const reset = () => {
    setSelectedFile(null);
    setDuration(null);
    setError('');
    setImporting(false);
    setImportModeChoice('replace');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setDuration(null);
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const isAudio = file.type.startsWith('audio/');
    const isVideo = file.type.startsWith('video/');
    if (!isAudio && !isVideo) {
      setError(t(locale, 'transcription.importDialog.invalidMedia'));
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    // Extract duration using HTML5 media element (works for both audio and video)
    const media = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
    const objectUrl = URL.createObjectURL(file);
    media.src = objectUrl;
    media.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(media.duration)) {
        setDuration(media.duration);
      } else {
        setError(t(locale, 'transcription.importDialog.unreadableDuration'));
      }
      URL.revokeObjectURL(objectUrl);
    }, { once: true });
    media.addEventListener('error', () => {
      setError(t(locale, 'transcription.importDialog.unsupportedMedia'));
      URL.revokeObjectURL(objectUrl);
    }, { once: true });
  };

  const handleImport = async () => {
    if (!selectedFile || !duration) return;
    setImporting(true);
    setError('');
    try {
      if (disposition.kind === 'choose') {
        await onImport(selectedFile, duration, { mode: importModeChoice });
      } else {
        await onImport(selectedFile, duration);
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, 'transcription.importDialog.importFailed'));
      setImporting(false);
    }
  };

  const isVideoFile = selectedFile?.type.startsWith('video/') ?? false;

  if (!isOpen) return null;

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={handleClose}
      className="audio-import-dialog panel-design-match panel-design-match-dialog"
      ariaLabel={t(locale, 'transcription.importDialog.title')}
      title={t(locale, 'transcription.importDialog.title')}
      closeLabel={t(locale, 'transcription.importDialog.close')}
      footer={(
        <>
          <PanelButton variant="ghost" onClick={handleClose} disabled={importing}>
            {t(locale, 'transcription.importDialog.cancel')}
          </PanelButton>
          <PanelButton
            variant="primary"
            disabled={!selectedFile || !duration || importing}
            onClick={() => fireAndForget(handleImport(), { context: 'src/components/AudioImportDialog.tsx:L121', policy: 'user-visible' })}
          >
            {importing ? t(locale, 'transcription.importDialog.importing') : t(locale, 'transcription.importDialog.confirmImport')}
          </PanelButton>
        </>
      )}
    >
          <div
            className={`audio-drop-zone ${selectedFile ? 'audio-drop-zone-filled' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            {selectedFile ? (
              <>
                {isVideoFile ? <MaterialSymbol name="video_file" className={JIEYU_MATERIAL_HERO} /> : <MaterialSymbol name="audio_file" className={JIEYU_MATERIAL_HERO} />}
                <strong>{selectedFile.name}</strong>
                <span className="small-text">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  {duration ? ` · ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : ''}
                </span>
              </>
            ) : (
              <>
                <MaterialSymbol name="upload" className={JIEYU_MATERIAL_HERO} />
                <strong>{t(locale, 'transcription.importDialog.selectMedia')}</strong>
                <span className="small-text">{t(locale, 'transcription.importDialog.supportedFormats')}</span>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ALL_ACCEPTED_FORMATS}
            aria-label={t(locale, 'transcription.importDialog.selectMedia')}
            className="audio-import-dialog-file-input"
            onChange={handleFileChange}
          />

          {error && <PanelFeedback level="error">{error}</PanelFeedback>}

          {disposition.kind === 'choose' && (
            <fieldset className="audio-import-disposition">
              <legend className="audio-import-disposition-legend">
                {t(locale, 'transcription.importDialog.importModeLegend')}
              </legend>
              <label className="audio-import-disposition-option">
                <input
                  type="radio"
                  name="audio-import-mode"
                  value="replace"
                  checked={importModeChoice === 'replace'}
                  onChange={() => setImportModeChoice('replace')}
                />
                <span>
                  {tf(locale, 'transcription.importDialog.importModeReplace', { label: disposition.replaceLabel })}
                </span>
              </label>
              <div className="audio-import-disposition-hint">
                {t(locale, 'transcription.importDialog.importModeReplaceHint')}
              </div>
              <label className="audio-import-disposition-option">
                <input
                  type="radio"
                  name="audio-import-mode"
                  value="add"
                  checked={importModeChoice === 'add'}
                  onChange={() => setImportModeChoice('add')}
                />
                <span>{t(locale, 'transcription.importDialog.importModeAdd')}</span>
              </label>
              <div className="audio-import-disposition-hint">
                {t(locale, 'transcription.importDialog.importModeAddHint')}
              </div>
            </fieldset>
          )}
    </ModalPanel>
  );
}
