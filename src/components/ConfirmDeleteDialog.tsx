import { memo } from 'react';
import { normalizeLocale, t } from '../i18n';
import { getConfirmDeleteDialogMessages } from '../i18n/confirmDeleteDialogMessages';

type ConfirmDeleteDialogProps = {
  locale?: string;
  open: boolean;
  /** \u5220\u9664\u7c7b\u578b\u6807\u9898，\u5982"\u5220\u9664\u97f3\u9891"、"\u5220\u9664\u9879\u76ee" */
  title?: string;
  /** \u5220\u9664\u63cf\u8ff0（\u5f53\u4f7f\u7528\u65b0\u63a5\u53e3\u65f6） */
  description?: string;
  /** \u8981\u5220\u9664\u7684\u9879\u76ee\u6570\u91cf（\u7528\u4e8e\u663e\u793a，\u4e0e\u65e7\u63a5\u53e3\u517c\u5bb9） */
  itemCount?: number;
  /** \u663e\u793a\u786e\u8ba4\u4fe1\u606f\u65f6\u662f\u5426\u663e\u793a"\u672c\u6b21\u4f1a\u8bdd\u4e0d\u518d\u63d0\u793a"\u9009\u9879（\u4e0e\u65e7\u63a5\u53e3\u517c\u5bb9） */
  showMuteOption?: boolean;
  muteInSession?: boolean;
  onMuteChange?: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** \u65e7\u63a5\u53e3\u517c\u5bb9：\u603b\u6570\u91cf */
  totalCount?: number;
  /** \u65e7\u63a5\u53e3\u517c\u5bb9：\u542b\u6587\u672c\u6570\u91cf */
  textCount?: number;
  /** \u65e7\u63a5\u53e3\u517c\u5bb9：\u7a7a\u767d\u6570\u91cf */
  emptyCount?: number;
};

export const ConfirmDeleteDialog = memo(function ConfirmDeleteDialog({
  locale,
  open,
  title = '\u786e\u8ba4\u5220\u9664',
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
  const uiLocale = normalizeLocale(locale) ?? 'zh-CN';
  const messages = getConfirmDeleteDialogMessages(uiLocale);

  // \u65e7\u63a5\u53e3\u517c\u5bb9：\u5982\u679c\u4f20\u5165\u4e86 totalCount，\u8bf4\u660e\u662f\u53e5\u6bb5\u5220\u9664
  const isSegmentDelete = totalCount !== undefined;

  const displayDescription = description ?? (
    isSegmentDelete
      ? (totalCount > 1
        ? messages.segmentDeleteMany(totalCount, textCount ?? 0, emptyCount ?? 0)
        : messages.segmentDeleteSingle)
      : (itemCount !== undefined
        ? messages.itemDeleteMany(itemCount)
        : messages.deleteCannotUndo)
  );

  const displayTitle = isSegmentDelete ? messages.defaultTitle : title;

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{displayTitle}</h3>
        </div>
        <div className="dialog-body">
          <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: 14 }}>
            {displayDescription}
          </p>
          {showMuteOption && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>
              <input
                type="checkbox"
                checked={muteInSession}
                onChange={(e) => onMuteChange?.(e.target.checked)}
              />
              {messages.mutePromptInSession}
            </label>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={onCancel}>{t(uiLocale, 'transcription.dialog.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm}>{t(uiLocale, 'transcription.dialog.deleteLayerConfirmButton')}</button>
        </div>
      </div>
    </div>
  );
});
