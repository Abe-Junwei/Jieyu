import React, { useEffect, useRef } from 'react';
import type { ToastItem } from '../contexts/ToastContext';

interface Props {
  items: ToastItem[];
  dismissLabel: string;
  onDismiss: (id: string) => void;
  onPausedChange: (paused: boolean) => void;
  className?: string;
}

/** 提示条堆叠：新的在下；悬停、键盘焦点、窗口失焦暂停计时（ADR-0116）。 | Toast stack with pause rules. */
export function ToastStack({
  items,
  dismissLabel,
  onDismiss,
  onPausedChange,
  className,
}: Props): React.ReactNode {
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const blurRef = useRef(false);

  const sync = () => onPausedChange(hoverRef.current || focusRef.current || blurRef.current);

  useEffect(() => {
    const onBlur = () => {
      blurRef.current = true;
      onPausedChange(true);
    };
    const onFocus = () => {
      blurRef.current = false;
      onPausedChange(hoverRef.current || focusRef.current);
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [onPausedChange]);

  if (items.length === 0) return null;

  return (
    <div
      className={`transcription-toast-container${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => {
        hoverRef.current = true;
        sync();
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
        sync();
      }}
      onFocus={() => {
        focusRef.current = true;
        sync();
      }}
      onBlur={() => {
        focusRef.current = false;
        sync();
      }}
    >
      {items.map((item) => {
        const hasAction =
          item.actionLabel !== undefined &&
          item.actionLabel.length > 0 &&
          item.onAction !== undefined;
        return (
          <div
            key={item.id}
            role={item.variant === 'error' ? 'alert' : undefined}
            className={`transcription-toast toast-${item.variant}${hasAction ? ' transcription-toast-with-action' : ''}${item.exiting === true ? ' transcription-toast-exiting' : ''}`}
          >
            <span className="transcription-toast-dot" aria-hidden="true" />
            <span className="transcription-toast-text">{item.message}</span>
            {hasAction ? (
              <button
                type="button"
                className="transcription-toast-action"
                onClick={() => item.onAction?.()}
              >
                {item.actionLabel}
              </button>
            ) : null}
            <button
              type="button"
              className="transcription-toast-close"
              aria-label={dismissLabel}
              onClick={() => onDismiss(item.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
