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
