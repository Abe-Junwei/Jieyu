import { PanelSection } from '../components/ui/PanelSection';
import { t } from '../i18n';
import type { LanguageCatalogEntry } from '../services/LinguisticService';
import type { WorkspaceLocale } from './languageMetadataWorkspace.shared';

type LanguageMetadataWorkspaceCatalogPanelProps = {
  locale: WorkspaceLocale;
  entries: LanguageCatalogEntry[];
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
  selectedEntryId,
  loading,
  error,
  searchText,
  onSearchTextChange,
  onCreateCustom,
  onSelectEntry,
}: LanguageMetadataWorkspaceCatalogPanelProps) {
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
        <button type="button" className="button secondary" onClick={onCreateCustom}>{t(locale, 'workspace.languageMetadata.createCustom')}</button>
      </div>

      {loading ? <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.loading')}</p> : null}
      {!loading && error ? <p className="language-metadata-workspace-state language-metadata-workspace-state-error">{t(locale, 'workspace.languageMetadata.errorPrefix').replace('{message}', error)}</p> : null}
      {!loading && !error && entries.length === 0 ? <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.emptyList')}</p> : null}

      <div className="language-metadata-workspace-list" role="list" aria-label={t(locale, 'workspace.languageMetadata.listTitle')}>
        {entries.map((entry) => {
          const active = selectedEntryId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              className={`language-metadata-workspace-list-item${active ? ' language-metadata-workspace-list-item-active' : ''}${entry.visibility === 'hidden' ? ' language-metadata-workspace-list-item-hidden' : ''}`}
              onClick={() => onSelectEntry(entry.id)}
            >
              <span className="language-metadata-workspace-list-label">{entry.localName}</span>
              <span className="language-metadata-workspace-list-meta">
                <span>{entry.englishName}</span>
                <span>{entry.languageCode}</span>
              </span>
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}