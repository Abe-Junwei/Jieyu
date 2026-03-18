import { memo } from 'react';

type ConfirmDeleteDialogProps = {
  open: boolean;
  totalCount: number;
  textCount: number;
  emptyCount: number;
  muteInSession: boolean;
  onMuteChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export const ConfirmDeleteDialog = memo(function ConfirmDeleteDialog({
  open,
  totalCount,
  textCount,
  emptyCount,
  muteInSession,
  onMuteChange,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>确认删除</h3>
        </div>
        <div className="dialog-body">
          <p style={{ margin: 0, color: '#334155', fontSize: 14 }}>
            {totalCount > 1
              ? `将删除 ${totalCount} 个句段（含文本 ${textCount} 个，空白 ${emptyCount} 个）。`
              : '当前句段包含文本内容，删除后无法恢复。'}
          </p>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
            <input
              type="checkbox"
              checked={muteInSession}
              onChange={(e) => onMuteChange(e.target.checked)}
            />
            本次会话后续删除含文本句段时不再提示
          </label>
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-danger" onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  );
});
