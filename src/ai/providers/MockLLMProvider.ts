import type {
  ChatChunk,
  ChatMessage,
  ChatRequestOptions,
  LLMProvider,
} from './LLMProvider';

export interface MockLLMProviderOptions {
  delayMs?: number;
  prefix?: string;
}

function extractCommandText(source: string): string | undefined {
  const quoted = source.match(/["“](.+?)["”]/);
  if (quoted?.[1]) return quoted[1].trim();

  const markers = ['内容为', '文本为', '翻译为', '译为', '为：', '为:', '：', ':'];
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
  const langMatch = normalized.match(/(?:语言|language)\s*(?:是|为|=|:|：)?\s*([a-z]{2,3})/i);
  const languageId = langMatch?.[1]?.toLowerCase();

  if (/(创建|新建|建立).*(转写行|句段|语段)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'create_transcription_segment',
        arguments: {},
      },
    });
  }

  // 带语言限定词时（如"日本语转写行"、"中文翻译层"）→ 删除整层 | with language qualifier → delete entire layer
  if (/(删除|移除).*(日|中|英|法|德|韩|俄|西|葡|阿|藏|维|蒙|粤|闽|语|文).*(转写|翻译)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'delete_layer',
        arguments: {},
      },
    });
  } else if (/(删除|移除).*(转写行|句段|语段)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'delete_transcription_segment',
        arguments: {},
      },
    });
  } else if (/(清空|删除|移除).*(翻译行|译文|翻译内容|翻译文本)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'clear_translation_segment',
        arguments: {},
      },
    });
  } else if (/(创建|新建|建立).*(转写层)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'create_transcription_layer',
        arguments: languageId ? { languageId } : {},
      },
    });
  } else if (/(创建|新建|建立).*(翻译层)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'create_translation_layer',
        arguments: languageId ? { languageId } : {},
      },
    });
  } else if (/(删除|移除).*(层)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'delete_layer',
        arguments: {},
      },
    });
  } else if (/(链接|关联|连接).*(层)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'link_translation_layer',
        arguments: {},
      },
    });
  } else if (/(取消链接|取消关联|断开).*(层)/.test(normalized)) {
    return JSON.stringify({
      tool_call: {
        name: 'unlink_translation_layer',
        arguments: {},
      },
    });
  } else if (/(转写|写入转写|设置转写)/.test(normalized) && text) {
    return JSON.stringify({
      tool_call: {
        name: 'set_transcription_text',
        arguments: { text },
      },
    });
  } else if (/(翻译|译文|写入翻译|设置翻译)/.test(normalized) && text) {
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
    const source = lastUserMessage?.content?.trim() || '（空输入）';
    const functionCallReply = buildMockFunctionCallingReply(source);
    const full = functionCallReply.length > 0
      ? functionCallReply
      : `${this.prefix}(${model}) 已收到：${source}`;
    const units = full.split('');

    for (const unit of units) {
      if (options?.signal?.aborted) {
        yield { delta: '', done: true, error: 'aborted' };
        return;
      }
      yield { delta: unit };
      await sleep(this.delayMs);
    }

    yield { delta: '', done: true };
  }
}
