import { PanelSection } from '../components/ui/PanelSection';
import { PanelSummary } from '../components/ui/PanelSummary';
import { t } from '../i18n';
import type { LanguageCatalogDisplayNameEntry, LanguageCatalogEntry, LanguageCatalogVisibility } from '../services/LinguisticService';
import {
  LANGUAGE_DISPLAY_NAME_ROLE_OPTIONS,
  readEntryKindLabel,
  readHistoryFieldLabel,
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
  const entryKindLabel = readEntryKindLabel(locale, selectedEntry);
  const visibilityLabel = draft.visibility === 'hidden'
    ? t(locale, 'workspace.languageMetadata.visibilityHidden')
    : t(locale, 'workspace.languageMetadata.visibilityVisible');
  const summaryName = draft.localName.trim() || selectedEntry?.localName || t(locale, 'workspace.languageMetadata.createCustom');
  const summaryEnglish = draft.englishName.trim() || selectedEntry?.englishName || t(locale, 'workspace.languageMetadata.notSet');
  const summaryCode = draft.languageCode.trim() || draft.iso6393.trim() || selectedEntry?.languageCode || t(locale, 'workspace.languageMetadata.notSet');
  const summaryCanonicalTag = draft.canonicalTag.trim() || selectedEntry?.canonicalTag || t(locale, 'workspace.languageMetadata.notSet');
  const summaryId = selectedEntry?.id || draft.idInput.trim() || t(locale, 'workspace.languageMetadata.notSet');

  return (
    <div className="language-metadata-workspace-detail-column">
      <PanelSummary
        className="language-metadata-workspace-summary-card"
        title={t(locale, 'workspace.languageMetadata.detailTitle')}
        description={selectedEntry?.localName ?? t(locale, 'workspace.languageMetadata.createCustom')}
        meta={(
          <span className="language-metadata-workspace-summary-meta-row">
            <span className="language-metadata-workspace-chip language-metadata-workspace-chip-subtle">{entryKindLabel}</span>
            <span className="language-metadata-workspace-chip">{visibilityLabel}</span>
          </span>
        )}
        supportingText={selectedEntry?.englishName ?? t(locale, 'workspace.languageMetadata.detailDescription')}
      />

      <div className="language-metadata-workspace-insights" aria-label={t(locale, 'workspace.languageMetadata.detailTitle')}>
        <article className="language-metadata-workspace-insight-card">
          <span className="language-metadata-workspace-insight-label">{t(locale, 'workspace.languageMetadata.localNameLabel')}</span>
          <strong className="language-metadata-workspace-insight-value">{summaryName}</strong>
          <span className="language-metadata-workspace-insight-note">{summaryEnglish}</span>
        </article>
        <article className="language-metadata-workspace-insight-card">
          <span className="language-metadata-workspace-insight-label">{t(locale, 'workspace.languageMetadata.languageCodeLabel')}</span>
          <strong className="language-metadata-workspace-insight-value">{summaryCode}</strong>
          <span className="language-metadata-workspace-insight-note">{t(locale, 'workspace.languageMetadata.canonicalTagLabel')} · {summaryCanonicalTag}</span>
        </article>
        <article className="language-metadata-workspace-insight-card">
          <span className="language-metadata-workspace-insight-label">{t(locale, 'workspace.languageMetadata.idLabel')}</span>
          <strong className="language-metadata-workspace-insight-value">{summaryId}</strong>
          <span className="language-metadata-workspace-insight-note">{entryKindLabel} · {visibilityLabel}</span>
        </article>
      </div>

      <PanelSection className="language-metadata-workspace-detail-panel" title={t(locale, 'workspace.languageMetadata.editTitle')} description={t(locale, 'workspace.languageMetadata.editDescription')}>
        <div className="language-metadata-workspace-form-stack">
          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionIdentity')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionIdentityDescription')}</p>
            </div>
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
            </div>
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionStandards')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionStandardsDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
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
                <span>{t(locale, 'workspace.languageMetadata.glottocodeLabel')}</span>
                <input className="input" type="text" value={draft.glottocode} onChange={(event) => onDraftChange('glottocode', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.wikidataIdLabel')}</span>
                <input className="input" type="text" value={draft.wikidataId} onChange={(event) => onDraftChange('wikidataId', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionClassification')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionClassificationDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
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
                <span>{t(locale, 'workspace.languageMetadata.visibilityLabel')}</span>
                <select className="input" value={draft.visibility} onChange={(event) => onDraftChange('visibility', event.target.value as LanguageCatalogVisibility)}>
                  <option value="visible">{t(locale, 'workspace.languageMetadata.visibilityVisible')}</option>
                  <option value="hidden">{t(locale, 'workspace.languageMetadata.visibilityHidden')}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.aliasesLabel')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.aliasesPlaceholder')}</p>
            </div>
            <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
              <span>{t(locale, 'workspace.languageMetadata.aliasesLabel')}</span>
              <textarea className="input language-metadata-workspace-textarea" value={draft.aliasesText} onChange={(event) => onDraftChange('aliasesText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.aliasesPlaceholder')} />
            </label>
          </section>

          <section className="language-metadata-workspace-subsection language-metadata-workspace-matrix-fieldset">
            <div className="language-metadata-workspace-matrix-header">
              <div>
                <span className="language-metadata-workspace-matrix-title">{t(locale, 'workspace.languageMetadata.matrixTitle')}</span>
                <p className="language-metadata-workspace-matrix-description">{t(locale, 'workspace.languageMetadata.matrixDescription')}</p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={onAddDisplayNameRow}>{t(locale, 'workspace.languageMetadata.matrixAddRow')}</button>
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
                    <button type="button" className="btn btn-ghost btn-danger" onClick={() => onRemoveDisplayNameRow(row.key)}>{t(locale, 'workspace.languageMetadata.matrixRemoveRow')}</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.matrixEmpty')}</p>
            )}
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionNotes')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionNotesDescription')}</p>
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
              <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
                <span>{t(locale, 'workspace.languageMetadata.changeReasonLabel')}</span>
                <textarea
                  className="input language-metadata-workspace-textarea"
                  value={draft.changeReason}
                  onChange={(event) => onDraftChange('changeReason', event.target.value)}
                  placeholder={t(locale, 'workspace.languageMetadata.changeReasonPlaceholder')}
                />
              </label>
            </div>
          </section>
        </div>

        {saveError ? <p className="language-metadata-workspace-state language-metadata-workspace-state-error">{saveError}</p> : null}
        {saveSuccess ? <p className="language-metadata-workspace-state language-metadata-workspace-state-success">{saveSuccess}</p> : null}

        <div className="language-metadata-workspace-actions">
          <button type="button" className="btn btn-ghost" onClick={onResetDraft}>{t(locale, 'workspace.languageMetadata.resetButton')}</button>
          {selectedEntry?.hasPersistedRecord ? (
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={deleting}>
              {deleting
                ? t(locale, 'workspace.languageMetadata.deleting')
                : selectedEntry.entryKind === 'custom'
                  ? t(locale, 'workspace.languageMetadata.deleteCustomButton')
                  : t(locale, 'workspace.languageMetadata.deleteOverrideButton')}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onSave} disabled={saving}>{saving ? t(locale, 'workspace.languageMetadata.saving') : t(locale, 'workspace.languageMetadata.saveButton')}</button>
        </div>
      </PanelSection>

      <PanelSection className="language-metadata-workspace-detail-panel" title={t(locale, 'workspace.languageMetadata.historyTitle')} description={t(locale, 'workspace.languageMetadata.historyDescription')}>
        {historyItems.length > 0 ? (
          <ol className="language-metadata-workspace-history-list">
            {historyItems.map((item) => (
              <li key={item.id} className="language-metadata-workspace-history-item">
                <strong>{item.summary}</strong>
                <span>{item.createdAt}</span>
                {item.changedFields?.length ? <p>{t(locale, 'workspace.languageMetadata.historyChangedFieldsLabel')}{item.changedFields.map((field) => readHistoryFieldLabel(locale, field)).join('、')}</p> : null}
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