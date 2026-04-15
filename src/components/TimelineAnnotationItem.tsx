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
import { MaterialSymbol } from './ui/MaterialSymbol';
import { tf, useLocale } from '../i18n';
import type { UtteranceSelfCertainty } from '../utils/utteranceSelfCertainty';

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
  /** 标注者自我确信度角标 | Annotator self-certainty badge */
  selfCertainty?: UtteranceSelfCertainty;
  selfCertaintyTitle?: string;
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
  /** 层级显示样式 | Layer display style overrides */
  layerStyle?: CSSProperties;
  /** 内容方向 | Text direction */
  contentDirection?: 'ltr' | 'rtl';
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
  selfCertainty,
  selfCertaintyTitle,
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
  layerStyle,
  contentDirection,
}: TimelineAnnotationItemProps) {
  const locale = useLocale();

  return (
    <div
      className={[
        'timeline-annotation',
        isSelected ? 'timeline-annotation-selected' : '',
        isActive ? 'timeline-annotation-active' : '',
        isCompact ? 'timeline-annotation-compact' : '',
        !draft.trim() && !isActive ? 'timeline-annotation-empty' : '',
        speakerLabel ? 'timeline-annotation-has-speaker' : '',
        hasTrailingTools ? 'timeline-annotation-has-tools' : '',
        typeof confidence === 'number' && confidence < 0.5 ? 'timeline-annotation-confidence-low' : '',
        typeof confidence === 'number' && confidence >= 0.5 && confidence < 0.75 ? 'timeline-annotation-confidence-mid' : '',
        selfCertainty ? 'timeline-annotation-has-self-certainty' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left,
        width,
        ...(speakerColor ? ({ '--speaker-color': speakerColor } as CSSProperties) : {}),
        ...layerStyle,
      }}
      dir={contentDirection}
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
          title={tf(locale, 'transcription.timeline.speakerTitle', { name: speakerLabel })}
        >
          {isCompact ? '●' : speakerLabel}
        </span>
      )}
      {overlapCycleIndicator && overlapCycleIndicator.total > 1 && isActive && (
        <span
          className="timeline-annotation-overlap-cycle-badge"
          title={tf(locale, 'transcription.timeline.overlapCycleTitle', {
            index: overlapCycleIndicator.index,
            total: overlapCycleIndicator.total,
          })}
        >
          {overlapCycleIndicator.index}/{overlapCycleIndicator.total}
        </span>
      )}
      {content ? content : isActive ? (
        <input
          className="timeline-annotation-input"
          value={draft}
          autoFocus
          placeholder={placeholder}
          dir={contentDirection}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      ) : (
        <span>{draft || '\u00A0'}</span>
      )}
      {tools ? <div className="timeline-annotation-tools">{tools}</div> : null}
      {selfCertainty === 'certain' && (
        <span
          className="timeline-annotation-self-certainty timeline-annotation-self-certainty--certain"
          title={selfCertaintyTitle}
          aria-label={selfCertaintyTitle}
        >
          <MaterialSymbol name="check" aria-hidden className="timeline-annotation-self-certainty-icon" />
        </span>
      )}
      {selfCertainty === 'not_understood' && (
        <span
          className="timeline-annotation-self-certainty timeline-annotation-self-certainty--not-understood"
          title={selfCertaintyTitle}
          aria-label={selfCertaintyTitle}
        >
          <MaterialSymbol name="question_mark" aria-hidden className="timeline-annotation-self-certainty-icon" />
        </span>
      )}
      {selfCertainty === 'uncertain' && (
        <span
          className="timeline-annotation-self-certainty timeline-annotation-self-certainty--uncertain"
          title={selfCertaintyTitle}
          aria-label={selfCertaintyTitle}
        >
          <span className="timeline-annotation-self-certainty-wavy" aria-hidden>
            {'\u2248'}
          </span>
        </span>
      )}
      {noteCount != null && noteCount > 0 && onNoteClick && (
        <NoteDocumentIcon
          className="timeline-annotation-note-icon timeline-annotation-note-icon-active"
          onClick={(e) => { e.stopPropagation(); onNoteClick?.(e); }}
          ariaLabel={tf(locale, 'transcription.notes.count', { count: noteCount })}
          title={tf(locale, 'transcription.notes.count', { count: noteCount })}
        />
      )}
    </div>
  );
});
