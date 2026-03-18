import type { ChatChunk } from './LLMProvider';

export async function* iterateSseData(response: Response): AsyncGenerator<string, void, unknown> {
  const body = response.body;
  if (!body) {
    throw new Error('远程模型未返回可读流');
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
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

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

      if (done) break;
    }

    if (buffer.length > 0) {
      const tailLine = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
      if (tailLine.startsWith('data:')) {
        dataLines.push(tailLine.slice(5).replace(/^\s/, ''));
      }
    }

    for await (const payload of flushEvent()) {
      yield payload;
    }
  } finally {
    reader.cancel();
  }
}

export async function* iterateJsonLines(response: Response): AsyncGenerator<string, void, unknown> {
  const body = response.body;
  if (!body) {
    throw new Error('远程模型未返回可读流');
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
    reader.cancel();
  }
}

export function toErrorChunk(message: string): ChatChunk {
  return { delta: '', done: true, error: message };
}