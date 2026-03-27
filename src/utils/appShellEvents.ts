export const APP_SHELL_OPEN_SEARCH_EVENT = 'jieyu:open-search';

export type AppShellSearchScope = 'current-layer' | 'current-utterance' | 'global';

export interface AppShellOpenSearchDetail {
  query?: string;
  scope?: AppShellSearchScope;
  layerKinds?: Array<'transcription' | 'translation' | 'gloss'>;
}