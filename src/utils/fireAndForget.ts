/**
 * Fire-and-forget an async call with error handling.
 * Prevents unhandled promise rejections from `void asyncFn()` patterns.
 *
 * @param promise - The promise to execute
 * @param options - Governance options (context/policy/reporting)
 */
import { createLogger } from '../observability/logger';

export const FIRE_AND_FORGET_ERROR_EVENT = 'jieyu:fire-and-forget-error' as const;

const log = createLogger('fireAndForget');

export type FireAndForgetPolicy = 'user-visible' | 'background';

export interface FireAndForgetErrorDetail {
  context: string;
  policy: FireAndForgetPolicy;
  error: unknown;
}

export interface FireAndForgetOptions {
  /** 失败上下文（用于日志/Toast/Sentry） | Failure context for logs/toast/Sentry */
  context: string;
  /** user-visible: 触发 Toast；background: 仅记录/上报 | user-visible triggers toast; background only logs/reports */
  policy: FireAndForgetPolicy;
  /** 自定义失败回调（可选） | Optional custom error callback */
  onError?: (err: unknown) => void;
  /** 是否上报到 Sentry（默认 true） | Report to Sentry (default true) */
  reportToSentry?: boolean;
}

function normalizeContext(context: string): string {
  const trimmed = context.trim();
  return trimmed.length > 0 ? trimmed : 'fireAndForget.unknown';
}

function reportFireAndForgetErrorToSentry(context: string, policy: FireAndForgetPolicy, err: unknown): void {
  if (!import.meta.env.PROD) return;
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: {
          jieyu_module: 'fireAndForget',
          fire_and_forget_policy: policy,
        },
        extra: {
          context,
          policy,
        },
      });
    })
    .catch(() => { /* Sentry 未安装或 DSN 关闭 | Sentry absent or DSN disabled */ });
}

export function fireAndForget(
  promise: Promise<unknown>,
  options: FireAndForgetOptions,
): void {
  const context = normalizeContext(options.context);
  const policy = options.policy;
  const shouldReportToSentry = options.reportToSentry ?? true;

  promise.catch((err) => {
    log.error('Unhandled async error', {
      context,
      policy,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    if (shouldReportToSentry) {
      reportFireAndForgetErrorToSentry(context, policy, err);
    }

    if (options.onError) {
      options.onError(err);
      return;
    }

    if (policy === 'user-visible') {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        const detail: FireAndForgetErrorDetail = {
          context,
          policy,
          error: err,
        };
        window.dispatchEvent(new CustomEvent<FireAndForgetErrorDetail>(FIRE_AND_FORGET_ERROR_EVENT, { detail }));
      }
    }
  });
}
