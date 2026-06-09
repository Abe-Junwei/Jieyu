import type { LocalContextToolResult } from './localContextToolTypes';
import type { HistoryChatMessage } from './historyTrim';

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractToolResultPayloadJson(content: string): Record<string, unknown> | null {
  const marker = 'tool_result_payload:';
  const markerIndex = content.indexOf(marker);
  if (markerIndex < 0) return null;

  const jsonStart = content.indexOf('{', markerIndex);
  if (jsonStart < 0) return null;

  let depth = 0;
  for (let index = jsonStart; index < content.length; index += 1) {
    const char = content[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(content.slice(jsonStart, index + 1));
          return asObjectRecord(parsed);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function summarizeLocalToolResultsForCompaction(results: LocalContextToolResult[]): string {
  return results
    .map((result) => {
      const status = result.ok ? 'ok' : 'fail';
      const parts = [`${result.name}:${status}`];
      if (result.ok) {
        const body = asObjectRecord(result.result);
        if (body && typeof body.count === 'number') {
          parts.push(`count=${body.count}`);
        }
      } else if (result.error) {
        parts.push(`err=${result.error}`);
      }
      return parts.join(',');
    })
    .join('; ');
}

export function compactLocalToolResultContinuationContent(content: string): string {
  if (!content.includes('__LOCAL_TOOL_RESULT__')) return content;

  let step = '?';
  let summary = 'prior step';
  const parsed = extractToolResultPayloadJson(content);
  if (parsed) {
    if (typeof parsed.step === 'number') {
      step = String(parsed.step);
    }
    if (Array.isArray(parsed.results)) {
      summary = summarizeLocalToolResultsForCompaction(parsed.results as LocalContextToolResult[]);
    }
  }

  return [
    '__LOCAL_TOOL_RESULT__',
    `compacted_step: ${step}`,
    `compacted_summary: ${summary}`,
    '[Earlier tool output compacted to save context. Use the latest tool_result_payload below.]',
  ].join('\n');
}

function compactAssistantLoopMessage(content: string): string {
  if (content.includes('tool_call') || content.includes('tool_calls')) {
    return '[Compacted prior assistant tool-call turn. Continue from the latest tool_result_payload.]';
  }
  if (content.length > 240) {
    return `${content.slice(0, 200)}… [compacted]`;
  }
  return content;
}

/**
 * Compacts older agent-loop carrier messages in history, keeping the latest entry full.
 * Spec: 智能体改进方案 P1.1 tool result clearing (history path).
 */
export function compactAgentLoopHistoryForContinuation(
  history: HistoryChatMessage[],
): HistoryChatMessage[] {
  if (history.length <= 1) return history;

  const carrierIndices = history
    .map((message, index) =>
      message.content.includes('__LOCAL_TOOL_RESULT__') ||
      (message.role === 'assistant' && message.content.length > 400)
        ? index
        : -1,
    )
    .filter((index) => index >= 0);

  if (carrierIndices.length <= 1) return history;

  const keepFullIndex = carrierIndices[carrierIndices.length - 1]!;

  return history.map((message, index) => {
    if (index === keepFullIndex) return message;
    if (message.content.includes('__LOCAL_TOOL_RESULT__')) {
      return { ...message, content: compactLocalToolResultContinuationContent(message.content) };
    }
    if (message.role === 'assistant' && message.content.length > 400) {
      return { ...message, content: compactAssistantLoopMessage(message.content) };
    }
    return message;
  });
}
