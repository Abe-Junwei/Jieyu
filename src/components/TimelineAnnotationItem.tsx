import {
  memo,
  type CSSProperties,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { NoteDocumentIcon } from './NoteDocumentIcon';

// ── Types ────────────────────────────────────────────────────

export interface TimelineAnnotationItemProps {
  left: number;
  width: number;
  isSelected: boolean;
  isActive: boolean;
  isCompact: boolean;
  title: string;
  draft: string;
  placeholder?: string;
  speakerLabel?: string;
  speakerColor?: string;
  noteCount?: number;
  overlapCycleIndicator?: { index: number; total: number };
  /** AI confidence 0.0–1.0；低于阈值时渲染警示色 | AI confidence; triggers warning style below threshold */
  confidence?: number;
  content?: ReactNode;
  tools?: ReactNode;
  hasTrailingTools?: boolean;
  onClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onDoubleClick: () => void;
  onResizeStartPointerDown: (e: PointerEvent<HTMLSpanElement>) => void;
  onResizeEndPointerDown: (e: PointerEvent<HTMLSpanElement>) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  onBlur: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onNoteClick?: (e: MouseEvent) => void;
}

// ── Component ────────────────────────────────────────────────

export const TimelineAnnotationItem = memo(function TimelineAnnotationItem({
  left,
  width,
  isSelected,
  isActive,
  isCompact,
  title,
  draft,
  placeholder,
  speakerLabel,
  speakerColor,
  noteCount,
  overlapCycleIndicator,
  confidence,
  content,
  tools,
  hasTrailingTools,
  onClick,
  onContextMenu,
  onDoubleClick,
  onResizeStartPointerDown,
  onResizeEndPointerDown,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onNoteClick,
}: TimelineAnnotationItemProps) {
  return (
    <div
      className={[
        'timeline-annotation',
        isSelected ? 'timeline-annotation-selected' : '',
        isActive ? 'timeline-annotation-active' : '',
        isCompact ? 'timeline-annotation-compact' : '',
        speakerLabel ? 'timeline-annotation-has-speaker' : '',
        hasTrailingTools ? 'timeline-annotation-has-tools' : '',
        typeof confidence === 'number' && confidence < 0.5 ? 'timeline-annotation-confidence-low' : '',
        typeof confidence === 'number' && confidence >= 0.5 && confidence < 0.75 ? 'timeline-annotation-confidence-mid' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left,
        width,
        ...(speakerColor ? ({ '--speaker-color': speakerColor } as CSSProperties) : {}),
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      onDoubleClick={onDoubleClick}
    >
      <span
        className="timeline-annotation-resize-handle timeline-annotation-resize-handle-start"
        onPointerDown={onResizeStartPointerDown}
      />
      <span
        className="timeline-annotation-resize-handle timeline-annotation-resize-handle-end"
        onPointerDown={onResizeEndPointerDown}
      />
      {speakerLabel && (
        <span
          className={`timeline-annotation-speaker-badge${isCompact ? ' timeline-annotation-speaker-badge-compact' : ''}`}
          title={`说话人：${speakerLabel}`}
        >
          {isCompact ? '●' : speakerLabel}
        </span>
      )}
      {overlapCycleIndicator && overlapCycleIndicator.total > 1 && isActive && (
        <span className="timeline-annotation-overlap-cycle-badge" title={`重叠候选 ${overlapCycleIndicator.index}/${overlapCycleIndicator.total}，再次点击可轮换`}>
          {overlapCycleIndicator.index}/{overlapCycleIndicator.total}
        </span>
      )}
      {content ? content : isActive ? (
        <input
          className="timeline-annotation-input"
          value={draft}
          autoFocus
          placeholder={placeholder}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      ) : (
        <span>{draft || '\u00A0'}</span>
      )}
      {tools ? <div className="timeline-annotation-tools">{tools}</div> : null}
      {noteCount != null && noteCount > 0 && onNoteClick && (
        <NoteDocumentIcon
          className="timeline-annotation-note-icon timeline-annotation-note-icon-active"
          onClick={(e) => { e.stopPropagation(); onNoteClick?.(e); }}
          ariaLabel={`${noteCount} 条备注`}
          title={`${noteCount} 条备注`}
        />
      )}
    </div>
  );
});
