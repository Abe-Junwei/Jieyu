import type { AiSessionMemoryLocalSemanticFrame, AiTaskTraceEntry, UiChatMessage } from '../../ai/chat/chatDomain.types';
import { getAiChatCardMessages } from '../../i18n/aiChatCardMessages';

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
  if (scope === 'project') return isZh ? '整个项目' : 'the whole project';
  if (scope === 'current_track') return isZh ? '当前音频' : 'the current audio';
  return isZh ? '当前范围' : 'the current scope';
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
      isZh ? '按说话人分别统计' : 'Break down by speaker',
      isZh ? `按说话人分别统计${scopeLabel}` : `Break down ${scopeLabel} by speaker`,
    );
    push(
      'list-incomplete',
      isZh ? '列出未完成项' : 'List incomplete items',
      isZh ? `列出${scopeLabel}未完成的语段` : `List the incomplete segments in ${scopeLabel}`,
    );
    push(
      'narrow-scope',
      isZh ? '只看当前范围' : 'Narrow to current scope',
      isZh ? '只看当前范围' : 'Only use the current scope',
    );
    return out.slice(0, 3);
  }

  if (lastFrame.questionKind === 'search' || lastFrame.questionKind === 'list') {
    push(
      'open-first',
      isZh ? '展开第 1 条' : 'Open the first result',
      isZh ? '展开第 1 条的详情' : 'Open the details for the first result',
    );
    push(
      'list-incomplete',
      isZh ? '列出未完成项' : 'List incomplete items',
      isZh ? `列出${scopeLabel}未完成的语段` : `List the incomplete segments in ${scopeLabel}`,
    );
    push(
      'narrow-scope',
      isZh ? '只看当前范围' : 'Narrow to current scope',
      isZh ? '只看当前范围' : 'Only use the current scope',
    );
    return out.slice(0, 3);
  }

  if (lastFrame.questionKind === 'detail') {
    push(
      'quality-check',
      isZh ? '查看相关质量问题' : 'Check related quality issues',
      isZh ? '查看这条语段的相关质量问题' : 'Check the related quality issues for this segment',
    );
    push(
      'linguistic-memory',
      isZh ? '看词法标注' : 'Show linguistic annotations',
      isZh ? '查看这条语段的词法标注' : 'Show the linguistic annotations for this segment',
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