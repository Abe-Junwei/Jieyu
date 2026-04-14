import type { ChatChunk } from './LLMProvider';

export async function* iterateSseData(response: Response): AsyncGenerator<string, void, unknown> {
  const body = response.body;
  if (!body) {
    throw new Error('Remote model did not return a readable stream');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];

  const flushEvent = async function* (): AsyncGenerator<string, void, unknown> {
    if (dataLines.length === 0) return;
    const payload = dataLines.join('\n').trim();
    dataLines = [];
    if (payload.length > 0) {
      yield payload;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: false });
      } else if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (line.length === 0) {
          for await (const payload of flushEvent()) {
            yield payload;
          }
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^\s/, ''));
        }

        newlineIndex = buffer.indexOf('\n');
      }

      if (done) {
        // Exit the read loop; post-loop handles final flush to avoid double-yield.
        break;
      }
    }

    // Post-loop: flush any remaining buffer (e.g., a data: line with no trailing newline
    // that arrived in the same chunk as done: true, bypassing the newline scan).
    if (buffer.length > 0) {
      const tailLine = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
      if (tailLine.startsWith('data:')) {
        const content = tailLine.slice(5).replace(/^\s/, '');
        if (content.length > 0 && content !== '[DONE]') {
          dataLines.push(content);
        }
      }
    }

    for await (const payload of flushEvent()) {
      yield payload;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 忽略 abort/收尾阶段的 cancel 失败 | Ignore cancel failures during abort/teardown.
    }
  }
}

export async function* iterateJsonLines(response: Response): AsyncGenerator<string, void, unknown> {
  const body = response.body;
  if (!body) {
    throw new Error('Remote model did not return a readable stream');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          yield trimmed;
        }
      }

      if (done) break;
    }

    const finalLine = buffer.trim();
    if (finalLine.length > 0) {
      yield finalLine;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 忽略 abort/收尾阶段的 cancel 失败 | Ignore cancel failures during abort/teardown.
    }
  }
}

export function toErrorChunk(message: string): ChatChunk {
  return { delta: '', done: true, error: message };
}

function stripThinkBlocks(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/<\/think>/gi, '')
    .replace(/<redacted_thinking>[\s\S]*?(<\/redacted_thinking>|$)/gi, '')
    .replace(/<\/redacted_thinking>/gi, '');
}

/** 从最后一个可能是未写完的标签起始 < 起扣留到末尾，避免误发碎片，且不必固定扣 8 字 | Hold back from last `<` that prefixes a known tag */
function streamVisibleHoldBackLength(visible: string): number {
  if (visible.length === 0) return 0;
  const sentinels = ['<think>', '</think>', '<redacted_thinking>', '</redacted_thinking>'] as const;
  for (let i = visible.length - 1; i >= 0; i -= 1) {
    if (visible[i] !== '<') continue;
    const tail = visible.slice(i);
    for (const tag of sentinels) {
      if (tag.length > tail.length && tag.startsWith(tail)) {
        return visible.length - i;
      }
    }
  }
  return 0;
}

export interface ThinkTagStripper {
  feed(chunk: string, flush?: boolean): string;
}

/**
 * 流式剥离 `<think>...</think>`，防止推理内容进入可见回复。
 * Stream-strip `<think>...</think>` blocks to avoid exposing reasoning text.
 */
export function createThinkTagStripper(): ThinkTagStripper {
  let raw = '';
  let emittedVisibleLength = 0;

  return {
    feed(chunk: string, flush = false): string {
      if (chunk.length > 0) raw += chunk;
      const visible = stripThinkBlocks(raw);
      const holdBack = flush ? 0 : streamVisibleHoldBackLength(visible);
      const commitLength = Math.max(0, visible.length - holdBack);

      if (commitLength <= emittedVisibleLength) {
        emittedVisibleLength = Math.min(emittedVisibleLength, commitLength);
        return '';
      }

      const delta = visible.slice(emittedVisibleLength, commitLength);
      emittedVisibleLength = commitLength;
      return delta;
    },
  };
}
