import type { ToastVariant } from '../contexts/ToastContext';

export const APP_GLOBAL_TOAST_EVENT = 'jieyu:app-global-toast';

export type AppGlobalToastDetail = {
  message: string;
  /** 对齐 ToastContext 变体 | Matches ToastContext variants */
  variant?: ToastVariant;
  autoDismissMs?: number;
};

/**
 * 在 `AppGlobalToastHost` 挂载后向用户展示全局 Toast（不依赖转写页 `ToastProvider`）。
 * Shows a global toast once `AppGlobalToastHost` is mounted (works outside transcription `ToastProvider`).
 */
export function dispatchAppGlobalToast(detail: AppGlobalToastDetail): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<AppGlobalToastDetail>(APP_GLOBAL_TOAST_EVENT, { detail }));
}
