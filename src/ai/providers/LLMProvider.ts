export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatChunk {
  delta: string;
  done?: boolean;
  error?: string;
}

export interface LLMProvider {
  id: string;
  label: string;
  supportsStreaming: boolean;
  chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown>;
}
