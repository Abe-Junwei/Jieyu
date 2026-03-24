import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { VoiceAgentMode } from '../services/VoiceAgentService';
import { detectLocale, isDictKey, t } from '../i18n';

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

const DISMISS_DELAY_MS = 3500;
const DISMISS_ERROR_MS = 5000;

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

const SAVE_STATE_MESSAGE: Record<SaveState['kind'], string> = {
  idle: '',
  saving: '保存中…',
  done: '', // filled dynamically
  error: '', // filled dynamically
};

function normalizeErrorToast(state: Extract<SaveState, { kind: 'error' }>): {
  message: string;
  variant: ToastVariant;
} {
  const locale = detectLocale();
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
    const hasRefreshHint = rawMessage.includes(refreshHint) || rawMessage.includes('刷新') || rawMessage.includes('refresh');
    const withHint = hasRefreshHint ? rawMessage : `${rawMessage}（${refreshHint}）`;
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

const VOICE_MODE_MESSAGE: Record<Exclude<VoiceAgentMode, 'idle'>, string> = {
  command: '🎤 等待语音指令…',
  dictation: '🎤 听写模式 — 说话即写入',
  analysis: '🎤 分析模式 — 说话即分析',
};

const VOICE_LISTENING_MESSAGE: Record<Exclude<VoiceAgentMode, 'idle'>, string> = {
  command: '🎤 正在听…',
  dictation: '🎤 正在听写…',
  analysis: '🎤 正在分析…',
};

// ── ToastProvider ─────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
}

export function ToastProvider({ children }: Props) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCurrent(null);
  }, []);

  const showToast = useCallback((
    message: string,
    variant: ToastVariant = 'info',
    autoDismissMs: number | undefined = undefined,
  ) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Auto-dismiss defaults
    const delay = autoDismissMs ?? (
      variant === 'error' ? DISMISS_ERROR_MS :
      variant === 'recording' || variant === 'listening' || variant === 'routing' ||
        variant === 'executing' || variant === 'ai-thinking'
        ? 0  // persist until explicitly dismissed
        : DISMISS_DELAY_MS
    );

    const item: ToastItem = { id: nextId(), message, variant };
    setCurrent(item);

    if (delay > 0) {
      timerRef.current = setTimeout(dismiss, delay);
    }
  }, [dismiss]);

  const showSaveState = useCallback((state: SaveState) => {
    if (state.kind === 'idle') {
      dismiss();
      return;
    }
    const defaultVariant = SAVE_STATE_VARIANT[state.kind];
    const baseMessage = SAVE_STATE_MESSAGE[state.kind];
    const locale = detectLocale();
    const message = state.kind === 'done'
      ? (state.message || t(locale, 'transcription.toast.saved'))
      : state.kind === 'error'
        ? (state.message || t(locale, 'transcription.toast.saveFailed'))
        : baseMessage;

    if (state.kind === 'error') {
      const normalized = normalizeErrorToast(state);
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
    const message = isListening
      ? VOICE_LISTENING_MESSAGE[mode]
      : VOICE_MODE_MESSAGE[mode];
    showToast(message, variant, 0); // persist while in voice mode
  }, [dismiss, showToast]);

  const value: ToastContextValue = { showToast, showSaveState, showVoiceState, dismiss };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <div className="transcription-toast-container" role="status" aria-live="polite">
          <div
            className={`transcription-toast toast-${current.variant}`}
            onClick={dismiss}
            title="点击关闭"
          >
            {current.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
