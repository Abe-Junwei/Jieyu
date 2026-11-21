import React, { createContext, useCallback, useContext, useRef } from 'react';
import { ToastStack } from '../components/ToastStack';
import { useToastQueue } from '../hooks/useToastQueue';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import type { VoiceAgentMode } from '../services/VoiceAgentService';
import { isDictKey, t, useLocale, type Locale } from '../i18n';
import { createLogger } from '../observability/logger';

// ── Toast variant & item ────────────────────────────────────────────────────

export type ToastVariant =
  | 'info'
  | 'success'
  | 'error'
  | 'warning'
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
  /** 同 key 的提示条原位更新，不叠新条。 */
  key?: string;
  exiting?: boolean;
  actionLabel?: string;
  onAction?: () => void;
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
const NOOP_TOAST_CONTEXT: ToastContextValue = {
  showToast: () => undefined,
  showSaveState: () => undefined,
  showVoiceState: () => undefined,
  dismiss: () => undefined,
};
let hasWarnedAboutMissingToastProvider = false;
const log = createLogger('ToastContext');

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx) {
    return ctx;
  }

  const runtimeMode = typeof import.meta !== 'undefined' ? import.meta.env?.MODE : undefined;
  if (runtimeMode === 'development') {
    if (!hasWarnedAboutMissingToastProvider) {
      hasWarnedAboutMissingToastProvider = true;
      log.warn('Missing ToastProvider during hot reload; using a no-op fallback temporarily.');
    }
    return NOOP_TOAST_CONTEXT;
  }

  throw new Error('useToast must be used within <ToastProvider>');
}

// ── Auto-dismiss delays ──────────────────────────────────────────────────────

/** 结果 4 秒；错误与常驻状态不自动关闭（ADR-0116）。 */
const DISMISS_DELAY_MS = 4000;
const TOAST_DEDUP_WINDOW_MS = 2500;
const SAVE_DONE_TOAST_COOLDOWN_MS = 6000;
const SAVE_TOAST_KEY = 'save';
const VOICE_TOAST_KEY = 'voice';

function nextId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── SaveState → Toast mapping ───────────────────────────────────────────────

const SAVE_STATE_VARIANT: Record<SaveState['kind'], ToastVariant> = {
  idle: 'info',
  saving: 'info',
  done: 'success',
  error: 'error',
  viewStale: 'warning',
};

function normalizeErrorToast(
  locale: Locale,
  state: Extract<SaveState, { kind: 'error' }>,
): {
  message: string;
  variant: ToastVariant;
} {
  const translatedTemplate =
    state.errorMeta?.i18nKey !== undefined && isDictKey(state.errorMeta.i18nKey)
      ? t(locale, state.errorMeta.i18nKey)
      : undefined;
  // RD-2：带占位符的文案（如 "{message}"）在这里拿不到参数；调用方已插好参数的 message 优先。
  // RD-2: parametrised templates (e.g. "{message}") cannot be filled here; prefer the caller's
  // already-interpolated message instead of showing literal placeholders.
  const hasUnfilledPlaceholder =
    translatedTemplate !== undefined && /\{[A-Za-z_][\w]*\}/.test(translatedTemplate);
  const translatedMessage =
    hasUnfilledPlaceholder && state.message !== undefined && state.message.length > 0
      ? state.message
      : translatedTemplate;
  const rawMessage =
    translatedMessage !== undefined && translatedMessage.length > 0
      ? translatedMessage
      : state.message !== undefined && state.message.length > 0
        ? state.message
        : t(locale, 'transcription.toast.saveFailed');
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
    const hasRefreshHint =
      normalizedRaw.includes(normalizedHint) ||
      normalizedRaw.includes('refresh') ||
      normalizedRaw.includes(relaxedHint);
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

function getVoiceToastMessage(
  locale: Locale,
  mode: Exclude<VoiceAgentMode, 'idle'>,
  isListening: boolean,
): string {
  const key = isListening
    ? (`transcription.toast.voice.${mode}Listening` as const)
    : (`transcription.toast.voice.${mode}Waiting` as const);
  return t(locale, key);
}

function isVoiceToastVariant(variant: ToastVariant): boolean {
  return (
    variant === 'listening' ||
    variant === 'routing' ||
    variant === 'executing' ||
    variant === 'ai-thinking'
  );
}

// ── ToastProvider ─────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
}

/** 外层已有提示条时直接复用，全应用只有一个队列与一个容器。 */
export function ToastProvider({ children }: Props) {
  const parent = useContext(ToastContext);
  if (parent) return <>{children}</>;
  return <ToastProviderRoot>{children}</ToastProviderRoot>;
}

function ToastProviderRoot({ children }: Props) {
  const locale = useLocale();
  const queue = useToastQueue();
  const { items, push, dismiss, dismissWhere, dismissAll, setPaused } = queue;
  const lastToastRef = useRef<{ message: string; variant: ToastVariant; timestamp: number } | null>(
    null,
  );
  const lastSaveDoneToastAtRef = useRef<number>(0);

  const showToast = useCallback(
    (
      message: string,
      variant: ToastVariant = 'info',
      autoDismissMs: number | undefined = undefined,
      key?: string,
    ) => {
      const now = Date.now();
      const previousToast = lastToastRef.current;
      if (
        previousToast &&
        previousToast.message === message &&
        previousToast.variant === variant &&
        now - previousToast.timestamp < TOAST_DEDUP_WINDOW_MS
      ) {
        return;
      }

      const persistent =
        variant === 'error' ||
        variant === 'recording' ||
        variant === 'listening' ||
        variant === 'routing' ||
        variant === 'executing' ||
        variant === 'ai-thinking';
      const totalDelay = autoDismissMs ?? (persistent ? 0 : DISMISS_DELAY_MS);

      lastToastRef.current = { message, variant, timestamp: now };
      push(
        {
          id: nextId(),
          message,
          variant,
          exiting: false,
          ...(key !== undefined && key !== '' ? { key } : {}),
        },
        totalDelay,
      );
    },
    [push],
  );

  const showSaveState = useCallback(
    (state: SaveState) => {
      if (state.kind === 'idle') {
        dismissWhere((item) => item.key === SAVE_TOAST_KEY);
        return;
      }

      if (state.kind === 'viewStale') {
        lastToastRef.current = {
          message: state.message,
          variant: 'warning',
          timestamp: Date.now(),
        };
        push(
          {
            id: nextId(),
            key: SAVE_TOAST_KEY,
            message: state.message,
            variant: 'warning',
            exiting: false,
            actionLabel: state.actionLabel,
            onAction: state.onAction,
          },
          0,
        );
        return;
      }

      if (state.kind === 'done') {
        const now = Date.now();
        if (now - lastSaveDoneToastAtRef.current < SAVE_DONE_TOAST_COOLDOWN_MS) {
          return;
        }
        lastSaveDoneToastAtRef.current = now;
      }

      const defaultVariant = SAVE_STATE_VARIANT[state.kind];
      const message =
        state.kind === 'done'
          ? state.message !== undefined && state.message.length > 0
            ? state.message
            : t(locale, 'transcription.toast.saved')
          : state.kind === 'error'
            ? state.message !== undefined && state.message.length > 0
              ? state.message
              : t(locale, 'transcription.toast.saveFailed')
            : t(locale, 'transcription.toast.saving');

      if (state.kind === 'error') {
        const normalized = normalizeErrorToast(locale, state);
        showToast(normalized.message, normalized.variant, undefined, SAVE_TOAST_KEY);
        return;
      }

      showToast(message, defaultVariant, undefined, SAVE_TOAST_KEY);
    },
    [dismissWhere, locale, push, showToast],
  );

  const showVoiceState = useCallback(
    (mode: VoiceAgentMode | null, isListening = false) => {
      if (mode === null) {
        dismissWhere((item) => isVoiceToastVariant(item.variant));
        return;
      }
      const variant = VOICE_MODE_VARIANT[mode];
      const message = getVoiceToastMessage(locale, mode, isListening);
      showToast(message, variant, 0, VOICE_TOAST_KEY); // persist while in voice mode
    },
    [dismissWhere, locale, showToast],
  );

  const value: ToastContextValue = {
    showToast,
    showSaveState,
    showVoiceState,
    dismiss: dismissAll,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack
        items={items}
        dismissLabel={t(locale, 'transcription.toast.dismiss')}
        onDismiss={dismiss}
        onPausedChange={setPaused}
      />
    </ToastContext.Provider>
  );
}
