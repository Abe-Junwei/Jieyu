import { describe, expect, it } from 'vitest';
import {
  bumpConversationGeneration,
  createConversationGenerationRef,
  isConversationGenerationStale,
  shouldApplyStreamUiUpdate,
} from './conversationGeneration';

describe('conversationGeneration', () => {
  it('marks prior generation stale after bump', () => {
    const ref = createConversationGenerationRef();
    const captured = ref.current;
    bumpConversationGeneration(ref);
    expect(isConversationGenerationStale(ref, captured)).toBe(true);
    expect(shouldApplyStreamUiUpdate(ref, captured)).toBe(false);
  });

  it('allows updates when generation unchanged', () => {
    const ref = createConversationGenerationRef(2);
    expect(shouldApplyStreamUiUpdate(ref, 2)).toBe(true);
  });
});
