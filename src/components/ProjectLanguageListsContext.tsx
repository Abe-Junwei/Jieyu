import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LinguisticService } from '../services/LinguisticService';
import {
  EMPTY_PROJECT_LANGUAGE_LISTS,
  readProjectLanguageLists,
  type ProjectLanguageLists,
} from '../utils/projectLanguageLists';
import {
  getActiveProjectTextId,
  readTranscriptionWorkspaceReturnHint,
  subscribeActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';

const ProjectLanguageListsContext = createContext<ProjectLanguageLists>(
  EMPTY_PROJECT_LANGUAGE_LISTS,
);

export function ProjectLanguageListsProvider({
  lists,
  children,
}: {
  lists: ProjectLanguageLists;
  children: ReactNode;
}) {
  return (
    <ProjectLanguageListsContext.Provider value={lists}>
      {children}
    </ProjectLanguageListsContext.Provider>
  );
}

export function ProjectLanguageListsLoader({
  textId,
  children,
}: {
  textId?: string;
  children: ReactNode;
}) {
  const [params] = useSearchParams();
  const publishedTextId = useSyncExternalStore(
    subscribeActiveProjectTextId,
    getActiveProjectTextId,
    () => '',
  );
  const id = (
    textId?.trim() ||
    publishedTextId ||
    params.get('textId')?.trim() ||
    readTranscriptionWorkspaceReturnHint()?.textId ||
    ''
  ).trim();
  const query = useQuery({
    queryKey: ['project-language-lists', id],
    enabled: id.length > 0,
    queryFn: async () => {
      const text = await LinguisticService.timeline.getTextById(id);
      return readProjectLanguageLists(text?.metadata);
    },
  });
  return (
    <ProjectLanguageListsProvider lists={query.data ?? EMPTY_PROJECT_LANGUAGE_LISTS}>
      {children}
    </ProjectLanguageListsProvider>
  );
}

export function useProjectLanguageLists(): ProjectLanguageLists {
  return useContext(ProjectLanguageListsContext);
}
