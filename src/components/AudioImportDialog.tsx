import { useRef, useState } from 'react';
import { Upload, FileAudio, X } from 'lucide-react';

type AudioImportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File, duration: number) => Promise<void>;
};

const ACCEPTED_FORMATS = '.mp3,.wav,.ogg,.webm,.m4a,.flac,.aac';

export function AudioImportDialog({ isOpen, onClose, onImport }: AudioImportDialogProps) {
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
      setError('请选择音频文件（MP3、WAV、OGG 等）。');
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
        setError('无法读取音频时长，文件可能已损坏。');
      }
      URL.revokeObjectURL(objectUrl);
    });
    audio.addEventListener('error', () => {
      setError('无法解析音频文件，请检查格式是否受支持。');
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
      setError(err instanceof Error ? err.message : '导入失败');
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>导入音频</h3>
          <button className="icon-btn" onClick={handleClose} title="关闭">
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
                <strong>点击选择音频文件</strong>
                <span className="small-text">支持 MP3、WAV、OGG、WebM、M4A、FLAC</span>
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
            取消
          </button>
          <button
            className="btn"
            disabled={!selectedFile || !duration || importing}
            onClick={() => void handleImport()}
          >
            {importing ? '导入中...' : '确认导入'}
          </button>
        </div>
      </div>
    </div>
  );
}
