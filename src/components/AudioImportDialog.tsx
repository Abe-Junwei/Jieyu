import { useRef, useState } from 'react';
import { Upload, FileAudio, X } from 'lucide-react';
import { detectLocale, t } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';

type AudioImportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File, duration: number) => Promise<void>;
};

const ACCEPTED_FORMATS = '.mp3,.wav,.ogg,.webm,.m4a,.flac,.aac';

export function AudioImportDialog({ isOpen, onClose, onImport }: AudioImportDialogProps) {
  const locale = detectLocale();
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

    if (!file.type.startsWith('audio/')) {
      setError(t(locale, 'transcription.importDialog.invalidAudio'));
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    // Extract duration using HTML5 Audio
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else {
        setError(t(locale, 'transcription.importDialog.unreadableDuration'));
      }
      URL.revokeObjectURL(objectUrl);
    });
    audio.addEventListener('error', () => {
      setError(t(locale, 'transcription.importDialog.unsupportedAudio'));
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

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{t(locale, 'transcription.importDialog.title')}</h3>
          <button className="icon-btn" onClick={handleClose} title={t(locale, 'transcription.importDialog.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <div
            className={`audio-drop-zone ${selectedFile ? 'audio-drop-zone-filled' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            {selectedFile ? (
              <>
                <FileAudio size={28} />
                <strong>{selectedFile.name}</strong>
                <span className="small-text">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  {duration ? ` · ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : ''}
                </span>
              </>
            ) : (
              <>
                <Upload size={28} />
                <strong>{t(locale, 'transcription.importDialog.selectAudio')}</strong>
                <span className="small-text">{t(locale, 'transcription.importDialog.supportedFormats')}</span>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {error && <p className="error">{error}</p>}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={handleClose} disabled={importing}>
            {t(locale, 'transcription.importDialog.cancel')}
          </button>
          <button
            className="btn"
            disabled={!selectedFile || !duration || importing}
            onClick={() => fireAndForget(handleImport())}
          >
            {importing ? t(locale, 'transcription.importDialog.importing') : t(locale, 'transcription.importDialog.confirmImport')}
          </button>
        </div>
      </div>
    </div>
  );
}
