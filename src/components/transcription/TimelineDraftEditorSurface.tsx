import type {
  ChangeEventHandler,
  CSSProperties,
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEvent as ReactPointerEvent,
  PointerEventHandler,
  ReactNode,
} from 'react';
import { t, useLocale } from '../../i18n';

export type TimelineDraftSaveStatus = 'dirty' | 'saving' | 'error' | undefined;

type SurfaceResizeEdge = 'top' | 'bottom';

interface TimelineDraftEditorSurfaceProps {
  wrapperClassName?: string;
  inputClassName: string;
  value: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  dir?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  rows?: number;
  saveStatus?: TimelineDraftSaveStatus;
  onRetry?: (() => void) | undefined;
  onResizeHandlePointerDown?: ((event: ReactPointerEvent<HTMLDivElement>, edge: SurfaceResizeEdge) => void) | undefined;
  overlay?: ReactNode;
  tools?: ReactNode;
  toolsClassName?: string;
  onPointerDown?: PointerEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onDoubleClick?: MouseEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onBlur: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onClick?: MouseEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onContextMenu?: MouseEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  /** 覆盖输入框行内排版（字号、字体等），与层显示样式对齐 | Inline typography overrides for layer display settings */
  inputStyle?: CSSProperties;
}

/**
 * 统一的草稿编辑表面 | Shared draft editor surface
 *
 * 仅统一输入壳、状态点与工具位；最终保存职责由调用方 adapter 决定。
 * | Unifies the input shell, save indicator, and tools slot; the caller keeps ownership of persistence semantics.
 */
export function TimelineDraftEditorSurface({
  wrapperClassName,
  inputClassName,
  value,
  placeholder,
  title,
  disabled = false,
  dir,
  autoFocus = false,
  multiline = false,
  rows,
  saveStatus,
  onRetry,
  onResizeHandlePointerDown,
  overlay,
  tools,
  toolsClassName,
  onPointerDown,
  onDoubleClick,
  onFocus,
  onChange,
  onBlur,
  onClick,
  onContextMenu,
  onKeyDown,
  inputStyle,
}: TimelineDraftEditorSurfaceProps) {
  const locale = useLocale();

  const surfaceClassName = [
    'timeline-draft-editor-surface',
    multiline ? 'timeline-draft-editor-surface-multiline' : '',
    tools ? 'timeline-draft-editor-surface-has-tools' : '',
    onResizeHandlePointerDown ? 'timeline-draft-editor-surface-resizable' : '',
    wrapperClassName ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className={surfaceClassName}>
      {saveStatus === 'error' && onRetry ? (
        <button
          type="button"
          className="timeline-text-item-status-dot timeline-text-item-status-dot-error timeline-text-item-status-dot-action"
          title={t(locale, 'transcription.timeline.save.retry')}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
        />
      ) : saveStatus ? (
        <span
          className={`timeline-text-item-status-dot timeline-text-item-status-dot-${saveStatus}`}
          title={saveStatus === 'saving'
            ? t(locale, 'transcription.timeline.save.saving')
            : t(locale, 'transcription.timeline.save.unsaved')}
        />
      ) : null}

      {multiline ? (
        <>
          {!disabled && onResizeHandlePointerDown ? (
            <>
              <div
                className="timeline-draft-editor-resize-handle timeline-draft-editor-resize-handle-top"
                aria-label="Resize from top edge"
                onPointerDown={(event) => onResizeHandlePointerDown(event, 'top')}
              />
              <div
                className="timeline-draft-editor-resize-handle timeline-draft-editor-resize-handle-bottom"
                aria-label="Resize from bottom edge"
                onPointerDown={(event) => onResizeHandlePointerDown(event, 'bottom')}
              />
            </>
          ) : null}
          <textarea
            className={inputClassName}
            data-allow-native-scroll="true"
            value={value}
            rows={rows}
            placeholder={placeholder}
            title={title}
            disabled={disabled}
            autoFocus={autoFocus}
            dir={dir}
            style={inputStyle}
            onFocus={onFocus as FocusEventHandler<HTMLTextAreaElement> | undefined}
            onChange={onChange as ChangeEventHandler<HTMLTextAreaElement>}
            onBlur={onBlur as FocusEventHandler<HTMLTextAreaElement>}
            onClick={onClick as MouseEventHandler<HTMLTextAreaElement> | undefined}
            onDoubleClick={onDoubleClick as MouseEventHandler<HTMLTextAreaElement> | undefined}
            onContextMenu={onContextMenu as MouseEventHandler<HTMLTextAreaElement> | undefined}
            onPointerDown={onPointerDown as PointerEventHandler<HTMLTextAreaElement> | undefined}
            onKeyDown={onKeyDown as KeyboardEventHandler<HTMLTextAreaElement> | undefined}
          />
        </>
      ) : (
        <input
          type="text"
          className={inputClassName}
          data-allow-native-scroll="true"
          value={value}
          placeholder={placeholder}
          title={title}
          disabled={disabled}
          autoFocus={autoFocus}
          dir={dir}
          style={inputStyle}
          onFocus={onFocus as FocusEventHandler<HTMLInputElement> | undefined}
          onChange={onChange as ChangeEventHandler<HTMLInputElement>}
          onBlur={onBlur as FocusEventHandler<HTMLInputElement>}
          onClick={onClick as MouseEventHandler<HTMLInputElement> | undefined}
          onDoubleClick={onDoubleClick as MouseEventHandler<HTMLInputElement> | undefined}
          onContextMenu={onContextMenu as MouseEventHandler<HTMLInputElement> | undefined}
          onPointerDown={onPointerDown as PointerEventHandler<HTMLInputElement> | undefined}
          onKeyDown={onKeyDown as KeyboardEventHandler<HTMLInputElement> | undefined}
        />
      )}

      {overlay ? (
        <div className="timeline-draft-editor-surface-overlay">
          {overlay}
        </div>
      ) : null}

      {tools ? (
        <div className={toolsClassName ?? 'timeline-draft-editor-surface-tools'}>
          {tools}
        </div>
      ) : null}
    </div>
  );
}
