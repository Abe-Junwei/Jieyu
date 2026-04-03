import { memo, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { SpeakerActionDialogState } from '../../hooks/speakerManagement/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { t, tf, useLocale } from '../../i18n';
import { DialogShell } from '../ui/DialogShell';
import { PanelSection } from '../ui/PanelSection';
import { PanelSummary } from '../ui/PanelSummary';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, state !== null, onClose);

  if (!state) return null;
  if (typeof document === 'undefined') return null;

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
  const confirmButtonClassName = isClear || isDelete ? 'panel-button panel-button--danger' : 'panel-button panel-button--primary';
  const summaryProps = {
    ...(riskCopy ? { supportingText: riskCopy, supportingClassName: 'panel-note panel-note--danger' } : {}),
  };

  return createPortal(
    <div className="dialog-overlay dialog-overlay-topmost" onClick={onClose} role="presentation">
      <DialogShell
        containerRef={dialogRef}
        className="speaker-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="speaker-dialog-title"
        title={<span id="speaker-dialog-title">{dialogTitle}</span>}
        titleClassName="speaker-action-dialog-title"
        bodyClassName="speaker-action-dialog-body"
        footerClassName="speaker-action-dialog-footer"
        actions={(
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={`${dialogTitle} ${t(locale, 'transcription.dialog.cancel')}`}
            title={`${dialogTitle} ${t(locale, 'transcription.dialog.cancel')}`}
            disabled={busy}
          >
            <X size={18} />
          </button>
        )}
        footer={(
          <>
            <button className="panel-button panel-button--ghost" onClick={onClose} disabled={busy}>{t(locale, 'transcription.dialog.cancel')}</button>
            <button
              className={confirmButtonClassName}
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
            </button>
          </>
        )}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <PanelSummary
          className="speaker-action-dialog-summary"
          description={summaryCopy}
          meta={(
            <div className="panel-meta">
              {summaryMeta.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className={`panel-chip${riskCopy && index === 1 ? ' panel-chip--danger' : ''}`}
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {...summaryProps}
        />

          {isRename && (
            <PanelSection className="speaker-action-dialog-field-stack">
              <div className="dialog-field">
                <label htmlFor="speaker-rename-input">{t(locale, 'transcription.speakerDialog.renameLabel')}</label>
                <input
                  id="speaker-rename-input"
                  className="input panel-input layer-action-dialog-input"
                  value={state.draftName}
                  onChange={(event) => onDraftNameChange(event.target.value)}
                  placeholder={state.speakerName}
                  autoFocus
                />
              </div>
            </PanelSection>
          )}

          {isMerge && (
            <PanelSection className="speaker-action-dialog-field-stack">
              <div className="dialog-field">
                <label htmlFor="speaker-merge-target">{t(locale, 'transcription.speakerDialog.mergeTargetLabel')}</label>
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
              </div>
            </PanelSection>
          )}

          {isDelete && (
            <PanelSection className="speaker-action-dialog-field-stack">
              <div className="dialog-field">
                <label htmlFor="speaker-delete-target">{t(locale, 'transcription.speakerDialog.deleteStrategyLabel')}</label>
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
              </div>
            </PanelSection>
          )}
      </DialogShell>
    </div>,
    document.body,
  );
});
