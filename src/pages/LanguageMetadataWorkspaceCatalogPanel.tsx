import { useMemo } from 'react';
import { PanelSection } from '../components/ui/PanelSection';
import { t } from '../i18n';
import type { LanguageCatalogEntry } from '../services/LinguisticService';
import { readEntryKindLabel, type WorkspaceLocale } from './languageMetadataWorkspace.shared';

type LanguageMetadataWorkspaceCatalogPanelProps = {
  locale: WorkspaceLocale;
  entries: LanguageCatalogEntry[];
  projectLanguageIds: readonly string[];
  selectedEntryId: string;
  loading: boolean;
  error: string;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onCreateCustom: () => void;
  onSelectEntry: (languageId: string) => void;
};

export function LanguageMetadataWorkspaceCatalogPanel({
  locale,
  entries,
  projectLanguageIds,
  selectedEntryId,
  loading,
  error,
  searchText,
  onSearchTextChange,
  onCreateCustom,
  onSelectEntry,
}: LanguageMetadataWorkspaceCatalogPanelProps) {
  // 将条目拆分为"项目使用中"和"其余" | Split entries into project-in-use and rest
  const { projectEntries, otherEntries } = useMemo(() => {
    if (projectLanguageIds.length === 0) {
      return { projectEntries: [] as LanguageCatalogEntry[], otherEntries: entries };
    }
    const projectIdSet = new Set(projectLanguageIds);
    const inProject: LanguageCatalogEntry[] = [];
    const rest: LanguageCatalogEntry[] = [];
    entries.forEach((entry) => {
      if (projectIdSet.has(entry.id)) {
        inProject.push(entry);
      } else {
        rest.push(entry);
      }
    });
    return { projectEntries: inProject, otherEntries: rest };
  }, [entries, projectLanguageIds]);

  const hasGroups = projectEntries.length > 0;

  const renderItem = (entry: LanguageCatalogEntry) => {
    const active = selectedEntryId === entry.id;
    return (
      <button
        key={entry.id}
        type="button"
        className={`language-metadata-workspace-list-item${active ? ' language-metadata-workspace-list-item-active' : ''}${entry.visibility === 'hidden' ? ' language-metadata-workspace-list-item-hidden' : ''}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelectEntry(entry.id)}
      >
        <div className="language-metadata-workspace-list-heading">
          <span className="language-metadata-workspace-list-label">{entry.localName}</span>
          {entry.visibility === 'hidden' ? (
            <span className="language-metadata-workspace-chip language-metadata-workspace-chip-muted">
              {t(locale, 'workspace.languageMetadata.visibilityHidden')}
            </span>
          ) : null}
        </div>
        <p className="language-metadata-workspace-list-description">{entry.englishName}</p>
        <span className="language-metadata-workspace-list-meta">
          <span className="language-metadata-workspace-chip">{entry.languageCode}</span>
          <span className="language-metadata-workspace-chip language-metadata-workspace-chip-subtle">{readEntryKindLabel(locale, entry)}</span>
          {entry.id !== entry.languageCode ? <span className="language-metadata-workspace-list-id">{entry.id}</span> : null}
        </span>
      </button>
    );
  };

  return (
    <PanelSection
      className="language-metadata-workspace-list-panel"
      title={t(locale, 'workspace.languageMetadata.listTitle')}
      description={t(locale, 'workspace.languageMetadata.listDescription')}
      meta={<span className="language-metadata-workspace-list-count">{t(locale, 'workspace.languageMetadata.countLabel').replace('{count}', String(entries.length))}</span>}
    >
      <div className="language-metadata-workspace-toolbar">
        <input
          className="input language-metadata-workspace-search"
          type="search"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder={t(locale, 'workspace.languageMetadata.searchPlaceholder')}
          aria-label={t(locale, 'workspace.languageMetadata.searchPlaceholder')}
        />
        <button type="button" className="btn btn-ghost" onClick={onCreateCustom}>{t(locale, 'workspace.languageMetadata.createCustom')}</button>
      </div>

      {loading ? <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.loading')}</p> : null}
      {!loading && error ? <p className="language-metadata-workspace-state language-metadata-workspace-state-error">{t(locale, 'workspace.languageMetadata.errorPrefix').replace('{message}', error)}</p> : null}
      {!loading && !error && entries.length === 0 ? <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.emptyList')}</p> : null}

      <div className="language-metadata-workspace-list" role="list" aria-label={t(locale, 'workspace.languageMetadata.listTitle')}>
        {hasGroups ? (
          <>
            <div className="language-metadata-workspace-list-group-header" role="presentation">
              {t(locale, 'workspace.languageMetadata.groupProject')}
            </div>
            {projectEntries.map(renderItem)}
            <div className="language-metadata-workspace-list-group-header" role="presentation">
              {t(locale, 'workspace.languageMetadata.groupAll')}
            </div>
            {otherEntries.map(renderItem)}
          </>
        ) : entries.map(renderItem)}
      </div>
    </PanelSection>
  );
}