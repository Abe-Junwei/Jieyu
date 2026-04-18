// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AiChatMetricsBar } from './AiChatMetricsBar';

afterEach(() => {
  cleanup();
});

describe('AiChatMetricsBar', () => {
  it('does not render without metrics', () => {
    const { container } = render(
      <AiChatMetricsBar isZh={false} aiInteractionMetrics={null} aiSessionMemory={null} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders metrics counters and mapped last tool label', () => {
    const { container } = render(
      <AiChatMetricsBar
        isZh={false}
        aiInteractionMetrics={{
          turnCount: 6,
          successCount: 3,
          failureCount: 1,
          clarifyCount: 2,
          explainFallbackCount: 1,
          cancelCount: 1,
          recoveryCount: 1,
          totalInputTokens: 120,
          totalOutputTokens: 88,
          currentTurnTokens: 34,
          totalInputTokensAvailable: true,
          totalOutputTokensAvailable: true,
          currentTurnTokensAvailable: true,
        }}
        aiSessionMemory={{
          lastToolName: 'delete_layer',
        }}
      />,
    );

    const root = container.querySelector('.ai-chat-metrics-bar') as HTMLDivElement;

    expect(root).toBeTruthy();
    expect(root.textContent).toContain('Turns 6');
    expect(screen.getByTitle('Successes').textContent).toContain('3');
    expect(screen.getByTitle('Failures').textContent).toContain('1');
    expect(root.textContent).toContain('Clarify 2');
    expect(root.textContent).toContain('Cancel 1');
    expect(root.textContent).toContain('Explain 1');
    expect(root.textContent).toContain('Recover 1');
    expect(root.textContent).toContain('Prompt 120');
    expect(root.textContent).toContain('Gen 88');
    expect(root.textContent).toContain('Turn 34');
    expect(screen.getByTitle('Last tool').textContent).toContain('Delete Layer');
  });

  it('renders an unavailable marker when token usage is not reported', () => {
    const { container } = render(
      <AiChatMetricsBar
        isZh={false}
        aiInteractionMetrics={{
          turnCount: 1,
          successCount: 0,
          failureCount: 0,
          clarifyCount: 0,
          explainFallbackCount: 0,
          cancelCount: 0,
          recoveryCount: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          currentTurnTokens: 0,
          totalInputTokensAvailable: false,
          totalOutputTokensAvailable: false,
          currentTurnTokensAvailable: false,
        }}
        aiSessionMemory={null}
      />,
    );

    const root = container.querySelector('.ai-chat-metrics-bar') as HTMLDivElement;
    expect(root.textContent).toContain('Prompt —');
    expect(root.textContent).toContain('Gen —');
    expect(root.textContent).toContain('Turn —');
  });
});