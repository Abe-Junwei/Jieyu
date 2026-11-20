import React, { useCallback, useEffect, useRef } from 'react';
import { APP_GLOBAL_TOAST_EVENT, type AppGlobalToastDetail } from '../utils/appGlobalToast';
import type { ToastVariant } from '../contexts/ToastContext';
import { useToastQueue } from '../hooks/useToastQueue';
import { ToastStack } from './ToastStack';

const DEDUP_MS = 4000;
const DEFAULT_DISMISS_MS = 6000;

/**
 * 应用壳层全局 Toast：消费 `dispatchAppGlobalToast`（F-1 / F-3）。
 * 错误默认不自动关闭（ADR-0116）。
 */
export function AppGlobalToastHost(): React.ReactNode {
  const { items, push, dismiss, setPaused } = useToastQueue();
  const lastRef = useRef<{ text: string; variant: ToastVariant; at: number } | null>(null);

  const onToast = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<AppGlobalToastDetail>).detail;
      if (!detail?.message?.trim()) return;
      const v = detail.variant ?? 'info';
      const now = Date.now();
      const prev = lastRef.current;
      if (prev && prev.text === detail.message && prev.variant === v && now - prev.at < DEDUP_MS) {
        return;
      }
      lastRef.current = { text: detail.message, variant: v, at: now };
      const delay = detail.autoDismissMs ?? (v === 'error' ? 0 : DEFAULT_DISMISS_MS);
      push(
        {
          id: `global-toast-${now}-${Math.random().toString(36).slice(2, 7)}`,
          message: detail.message,
          variant: v,
          exiting: false,
        },
        delay,
      );
    },
    [push],
  );

  useEffect(() => {
    window.addEventListener(APP_GLOBAL_TOAST_EVENT, onToast as EventListener);
    return () => window.removeEventListener(APP_GLOBAL_TOAST_EVENT, onToast as EventListener);
  }, [onToast]);

  return (
    <ToastStack
      items={items}
      dismissLabel="Dismiss"
      onDismiss={dismiss}
      onPausedChange={setPaused}
      className="app-global-toast-host"
    />
  );
}
