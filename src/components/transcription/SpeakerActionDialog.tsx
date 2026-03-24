import { memo, useRef } from 'react';
import type { SpeakerActionDialogState } from '../../hooks/speakerManagement/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, state !== null, onClose);

  if (!state) return null;

  const isRename = state.mode === 'rename';
  const isMerge = state.mode === 'merge';
  const isClear = state.mode === 'clear';
  const isDelete = state.mode === 'delete';
  const confirmDisabled = busy
    || (isRename && state.draftName.trim().length === 0)
    || (isMerge && state.targetSpeakerKey.trim().length === 0);

  const dialogTitle = isRename
    ? '重命名说话人'
    : isMerge
      ? '合并说话人'
      : isDelete
        ? '删除说话人实体'
        : '删除说话人标签';

  return (
    <div className="dialog-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="speaker-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h3 id="speaker-dialog-title">{dialogTitle}</h3>
        </div>
        <div className="dialog-body">
          {isRename && (
            <div className="dialog-field">
              <label htmlFor="speaker-rename-input">新的说话人名称</label>
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
              <p style={{ margin: 0, color: '#334155', fontSize: 14 }}>
                {'\u201c'}{state.sourceSpeakerName}{'\u201d'}合并到目标说话人后，其关联句段会一并迁移。
              </p>
              <div className="dialog-field">
                <label htmlFor="speaker-merge-target">目标说话人</label>
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
            <p style={{ margin: 0, color: '#334155', fontSize: 14 }}>
              确认删除{'\u201c'}{state.speakerName}{'\u201d'}的说话人标签？将影响 {state.affectedCount} 条句段。
            </p>
          )}

          {isDelete && (
            <>
              <p style={{ margin: 0, color: '#334155', fontSize: 14 }}>
                删除说话人实体{'\u201c'}{state.sourceSpeakerName}{'\u201d'}后，将影响 {state.affectedCount} 条句段。
              </p>
              <p style={{ margin: 0, color: '#b91c1c', fontSize: 13 }}>
                风险提示：若选择删除说话人标签，相关句段将失去说话人归属。建议优先迁移到其他说话人。
              </p>
              <div className="dialog-field">
                <label htmlFor="speaker-delete-target">删除策略</label>
                <select
                  id="speaker-delete-target"
                  className="input"
                  value={state.replacementSpeakerKey}
                  onChange={(event) => onTargetSpeakerChange(event.target.value)}
                  autoFocus
                >
                  <option value="">删除说话人标签并删除该说话人实体</option>
                  {state.candidates.map((candidate) => (
                    <option key={candidate.key} value={candidate.key}>迁移后删除：{candidate.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>取消</button>
          <button
            className={`btn ${isClear || isDelete ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {busy
              ? '处理中…'
              : isRename
                ? '确认改名'
                : isMerge
                  ? '确认合并'
                  : isDelete
                      ? '确认删除说话人实体'
                    : '确认删除标签'}
          </button>
        </div>
      </div>
    </div>
  );
});
