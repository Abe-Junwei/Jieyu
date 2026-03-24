import { isLikelyConflictError } from './conflictError';

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ConflictAwareErrorOptions = {
  actionLabel: string;
  error: unknown;
  conflictNames?: string[];
  conflictMessage?: string;
};

export function toConflictAwareActionErrorMessage(options: ConflictAwareErrorOptions): string {
  const {
    actionLabel,
    error,
    conflictNames = [],
    conflictMessage = `${actionLabel}失败：检测到数据已被其他操作更新，请刷新后重试`,
  } = options;

  if (isLikelyConflictError(error, conflictNames)) {
    return conflictMessage;
  }

  return `${actionLabel}失败：${toErrorMessage(error)}`;
}
