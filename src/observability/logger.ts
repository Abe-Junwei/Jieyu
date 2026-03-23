/**
 * 轻量结构化日志模块 | Lightweight structured logger module
 *
 * 单进程桌面应用不需要 OpenTelemetry，但需要统一的日志格式
 * 便于过滤、调试和未来对接 Sentry breadcrumbs。
 *
 * A single-process desktop app doesn't need OpenTelemetry,
 * but benefits from a consistent log format for filtering,
 * debugging, and future Sentry breadcrumb integration.
 */

// ─── 类型 | Types ──────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  /** 可选结构化上下文 | Optional structured context */
  data?: Record<string, unknown>;
  /** ISO 时间戳 | ISO timestamp */
  ts: string;
}

/** 日志观测器（供测试和未来 Sentry 注入）| Log observer (for tests & future Sentry integration) */
export type LogObserver = (entry: LogEntry) => void;

// ─── 级别过滤 | Level filtering ────────────────────────────

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'info';

/** 设置全局最低日志级别 | Set global minimum log level */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

// ─── 观测器注册 | Observer registry ─────────────────────────

const observers: LogObserver[] = [];

/** 注册观测器，返回取消函数 | Register observer, returns unsubscribe fn */
export function addLogObserver(fn: LogObserver): () => void {
  observers.push(fn);
  return () => {
    const idx = observers.indexOf(fn);
    if (idx >= 0) observers.splice(idx, 1);
  };
}

// ─── console 映射 | Console mapping ────────────────────────

const CONSOLE_FN: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

// ─── 核心 emit | Core emit ─────────────────────────────────

function emit(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;

  const entry: LogEntry = {
    level,
    module,
    message,
    ts: new Date().toISOString(),
    ...(data ? { data } : {}),
  };

  // 写控制台 | Write to console
  const prefix = `[${module}]`;
  if (data) {
    CONSOLE_FN[level](prefix, message, data);
  } else {
    CONSOLE_FN[level](prefix, message);
  }

  // 通知观测器 | Notify observers
  for (const obs of observers) {
    try { obs(entry); } catch { /* 观测器不应阻塞主流程 | observers must not block */ }
  }
}

// ─── 公共 API | Public API ──────────────────────────────────

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  /** 计时辅助：返回 stop 函数，调用后自动写一条 info 日志并返回 durationMs | Timing helper: returns stop fn that logs info with durationMs */
  time(label: string, data?: Record<string, unknown>): () => number;
}

/**
 * 创建模块级 logger | Create module-scoped logger
 * @example const log = createLogger('ChatOrchestrator');
 */
export function createLogger(module: string): Logger {
  return {
    debug: (msg, data) => emit('debug', module, msg, data),
    info: (msg, data) => emit('info', module, msg, data),
    warn: (msg, data) => emit('warn', module, msg, data),
    error: (msg, data) => emit('error', module, msg, data),
    time(label, data) {
      const start = performance.now();
      return () => {
        const durationMs = Math.round(performance.now() - start);
        emit('info', module, `${label} (${durationMs}ms)`, { ...data, durationMs });
        return durationMs;
      };
    },
  };
}
