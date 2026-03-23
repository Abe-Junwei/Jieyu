import { memo } from 'react';

type ConfirmDeleteDialogProps = {
  open: boolean;
  /** 删除类型标题，如"删除音频"、"删除项目" */
  title?: string;
  /** 删除描述（当使用新接口时） */
  description?: string;
  /** 要删除的项目数量（用于显示，与旧接口兼容） */
  itemCount?: number;
  /** 显示确认信息时是否显示"本次会话不再提示"选项（与旧接口兼容） */
  showMuteOption?: boolean;
  muteInSession?: boolean;
  onMuteChange?: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** 旧接口兼容：总数量 */
  totalCount?: number;
  /** 旧接口兼容：含文本数量 */
  textCount?: number;
  /** 旧接口兼容：空白数量 */
  emptyCount?: number;
};

export const ConfirmDeleteDialog = memo(function ConfirmDeleteDialog({
  open,
  title = '确认删除',
  description,
  itemCount,
  showMuteOption = false,
  muteInSession = false,
  onMuteChange,
  onCancel,
  onConfirm,
  totalCount,
  textCount,
  emptyCount,
}: ConfirmDeleteDialogProps) {
  if (!open) return null;

  // 旧接口兼容：如果传入了 totalCount，说明是句段删除
  const isSegmentDelete = totalCount !== undefined;

  const displayDescription = description ?? (
    isSegmentDelete
      ? (totalCount > 1
        ? `将删除 ${totalCount} 个句段（含文本 ${textCount} 个，空白 ${emptyCount} 个）。`
        : '当前句段包含文本内容，删除后无法恢复。')
      : (itemCount !== undefined
        ? `将删除 ${itemCount} 个项目，删除后无法恢复。`
        : '此操作删除后无法恢复。')
  );

  const displayTitle = isSegmentDelete ? '确认删除' : title;

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{displayTitle}</h3>
        </div>
        <div className="dialog-body">
          <p style={{ margin: 0, color: '#334155', fontSize: 14 }}>
            {displayDescription}
          </p>
          {showMuteOption && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', marginTop: 12 }}>
              <input
                type="checkbox"
                checked={muteInSession}
                onChange={(e) => onMuteChange?.(e.target.checked)}
              />
              本次会话后续删除含文本句段时不再提示
            </label>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-danger" onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  );
});
