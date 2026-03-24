import type { AiChatToolName, AiPromptContext, AiTaskSession } from './useAiChat.types';
import {
  extractClarifyLanguagePatch,
  extractClarifySplitPositionPatch,
} from '../ai/chat/toolCallHelpers';

export interface ClarifyFastPathCall {
  name: AiChatToolName;
  arguments: Record<string, unknown>;
}

interface ResolveClarifyFastPathCallParams {
  taskSession: AiTaskSession;
  userText: string;
  aiContext: AiPromptContext | null;
}

/**
 * 澄清快速路径：从短回复直接补齐工具参数 | Clarify fast-path: extract tool args from short follow-up replies
 */
export function resolveClarifyFastPathCall({
  taskSession,
  userText,
  aiContext,
}: ResolveClarifyFastPathCallParams): ClarifyFastPathCall | null {
  if (
    taskSession.status === 'waiting_clarify'
    && taskSession.toolName
    && taskSession.clarifyReason === 'missing-language-target'
  ) {
    const langPatch = extractClarifyLanguagePatch(userText);
    if (langPatch) {
      return { name: taskSession.toolName, arguments: langPatch };
    }
  }

  if (
    taskSession.status === 'waiting_clarify'
    && taskSession.toolName === 'split_transcription_segment'
    && taskSession.clarifyReason === 'missing-split-position'
  ) {
    const splitPatch = extractClarifySplitPositionPatch(userText, aiContext);
    if (splitPatch) {
      return { name: 'split_transcription_segment', arguments: splitPatch };
    }
  }

  return null;
}
