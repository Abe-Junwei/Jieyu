import type { AiContextDebugSnapshot, AiSystemPersonaKey } from './useAiChat.types';
import { createLogger } from '../observability/logger';

const log = createLogger('useAiChat.debug');

interface BuildContextDebugSnapshotParams {
  enabled: boolean;
  persona: AiSystemPersonaKey;
  historyContentList: string[];
  contextBlock: string;
  historyCharBudget: number;
  maxContextChars: number;
  responsePolicyPreview?: string;
}

/**
 * 生成上下文调试快照 | Build context debug snapshot for prompt diagnostics
 */
export function buildContextDebugSnapshot({
  enabled,
  persona,
  historyContentList,
  contextBlock,
  historyCharBudget,
  maxContextChars,
  responsePolicyPreview,
}: BuildContextDebugSnapshotParams): AiContextDebugSnapshot {
  return {
    enabled,
    persona,
    historyChars: historyContentList.join('').length,
    historyCount: historyContentList.length,
    contextChars: contextBlock.length,
    historyCharBudget,
    maxContextChars,
    contextPreview: contextBlock.slice(0, 1200),
    ...(responsePolicyPreview ? { responsePolicyPreview } : {}),
  };
}

/**
 * 控制台输出调试快照 | Emit compact console debug snapshot
 */
export function logContextDebugSnapshot(snapshot: AiContextDebugSnapshot): void {
  // 仅开发期：用于调优截断和 token 预算 | Dev-only diagnostics for truncation and token budget tuning
  log.debug('AI Context Debug', {
    ...snapshot,
    contextPreview: snapshot.contextPreview.slice(0, 240),
  });
}
