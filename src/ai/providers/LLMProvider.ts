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
  /**
   * 推理内容（如 DeepSeek 的 reasoning_content），用于展示模型思考过程。
   * 所有 provider 均可通过此字段可选地返回推理内容。
   */
  reasoningContent?: string;
  /**
   * 思考中状态：provider正在处理但尚未发出任何内容delta。
   * 用于非reasoning_content型provider（Anthropic/Gemini/Ollama）的UX反馈。
   * Hook累积时不使用此字段，仅用于UI层判断。
   */
  thinking?: boolean;
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
