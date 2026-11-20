import { useCallback, useEffect, useRef } from 'react';
import { APP_GLOBAL_TOAST_EVENT, type AppGlobalToastDetail } from '../utils/appGlobalToast';
import { useToast, type ToastVariant } from '../contexts/ToastContext';

const DEDUP_MS = 4000;

/**
 * 应用壳层全局 Toast：把 `dispatchAppGlobalToast` 转给唯一的 ToastProvider（F-1 / F-3）。
 * 不自带容器，避免与页面内提示条重叠；错误默认不自动关闭（ADR-0116）。
 */
export function AppGlobalToastHost(): null {
  const { showToast } = useToast();
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
      showToast(detail.message, v, detail.autoDismissMs);
    },
    [showToast],
  );

  useEffect(() => {
    window.addEventListener(APP_GLOBAL_TOAST_EVENT, onToast as EventListener);
    return () => window.removeEventListener(APP_GLOBAL_TOAST_EVENT, onToast as EventListener);
  }, [onToast]);

  return null;
}
