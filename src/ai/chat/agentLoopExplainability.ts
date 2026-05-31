/**
 * agentLoopExplainability — 重规划 / 循环退出时的用户可见补充文案。
 */

import { getAiChatCardMessages } from '../../i18n/messages';
import type { AgentLoopToolFailureMessageKey } from './agentLoopResultQuality';
import type { ReplanningMessageKey } from './agentLoopReplanning';

export type AgentLoopExplainabilityMessageKey =
  | ReplanningMessageKey
  | AgentLoopToolFailureMessageKey
  | 'agentLoopMaxStepsReached'
  | 'agentLoopDetailUnitNotFound';

function resolveExplainabilitySuffix(
  messageKey: AgentLoopExplainabilityMessageKey,
  isZhCn: boolean,
): string {
  const messages = getAiChatCardMessages(isZhCn);
  switch (messageKey) {
    case 'agentLoopSearchNoResults':
      return messages.agentLoopSearchNoResults();
    case 'agentLoopToolValidationError':
      return messages.agentLoopToolValidationError();
    case 'agentLoopToolRetryableError':
      return messages.agentLoopToolRetryableError();
    case 'agentLoopMaxStepsReached':
      return messages.agentLoopMaxStepsReached();
    case 'agentLoopDetailUnitNotFound':
      return messages.agentLoopDetailUnitNotFound();
    default:
      return '';
  }
}

export function appendAgentLoopExplainability(
  content: string,
  messageKey: AgentLoopExplainabilityMessageKey | undefined,
  isZhCn: boolean,
): string {
  if (!messageKey) return content;
  const suffix = resolveExplainabilitySuffix(messageKey, isZhCn);
  if (!suffix) return content;
  return content.trimEnd().length > 0 ? `${content.trimEnd()}\n\n${suffix}` : suffix;
}
