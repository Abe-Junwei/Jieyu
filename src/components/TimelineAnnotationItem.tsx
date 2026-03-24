import {
  memo,
  type CSSProperties,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';

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
  /** AI confidence 0.0–1.0；低于阈值时渲染警示色 | AI confidence; triggers warning style below threshold */
  confidence?: number;
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
  confidence,
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
      {isActive ? (
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
      {noteCount != null && noteCount > 0 && (
        <svg
          className="timeline-annotation-note-icon"
          onClick={(e) => { e.stopPropagation(); onNoteClick?.(e); }}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>{`${noteCount} 条备注`}</title>
          <path d="M4.5 1.5h5l3 3v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M6.5 7h3M6.5 9.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
});
