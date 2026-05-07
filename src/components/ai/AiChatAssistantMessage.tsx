import { Fragment } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE_TIGHT } from '../../utils/jieyuMaterialIcon';
import { buildCopyableAssistantPlainText, splitCitationMarkers } from '../../utils/citationFootnoteUtils';
import { formatCitationLabel } from './aiChatCardUtils';
import { StreamWordsText } from './streamAssistantWords';
import { AiChatFeedbackButtons } from './AiChatFeedbackButtons';
import { AiChatDegradationOverride, useDegradationOverrides } from './AiChatDegradationOverride';
import { t, tf, type Locale } from '../../i18n';
import type { DegradationScenario } from '../../ai/chat/degradationManualOverride';
import type { WorkflowExplainabilityV0 } from '../../ai/chat/workflowExplainability';

type Citation = {
  type: 'note' | 'unit' | 'pdf' | 'schema';
  refId: string;
  label?: string;
  snippet?: string;
  confidence?: number;
  reasonCode?: string;
};
type AssistantMessage = {
  id: string;
  status?: 'streaming' | 'done' | 'aborted' | 'error';
  content?: string;
  reasoningContent?: string;
  citations?: Citation[];
  generationSource?: 'llm' | 'local';
  generationModel?: string;
  thinking?: boolean;
  degradationScenarios?: DegradationScenario[];
  sourceScopeSummary?: {
    evidenceCount: number;
    sourceTypeBreakdown: Record<string, number>;
    scopeLabel: string;
  };
  workflowExplainability?: WorkflowExplainabilityV0;
  compatibilityReport?: {
    reportId: string;
    findings: Array<{
      findingId: string;
      kind: string;
      severity: 'info' | 'warning' | 'error';
      title: string;
      description: string;
      recommendedAction: string;
      evidenceCount: number;
    }>;
    summary: string;
    exportTargets: string[];
  };
  reflectionChecks?: Array<{ name: string; passed: boolean }>;
};

export function AiChatAssistantMessage({
  assistantMsg,
  locale,
  isZh,
  cardMessages,
  expandedReasoningIds,
  copiedMessageId,
  pinnedMessageIdSet,
  canToggleMessagePin,
  canActivateCitation,
  onToggleMessagePin,
  onCopyAssistantMessage,
  onToggleReasoning,
  onActivateCitation,
  feedbackRatings,
  onFeedbackRate,
}: {
  assistantMsg: AssistantMessage;
  locale: Locale;
  isZh: boolean;
  cardMessages: {
    parsingToolCall: string;
    thinking: string;
    aborted: string;
    reasoning: string;
    hideReasoning: string;
    showReasoning: string;
    copied: string;
    copy: string;
    unpinMessage: string;
    pinMessage: string;
    aiGenerated: string;
    generatedByModel: (model: string) => string;
    evidenceTitle: string;
    evidenceSourceLabel: string;
    evidenceQuoteLabel: string;
    evidenceConfidenceLabel: (confidencePercent: string) => string;
    evidenceJump: string;
    sourceScopeSummary: (count: number, scopeLabel: string) => string;
    workflowExplainabilitySrOnly: (
      headlineKey: 'assistant_error' | 'degraded_response' | 'scope_summary_only',
      detailsJoined: string,
    ) => string;
  };
  expandedReasoningIds: Set<string>;
  copiedMessageId: string | null;
  pinnedMessageIdSet: Set<string>;
  canToggleMessagePin: boolean;
  canActivateCitation: boolean;
  onToggleMessagePin: (messageId: string, isPinned: boolean) => void;
  onCopyAssistantMessage: (messageId: string, content: string) => void;
  onToggleReasoning: (messageId: string) => void;
  onActivateCitation: (citation: { type: 'note' | 'unit' | 'pdf' | 'schema'; refId: string }, rawCitation?: { snippet?: string }) => void;
  feedbackRatings?: Record<string, 'thumbs_up' | 'thumbs_down'>;
  onFeedbackRate?: (messageId: string, rating: 'thumbs_up' | 'thumbs_down') => void;
}) {
  const assistantContent = ((assistantMsg.status === 'streaming' && /\{[\s\S]*"tool_call"\s*:\s*\{/.test(assistantMsg.content || ''))
    ? cardMessages.parsingToolCall
    : (assistantMsg.content || (assistantMsg.status === 'streaming'
      ? (assistantMsg.thinking ? cardMessages.thinking : '...')
      : (assistantMsg.status === 'aborted' ? cardMessages.aborted : ''))));
  const reasoningContent = assistantMsg.reasoningContent;
  const hasReasoning = typeof reasoningContent === 'string' && reasoningContent.length > 0;
  const isReasoningExpanded = hasReasoning && expandedReasoningIds.has(assistantMsg.id);
  const rawCitations = assistantMsg.citations ?? [];
  const hasInlineMarkers = rawCitations.length > 0 && /\[\d+\]/.test(assistantContent);
  const orderedCitations = hasInlineMarkers
    ? rawCitations
    : [...rawCitations].sort((a, b) => {
      const rank = (type: string): number => {
        if (type === 'unit') return 1;
        if (type === 'note') return 2;
        if (type === 'pdf') return 3;
        return 99;
      };
      return rank(a.type) - rank(b.type);
    });
  const copyableAssistantContent = buildCopyableAssistantPlainText({
    content: assistantMsg.content ?? '',
    citations: orderedCitations,
    locale,
  });
  const hasCopyableAssistantContent = copyableAssistantContent.length > 0;
  const showAiGeneratedText = assistantMsg.generationSource === 'llm' && assistantMsg.status === 'done';
  const generatedModelName = (assistantMsg.generationModel ?? '').trim();
  const generatedLabel = generatedModelName.length > 0
    ? cardMessages.generatedByModel(generatedModelName)
    : cardMessages.aiGenerated;
  const isAssistantPinned = pinnedMessageIdSet.has(assistantMsg.id);
  const evidenceCitations = orderedCitations.filter((citation) => citation.refId.trim().length > 0);
  const degradationScenarios = assistantMsg.degradationScenarios ?? [];
  const failedReflectionChecks = (assistantMsg.reflectionChecks ?? []).filter((check) => !check.passed);
  const showNoEvidenceFallback = assistantMsg.status === 'done'
    && evidenceCitations.length === 0
    && (
      assistantMsg.sourceScopeSummary !== undefined
      || degradationScenarios.includes('rag_no_results')
    );
  const { states: degradationStates, setState: setDegradationStates } = useDegradationOverrides(
    degradationScenarios,
    assistantMsg.id,
  );

  return (
    <div className="ai-chat-message-bubble ai-chat-message-assistant">
      <div className="ai-chat-message-surface">
        {assistantMsg.workflowExplainability && assistantMsg.workflowExplainability.headlineKey !== 'ok' && (
          <span className="ai-chat-sr-only">
            {cardMessages.workflowExplainabilitySrOnly(
              assistantMsg.workflowExplainability.headlineKey,
              assistantMsg.workflowExplainability.detailSignals.join(
                locale === 'zh-CN' ? '\u3001' : '; ',
              ),
            )}
          </span>
        )}
        {assistantMsg.sourceScopeSummary && assistantMsg.status === 'done' && (
          <div className="ai-chat-source-scope-summary">
            <MaterialSymbol name="library_books" className={JIEYU_MATERIAL_INLINE_TIGHT} />
            <span>
              {cardMessages.sourceScopeSummary(
                assistantMsg.sourceScopeSummary.evidenceCount,
                assistantMsg.sourceScopeSummary.scopeLabel,
              )}
            </span>
          </div>
        )}
        <span className="ai-chat-message-content">
          {hasInlineMarkers
            ? splitCitationMarkers(assistantContent, rawCitations.length).map((seg, i) => (
              seg.type === 'text'
                ? (
                  assistantMsg.status === 'streaming'
                    ? (
                      <StreamWordsText
                        key={`${assistantMsg.id}-cit-${i}`}
                        streamKey={`${assistantMsg.id}-cit-${i}`}
                        text={seg.value}
                        locale={locale}
                      />
                    )
                    : <Fragment key={i}>{seg.value}</Fragment>
                )
                : (
                  <sup
                    key={i}
                    className="ai-citation-marker"
                    role={canActivateCitation ? 'button' : undefined}
                    tabIndex={canActivateCitation ? 0 : undefined}
                    onClick={() => {
                      if (!canActivateCitation) return;
                      const c = rawCitations[seg.index! - 1];
                      if (c) onActivateCitation(c, c);
                    }}
                    onKeyDown={(e) => {
                      if (!canActivateCitation) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        const c = rawCitations[seg.index! - 1];
                        if (c) onActivateCitation(c, c);
                      }
                    }}
                  >
                    {seg.value}
                  </sup>
                )
            ))
            : assistantMsg.status === 'streaming'
              ? (
                <StreamWordsText
                  streamKey={assistantMsg.id}
                  text={assistantContent}
                  locale={locale}
                />
              )
              : assistantContent}
        </span>
        {hasReasoning && isReasoningExpanded && (
          <div className="ai-chat-reasoning-block">
            <div className="ai-chat-reasoning-title">
              {cardMessages.reasoning}
            </div>
            <div className="ai-chat-reasoning-body">
              {assistantMsg.status === 'streaming'
                ? (
                  <StreamWordsText
                    streamKey={`${assistantMsg.id}-reasoning`}
                    text={reasoningContent ?? ''}
                    locale={locale}
                  />
                )
                : reasoningContent}
            </div>
          </div>
        )}
        {evidenceCitations.length > 0 && (
          <div className="ai-chat-evidence-stack" role="region" aria-label={cardMessages.evidenceTitle}>
            <div className="ai-chat-evidence-stack__title">
              <MaterialSymbol name="fact_check" className={JIEYU_MATERIAL_INLINE_TIGHT} />
              <span>{cardMessages.evidenceTitle}</span>
            </div>
            <div className="ai-chat-evidence-list">
              {evidenceCitations.map((citation, index) => {
                const confidence = typeof citation.confidence === 'number' && Number.isFinite(citation.confidence)
                  ? Math.max(0, Math.min(1, citation.confidence))
                  : 0.8;
                const confidencePercent = `${Math.round(confidence * 100)}%`;
                const confidenceTier = confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
                const quote = (citation.snippet ?? '').trim();
                return (
                  <article
                    key={`${assistantMsg.id}-evidence-${citation.type}-${citation.refId}-${index}`}
                    className={`ai-chat-evidence-card is-confidence-${confidenceTier}`}
                  >
                    <div className="ai-chat-evidence-card__meta">
                      <span className="ai-chat-evidence-card__marker">[{index + 1}]</span>
                      <span className="ai-chat-evidence-card__source">
                        {cardMessages.evidenceSourceLabel}: {formatCitationLabel(isZh, citation)}
                      </span>
                      <span className="ai-chat-evidence-card__confidence">
                        {cardMessages.evidenceConfidenceLabel(confidencePercent)}
                      </span>
                      <button
                        type="button"
                        className="ai-chat-evidence-card__jump"
                        data-testid={`ai-chat-evidence-jump-${index}`}
                        disabled={!canActivateCitation}
                        aria-label={cardMessages.evidenceJump}
                        title={cardMessages.evidenceJump}
                        onClick={() => onActivateCitation(citation, citation)}
                      >
                        <MaterialSymbol name="open_in_new" className={JIEYU_MATERIAL_INLINE_TIGHT} />
                      </button>
                    </div>
                    {quote.length > 0 && (
                      <blockquote className="ai-chat-evidence-card__quote">
                        <span>{cardMessages.evidenceQuoteLabel}: </span>{quote}
                      </blockquote>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}
        {/* P1: low-confidence evidence warning */}
        {evidenceCitations.length > 0 && evidenceCitations.some((c) => (typeof c.confidence === 'number' ? c.confidence : 0.8) < 0.5) && (
          <div className="ai-chat-low-confidence-banner" role="alert">
            <MaterialSymbol name="warning" className={JIEYU_MATERIAL_INLINE_TIGHT} />
            <span>{t(locale, 'msg.aiChat.lowConfidenceWarning')}</span>
          </div>
        )}
        {/* P1: no-evidence fallback with actionable next step (scope summary and/or RAG empty) */}
        {showNoEvidenceFallback && (
          <div className="ai-chat-no-evidence-fallback" role="note">
            <MaterialSymbol name="search_off" className={JIEYU_MATERIAL_INLINE_TIGHT} />
            <div>
              <p>{t(locale, 'msg.aiChat.noEvidenceFallback.title')}</p>
              <p className="ai-chat-no-evidence-fallback__hint">
                {t(locale, 'msg.aiChat.noEvidenceFallback.hint')}
              </p>
              {assistantMsg.sourceScopeSummary && (
                <p className="ai-chat-no-evidence-fallback__scope">
                  {cardMessages.sourceScopeSummary(
                    assistantMsg.sourceScopeSummary.evidenceCount,
                    assistantMsg.sourceScopeSummary.scopeLabel,
                  )}
                </p>
              )}
            </div>
          </div>
        )}
        {degradationStates.length > 0 && (
          <div className="ai-chat-degradation-stack" role="region" aria-label={t(locale, 'msg.aiChat.degradation.ariaLabel')}>
            {degradationStates.map((state) => (
              <AiChatDegradationOverride
                key={`${assistantMsg.id}-${state.scenario}`}
                state={state}
                locale={locale}
                onStateChange={(next) => {
                  setDegradationStates((prev) =>
                    prev.map((s) => (s.scenario === next.scenario ? next : s)),
                  );
                }}
              />
            ))}
          </div>
        )}
        {/* P1: reflection — collapsible panel, failed checks only (passes stay silent) */}
        {failedReflectionChecks.length > 0 && assistantMsg.status === 'done' && (
          <details className="ai-chat-reflection-panel" open data-testid="ai-chat-reflection-panel">
            <summary className="ai-chat-reflection-panel__summary" aria-label={t(locale, 'msg.aiChat.reflectionPanel.ariaLabel')}>
              <MaterialSymbol name="fact_check" className={JIEYU_MATERIAL_INLINE_TIGHT} />
              <span>{t(locale, 'msg.aiChat.reflectionPanel.title')}</span>
              <span className="ai-chat-reflection-panel__failed-count">({failedReflectionChecks.length})</span>
            </summary>
            <ul className="ai-chat-reflection-panel__list">
              {failedReflectionChecks.map((check) => (
                <li
                  key={`${assistantMsg.id}-${check.name}`}
                  className="ai-chat-reflection-panel__item is-failed"
                >
                  <MaterialSymbol name="error" className={JIEYU_MATERIAL_INLINE_TIGHT} />
                  <span>{check.name}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {assistantMsg.compatibilityReport && assistantMsg.status === 'done' && (
          <div className="ai-chat-compatibility-report" role="region" aria-label={t(locale, 'msg.aiChat.compatibilityReport.ariaLabel')}>
            <div className="ai-chat-compatibility-report__header">
              <MaterialSymbol name="sync_alt" className={JIEYU_MATERIAL_INLINE_TIGHT} />
              <span>{t(locale, 'msg.aiChat.compatibilityReport.title')}</span>
              <span className="ai-chat-compatibility-report__count">
                {assistantMsg.compatibilityReport.findings.length}
              </span>
            </div>
            <div className="ai-chat-compatibility-report__summary">
              {assistantMsg.compatibilityReport.summary}
            </div>
            {assistantMsg.compatibilityReport.findings.length > 0 && (
              <div className="ai-chat-compatibility-report__findings">
                {assistantMsg.compatibilityReport.findings.map((finding) => {
                  const severityIcon = finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'info';
                  return (
                    <div
                      key={`${assistantMsg.id}-${finding.findingId}`}
                      className={`ai-chat-compatibility-report__finding is-severity-${finding.severity}`}
                    >
                      <div className="ai-chat-compatibility-report__finding-title">
                        <MaterialSymbol name={severityIcon} className={JIEYU_MATERIAL_INLINE_TIGHT} />
                        <span>{finding.title}</span>
                        <span className="ai-chat-compatibility-report__finding-kind">({finding.kind})</span>
                      </div>
                      <div className="ai-chat-compatibility-report__finding-desc">{finding.description}</div>
                      <div className="ai-chat-compatibility-report__finding-action">
                        <strong>{t(locale, 'msg.aiChat.compatibilityReport.recommendedAction')}:</strong>{' '}
                        {finding.recommendedAction}
                      </div>
                      {finding.evidenceCount > 0 && (
                        <div className="ai-chat-compatibility-report__finding-evidence">
                          {tf(locale, 'msg.aiChat.compatibilityReport.evidenceCount', { count: finding.evidenceCount })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="ai-chat-message-actions">
          {canToggleMessagePin && (
          <button
            type="button"
            className={`ai-chat-message-action-btn ai-chat-message-pin-btn ${isAssistantPinned ? 'is-active' : ''}`}
            onClick={() => onToggleMessagePin(assistantMsg.id, isAssistantPinned)}
            aria-label={isAssistantPinned ? cardMessages.unpinMessage : cardMessages.pinMessage}
            title={isAssistantPinned ? cardMessages.unpinMessage : cardMessages.pinMessage}
          >
            <MaterialSymbol
              name={isAssistantPinned ? 'close' : 'push_pin'}
              className={JIEYU_MATERIAL_INLINE_TIGHT}
            />
          </button>
          )}
          {hasCopyableAssistantContent && (
            <button
              type="button"
              className="icon-btn ai-chat-message-copy-btn"
              title={copiedMessageId === assistantMsg.id
                ? cardMessages.copied
                : cardMessages.copy}
              aria-label={copiedMessageId === assistantMsg.id
                ? cardMessages.copied
                : cardMessages.copy}
              onClick={() => onCopyAssistantMessage(assistantMsg.id, copyableAssistantContent)}
            >
              {copiedMessageId === assistantMsg.id ? <MaterialSymbol name="check" className={JIEYU_MATERIAL_INLINE_TIGHT} /> : <MaterialSymbol name="content_copy" className={JIEYU_MATERIAL_INLINE_TIGHT} />}
            </button>
          )}
          {hasReasoning && (
            <button
              type="button"
              className="ai-chat-message-action-btn ai-chat-message-action-btn-italic"
              onClick={() => onToggleReasoning(assistantMsg.id)}
            >
              {isReasoningExpanded
                ? cardMessages.hideReasoning
                : cardMessages.showReasoning}
            </button>
          )}
          {orderedCitations.map((citation, ci) => (
            <button
              key={`${assistantMsg.id}-${citation.type}-${citation.refId}`}
              className="ai-chat-message-action-btn"
              title={`${citation.type}:${citation.refId}`}
              type="button"
              disabled={!canActivateCitation}
              onClick={() => onActivateCitation(citation, citation)}
            >
              {hasInlineMarkers ? `[${ci + 1}] ` : ''}{formatCitationLabel(isZh, citation)}
            </button>
          ))}
          {showAiGeneratedText && (
            <span className="ai-chat-message-source-text">
              {generatedLabel}
            </span>
          )}
          {assistantMsg.status === 'done' && onFeedbackRate && (
            <AiChatFeedbackButtons
              messageId={assistantMsg.id}
              rated={feedbackRatings?.[assistantMsg.id] ?? null}
              onRate={onFeedbackRate}
            />
          )}
        </div>
      </div>
    </div>
  );
}
