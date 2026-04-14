type DictationAutoAdvanceInput = {
  utteranceIdsOnCurrentMedia: readonly string[];
  activeUnitId?: string | null;
};

export function resolveNextUtteranceIdForDictation(input: DictationAutoAdvanceInput): string | null {
  const activeId = input.activeUnitId?.trim() ?? '';
  if (!activeId) return null;
  const activeIndex = input.utteranceIdsOnCurrentMedia.findIndex((id) => id === activeId);
  if (activeIndex < 0) return null;
  const nextId = input.utteranceIdsOnCurrentMedia[activeIndex + 1];
  return nextId ?? null;
}