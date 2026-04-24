import { useEffect } from 'react';

import type { ToastContextValue } from '../../contexts/ToastContext';
import { FIRE_AND_FORGET_ERROR_EVENT, type FireAndForgetErrorDetail } from '../../utils/fireAndForget';

type ToastMessageFn = (key: string, opts?: Record<string, unknown>) => string;

type TaskRecoveredDetail = { count: number };

type WebllmWarmupDetail = {
  status?: 'success' | 'error' | 'cancelled';
  message?: string;
};

const WINDOW_TOAST_EVENTS = ['taskrunner:stale-recovered', 'ai:webllm-warmup'] as const;

interface ToastControllerWindowEffectsInput {
  enabled: boolean;
  showToast: ToastContextValue['showToast'];
  tf: ToastMessageFn;
}

export function useToastControllerWindowEvents(input: ToastControllerWindowEffectsInput) {
  const { enabled, showToast, tf } = input;

  useEffect(() => {
    if (!enabled) return;

    const dispatchWindowToastEvent = (eventName: (typeof WINDOW_TOAST_EVENTS)[number], e: Event) => {
      if (eventName === 'taskrunner:stale-recovered') {
        const count = (e as CustomEvent<TaskRecoveredDetail>).detail?.count ?? 0;
        if (count > 0) {
          showToast(tf('transcription.toast.taskRecovered', { count }), 'info');
        }
        return;
      }

      const detail = (e as CustomEvent<WebllmWarmupDetail>).detail;
      if (!detail?.message) return;
      showToast(detail.message, detail.status === 'error' ? 'error' : 'info', 2000);
    };

    const listeners = WINDOW_TOAST_EVENTS.map((eventName) => {
      const listener = (e: Event) => dispatchWindowToastEvent(eventName, e);
      window.addEventListener(eventName, listener);
      return { eventName, listener };
    });

    return () => {
      listeners.forEach(({ eventName, listener }) => {
        window.removeEventListener(eventName, listener);
      });
    };
  }, [enabled, showToast, tf]);
}

export function useFireAndForgetErrorToast(input: ToastControllerWindowEffectsInput) {
  const { enabled, showToast, tf } = input;

  useEffect(() => {
    if (!enabled) return;

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<FireAndForgetErrorDetail>).detail;
      const context = detail?.context?.trim() ?? '';
      if (context.length > 0) {
        showToast(tf('transcription.toast.asyncActionFailedWithContext', { context }), 'error');
        return;
      }
      showToast(tf('transcription.toast.asyncActionFailed'), 'error');
    };

    window.addEventListener(FIRE_AND_FORGET_ERROR_EVENT, listener);
    return () => {
      window.removeEventListener(FIRE_AND_FORGET_ERROR_EVENT, listener);
    };
  }, [enabled, showToast, tf]);
}
