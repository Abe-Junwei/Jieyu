/**
 * Fire-and-forget an async call with error handling.
 * Prevents unhandled promise rejections from `void asyncFn()` patterns.
 *
 * @param promise - The promise to execute
 * @param options - Governance options (context/policy/reporting)
 */
import { createLogger } from '../observability/logger';

export const FIRE_AND_FORGET_ERROR_EVENT = 'jieyu:fire-and-forget-error' as const;

/** 将 Promise 转为可分支测试的 `Result`；不等价于 `fireAndForget`（不吞错、不派发全局事件）。 */
export type AsyncResult<T, E = unknown> = { ok: true; value: T } | { ok: false; error: E };

export async function asyncResultFromPromise<T>(promise: Promise<T>): Promise<AsyncResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

const log = createLogger('fireAndForget');

/**
 * - `user-visible`：失败弹 Toast，默认上报 Sentry（可 `reportToSentry: false`）
 * - `background`：不弹 Toast，error 级日志，默认上报 Sentry
 * - `background-quiet`：不弹 Toast，warn 级日志，**默认不上报 Sentry**（非关键/高噪后台；可 `reportToSentry: true` 单点抬高）
 */
export type FireAndForgetPolicy = 'user-visible' | 'background' | 'background-quiet';

export interface FireAndForgetErrorDetail {
  context: string;
  policy: FireAndForgetPolicy;
  error: unknown;
}

export interface FireAndForgetOptions {
  /** 失败上下文（用于日志/Toast/Sentry） | Failure context for logs/toast/Sentry */
  context: string;
  /** 见 `FireAndForgetPolicy` | See `FireAndForgetPolicy` */
  policy: FireAndForgetPolicy;
  /** 自定义失败回调（可选） | Optional custom error callback */
  onError?: (err: unknown) => void;
  /** 是否上报 Sentry（默认依 `policy`：`background-quiet` 为 false，其余为 true） | Sentry: default from policy */
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

function defaultReportToSentryForPolicy(policy: FireAndForgetPolicy): boolean {
  return policy !== 'background-quiet';
}

export function fireAndForget(
  promise: Promise<unknown>,
  options: FireAndForgetOptions,
): void {
  const context = normalizeContext(options.context);
  const policy = options.policy;
  const shouldReportToSentry = options.reportToSentry ?? defaultReportToSentryForPolicy(policy);

  promise.catch((err) => {
    const baseFields = {
      context,
      policy,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    if (policy === 'background-quiet') {
      log.warn('Background async error (quiet policy)', baseFields);
    } else {
      log.error('Unhandled async error', baseFields);
    }

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
