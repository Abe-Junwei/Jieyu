import { memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';

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
  useFocusTrap(dialogRef, open, onCancel);

  if (!open) return null;

  const layerTypeLabel = layerType === 'translation' ? '翻译层' : '转写层';

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
          <h3 id="delete-layer-title">删除层</h3>
        </div>
        <div className="dialog-body">
          <p style={{ margin: '0 0 16px 0', color: '#ef4444', fontSize: 14, fontWeight: 500 }}>
            警告：此操作不可撤销
          </p>
          <p style={{ margin: '0 0 8px 0', color: '#334155', fontSize: 14 }}>
            确定要删除层「{layerName}」吗？
          </p>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            类型：{layerTypeLabel}
            <br />
            文本记录：{textCount} 条
            {textCount > 0 && (
              <span style={{ color: '#ef4444' }}>
                <br />
                删除后将无法恢复这些文本内容。
              </span>
            )}
          </p>
          {warningMessage && (
            <p style={{ margin: '12px 0 0 0', color: '#b45309', fontSize: 13, fontWeight: 500 }}>
              提示：{warningMessage}
            </p>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer', marginTop: 12 }}>
            <input
              type="checkbox"
              checked={keepUtterances}
              onChange={(e) => onKeepUtterancesChange?.(e.target.checked)}
            />
            保留现有语段区间
          </label>
          <p style={{ margin: '8px 0 0 0', color: '#64748b', fontSize: 12 }}>
            未勾选时：仅清理不再被任何层引用的语段边界。
          </p>
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-danger" onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
});
