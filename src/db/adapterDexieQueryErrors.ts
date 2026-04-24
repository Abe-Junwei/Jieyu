/**
 * Dexie 按索引 where() 与 filter/全表 回退的误差分 + 非预期错误可观测
 * Distinguish expected indexed-query fallback vs real DB failures, with logging/Sentry for the latter
 */
import Dexie from 'dexie';
import { createLogger } from '../observability/logger';

const log = createLogger('dbDexieQuery');
const warnedDexieIndexedFallbackContexts = new Set<string>();

function errorMessageOf(err: unknown): string {
  if (err instanceof Error && typeof err.message === 'string') return err.message;
  if (typeof err === 'string') return err;
  try {
    return String(err);
  } catch {
    return '';
  }
}

function errorNameOf(err: unknown): string {
  if (err instanceof Error && typeof err.name === 'string') return err.name;
  return '';
}

/**
 * 预期走 filter / 全表回退 的 Dexie 错误（字段未建索引、where/KeyPath 不合法等）。
 * 同时参考 Dexie `errnames` 与 `message`（Dexie 版本间文案略有差异，故保留多信号）。
 */
export function isDexieIndexedQueryFallbackError(err: unknown): boolean {
  const msg = errorMessageOf(err);
  if (msg.length > 0) {
    const m = msg.toLowerCase();
    if (m.includes('not indexed')) return true;
    if (m.includes('keypath') && (m.includes('not') || m.includes('invalid'))) return true;
    if (m.includes('no such') && m.includes('index')) return true;
  }

  const name = errorNameOf(err);
  if (!name) return false;
  if (name === Dexie.errnames.Schema || name === 'SchemaError') {
    const m = msg.toLowerCase();
    if (m.includes('keypath') || m.includes('index') || m.includes('invalid') || m.includes('key ')) {
      return true;
    }
  }
  if (name === Dexie.errnames.Data || name === 'DataError') {
    const m = msg.toLowerCase();
    if (m.includes('key') && (m.includes('invalid') || m.includes('not'))) {
      return true;
    }
  }
  if (name === Dexie.errnames.InvalidAccess || name === 'InvalidAccessError') {
    const m = msg.toLowerCase();
    if (m.length > 0 && (m.includes('key') || m.includes('index') || m.includes('path') || m.includes('query'))) {
      return true;
    }
  }
  if (name === Dexie.errnames.InvalidArgument || name === 'InvalidArgumentError') {
    const m = msg.toLowerCase();
    if (m.includes('index') || m.includes('key') || m.includes('where')) {
      return true;
    }
  }
  return false;
}

/**
 * 索引/where 快路径之外抛出的、仍由调用方以「全表/降级」继续的场景：必须打日志，生产进 Sentry。
 */
export function reportUnexpectedDexieQueryError(context: string, err: unknown): void {
  const data: Record<string, unknown> = {
    context: context.slice(0, 200),
    name: err instanceof Error ? err.name : typeof err,
    message: errorMessageOf(err).slice(0, 2000),
  };
  if (import.meta.env.DEV) {
    log.warn('Dexie query path failed unexpectedly; caller will fall back', data);
  } else {
    log.error('Dexie query path failed unexpectedly; caller will fall back', data);
  }
  if (import.meta.env.PROD) {
    void import('@sentry/react')
      .then((Sentry) => {
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { jieyu_module: 'dbDexieQuery' },
          extra: data,
        });
      })
      .catch(() => { /* Sentry 未安装或 DSN 关闭 */ });
  }
}

/**
 * DEV 提示：索引 where 快路径触发了「预期回退」，帮助开发期补齐索引或改用显式查询策略。
 * DEV hint: indexed where fast-path hit expected fallback; helps decide whether to add index or use explicit scan strategy.
 */
export function reportDexieIndexedQueryFallback(context: string, err: unknown): void {
  if (!import.meta.env.DEV) return;

  const key = context.trim().slice(0, 200);
  if (!key || warnedDexieIndexedFallbackContexts.has(key)) return;
  warnedDexieIndexedFallbackContexts.add(key);

  log.info('Dexie indexed query fell back to degraded path', {
    context: key,
    name: err instanceof Error ? err.name : typeof err,
    message: errorMessageOf(err).slice(0, 2000),
    suggestion: 'consider adding index or using explicit scan/query strategy',
  });
}

export function __resetDexieIndexedFallbackHintsForTests(): void {
  warnedDexieIndexedFallbackContexts.clear();
}

/**
 * 先走索引/where 快路径，失败时仅在非「预期回退类」错误上报告，再执行 `runFallback`（通常全表或空结果）。
 */
export async function runDexieIndexedQueryOrElse<T>(
  context: string,
  runIndexed: () => Promise<T>,
  runFallback: () => Promise<T>,
): Promise<T> {
  try {
    return await runIndexed();
  } catch (err) {
    if (isDexieIndexedQueryFallbackError(err)) {
      reportDexieIndexedQueryFallback(context, err);
    } else {
      reportUnexpectedDexieQueryError(context, err);
    }
    return await runFallback();
  }
}

/**
 * 可选/降级路径中的 Dexie 失败（如行为库、分析缓存）：
 * 非「预期索引回退类」错误走 {@link reportUnexpectedDexieQueryError}；始终 `console.debug` 供本机过滤。
 */
export function reportIfUnexpectedDexieDegradation(
  context: string,
  err: unknown,
  debugMessage: string,
): void {
  if (isDexieIndexedQueryFallbackError(err)) {
    reportDexieIndexedQueryFallback(context, err);
  } else {
    reportUnexpectedDexieQueryError(context, err);
  }
  console.debug(debugMessage, err);
}
