import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APP_GLOBAL_TOAST_EVENT, type AppGlobalToastDetail } from '../utils/appGlobalToast';
import type { ToastVariant } from '../contexts/ToastContext';
import '../styles/ai-hub.css';

const DEDUP_MS = 4000;

/**
 * 应用壳层全局 Toast：消费 `dispatchAppGlobalToast`（F-1 / F-3）。
 */
export function AppGlobalToastHost(): React.ReactNode {
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<ToastVariant>('info');
  const lastRef = useRef<{ text: string; variant: ToastVariant; at: number } | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setMessage(null);
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<AppGlobalToastDetail>).detail;
      if (!detail?.message?.trim()) return;
      const v = detail.variant ?? 'info';
      const now = Date.now();
      const prev = lastRef.current;
      if (prev && prev.text === detail.message && prev.variant === v && now - prev.at < DEDUP_MS) {
        return;
      }
      lastRef.current = { text: detail.message, variant: v, at: now };
      setVariant(v);
      setMessage(detail.message);
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
      const delay = detail.autoDismissMs ?? (v === 'error' ? 8000 : 6000);
      if (delay > 0) {
        dismissTimerRef.current = setTimeout(dismiss, delay);
      } else {
        dismissTimerRef.current = null;
      }
    };
    window.addEventListener(APP_GLOBAL_TOAST_EVENT, onToast as EventListener);
    return () => {
      window.removeEventListener(APP_GLOBAL_TOAST_EVENT, onToast as EventListener);
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [dismiss]);

  if (!message) {
    return null;
  }

  return (
    <div className="transcription-toast-container app-global-toast-host" role="status" aria-live="polite">
      <div
        className={`transcription-toast toast-${variant}`}
        onClick={dismiss}
        title="Dismiss"
      >
        {message}
      </div>
    </div>
  );
}
