import type { AiSessionMemoryLocalSemanticFrame, AiTaskTraceEntry, UiChatMessage } from '../../ai/chat/chatDomain.types';
import { getAiChatCardMessages } from '../../i18n/messages';

export type FollowUpSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

function normalizeRecommendationText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function classifyRecommendationAdoption(
  inputText: string,
  recommendedText: string,
): 'accepted_exact' | 'accepted_edited' | null {
  const normalizedInput = normalizeRecommendationText(inputText);
  const normalizedRecommended = normalizeRecommendationText(recommendedText);
  if (!normalizedInput || !normalizedRecommended) return null;
  if (normalizedInput === normalizedRecommended) return 'accepted_exact';

  const anchorLength = normalizedRecommended.length >= 16 ? 10 : 6;
  const recommendedAnchor = normalizedRecommended.slice(0, Math.min(anchorLength, normalizedRecommended.length));
  if (recommendedAnchor.length >= 4 && normalizedInput.startsWith(recommendedAnchor)) {
    return 'accepted_edited';
  }

  let sharedPrefix = 0;
  while (
    sharedPrefix < normalizedInput.length
    && sharedPrefix < normalizedRecommended.length
    && normalizedInput[sharedPrefix] === normalizedRecommended[sharedPrefix]
  ) {
    sharedPrefix += 1;
  }

  return sharedPrefix / normalizedRecommended.length >= 0.45 ? 'accepted_edited' : null;
}

function humanizeLocalScope(scope: AiSessionMemoryLocalSemanticFrame['scope'], isZh: boolean): string {
  if (scope === 'project') return isZh ? '\u6574\u4e2a\u9879\u76ee' : 'the whole project';
  if (scope === 'current_track') return isZh ? '\u5f53\u524d\u97f3\u9891' : 'the current audio';
  return isZh ? '\u5f53\u524d\u8303\u56f4' : 'the current scope';
}

export function buildFollowUpSuggestions(params: {
  isZh: boolean;
  latestAssistantMessage: UiChatMessage | null;
  lastFrame: AiSessionMemoryLocalSemanticFrame | null | undefined;
}): FollowUpSuggestion[] {
  const { isZh, latestAssistantMessage, lastFrame } = params;
  if (
    !latestAssistantMessage
    || latestAssistantMessage.role !== 'assistant'
    || latestAssistantMessage.status !== 'done'
    || latestAssistantMessage.generationSource !== 'local'
  ) {
    return [];
  }
  if (!lastFrame) return [];

  const scopeLabel = humanizeLocalScope(lastFrame.scope, isZh);
  const out: FollowUpSuggestion[] = [];
  const push = (id: string, label: string, prompt: string) => {
    if (!label.trim() || !prompt.trim()) return;
    if (out.some((item) => item.id === id || item.label === label)) return;
    out.push({ id, label, prompt });
  };

  if (lastFrame.domain === 'project_stats' || lastFrame.questionKind === 'count') {
    push(
      'breakdown-speaker',
      isZh ? '\u6309\u8bf4\u8bdd\u4eba\u5206\u522b\u7edf\u8ba1' : 'Break down by speaker',
      isZh ? `\u6309\u8bf4\u8bdd\u4eba\u5206\u522b\u7edf\u8ba1${scopeLabel}` : `Break down ${scopeLabel} by speaker`,
    );
    push(
      'list-incomplete',
      isZh ? '\u5217\u51fa\u672a\u5b8c\u6210\u9879' : 'List incomplete items',
      isZh ? `\u5217\u51fa${scopeLabel}\u672a\u5b8c\u6210\u7684\u8bed\u6bb5` : `List the incomplete segments in ${scopeLabel}`,
    );
    push(
      'narrow-scope',
      isZh ? '\u53ea\u770b\u5f53\u524d\u8303\u56f4' : 'Narrow to current scope',
      isZh ? '\u53ea\u770b\u5f53\u524d\u8303\u56f4' : 'Only use the current scope',
    );
    return out.slice(0, 3);
  }

  if (lastFrame.questionKind === 'search' || lastFrame.questionKind === 'list') {
    push(
      'open-first',
      isZh ? '\u5c55\u5f00\u7b2c 1 \u6761' : 'Open the first result',
      isZh ? '\u5c55\u5f00\u7b2c 1 \u6761\u7684\u8be6\u60c5' : 'Open the details for the first result',
    );
    push(
      'list-incomplete',
      isZh ? '\u5217\u51fa\u672a\u5b8c\u6210\u9879' : 'List incomplete items',
      isZh ? `\u5217\u51fa${scopeLabel}\u672a\u5b8c\u6210\u7684\u8bed\u6bb5` : `List the incomplete segments in ${scopeLabel}`,
    );
    push(
      'narrow-scope',
      isZh ? '\u53ea\u770b\u5f53\u524d\u8303\u56f4' : 'Narrow to current scope',
      isZh ? '\u53ea\u770b\u5f53\u524d\u8303\u56f4' : 'Only use the current scope',
    );
    return out.slice(0, 3);
  }

  if (lastFrame.questionKind === 'detail') {
    push(
      'quality-check',
      isZh ? '\u67e5\u770b\u76f8\u5173\u8d28\u91cf\u95ee\u9898' : 'Check related quality issues',
      isZh ? '\u67e5\u770b\u8fd9\u6761\u8bed\u6bb5\u7684\u76f8\u5173\u8d28\u91cf\u95ee\u9898' : 'Check the related quality issues for this segment',
    );
    push(
      'linguistic-memory',
      isZh ? '\u770b\u8bcd\u6cd5\u6807\u6ce8' : 'Show linguistic annotations',
      isZh ? '\u67e5\u770b\u8fd9\u6761\u8bed\u6bb5\u7684\u8bcd\u6cd5\u6807\u6ce8' : 'Show the linguistic annotations for this segment',
    );
  }

  return out.slice(0, 3);
}

export function formatTaskTraceOutcome(entry: AiTaskTraceEntry, isZh: boolean): string {
  const messages = getAiChatCardMessages(isZh);
  if (entry.outcome === 'clarify') return messages.taskTraceOutcomeClarify;
  if (entry.outcome === 'error') return messages.taskTraceOutcomeError;
  if (entry.outcome === 'done') return messages.taskTraceOutcomeDone;
  return messages.taskTraceOutcomeRunning;
}