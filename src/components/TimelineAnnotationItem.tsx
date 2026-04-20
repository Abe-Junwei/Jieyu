import { memo, type CSSProperties, type ChangeEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { TimelineDraftEditorSurface, type TimelineDraftSaveStatus } from './transcription/TimelineDraftEditorSurface';
import { t, tf, useLocale } from '../i18n';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { TimelineBadges } from './TimelineBadges';

// ── Types ────────────────────────────────────────────────────

export interface TimelineAnnotationItemProps {
  left: number;
  width: number;
  isSelected: boolean;
  isLayerCurrent?: boolean;
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
  selfCertainty?: UnitSelfCertainty;
  selfCertaintyTitle?: string;
  selfCertaintyAmbiguous?: boolean;
  skipProcessing?: boolean;
  content?: ReactNode;
  tools?: ReactNode;
  hasTrailingTools?: boolean;
  saveStatus?: TimelineDraftSaveStatus;
  onRetrySave?: () => void;
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
  isLayerCurrent,
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
  selfCertaintyAmbiguous,
  skipProcessing,
  content,
  tools,
  hasTrailingTools,
  saveStatus,
  onRetrySave,
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

  const rendersInlineEditor = !content && !skipProcessing && isActive;

  return (
    <div
      className={[
        'timeline-annotation',
        isSelected ? 'timeline-annotation-selected' : '',
        isLayerCurrent ? 'timeline-annotation-layer-current' : '',
        isActive ? 'timeline-annotation-active' : '',
        isCompact ? 'timeline-annotation-compact' : '',
        !draft.trim() && !isActive ? 'timeline-annotation-empty' : '',
        speakerLabel ? 'timeline-annotation-has-speaker' : '',
        hasTrailingTools ? 'timeline-annotation-has-tools' : '',
        typeof confidence === 'number' && confidence < 0.5 ? 'timeline-annotation-confidence-low' : '',
        typeof confidence === 'number' && confidence >= 0.5 && confidence < 0.75 ? 'timeline-annotation-confidence-mid' : '',
        selfCertainty || selfCertaintyAmbiguous ? 'timeline-annotation-has-self-certainty' : '',
        skipProcessing ? 'timeline-annotation-skipped' : '',
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
      {speakerLabel ? (
        <span
          className="timeline-annotation-speaker-badge"
          title={tf(locale, 'transcription.timeline.speakerTitle', { name: speakerLabel })}
          aria-hidden
        />
      ) : null}
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
      {content ? content : skipProcessing ? (
        <span className="timeline-annotation-skipped-label">{t(locale, 'transcription.action.skipProcessingMarked')}</span>
      ) : isActive ? (
        <TimelineDraftEditorSurface
          inputClassName="timeline-annotation-input"
          value={draft}
          autoFocus
          {...(placeholder !== undefined ? { placeholder } : {})}
          {...(contentDirection !== undefined ? { dir: contentDirection } : {})}
          {...(saveStatus !== undefined ? { saveStatus } : {})}
          {...(onRetrySave !== undefined ? { onRetry: onRetrySave } : {})}
          {...(tools ? { tools } : {})}
          toolsClassName="timeline-annotation-tools"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={onChange}
          {...(onFocus ? { onFocus } : {})}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      ) : (
        <span>{draft || '\u00A0'}</span>
      )}
      {tools && !rendersInlineEditor && !content ? <div className="timeline-annotation-tools">{tools}</div> : null}
      <TimelineBadges
        locale={locale}
        {...(selfCertainty ? { selfCertainty } : {})}
        {...(selfCertaintyTitle ? { selfCertaintyTitle } : {})}
        {...(selfCertaintyAmbiguous ? { selfCertaintyAmbiguous } : {})}
        {...(noteCount != null ? { noteCount } : {})}
        {...(onNoteClick ? {
          onNoteClick: (event) => {
            onNoteClick(event);
          },
        } : {})}
      />
    </div>
  );
});
