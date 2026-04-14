/**
 * UndoHistory | 撤销历史组件
 *
 * 展示撤销/重做芯片(chip)和完整的撤销历史列表
 * Displays undo chip and full undo history dropdown with indexed items
 */

import { type FC, useCallback } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { t, tf, useLocale } from '../../../i18n';
import { JIEYU_LUCIDE_AI_PANEL_SM, JIEYU_LUCIDE_UNDO_CHIP } from '../../../utils/jieyuLucideIcon';

export interface UndoHistoryProps {
  // 状态 | State
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  undoHistory: string[];
  isHistoryVisible: boolean;

  // 回调 | Callbacks
  onToggleHistoryVisible: (visible: boolean | ((v: boolean) => boolean)) => void;
  onJumpToHistoryIndex: (index: number) => void;
  onRedo: () => void;
}

const UndoHistory: FC<UndoHistoryProps> = ({
  canUndo,
  canRedo,
  undoLabel,
  undoHistory,
  isHistoryVisible,
  onToggleHistoryVisible,
  onJumpToHistoryIndex,
  onRedo,
}) => {
  const locale = useLocale();
  const canShowUndoChip = canUndo && Boolean(undoLabel);

  const handleChipClick = useCallback(() => {
    onToggleHistoryVisible((v) => !v);
  }, [onToggleHistoryVisible]);

  const handleHistoryItemClick = useCallback((index: number) => {
    onJumpToHistoryIndex(index);
    onToggleHistoryVisible(false);
  }, [onJumpToHistoryIndex, onToggleHistoryVisible]);

  const handleRedoClick = useCallback(() => {
    onRedo();
    onToggleHistoryVisible(false);
  }, [onRedo, onToggleHistoryVisible]);

  if (!canShowUndoChip && !canRedo) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="transcription-undo-chip"
        title={canShowUndoChip
          ? tf(locale, 'transcription.undo.next', { label: undoLabel })
          : t(locale, 'transcription.toolbar.redo')}
        onClick={handleChipClick}
      >
        {canShowUndoChip ? <Undo2 aria-hidden className={JIEYU_LUCIDE_UNDO_CHIP} /> : <Redo2 aria-hidden className={JIEYU_LUCIDE_UNDO_CHIP} />}
        <span className="transcription-undo-chip-label">
          {canShowUndoChip
            ? tf(locale, 'transcription.undo.current', { label: undoLabel })
            : t(locale, 'transcription.toolbar.redo')}
        </span>
      </button>
      {isHistoryVisible && (
        <div className="transcription-undo-history">
          <div className="transcription-undo-history-title">
            {t(locale, 'transcription.undo.historyTitle')}
          </div>
          {canRedo && (
            <button
              type="button"
              className="transcription-undo-history-item transcription-undo-history-redo"
              onClick={handleRedoClick}
              title={t(locale, 'transcription.toolbar.redo')}
            >
              <Redo2 aria-hidden className={JIEYU_LUCIDE_AI_PANEL_SM} />
              <span>{t(locale, 'transcription.toolbar.redo')}</span>
            </button>
          )}
          {undoHistory.map((label, idx) => (
            <button
              key={`${label}-${idx}`}
              type="button"
              className="transcription-undo-history-item"
              onClick={() => handleHistoryItemClick(idx)}
              title={tf(locale, 'transcription.undo.jumpTo', { label })}
            >
              {idx + 1}. {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

export default UndoHistory;
