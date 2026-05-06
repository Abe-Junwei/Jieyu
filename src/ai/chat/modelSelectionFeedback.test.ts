import { describe, expect, it } from 'vitest';
import { decideModelFromFeedback, computeFeedbackWindow } from './modelSelectionFeedback';

describe('computeFeedbackWindow', () => {
  it('counts thumbs up and down', () => {
    const window = computeFeedbackWindow(['thumbs_up', 'thumbs_down', 'thumbs_up'], 10);
    expect(window.thumbsUpCount).toBe(2);
    expect(window.thumbsDownCount).toBe(1);
    expect(window.consecutiveThumbsDown).toBe(0);
  });

  it('counts consecutive thumbs down at the end', () => {
    const window = computeFeedbackWindow([
      'thumbs_up', 'thumbs_down', 'thumbs_down', 'thumbs_down',
    ], 10);
    expect(window.consecutiveThumbsDown).toBe(3);
  });

  it('resets consecutive count after a thumbs up', () => {
    const window = computeFeedbackWindow([
      'thumbs_down', 'thumbs_down', 'thumbs_up', 'thumbs_down',
    ], 10);
    expect(window.consecutiveThumbsDown).toBe(1);
  });

  it('respects windowSize', () => {
    const window = computeFeedbackWindow(
      ['thumbs_up', 'thumbs_down', 'thumbs_up', 'thumbs_down'],
      2,
    );
    expect(window.thumbsUpCount).toBe(1);
    expect(window.thumbsDownCount).toBe(1);
  });

  it('handles empty ratings', () => {
    const window = computeFeedbackWindow([], 10);
    expect(window.thumbsUpCount).toBe(0);
    expect(window.thumbsDownCount).toBe(0);
    expect(window.consecutiveThumbsDown).toBe(0);
  });
});

describe('decideModelFromFeedback', () => {
  it('advises keep_current when feedback is balanced', () => {
    const decision = decideModelFromFeedback(
      { thumbsUpCount: 5, thumbsDownCount: 2, consecutiveThumbsDown: 1 },
      'gpt-4',
    );
    expect(decision.advice).toBe('keep_current');
    expect(decision.reason).toContain('gpt-4');
  });

  it('advises downgrade_model on 3 consecutive thumbs down', () => {
    const decision = decideModelFromFeedback(
      { thumbsUpCount: 2, thumbsDownCount: 3, consecutiveThumbsDown: 3 },
      'gpt-4',
      'fallback-light',
    );
    expect(decision.advice).toBe('downgrade_model');
    expect(decision.suggestedFallbackModelId).toBe('fallback-light');
    expect(decision.reason).toContain('降级');
  });

  it('advises suggest_switch when negative ratio >= 50% with enough samples', () => {
    const decision = decideModelFromFeedback(
      { thumbsUpCount: 2, thumbsDownCount: 3, consecutiveThumbsDown: 1 },
      'gpt-4',
    );
    expect(decision.advice).toBe('suggest_switch');
    expect(decision.reason).toContain('50%');
  });

  it('does not suggest_switch with insufficient samples', () => {
    const decision = decideModelFromFeedback(
      { thumbsUpCount: 1, thumbsDownCount: 1, consecutiveThumbsDown: 1 },
      'gpt-4',
    );
    expect(decision.advice).toBe('keep_current');
  });

  it('advises downgrade_model on more than 3 consecutive thumbs down', () => {
    const decision = decideModelFromFeedback(
      { thumbsUpCount: 0, thumbsDownCount: 5, consecutiveThumbsDown: 5 },
      'gpt-4',
    );
    expect(decision.advice).toBe('downgrade_model');
    expect(decision.reason).toContain('5');
  });
});
