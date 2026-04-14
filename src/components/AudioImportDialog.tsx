import { useRef, useState } from 'react';
import { Upload, FileAudio, FileVideo } from 'lucide-react';
import { JIEYU_LUCIDE_HERO } from '../utils/jieyuLucideIcon';
import { t, useLocale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { ModalPanel, PanelButton, PanelFeedback } from './ui';

type AudioImportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File, duration: number) => Promise<void>;
};

const ACCEPTED_AUDIO_FORMATS = '.mp3,.wav,.ogg,.webm,.m4a,.flac,.aac';
const ACCEPTED_VIDEO_FORMATS = '.mp4,.webm,.mov,.avi,.mkv';
const ALL_ACCEPTED_FORMATS = `${ACCEPTED_AUDIO_FORMATS},${ACCEPTED_VIDEO_FORMATS}`;

export function AudioImportDialog({ isOpen, onClose, onImport }: AudioImportDialogProps) {
  const locale = useLocale();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setSelectedFile(null);
    setDuration(null);
    setError('');
    setImporting(false);
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
    });
    media.addEventListener('error', () => {
      setError(t(locale, 'transcription.importDialog.unsupportedMedia'));
      URL.revokeObjectURL(objectUrl);
    });
  };

  const handleImport = async () => {
    if (!selectedFile || !duration) return;
    setImporting(true);
    setError('');
    try {
      await onImport(selectedFile, duration);
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
            onClick={() => fireAndForget(handleImport())}
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
                {isVideoFile ? <FileVideo className={JIEYU_LUCIDE_HERO} /> : <FileAudio className={JIEYU_LUCIDE_HERO} />}
                <strong>{selectedFile.name}</strong>
                <span className="small-text">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  {duration ? ` · ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : ''}
                </span>
              </>
            ) : (
              <>
                <Upload className={JIEYU_LUCIDE_HERO} />
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
    </ModalPanel>
  );
}
