/**
 * 语音与 AI 聊天共用的工具执行回调形态（ADR-0028）
 * Shared tool-execution callback shape for voice and AI chat paths.
 */
export type VoiceAssistantToolCallHandler = (
  call: { name: string; arguments: Record<string, unknown> },
) => Promise<{ ok: boolean; message: string }>;
