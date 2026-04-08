import { memo } from 'react';
import { t, tf, useLocale } from '../i18n';
import { ModalPanel, PanelButton, PanelChip, PanelNote } from './ui';
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
  const locale = useLocale();

  const layerTypeLabel = layerType === 'translation'
    ? t(locale, 'transcription.dialog.deleteLayerTypeTranslation')
    : t(locale, 'transcription.dialog.deleteLayerTypeTranscription');

  return (
    <ModalPanel
      isOpen={open}
      onClose={onCancel}
      hideCloseButton
      className="delete-layer-confirm-dialog panel-design-match panel-design-match-dialog"
      ariaLabelledBy="delete-layer-title"
      title={<span id="delete-layer-title">{t(locale, 'transcription.dialog.deleteLayerTitle')}</span>}
      footer={(
        <>
          <PanelButton variant="ghost" onClick={onCancel}>{t(locale, 'transcription.dialog.cancel')}</PanelButton>
          <PanelButton variant="danger" onClick={onConfirm}>{t(locale, 'transcription.dialog.deleteLayerConfirmButton')}</PanelButton>
        </>
      )}
    >
        <PanelSummary
          className="delete-layer-confirm-summary"
          description={tf(locale, 'transcription.dialog.deleteLayerConfirm', { layerName })}
          meta={(
            <div className="panel-meta">
              <PanelChip>{tf(locale, 'transcription.dialog.deleteLayerType', { layerType: layerTypeLabel })}</PanelChip>
              <PanelChip variant={textCount > 0 ? 'danger' : 'default'}>
                {tf(locale, 'transcription.dialog.deleteLayerTextCount', { count: textCount })}
              </PanelChip>
            </div>
          )}
          supportingText={t(locale, 'transcription.dialog.deleteLayerIrreversibleWarning')}
          supportingClassName="dialog-supporting-note-danger"
        >
          {textCount > 0 ? (
            <PanelNote variant="danger">
              {t(locale, 'transcription.dialog.deleteLayerTextDestructiveHint')}
            </PanelNote>
          ) : null}
        </PanelSummary>
        {warningMessage ? (
          <PanelSection className="delete-layer-confirm-section">
            <PanelNote className="delete-layer-confirm-warning">
              {t(locale, 'transcription.dialog.deleteLayerWarningPrefix')} {warningMessage}
            </PanelNote>
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
          <PanelNote>
            {t(locale, 'transcription.dialog.deleteLayerKeepUtterancesHint')}
          </PanelNote>
        </PanelSection>
    </ModalPanel>
  );
});
