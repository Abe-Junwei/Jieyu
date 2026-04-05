import { PanelSection } from '../components/ui/PanelSection';
import { PanelSummary } from '../components/ui/PanelSummary';
import { t } from '../i18n';
import type { LanguageCatalogDisplayNameEntry, LanguageCatalogEntry, LanguageCatalogVisibility } from '../services/LinguisticService';
import {
  LANGUAGE_DISPLAY_NAME_ROLE_OPTIONS,
  readEntryKindLabel,
  type HistoryItem,
  type LanguageDisplayNameDraftRow,
  type LanguageDisplayNameRowChangeHandler,
  type LanguageMetadataDraft,
  type LanguageMetadataDraftChangeHandler,
  type WorkspaceLocale,
} from './languageMetadataWorkspace.shared';

function readDisplayNameRoleLabel(locale: WorkspaceLocale, role: LanguageCatalogDisplayNameEntry['role']): string {
  const keyByRole: Record<LanguageCatalogDisplayNameEntry['role'], string> = {
    preferred: 'workspace.languageMetadata.matrixRolePreferred',
    menu: 'workspace.languageMetadata.matrixRoleMenu',
    autonym: 'workspace.languageMetadata.matrixRoleAutonym',
    exonym: 'workspace.languageMetadata.matrixRoleExonym',
    academic: 'workspace.languageMetadata.matrixRoleAcademic',
    historical: 'workspace.languageMetadata.matrixRoleHistorical',
    search: 'workspace.languageMetadata.matrixRoleSearch',
  };
  return t(locale, keyByRole[role] as Parameters<typeof t>[1]);
}

type LanguageMetadataWorkspaceDetailColumnProps = {
  locale: WorkspaceLocale;
  draft: LanguageMetadataDraft;
  selectedEntry: LanguageCatalogEntry | null;
  historyItems: HistoryItem[];
  saving: boolean;
  deleting: boolean;
  saveError: string;
  saveSuccess: string;
  onDraftChange: LanguageMetadataDraftChangeHandler;
  onDisplayNameRowChange: LanguageDisplayNameRowChangeHandler;
  onAddDisplayNameRow: () => void;
  onRemoveDisplayNameRow: (rowKey: string) => void;
  onResetDraft: () => void;
  onDelete: () => void;
  onSave: () => void;
};

export function LanguageMetadataWorkspaceDetailColumn({
  locale,
  draft,
  selectedEntry,
  historyItems,
  saving,
  deleting,
  saveError,
  saveSuccess,
  onDraftChange,
  onDisplayNameRowChange,
  onAddDisplayNameRow,
  onRemoveDisplayNameRow,
  onResetDraft,
  onDelete,
  onSave,
}: LanguageMetadataWorkspaceDetailColumnProps) {
  return (
    <div className="language-metadata-workspace-detail-column">
      <PanelSummary
        className="language-metadata-workspace-summary-card"
        title={t(locale, 'workspace.languageMetadata.detailTitle')}
        description={selectedEntry?.localName ?? t(locale, 'workspace.languageMetadata.createCustom')}
        meta={<span className="language-metadata-workspace-summary-meta">{readEntryKindLabel(locale, selectedEntry)}</span>}
        supportingText={selectedEntry?.englishName ?? t(locale, 'workspace.languageMetadata.detailDescription')}
      />

      <PanelSection className="language-metadata-workspace-detail-panel" title={t(locale, 'workspace.languageMetadata.editTitle')} description={t(locale, 'workspace.languageMetadata.editDescription')}>
        <div className="language-metadata-workspace-grid">
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.idLabel')}</span>
            <input className="input" type="text" value={draft.idInput} onChange={(event) => onDraftChange('idInput', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.idPlaceholder')} disabled={Boolean(selectedEntry && !selectedEntry.id.startsWith('user:'))} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.languageCodeLabel')}</span>
            <input className="input" type="text" value={draft.languageCode} onChange={(event) => onDraftChange('languageCode', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.canonicalTagLabel')}</span>
            <input className="input" type="text" value={draft.canonicalTag} onChange={(event) => onDraftChange('canonicalTag', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.localNameLabel')}</span>
            <input className="input" type="text" value={draft.localName} onChange={(event) => onDraftChange('localName', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.englishNameLabel')}</span>
            <input className="input" type="text" value={draft.englishName} onChange={(event) => onDraftChange('englishName', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.nativeNameLabel')}</span>
            <input className="input" type="text" value={draft.nativeName} onChange={(event) => onDraftChange('nativeName', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.iso6391Label')}</span>
            <input className="input" type="text" value={draft.iso6391} onChange={(event) => onDraftChange('iso6391', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.iso6392BLabel')}</span>
            <input className="input" type="text" value={draft.iso6392B} onChange={(event) => onDraftChange('iso6392B', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.iso6392TLabel')}</span>
            <input className="input" type="text" value={draft.iso6392T} onChange={(event) => onDraftChange('iso6392T', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.iso6393Label')}</span>
            <input className="input" type="text" value={draft.iso6393} onChange={(event) => onDraftChange('iso6393', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.familyLabel')}</span>
            <input className="input" type="text" value={draft.family} onChange={(event) => onDraftChange('family', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.subfamilyLabel')}</span>
            <input className="input" type="text" value={draft.subfamily} onChange={(event) => onDraftChange('subfamily', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.macrolanguageLabel')}</span>
            <input className="input" type="text" value={draft.macrolanguage} onChange={(event) => onDraftChange('macrolanguage', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.scopeLabel')}</span>
            <select className="input" value={draft.scope} onChange={(event) => onDraftChange('scope', event.target.value)}>
              <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
              <option value="individual">individual</option>
              <option value="macrolanguage">macrolanguage</option>
              <option value="collection">collection</option>
              <option value="special">special</option>
              <option value="private-use">private-use</option>
            </select>
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.languageTypeLabel')}</span>
            <select className="input" value={draft.languageType} onChange={(event) => onDraftChange('languageType', event.target.value)}>
              <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
              <option value="living">living</option>
              <option value="historical">historical</option>
              <option value="extinct">extinct</option>
              <option value="ancient">ancient</option>
              <option value="constructed">constructed</option>
              <option value="special">special</option>
            </select>
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.glottocodeLabel')}</span>
            <input className="input" type="text" value={draft.glottocode} onChange={(event) => onDraftChange('glottocode', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.wikidataIdLabel')}</span>
            <input className="input" type="text" value={draft.wikidataId} onChange={(event) => onDraftChange('wikidataId', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field">
            <span>{t(locale, 'workspace.languageMetadata.visibilityLabel')}</span>
            <select className="input" value={draft.visibility} onChange={(event) => onDraftChange('visibility', event.target.value as LanguageCatalogVisibility)}>
              <option value="visible">{t(locale, 'workspace.languageMetadata.visibilityVisible')}</option>
              <option value="hidden">{t(locale, 'workspace.languageMetadata.visibilityHidden')}</option>
            </select>
          </label>
        </div>

        <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
          <span>{t(locale, 'workspace.languageMetadata.aliasesLabel')}</span>
          <textarea className="input language-metadata-workspace-textarea" value={draft.aliasesText} onChange={(event) => onDraftChange('aliasesText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.aliasesPlaceholder')} />
        </label>

        <div className="language-metadata-workspace-field language-metadata-workspace-field-block language-metadata-workspace-matrix-fieldset">
          <div className="language-metadata-workspace-matrix-header">
            <div>
              <span className="language-metadata-workspace-matrix-title">{t(locale, 'workspace.languageMetadata.matrixTitle')}</span>
              <p className="language-metadata-workspace-matrix-description">{t(locale, 'workspace.languageMetadata.matrixDescription')}</p>
            </div>
            <button type="button" className="button secondary" onClick={onAddDisplayNameRow}>{t(locale, 'workspace.languageMetadata.matrixAddRow')}</button>
          </div>

          {draft.displayNameRows.length > 0 ? (
            <div className="language-metadata-workspace-matrix-list" role="list" aria-label={t(locale, 'workspace.languageMetadata.matrixTitle')}>
              {draft.displayNameRows.map((row) => (
                <div key={row.key} className="language-metadata-workspace-matrix-row" role="listitem">
                  <label className="language-metadata-workspace-field">
                    <span>{t(locale, 'workspace.languageMetadata.matrixLocaleLabel')}</span>
                    <input
                      className="input"
                      type="text"
                      value={row.locale}
                      onChange={(event) => onDisplayNameRowChange(row.key, 'locale', event.target.value)}
                      placeholder={t(locale, 'workspace.languageMetadata.matrixLocalePlaceholder')}
                    />
                  </label>
                  <label className="language-metadata-workspace-field">
                    <span>{t(locale, 'workspace.languageMetadata.matrixRoleLabel')}</span>
                    <select
                      className="input"
                      value={row.role}
                      onChange={(event) => onDisplayNameRowChange(row.key, 'role', event.target.value as LanguageDisplayNameDraftRow['role'])}
                    >
                      {LANGUAGE_DISPLAY_NAME_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{readDisplayNameRoleLabel(locale, role)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
                    <span>{t(locale, 'workspace.languageMetadata.matrixValueLabel')}</span>
                    <input className="input" type="text" value={row.value} onChange={(event) => onDisplayNameRowChange(row.key, 'value', event.target.value)} />
                  </label>
                  <label className="language-metadata-workspace-checkbox-field">
                    <input type="checkbox" checked={row.isPreferred} onChange={(event) => onDisplayNameRowChange(row.key, 'isPreferred', event.target.checked)} />
                    <span>{t(locale, 'workspace.languageMetadata.matrixPreferredLabel')}</span>
                  </label>
                  <button type="button" className="button ghost danger" onClick={() => onRemoveDisplayNameRow(row.key)}>{t(locale, 'workspace.languageMetadata.matrixRemoveRow')}</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.matrixEmpty')}</p>
          )}
        </div>

        <div className="language-metadata-workspace-grid">
          <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
            <span>{t(locale, 'workspace.languageMetadata.notesZhLabel')}</span>
            <textarea className="input language-metadata-workspace-textarea" value={draft.notesZh} onChange={(event) => onDraftChange('notesZh', event.target.value)} />
          </label>
          <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
            <span>{t(locale, 'workspace.languageMetadata.notesEnLabel')}</span>
            <textarea className="input language-metadata-workspace-textarea" value={draft.notesEn} onChange={(event) => onDraftChange('notesEn', event.target.value)} />
          </label>
        </div>

        {saveError ? <p className="language-metadata-workspace-state language-metadata-workspace-state-error">{saveError}</p> : null}
        {saveSuccess ? <p className="language-metadata-workspace-state language-metadata-workspace-state-success">{saveSuccess}</p> : null}

        <div className="language-metadata-workspace-actions">
          <button type="button" className="button secondary" onClick={onResetDraft}>{t(locale, 'workspace.languageMetadata.resetButton')}</button>
          {selectedEntry?.hasPersistedRecord ? (
            <button type="button" className="button danger" onClick={onDelete} disabled={deleting}>
              {deleting
                ? t(locale, 'workspace.languageMetadata.deleting')
                : selectedEntry.entryKind === 'custom'
                  ? t(locale, 'workspace.languageMetadata.deleteCustomButton')
                  : t(locale, 'workspace.languageMetadata.deleteOverrideButton')}
            </button>
          ) : null}
          <button type="button" className="button primary" onClick={onSave} disabled={saving}>{saving ? t(locale, 'workspace.languageMetadata.saving') : t(locale, 'workspace.languageMetadata.saveButton')}</button>
        </div>
      </PanelSection>

      <PanelSection className="language-metadata-workspace-detail-panel" title={t(locale, 'workspace.languageMetadata.historyTitle')} description={t(locale, 'workspace.languageMetadata.historyDescription')}>
        {historyItems.length > 0 ? (
          <ol className="language-metadata-workspace-history-list">
            {historyItems.map((item) => (
              <li key={item.id} className="language-metadata-workspace-history-item">
                <strong>{item.summary}</strong>
                <span>{item.createdAt}</span>
                {item.reason ? <p>{item.reason}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.historyEmpty')}</p>
        )}
      </PanelSection>
    </div>
  );
}