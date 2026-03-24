import { isLikelyConflictError } from './conflictError';
import { toConflictAwareActionErrorMessage } from './saveStateError';
import { createLogger } from '../observability/logger';
import { recordStructuredError } from '../observability/errorAggregation';
import type { StructuredErrorMeta } from './errorProtocol';

const log = createLogger('actionErrorReporter');

type ActionErrorReporterOptions = {
  actionLabel: string;
  error: unknown;
  setErrorMessage?: (message: string) => void;
  setErrorState?: (payload: { message: string; meta: StructuredErrorMeta }) => void;
  conflictNames?: string[];
  conflictMessage?: string;
  fallbackMessage?: string;
  i18nKey?: string;
  conflictI18nKey?: string;
  fallbackI18nKey?: string;
  recoverable?: boolean;
};

/**
 * 统一动作错误上报入口 | Unified action error reporting entry
 */
export function reportActionError(options: ActionErrorReporterOptions): { message: string; meta: StructuredErrorMeta } {
  const {
    actionLabel,
    error,
    setErrorMessage,
    setErrorState,
    conflictNames = [],
    conflictMessage,
    fallbackMessage,
    i18nKey,
    conflictI18nKey,
    fallbackI18nKey,
    recoverable = true,
  } = options;

  const isConflict = isLikelyConflictError(error, conflictNames);
  const message = isConflict
    ? (conflictMessage ?? toConflictAwareActionErrorMessage({ actionLabel, error, conflictNames }))
    : (fallbackMessage ?? toConflictAwareActionErrorMessage({ actionLabel, error, conflictNames }));

  const resolvedI18nKey = isConflict
    ? (conflictI18nKey ?? i18nKey)
    : (fallbackI18nKey ?? i18nKey);

  const meta: StructuredErrorMeta = {
    category: isConflict ? 'conflict' : 'action',
    action: actionLabel,
    recoverable,
    ...(resolvedI18nKey !== undefined && { i18nKey: resolvedI18nKey }),
    ...(error instanceof Error ? { detail: error.message } : { detail: String(error) }),
  };

  recordStructuredError(meta);

  setErrorState?.({ message, meta });
  setErrorMessage?.(message);

  log.warn('Reported action error', {
    actionLabel,
    category: meta.category,
    recoverable: meta.recoverable,
    ...(meta.i18nKey !== undefined && { i18nKey: meta.i18nKey }),
    ...(meta.detail !== undefined && { detail: meta.detail }),
  });

  return { message, meta };
}
