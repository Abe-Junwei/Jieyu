import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { VoiceAgentMode } from '../services/VoiceAgentService';
import { isDictKey, t, useLocale, type Locale } from '../i18n';

// ── Toast variant & item ────────────────────────────────────────────────────

export type ToastVariant =
  | 'info'
  | 'success'
  | 'error'
  | 'recording'
  | 'listening'
  | 'routing'
  | 'executing'
  | 'ai-thinking';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  autoDismissMs?: number;
  exiting?: boolean;
}

export interface ToastContextValue {
  /** Show a simple toast message. Pass autoDismissMs=0 to persist until dismiss(). */
  showToast: (message: string, variant?: ToastVariant, autoDismissMs?: number) => void;
  /** Map a SaveState (from transcription hooks) to a toast. */
  showSaveState: (state: SaveState) => void;
  /** Map a voice agent state to a toast. Pass null to clear voice toasts. */
  showVoiceState: (mode: VoiceAgentMode | null, isListening?: boolean) => void;
  /** Dismiss whatever toast is currently visible. */
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return ctx;
}

// ── Auto-dismiss delays ──────────────────────────────────────────────────────

const DISMISS_DELAY_MS = 2000;
const DISMISS_ERROR_MS = 2000;
const DISMISS_FADE_OUT_MS = 260;

function nextId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── SaveState → Toast mapping ───────────────────────────────────────────────

const SAVE_STATE_VARIANT: Record<SaveState['kind'], ToastVariant> = {
  idle: 'info',
  saving: 'info',
  done: 'success',
  error: 'error',
};

function normalizeErrorToast(locale: Locale, state: Extract<SaveState, { kind: 'error' }>): {
  message: string;
  variant: ToastVariant;
} {
  const translatedMessage = (
    state.errorMeta?.i18nKey !== undefined && isDictKey(state.errorMeta.i18nKey)
      ? t(locale, state.errorMeta.i18nKey)
      : undefined
  );
  const rawMessage = translatedMessage || state.message || t(locale, 'transcription.toast.saveFailed');
  const category = state.errorMeta?.category;

  if (category === 'validation') {
    return {
      message: rawMessage,
      variant: 'info',
    };
  }

  if (category === 'conflict') {
    const refreshHint = t(locale, 'transcription.toast.refreshAndRetry');
    const normalizedRaw = rawMessage.toLowerCase().replace(/\s+/g, '');
    const normalizedHint = refreshHint.toLowerCase().replace(/\s+/g, '');
    const relaxedHint = normalizedHint.length > 2 ? normalizedHint.slice(2) : normalizedHint;
    const hasRefreshHint = normalizedRaw.includes(normalizedHint)
      || normalizedRaw.includes('refresh')
      || normalizedRaw.includes(relaxedHint);
    const suffix = locale === 'zh-CN' ? `（${refreshHint}）` : ` (${refreshHint})`;
    const withHint = hasRefreshHint ? rawMessage : `${rawMessage}${suffix}`;
    return {
      message: withHint,
      variant: 'error',
    };
  }

  return {
    message: rawMessage,
    variant: 'error',
  };
}

// ── Voice agent state → Toast mapping ───────────────────────────────────────

const VOICE_MODE_VARIANT: Record<Exclude<VoiceAgentMode, 'idle'>, ToastVariant> = {
  command: 'listening',
  dictation: 'listening',
  analysis: 'listening',
};

function getVoiceToastMessage(locale: Locale, mode: Exclude<VoiceAgentMode, 'idle'>, isListening: boolean): string {
  const key = isListening
    ? (`transcription.toast.voice.${mode}Listening` as const)
    : (`transcription.toast.voice.${mode}Waiting` as const);
  return t(locale, key);
}

// ── ToastProvider ─────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
}

export function ToastProvider({ children }: Props) {
  const locale = useLocale();
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (removeTimerRef.current !== null) {
      clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setCurrent((prev) => (prev ? { ...prev, exiting: true } : prev));
    removeTimerRef.current = setTimeout(() => {
      setCurrent(null);
      removeTimerRef.current = null;
    }, DISMISS_FADE_OUT_MS);
  }, [clearTimers]);

  const showToast = useCallback((
    message: string,
    variant: ToastVariant = 'info',
    autoDismissMs: number | undefined = undefined,
  ) => {
    clearTimers();

    // Auto-dismiss defaults
    const totalDelay = autoDismissMs ?? (
      variant === 'error' ? DISMISS_ERROR_MS :
      variant === 'recording' || variant === 'listening' || variant === 'routing' ||
        variant === 'executing' || variant === 'ai-thinking'
        ? 0  // persist until explicitly dismissed
        : DISMISS_DELAY_MS
    );

    const item: ToastItem = { id: nextId(), message, variant, exiting: false };
    setCurrent(item);

    if (totalDelay > 0) {
      dismissTimerRef.current = setTimeout(dismiss, Math.max(totalDelay - DISMISS_FADE_OUT_MS, 0));
    }
  }, [clearTimers, dismiss]);

  const showSaveState = useCallback((state: SaveState) => {
    if (state.kind === 'idle') {
      dismiss();
      return;
    }
    const defaultVariant = SAVE_STATE_VARIANT[state.kind];
    const message = state.kind === 'done'
      ? (state.message || t(locale, 'transcription.toast.saved'))
      : state.kind === 'error'
        ? (state.message || t(locale, 'transcription.toast.saveFailed'))
        : t(locale, 'transcription.toast.saving');

    if (state.kind === 'error') {
      const normalized = normalizeErrorToast(locale, state);
      showToast(normalized.message, normalized.variant);
      return;
    }

    showToast(message, defaultVariant);
  }, [dismiss, showToast]);

  const showVoiceState = useCallback((
    mode: VoiceAgentMode | null,
    isListening = false,
  ) => {
    if (mode === null) {
      dismiss();
      return;
    }
    const variant = VOICE_MODE_VARIANT[mode];
    const message = getVoiceToastMessage(locale, mode, isListening);
    showToast(message, variant, 0); // persist while in voice mode
  }, [dismiss, locale, showToast]);

  const value: ToastContextValue = { showToast, showSaveState, showVoiceState, dismiss };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <div className="transcription-toast-container" role="status" aria-live="polite">
          <div
            className={`transcription-toast toast-${current.variant} ${current.exiting ? 'transcription-toast-exiting' : ''}`}
            onClick={dismiss}
            title={t(locale, 'transcription.toast.dismiss')}
          >
            {current.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
