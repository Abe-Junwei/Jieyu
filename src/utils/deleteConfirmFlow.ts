export type DeleteConfirmStats = {
  totalCount: number;
  textCount: number;
  emptyCount: number;
};

export function buildDeleteConfirmStats(
  ids: string[],
  unitHasText: (id: string) => boolean,
): DeleteConfirmStats {
  const textCount = ids.filter((id) => unitHasText(id)).length;
  const emptyCount = ids.length - textCount;
  return {
    totalCount: ids.length,
    textCount,
    emptyCount,
  };
}

export function shouldPromptDelete(stats: DeleteConfirmStats, suppressInSession: boolean): boolean {
  if (stats.textCount === 0) return false;
  if (suppressInSession) return false;
  return true;
}

export function nextSuppressFlag(currentSuppress: boolean, confirmed: boolean, muteInSession: boolean): boolean {
  if (!confirmed) return currentSuppress;
  if (muteInSession) return true;
  return currentSuppress;
}
