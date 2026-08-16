/**
 * G0c: Invalidates in-flight stream UI/Dexie updates after clear, switch, or delete.
 */

export type ConversationGenerationRef = {
  current: number;
};

export function createConversationGenerationRef(initial = 0): ConversationGenerationRef {
  return { current: initial };
}

export function bumpConversationGeneration(ref: ConversationGenerationRef): number {
  ref.current += 1;
  return ref.current;
}

export function isConversationGenerationStale(
  ref: ConversationGenerationRef | undefined,
  capturedGeneration: number,
): boolean {
  if (!ref) return false;
  return ref.current !== capturedGeneration;
}

export function shouldApplyStreamUiUpdate(
  ref: ConversationGenerationRef | undefined,
  capturedGeneration: number,
): boolean {
  return !isConversationGenerationStale(ref, capturedGeneration);
}

/** Thrown when an in-flight send turn is superseded by conversation switch/clear. */
export class StaleConversationTurnError extends Error {
  constructor() {
    super('stale_conversation_turn');
    this.name = 'StaleConversationTurnError';
  }
}

export function throwIfConversationGenerationStale(
  ref: ConversationGenerationRef | undefined,
  capturedGeneration: number,
): void {
  if (isConversationGenerationStale(ref, capturedGeneration)) {
    throw new StaleConversationTurnError();
  }
}
