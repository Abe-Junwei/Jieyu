type DictationAutoAdvanceInput = {
  unitIdsOnCurrentMedia: readonly string[];
  activeUnitId?: string | null;
};

export function resolveNextUnitIdForDictation(input: DictationAutoAdvanceInput): string | null {
  const activeId = input.activeUnitId?.trim() ?? '';
  if (!activeId) return null;
  const activeIndex = input.unitIdsOnCurrentMedia.findIndex((id) => id === activeId);
  if (activeIndex < 0) return null;
  const nextId = input.unitIdsOnCurrentMedia[activeIndex + 1];
  return nextId ?? null;
}