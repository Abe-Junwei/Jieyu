import type { ChatChunk, ChatMessage, ChatRequestOptions, LLMProvider } from './providers/LLMProvider';

export interface SendMessageInput {
  history: ChatMessage[];
  userText: string;
  systemPrompt?: string;
  options?: ChatRequestOptions;
}

export interface SendMessageOutput {
  messages: ChatMessage[];
  stream: AsyncGenerator<ChatChunk, void, unknown>;
}

function trimMessageContent(value: string): string {
  return value.trim();
}

export class ChatOrchestrator {
  constructor(private readonly provider: LLMProvider) {}

  sendMessage(input: SendMessageInput): SendMessageOutput {
    const nextMessages: ChatMessage[] = [];

    const systemPrompt = trimMessageContent(input.systemPrompt ?? '');
    if (systemPrompt.length > 0) {
      nextMessages.push({ role: 'system', content: systemPrompt });
    } else if (import.meta.env.DEV && input.systemPrompt != null) {
      console.debug('[ChatOrchestrator] systemPrompt trimmed to empty, skipped');
    }

    for (const msg of input.history) {
      if (trimMessageContent(msg.content).length === 0) {
        if (import.meta.env.DEV) console.debug('[ChatOrchestrator] skipped empty history message', msg.role);
        continue;
      }
      nextMessages.push(msg);
    }

    const userText = trimMessageContent(input.userText);
    if (userText.length === 0) {
      throw new Error('userText 不能为空');
    }

    nextMessages.push({ role: 'user', content: userText });

    return {
      messages: nextMessages,
      stream: this.provider.chat(nextMessages, input.options),
    };
  }
}
