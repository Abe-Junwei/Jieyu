import type { ChatChunk, ChatMessage, ChatRequestOptions, LLMProvider } from './LLMProvider';

function estimateMockTokenCount(text: string): number {
  const normalized = text.trim();
  if (normalized.length === 0) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export interface MockLLMProviderOptions {
  delayMs?: number;
  prefix?: string;
}

function extractCommandText(source: string): string | undefined {
  const quoted = source.match(/["“](.+?)["”]/);
  if (quoted?.[1]) return quoted[1].trim();

  const markers = ['\u5185\u5bb9\u4e3a', '\u6587\u672c\u4e3a', '\u7ffb\u8bd1\u4e3a', '\u8bd1\u4e3a', '\u4e3a\uff1a', '\u4e3a:', '\uff1a', ':'];
  for (const marker of markers) {
    const idx = source.lastIndexOf(marker);
    if (idx >= 0) {
      const value = source.slice(idx + marker.length).trim();
      if (value.length > 0) return value;
    }
  }

  return undefined;
}

function buildMockFunctionCallingReply(source: string): string {
  const normalized = source.trim();
  const text = extractCommandText(normalized);
  const langMatch = normalized.match(/(?:\u8bed\u8a00|language)\s*(?:\u662f|\u4e3a|=|:|\uff1a)?\s*([a-z]{2,3})/i);
  const languageId = langMatch?.[1]?.toLowerCase();

  if (/(?:\u521b\u5efa|\u65b0\u5efa|\u5efa\u7acb).*(?:\u8f6c\u5199\u884c|\u53e5\u6bb5|\u8bed\u6bb5)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'create_transcription_segment',
        arguments: {},
      },
    });
  }

  // With a language qualifier, delete the whole layer instead of a single segment.
  if (/(?:\u5220\u9664|\u79fb\u9664).*(?:\u65e5|\u4e2d|\u82f1|\u6cd5|\u5fb7|\u97e9|\u4fc4|\u897f|\u8461|\u963f|\u85cf|\u7ef4|\u8499|\u7ca4|\u95fd|\u8bed|\u6587).*(?:\u8f6c\u5199|\u7ffb\u8bd1)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'delete_layer',
        arguments: {},
      },
    });
  } else if (/(?:\u5220\u9664|\u79fb\u9664).*(?:\u8f6c\u5199\u884c|\u53e5\u6bb5|\u8bed\u6bb5)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'delete_transcription_segment',
        arguments: {},
      },
    });
  } else if (/(?:\u6e05\u7a7a|\u5220\u9664|\u79fb\u9664).*(?:\u7ffb\u8bd1\u884c|\u8bd1\u6587|\u7ffb\u8bd1\u5185\u5bb9|\u7ffb\u8bd1\u6587\u672c)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'clear_translation_segment',
        arguments: {},
      },
    });
  } else if (/(?:\u521b\u5efa|\u65b0\u5efa|\u5efa\u7acb).*(?:\u8f6c\u5199\u5c42)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'create_transcription_layer',
        arguments: languageId ? { languageId } : {},
      },
    });
  } else if (/(?:\u521b\u5efa|\u65b0\u5efa|\u5efa\u7acb).*(?:\u7ffb\u8bd1\u5c42)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'create_translation_layer',
        arguments: languageId ? { languageId } : {},
      },
    });
  } else if (/(?:\u5220\u9664|\u79fb\u9664).*(?:\u5c42)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'delete_layer',
        arguments: {},
      },
    });
  } else if (/(?:\u94fe\u63a5|\u5173\u8054|\u8fde\u63a5).*(?:\u5c42)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'link_translation_layer',
        arguments: {},
      },
    });
  } else if (/(?:\u65b0\u589e|\u6dfb\u52a0|\u52a0\u5165|add).*(?:\u5bbf\u4e3b|host)/i.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'add_host',
        arguments: {},
      },
    });
  } else if (/(?:\u79fb\u9664|\u5220\u9664|\u53bb\u6389|remove).*(?:\u5bbf\u4e3b|host)/i.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'remove_host',
        arguments: {},
      },
    });
  } else if (/(?:\u5207\u6362|\u8bbe\u4e3a|\u8bbe\u7f6e|\u6539\u4e3a|switch|set).*(?:\u4e3b\u5bbf\u4e3b|\u9996\u9009\u5bbf\u4e3b|preferred\s*host)/i.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'switch_preferred_host',
        arguments: {},
      },
    });
  } else if (/(?:\u53d6\u6d88\u94fe\u63a5|\u53d6\u6d88\u5173\u8054|\u65ad\u5f00).*(?:\u5c42)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'unlink_translation_layer',
        arguments: {},
      },
    });
  } else if (/(?:\u8f6c\u5199|\u5199\u5165\u8f6c\u5199|\u8bbe\u7f6e\u8f6c\u5199)/.test(normalized) && text) {
    return JSON.stringify({
      tool_call: {
        name: 'set_transcription_text',
        arguments: { text },
      },
    });
  } else if (/(?:\u7ffb\u8bd1|\u8bd1\u6587|\u5199\u5165\u7ffb\u8bd1|\u8bbe\u7f6e\u7ffb\u8bd1)/.test(normalized) && text) {
    return JSON.stringify({
      tool_call: {
        name: 'set_translation_text',
        arguments: { text },
      },
    });
  }

  return '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export class MockLLMProvider implements LLMProvider {
  readonly id = 'mock';
  readonly label = 'Mock LLM';
  readonly supportsStreaming = true;

  private readonly delayMs: number;
  private readonly prefix: string;

  constructor(options?: MockLLMProviderOptions) {
    this.delayMs = options?.delayMs ?? 45;
    this.prefix = options?.prefix ?? '[MockAI]';
  }

  async *chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const model = options?.model ?? 'mock-1';
    const source = lastUserMessage?.content?.trim() || '\uff08\u7a7a\u8f93\u5165\uff09';
    const functionCallReply = buildMockFunctionCallingReply(source);
    const full = functionCallReply.length > 0
      ? functionCallReply
      : `${this.prefix}(${model}) \u5df2\u6536\u5230\uff1a${source}`;
    const units = full.split('');

    for (const unit of units) {
      if (options?.signal?.aborted) {
        yield { delta: '', done: true, error: 'aborted' };
        return;
      }
      yield { delta: unit };
      await sleep(this.delayMs);
    }

    const promptText = messages.map((message) => message.content).join('\n');
    const inputTokens = estimateMockTokenCount(promptText);
    const outputTokens = estimateMockTokenCount(full);
    yield {
      delta: '',
      done: true,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }
}
