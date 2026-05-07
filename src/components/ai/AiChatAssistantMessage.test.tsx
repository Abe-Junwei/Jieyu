import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { getAiChatCardMessages } from '../../i18n/aiChatCardMessages';
import { AiChatAssistantMessage } from './AiChatAssistantMessage';

const noop = () => {};

type AssistantMsg = Parameters<typeof AiChatAssistantMessage>[0]['assistantMsg'];

function renderAssistantMarkup(overrides: Partial<AssistantMsg>) {
  const cardMessages = getAiChatCardMessages(false);
  const defaults = { id: 'a1', status: 'done' as const, content: 'Hello' };
  return renderToStaticMarkup(
    <LocaleProvider locale="en-US">
      <AiChatAssistantMessage
        assistantMsg={{ ...defaults, ...overrides }}
        locale="en-US"
        isZh={false}
        cardMessages={cardMessages}
        expandedReasoningIds={new Set()}
        copiedMessageId={null}
        pinnedMessageIdSet={new Set()}
        canToggleMessagePin={false}
        canActivateCitation={false}
        onToggleMessagePin={noop}
        onCopyAssistantMessage={noop}
        onToggleReasoning={noop}
        onActivateCitation={noop}
      />
    </LocaleProvider>,
  );
}

describe('AiChatAssistantMessage (P1 UX)', () => {
  it('hides reflection panel when all reflection checks passed', () => {
    const html = renderAssistantMarkup({
      reflectionChecks: [{ name: 'citation_count_match', passed: true }],
    });
    expect(html).not.toContain('data-testid="ai-chat-reflection-panel"');
  });

  it('shows collapsible reflection panel listing only failed checks', () => {
    const html = renderAssistantMarkup({
      reflectionChecks: [
        { name: 'citation_count_match', passed: true },
        { name: 'quote_nonempty', passed: false },
      ],
    });
    expect(html).toContain('data-testid="ai-chat-reflection-panel"');
    expect(html).toContain('quote_nonempty');
    expect(html).not.toContain('citation_count_match');
  });

  it('shows no-evidence fallback when RAG returned no results even without sourceScopeSummary', () => {
    const html = renderAssistantMarkup({
      citations: [],
      degradationScenarios: ['rag_no_results'],
    });
    expect(html).toContain('No matching evidence found in current scope');
  });
});
