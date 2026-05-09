/**
 * toolPayload — Tool result payload helpers and orchestrator
 * Extracted from localContextToolExecutors.ts
 */

import type { AiPromptContext } from '../chatDomain.types';
import type { LocalContextToolResult } from '../localContextToolTypes';
import { buildLocalToolReadModelMeta } from '../localContextToolReadModelMeta';

export function attachReadModelToToolPayload(context: AiPromptContext, result: unknown): unknown {
  const meta = buildLocalToolReadModelMeta(context);
  if (result === null) {
    return { _readModel: meta };
  }
  if (typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }
  const body = result as Record<string, unknown>;
  if (body._readModel !== undefined) {
    return result;
  }
  return { ...body, _readModel: meta };
}

export function finalizeLocalContextToolResult(
  context: AiPromptContext,
  out: LocalContextToolResult,
): LocalContextToolResult {
  if (!out.ok) {
    return out;
  }
  return {
    ...out,
    result: attachReadModelToToolPayload(context, out.result),
  };
}

export function buildAcousticUnavailablePayload(localeHint?: string): Record<string, unknown> {
  const zh = (localeHint ?? '').toLowerCase().startsWith('zh');
  return {
    ok: false,
    reason: 'no_playable_media',
    message: zh
      ? '当前没有可播放媒体，无法提供声学分析结果。'
      : 'No playable media is available, so acoustic analysis is unavailable.',
  };
}
