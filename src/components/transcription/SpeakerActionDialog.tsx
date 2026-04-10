import { memo, useMemo } from 'react';
import type { SpeakerActionDialogState } from '../../hooks/speakerManagement/types';
import { t, tf, useLocale } from '../../i18n';
import { FormField, ModalPanel, PanelButton, PanelChip, PanelSection, PanelSummary } from '../ui';

type SpeakerActionDialogProps = {
  state: SpeakerActionDialogState | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDraftNameChange: (value: string) => void;
  onTargetSpeakerChange: (speakerKey: string) => void;
};

export const SpeakerActionDialog = memo(function SpeakerActionDialog({
  state,
  busy,
  onClose,
  onConfirm,
  onDraftNameChange,
  onTargetSpeakerChange,
}: SpeakerActionDialogProps) {
  const locale = useLocale();

  if (!state) {
    return <ModalPanel isOpen={false} onClose={onClose} title="">{null}</ModalPanel>;
  }

  const isRename = state.mode === 'rename';
  const isMerge = state.mode === 'merge';
  const isClear = state.mode === 'clear';
  const isDelete = state.mode === 'delete';
  const confirmDisabled = busy
    || (isRename && state.draftName.trim().length === 0)
    || (isMerge && state.targetSpeakerKey.trim().length === 0);

  const dialogTitle = isRename
    ? t(locale, 'transcription.speakerDialog.renameTitle')
    : isMerge
      ? t(locale, 'transcription.speakerDialog.mergeTitle')
      : isDelete
        ? t(locale, 'transcription.speakerDialog.deleteEntityTitle')
        : t(locale, 'transcription.speakerDialog.clearTagTitle');

  const summaryCopy = useMemo(() => {
    if (isMerge) {
      return tf(locale, 'transcription.speakerDialog.mergeHint', { sourceSpeakerName: state.sourceSpeakerName });
    }
    if (isClear) {
      return tf(locale, 'transcription.speakerDialog.clearHint', {
        speakerName: state.speakerName,
        affectedCount: state.affectedCount,
      });
    }
    if (isDelete) {
      return tf(locale, 'transcription.speakerDialog.deleteEntityHint', {
        sourceSpeakerName: state.sourceSpeakerName,
        affectedCount: state.affectedCount,
      });
    }
    return state.speakerName;
  }, [isClear, isDelete, isMerge, locale, state]);

  const summaryMeta = useMemo(() => {
    if (isRename) {
      return [state.speakerName];
    }
    if (isMerge) {
      return [state.sourceSpeakerName, String(state.candidates.length)];
    }
    if (isClear) {
      return [state.speakerName, String(state.affectedCount)];
    }
    return [state.sourceSpeakerName, String(state.affectedCount), String(state.candidates.length)];
  }, [isClear, isDelete, isMerge, isRename, state]);

  const riskCopy = isDelete
    ? t(locale, 'transcription.speakerDialog.deleteEntityRisk')
    : null;
  const confirmButtonVariant = (isClear || isDelete) ? 'danger' as const : 'primary' as const;
  const summaryProps = {
    ...(riskCopy ? { supportingText: riskCopy, supportingClassName: 'panel-note panel-note--danger' } : {}),
  };

  return (
    <ModalPanel
      isOpen={state !== null}
      onClose={onClose}
      ariaLabelledBy="speaker-dialog-title"
      className="speaker-action-dialog"
      headerClassName="speaker-action-dialog-header"
      bodyClassName="speaker-action-dialog-body"
      footerClassName="speaker-action-dialog-footer"
      title={<span id="speaker-dialog-title">{dialogTitle}</span>}
      closeLabel={`${dialogTitle} ${t(locale, 'transcription.dialog.cancel')}`}
      footer={(
        <>
          <PanelButton variant="ghost" onClick={onClose} disabled={busy}>{t(locale, 'transcription.dialog.cancel')}</PanelButton>
          <PanelButton
            variant={confirmButtonVariant}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {busy
              ? t(locale, 'transcription.speakerDialog.processing')
              : isRename
                ? t(locale, 'transcription.speakerDialog.confirmRename')
                : isMerge
                  ? t(locale, 'transcription.speakerDialog.confirmMerge')
                  : isDelete
                    ? t(locale, 'transcription.speakerDialog.confirmDeleteEntity')
                    : t(locale, 'transcription.speakerDialog.confirmClearTag')}
          </PanelButton>
        </>
      )}
    >
        <PanelSummary
          className="speaker-action-dialog-summary"
          description={summaryCopy}
          meta={(
            <div className="panel-meta">
              {summaryMeta.map((item, index) => (
                <PanelChip
                  key={`${item}-${index}`}
                  variant={riskCopy && index === 1 ? 'danger' : 'default'}
                >
                  {item}
                </PanelChip>
              ))}
            </div>
          )}
          {...summaryProps}
        />

          {isRename && (
            <PanelSection className="speaker-action-dialog-field-stack">
              <FormField htmlFor="speaker-rename-input" label={t(locale, 'transcription.speakerDialog.renameLabel')}>
                <input
                  id="speaker-rename-input"
                  className="input panel-input layer-action-dialog-input"
                  value={state.draftName}
                  onChange={(event) => onDraftNameChange(event.target.value)}
                  placeholder={state.speakerName}
                  autoFocus
                />
              </FormField>
            </PanelSection>
          )}

          {isMerge && (
            <PanelSection className="speaker-action-dialog-field-stack">
              <FormField htmlFor="speaker-merge-target" label={t(locale, 'transcription.speakerDialog.mergeTargetLabel')}>
                <select
                  id="speaker-merge-target"
                  className="input panel-input layer-action-dialog-input"
                  value={state.targetSpeakerKey}
                  onChange={(event) => onTargetSpeakerChange(event.target.value)}
                  autoFocus
                >
                  {state.candidates.map((candidate) => (
                    <option key={candidate.key} value={candidate.key}>{candidate.name}</option>
                  ))}
                </select>
              </FormField>
            </PanelSection>
          )}

          {isDelete && (
            <PanelSection className="speaker-action-dialog-field-stack">
              <FormField htmlFor="speaker-delete-target" label={t(locale, 'transcription.speakerDialog.deleteStrategyLabel')}>
                <select
                  id="speaker-delete-target"
                  className="input panel-input layer-action-dialog-input"
                  value={state.replacementSpeakerKey}
                  onChange={(event) => onTargetSpeakerChange(event.target.value)}
                  autoFocus
                >
                  <option value="">{t(locale, 'transcription.speakerDialog.deleteStrategyClearAndDelete')}</option>
                  {state.candidates.map((candidate) => (
                    <option key={candidate.key} value={candidate.key}>
                      {tf(locale, 'transcription.speakerDialog.deleteStrategyMigrateAndDelete', { name: candidate.name })}
                    </option>
                  ))}
                </select>
              </FormField>
            </PanelSection>
          )}
    </ModalPanel>
  );
});
