import { createLogger } from '../observability/logger';
import { recordStructuredError } from '../observability/errorAggregation';
import type { StructuredErrorMeta } from './errorProtocol';

const log = createLogger('validationErrorReporter');

type ValidationErrorReporterOptions = {
  message: string;
  setErrorMessage?: (message: string) => void;
  setErrorState?: (payload: { message: string; meta: StructuredErrorMeta }) => void;
  fallbackMessage?: string;
  action?: string;
  i18nKey?: string;
  recoverable?: boolean;
};

/**
 * 前置校验错误上报入口 | Validation error reporting entry
 */
export function reportValidationError(options: ValidationErrorReporterOptions): { message: string; meta: StructuredErrorMeta } {
  const {
    message,
    setErrorMessage,
    setErrorState,
    fallbackMessage = '操作不满足前置条件',
    action = '前置校验',
    i18nKey,
    recoverable = true,
  } = options;
  const nextMessage = message.trim().length > 0 ? message : fallbackMessage;
  const meta: StructuredErrorMeta = {
    category: 'validation',
    action,
    recoverable,
    ...(i18nKey !== undefined && { i18nKey }),
    detail: nextMessage,
  };

  recordStructuredError(meta);

  setErrorState?.({ message: nextMessage, meta });
  setErrorMessage?.(nextMessage);

  log.info('Reported validation error', {
    action,
    category: meta.category,
    recoverable: meta.recoverable,
    ...(meta.i18nKey !== undefined && { i18nKey: meta.i18nKey }),
    ...(meta.detail !== undefined && { detail: meta.detail }),
  });

  return { message: nextMessage, meta };
}
