/**
 * UndoHistory | 撤销历史组件
 *
 * 展示撤销/重做芯片(chip)和完整的撤销历史列表
 * Displays undo chip and full undo history dropdown with indexed items
 */

import { type FC, useCallback } from 'react';
import { Undo2 } from 'lucide-react';
import { detectLocale, t, tf } from '../../../i18n';

export interface UndoHistoryProps {
  // 状态 | State
  canUndo: boolean;
  undoLabel: string;
  undoHistory: string[];
  isHistoryVisible: boolean;

  // 回调 | Callbacks
  onToggleHistoryVisible: (visible: boolean | ((v: boolean) => boolean)) => void;
  onJumpToHistoryIndex: (index: number) => void;
}

const UndoHistory: FC<UndoHistoryProps> = ({
  canUndo,
  undoLabel,
  undoHistory,
  isHistoryVisible,
  onToggleHistoryVisible,
  onJumpToHistoryIndex,
}) => {
  const locale = detectLocale();

  const handleChipClick = useCallback(() => {
    onToggleHistoryVisible((v) => !v);
  }, [onToggleHistoryVisible]);

  const handleHistoryItemClick = useCallback((index: number) => {
    onJumpToHistoryIndex(index);
    onToggleHistoryVisible(false);
  }, [onJumpToHistoryIndex, onToggleHistoryVisible]);

  if (!canUndo || !undoLabel) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="transcription-undo-chip"
        title={tf(locale, 'transcription.undo.next', { label: undoLabel })}
        onClick={handleChipClick}
      >
        <Undo2 size={13} />
        <span className="transcription-undo-chip-label">
          {tf(locale, 'transcription.undo.current', { label: undoLabel })}
        </span>
      </button>
      {isHistoryVisible && (
        <div className="transcription-undo-history">
          <div className="transcription-undo-history-title">
            {t(locale, 'transcription.undo.historyTitle')}
          </div>
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
