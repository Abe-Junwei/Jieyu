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
  /**
   * Stream chat completion chunks. The final chunk MUST have `{ delta: '', done: true }`.
   * On error, yield `{ delta: '', error: message }` and return.
   */
  chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown>;
}
