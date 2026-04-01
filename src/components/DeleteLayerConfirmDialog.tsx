import { memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { t, tf, useLocale } from '../i18n';

export interface DeleteLayerConfirmDialogProps {
  open: boolean;
  layerName: string;
  layerType: 'transcription' | 'translation';
  textCount: number;
  warningMessage?: string;
  keepUtterances?: boolean;
  onKeepUtterancesChange?: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteLayerConfirmDialog = memo(function DeleteLayerConfirmDialog({
  open,
  layerName,
  layerType,
  textCount,
  warningMessage,
  keepUtterances = false,
  onKeepUtterancesChange,
  onCancel,
  onConfirm,
}: DeleteLayerConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  useFocusTrap(dialogRef, open, onCancel);

  if (!open) return null;

  const layerTypeLabel = layerType === 'translation'
    ? t(locale, 'transcription.dialog.deleteLayerTypeTranslation')
    : t(locale, 'transcription.dialog.deleteLayerTypeTranscription');

  const dialog = (
    <div className="dialog-overlay" onClick={onCancel} role="presentation">
      <div
        ref={dialogRef}
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-layer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h3 id="delete-layer-title">{t(locale, 'transcription.dialog.deleteLayerTitle')}</h3>
        </div>
        <div className="dialog-body">
          <p style={{ margin: '0 0 16px 0', color: 'var(--state-danger-solid)', fontSize: 14, fontWeight: 500 }}>
            {t(locale, 'transcription.dialog.deleteLayerIrreversibleWarning')}
          </p>
          <p style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: 14 }}>
            {tf(locale, 'transcription.dialog.deleteLayerConfirm', { layerName })}
          </p>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
            {tf(locale, 'transcription.dialog.deleteLayerType', { layerType: layerTypeLabel })}
            <br />
            {tf(locale, 'transcription.dialog.deleteLayerTextCount', { count: textCount })}
            {textCount > 0 && (
              <span style={{ color: 'var(--state-danger-solid)' }}>
                <br />
                {t(locale, 'transcription.dialog.deleteLayerTextDestructiveHint')}
              </span>
            )}
          </p>
          {warningMessage && (
            <p style={{ margin: '12px 0 0 0', color: 'var(--state-warning-text)', fontSize: 13, fontWeight: 500 }}>
              {t(locale, 'transcription.dialog.deleteLayerWarningPrefix')} {warningMessage}
            </p>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', marginTop: 12 }}>
            <input
              type="checkbox"
              checked={keepUtterances}
              onChange={(e) => onKeepUtterancesChange?.(e.target.checked)}
            />
            {t(locale, 'transcription.dialog.deleteLayerKeepUtterances')}
          </label>
          <p style={{ margin: '8px 0 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>
            {t(locale, 'transcription.dialog.deleteLayerKeepUtterancesHint')}
          </p>
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={onCancel}>{t(locale, 'transcription.dialog.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm}>{t(locale, 'transcription.dialog.deleteLayerConfirmButton')}</button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
});
