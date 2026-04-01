import { memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SpeakerActionDialogState } from '../../hooks/speakerManagement/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { t, tf, useLocale } from '../../i18n';

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

  return createPortal(
    <div className="dialog-overlay dialog-overlay-topmost" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="speaker-dialog-title"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h3 id="speaker-dialog-title">{dialogTitle}</h3>
        </div>
        <div className="dialog-body">
          {isRename && (
            <div className="dialog-field">
              <label htmlFor="speaker-rename-input">{t(locale, 'transcription.speakerDialog.renameLabel')}</label>
              <input
                id="speaker-rename-input"
                className="input"
                value={state.draftName}
                onChange={(event) => onDraftNameChange(event.target.value)}
                placeholder={state.speakerName}
                autoFocus
              />
            </div>
          )}

          {isMerge && (
            <>
              <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: 14 }}>
                {tf(locale, 'transcription.speakerDialog.mergeHint', { sourceSpeakerName: state.sourceSpeakerName })}
              </p>
              <div className="dialog-field">
                <label htmlFor="speaker-merge-target">{t(locale, 'transcription.speakerDialog.mergeTargetLabel')}</label>
                <select
                  id="speaker-merge-target"
                  className="input"
                  value={state.targetSpeakerKey}
                  onChange={(event) => onTargetSpeakerChange(event.target.value)}
                  autoFocus
                >
                  {state.candidates.map((candidate) => (
                    <option key={candidate.key} value={candidate.key}>{candidate.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {isClear && (
            <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: 14 }}>
              {tf(locale, 'transcription.speakerDialog.clearHint', {
                speakerName: state.speakerName,
                affectedCount: state.affectedCount,
              })}
            </p>
          )}

          {isDelete && (
            <>
              <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: 14 }}>
                {tf(locale, 'transcription.speakerDialog.deleteEntityHint', {
                  sourceSpeakerName: state.sourceSpeakerName,
                  affectedCount: state.affectedCount,
                })}
              </p>
              <p style={{ margin: 0, color: 'var(--state-danger-text)', fontSize: 13 }}>
                {t(locale, 'transcription.speakerDialog.deleteEntityRisk')}
              </p>
              <div className="dialog-field">
                <label htmlFor="speaker-delete-target">{t(locale, 'transcription.speakerDialog.deleteStrategyLabel')}</label>
                <select
                  id="speaker-delete-target"
                  className="input"
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
            </>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t(locale, 'transcription.dialog.cancel')}</button>
          <button
            className={`btn ${isClear || isDelete ? 'btn-danger' : 'btn-primary'}`}
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
        </div>
      </div>
    </div>,
    document.body,
  );
});
