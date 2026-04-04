import { memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { t, tf, useLocale } from '../i18n';
import { DialogShell } from './ui/DialogShell';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';

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
      <DialogShell
        containerRef={dialogRef}
        className="delete-layer-confirm-dialog panel-design-match panel-design-match-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-layer-title"
        title={<span id="delete-layer-title">{t(locale, 'transcription.dialog.deleteLayerTitle')}</span>}
        footer={(
          <>
            <button className="panel-button panel-button--ghost" onClick={onCancel}>{t(locale, 'transcription.dialog.cancel')}</button>
            <button className="panel-button panel-button--danger" onClick={onConfirm}>{t(locale, 'transcription.dialog.deleteLayerConfirmButton')}</button>
          </>
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <PanelSummary
          className="delete-layer-confirm-summary"
          description={tf(locale, 'transcription.dialog.deleteLayerConfirm', { layerName })}
          meta={(
            <div className="panel-meta">
              <span className="panel-chip">{tf(locale, 'transcription.dialog.deleteLayerType', { layerType: layerTypeLabel })}</span>
              <span className={`panel-chip${textCount > 0 ? ' panel-chip--danger' : ''}`}>
                {tf(locale, 'transcription.dialog.deleteLayerTextCount', { count: textCount })}
              </span>
            </div>
          )}
          supportingText={t(locale, 'transcription.dialog.deleteLayerIrreversibleWarning')}
          supportingClassName="dialog-supporting-note-danger"
        >
          {textCount > 0 ? (
            <p className="panel-note panel-note--danger">
              {t(locale, 'transcription.dialog.deleteLayerTextDestructiveHint')}
            </p>
          ) : null}
        </PanelSummary>
        {warningMessage ? (
          <PanelSection className="delete-layer-confirm-section">
            <p className="panel-note delete-layer-confirm-warning">
              {t(locale, 'transcription.dialog.deleteLayerWarningPrefix')} {warningMessage}
            </p>
          </PanelSection>
        ) : null}
        <PanelSection className="delete-layer-confirm-section">
          <label className="delete-layer-confirm-keep-toggle">
            <input
              type="checkbox"
              checked={keepUtterances}
              onChange={(e) => onKeepUtterancesChange?.(e.target.checked)}
            />
            <span>{t(locale, 'transcription.dialog.deleteLayerKeepUtterances')}</span>
          </label>
          <p className="panel-note">
            {t(locale, 'transcription.dialog.deleteLayerKeepUtterancesHint')}
          </p>
        </PanelSection>
      </DialogShell>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
});
