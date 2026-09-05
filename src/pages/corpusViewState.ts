/** sessionStorage key for corpus filter UI only (三页联评 R8). Not the workset. */
export const CORPUS_VIEW_STATE_KEY = 'corpusViewState';

export type CorpusViewState = {
  filterText?: string;
};

export function resetCorpusViewStateForTests(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CORPUS_VIEW_STATE_KEY);
  } catch {
    /* quota / private mode */
  }
}

export function readCorpusViewState(): CorpusViewState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(CORPUS_VIEW_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const filterText = String((parsed as CorpusViewState).filterText ?? '').trim();
    return filterText.length > 0 ? { filterText } : {};
  } catch {
    return {};
  }
}

export function writeCorpusViewState(state: CorpusViewState): void {
  if (typeof window === 'undefined') return;
  try {
    const filterText = state.filterText?.trim() ?? '';
    window.sessionStorage.setItem(
      CORPUS_VIEW_STATE_KEY,
      JSON.stringify(filterText.length > 0 ? { filterText } : {}),
    );
  } catch {
    /* quota / private mode */
  }
}
