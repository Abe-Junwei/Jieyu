import { readOptionalListScrollTop } from '../utils/workspaceReturnDeepLink';

/** sessionStorage key for corpus filter UI + list scroll (三页联评 R8). Not the workset. */
export const CORPUS_VIEW_STATE_KEY = 'corpusViewState';

export type CorpusViewState = {
  filterText?: string;
  listScrollTop?: number;
};

export function resetCorpusViewStateForTests(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CORPUS_VIEW_STATE_KEY);
  } catch {
    /* quota / private mode */
  }
}

function compactCorpusViewState(state: CorpusViewState): CorpusViewState {
  const filterText = state.filterText?.trim() ?? '';
  const listScrollTop = readOptionalListScrollTop(state.listScrollTop);
  return {
    ...(filterText.length > 0 ? { filterText } : {}),
    ...(listScrollTop ? { listScrollTop } : {}),
  };
}

export function readCorpusViewState(): CorpusViewState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(CORPUS_VIEW_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return compactCorpusViewState(parsed as CorpusViewState);
  } catch {
    return {};
  }
}

export function writeCorpusViewState(state: CorpusViewState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      CORPUS_VIEW_STATE_KEY,
      JSON.stringify(compactCorpusViewState(state)),
    );
  } catch {
    /* quota / private mode */
  }
}
