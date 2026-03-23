/**
 * ObserverStatus.test | AI观察者状态组件集成测试
 * @vitest-environment jsdom
 * 
 * 验证 ObserverStatus 组件的状态显示和建议执行
 * Validates observer stage display and recommendation execution for ObserverStatus component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ObserverStatus, { type ObserverStatusProps, type AiObserverRecommendation } from './ObserverStatus';

describe('ObserverStatus Component', () => {
  const mockRecommendations: AiObserverRecommendation[] = [
    { id: 'rec-1', title: 'Review Transcription', actionLabel: 'Review', detail: 'Review all transcriptions' },
    { id: 'rec-2', title: 'Check Glossing', actionLabel: 'Check', detail: 'Check glossing accuracy' },
    { id: 'rec-3', title: 'Verify Translations', detail: 'Verify all translations' },
  ];

  const createMockProps = (overrides?: Partial<ObserverStatusProps>): ObserverStatusProps => ({
    observerStage: 'collecting',
    recommendations: [],
    onExecuteRecommendation: vi.fn(),
    ...overrides,
  });

  it('renders component without errors', () => {
    const { container } = render(<ObserverStatus {...createMockProps()} />);
    expect(container).not.toBeNull();
    expect(container.querySelector('.transcription-ai-observer-stage-label')).not.toBeNull();
  });

  it('displays observer stage label', () => {
    const { container } = render(
      <ObserverStatus {...createMockProps({ observerStage: 'transcribing' })} />
    );
    const stageLabel = container.querySelector('.transcription-ai-observer-stage-label');
    expect(stageLabel).not.toBeNull();
  });

  it('renders recommendation buttons when recommendations exist', () => {
    const { container } = render(
      <ObserverStatus
        {...createMockProps({ recommendations: mockRecommendations })}
      />
    );
    const buttons = container.querySelectorAll('.transcription-ai-observer-rec-btn');
    // Should display max 2 visible recommendations
    expect(buttons.length).toBe(2);
  });

  it('shows overflow indicator when more than max visible recommendations', () => {
    const { container } = render(
      <ObserverStatus
        {...createMockProps({ recommendations: mockRecommendations })}
      />
    );
    const overflow = container.querySelector('.transcription-ai-observer-rec-overflow');
    expect(overflow).not.toBeNull();
    expect(overflow?.textContent).toBe('+1');
  });

  it('invokes callback when recommendation button is clicked', () => {
    const onExecuteRecommendation = vi.fn();
    const { container } = render(
      <ObserverStatus
        {...createMockProps({
          recommendations: mockRecommendations,
          onExecuteRecommendation,
        })}
      />
    );

    const buttons = container.querySelectorAll('.transcription-ai-observer-rec-btn');
    fireEvent.click(buttons[0]!);

    expect(onExecuteRecommendation).toHaveBeenCalledWith(mockRecommendations[0]);
  });

  it('does not render recommendations section when recommendations array is empty', () => {
    const { container } = render(
      <ObserverStatus {...createMockProps({ recommendations: [] })} />
    );
    const recsInline = container.querySelector('.transcription-ai-observer-recs-inline');
    expect(recsInline).toBeNull();
  });

  it('handles different observer stages', () => {
    const { rerender, container: container1 } = render(
      <ObserverStatus {...createMockProps({ observerStage: 'collecting' })} />
    );
    expect(container1.querySelector('.transcription-ai-observer-stage-label')).not.toBeNull();

    rerender(<ObserverStatus {...createMockProps({ observerStage: 'glossing' })} />);
    expect(container1.querySelector('.transcription-ai-observer-stage-label')).not.toBeNull();

    rerender(<ObserverStatus {...createMockProps({ observerStage: 'reviewing' })} />);
    expect(container1.querySelector('.transcription-ai-observer-stage-label')).not.toBeNull();
  });

  it('displays correct action labels or titles for recommendations', () => {
    const recs: AiObserverRecommendation[] = [
      { id: 'r1', title: 'Default Title', actionLabel: 'Custom Label' },
      { id: 'r2', title: 'Only Title' },
    ];
    
    const { container } = render(
      <ObserverStatus {...createMockProps({ recommendations: recs })} />
    );

    const buttons = container.querySelectorAll('.transcription-ai-observer-rec-btn');
    expect(buttons[0]!.textContent).toBe('Custom Label');
    expect(buttons[1]!.textContent).toBe('Only Title');
  });

  it('handles undefined observer stage gracefully', () => {
    const { container } = render(
      <ObserverStatus {...createMockProps({ observerStage: undefined })} />
    );
    expect(container.querySelector('.transcription-ai-observer-stage-label')).not.toBeNull();
  });
});
