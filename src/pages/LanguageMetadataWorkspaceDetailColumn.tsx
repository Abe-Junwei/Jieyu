import { PanelSection } from '../components/ui/PanelSection';
import { PanelFeedback } from '../components/ui/PanelFeedback';
import { t, tf } from '../i18n';
import type { LanguageCatalogDisplayNameEntry, LanguageCatalogEntry, LanguageCatalogVisibility } from '../services/LinguisticService';
import { buildClassificationPathDisplayLine, buildClassificationPathValue, LANGUAGE_DISPLAY_NAME_ROLE_OPTIONS, parseLineSeparatedText, readEntryKindLabel, readHistoryFieldLabel, type HistoryItem, type LanguageDisplayNameDraftRow, type LanguageDisplayNameRowChangeHandler, type LanguageMetadataDraft, type LanguageMetadataDraftChangeHandler, type WorkspaceLocale } from './languageMetadataWorkspace.shared';
import { useLanguageMetadataMapController } from './languageMetadataWorkspace.mapController';
import { useLanguageMetadataCustomFieldController } from './languageMetadataWorkspace.customFieldController';
import { LanguageMetadataWorkspaceGeographySection } from './LanguageMetadataWorkspaceGeographySection';
import { LanguageMetadataWorkspaceCustomFieldsSection } from './LanguageMetadataWorkspaceCustomFieldsSection';

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
  duplicateHint: { id: string; name: string } | null;
  historyItems: HistoryItem[];
  onDraftChange: LanguageMetadataDraftChangeHandler;
  onDisplayNameRowChange: LanguageDisplayNameRowChangeHandler;
  onAddDisplayNameRow: () => void;
  onRemoveDisplayNameRow: (rowKey: string) => void;
  onSelectEntry: (languageId: string) => void;
};

export function LanguageMetadataWorkspaceDetailColumn({
  locale,
  draft,
  selectedEntry,
  duplicateHint,
  historyItems,
  onDraftChange,
  onDisplayNameRowChange,
  onAddDisplayNameRow,
  onRemoveDisplayNameRow,
  onSelectEntry,
}: LanguageMetadataWorkspaceDetailColumnProps) {
  // ─── 地图/地名搜索 | Map & geocode ───
  const map = useLanguageMetadataMapController(locale, draft, onDraftChange);
  // ─── 自定义字段 | Custom fields ───
  const cf = useLanguageMetadataCustomFieldController(locale, draft, onDraftChange);
  const entryKindLabel = readEntryKindLabel(locale, selectedEntry);
  const visibilityLabel = draft.visibility === 'hidden'
    ? t(locale, 'workspace.languageMetadata.visibilityHidden')
    : t(locale, 'workspace.languageMetadata.visibilityVisible');
  const classificationPathPreview = buildClassificationPathDisplayLine(locale, {
    genus: draft.genus,
    subfamily: draft.subfamily,
    branch: draft.branch,
    dialects: parseLineSeparatedText(draft.dialectsText),
    vernaculars: parseLineSeparatedText(draft.vernacularsText),
  }) || draft.classificationPath;

  const syncClassificationPath = (next: Partial<Pick<LanguageMetadataDraft, 'genus' | 'subfamily' | 'branch' | 'dialectsText' | 'vernacularsText'>>) => {
    onDraftChange('classificationPath', buildClassificationPathValue({
      genus: next.genus ?? draft.genus,
      subfamily: next.subfamily ?? draft.subfamily,
      branch: next.branch ?? draft.branch,
      dialects: parseLineSeparatedText(next.dialectsText ?? draft.dialectsText),
      vernaculars: parseLineSeparatedText(next.vernacularsText ?? draft.vernacularsText),
    }));
  };
  const summaryName = draft.localName.trim() || selectedEntry?.localName || t(locale, 'workspace.languageMetadata.createCustom');
  const summaryCode = draft.languageCode.trim() || draft.iso6393.trim() || selectedEntry?.languageCode || t(locale, 'workspace.languageMetadata.notSet');
  const summaryCanonicalTag = draft.canonicalTag.trim() || selectedEntry?.canonicalTag || t(locale, 'workspace.languageMetadata.notSet');
  const summaryId = selectedEntry?.id || draft.idInput.trim() || t(locale, 'workspace.languageMetadata.notSet');
  const summaryClassification = classificationPathPreview || t(locale, 'workspace.languageMetadata.notSet');

  return (
    <div className="lm-detail-column la-panel-stack">
      <section className="ws-summary-card lm-summary la-panel-section" aria-labelledby="lm-workspace-title">
        <div className="ws-summary-header">
          <div className="ws-summary-copy">
            <h2 id="lm-workspace-title" className="ws-summary-title">{summaryName}</h2>
          </div>
          <div className="lm-summary-meta-row">
            <span className="lm-chip lm-chip-subtle">{entryKindLabel}</span>
            <span className="lm-chip">{visibilityLabel}</span>
          </div>
        </div>

        <div className="ws-summary-facts" aria-label={t(locale, 'workspace.languageMetadata.detailTitle')}>
          <article className="ws-summary-fact">
            <span className="ws-summary-fact-label">{t(locale, 'workspace.languageMetadata.languageCodeLabel')}</span>
            <strong className="ws-summary-fact-value">{summaryCode}</strong>
            <span className="ws-summary-fact-note">{t(locale, 'workspace.languageMetadata.canonicalTagLabel')} · {summaryCanonicalTag}</span>
          </article>
          <article className="ws-summary-fact">
            <span className="ws-summary-fact-label">{t(locale, 'workspace.languageMetadata.idLabel')}</span>
            <strong className="ws-summary-fact-value">{summaryId}</strong>
            <span className="ws-summary-fact-note">{entryKindLabel} · {visibilityLabel}</span>
          </article>
          <article className="ws-summary-fact">
            <span className="ws-summary-fact-label">{t(locale, 'workspace.languageMetadata.sectionClassification')}</span>
            <strong className="ws-summary-fact-value">{summaryClassification}</strong>
            <span className="ws-summary-fact-note">{t(locale, 'workspace.languageMetadata.sectionClassificationDescription')}</span>
          </article>
        </div>
      </section>

      <PanelSection className="lm-editor-panel la-panel-section">
        <div className="ws-form-stack">
          <details className="ws-subsection lm-subsection" open>
            <summary className="lm-subsection-header">
              <h3 className="panel-title-primary">{t(locale, 'workspace.languageMetadata.sectionIdentity')}</h3>
              <p className="lm-subsection-description">{t(locale, 'workspace.languageMetadata.sectionIdentityDescription')}</p>
            </summary>
            <div className="lm-grid">
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.idLabel')}</span>
                <input className="input" type="text" value={draft.idInput} onChange={(event) => onDraftChange('idInput', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.idPlaceholder')} disabled={Boolean(selectedEntry && !selectedEntry.id.startsWith('user:'))} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.languageCodeLabel')}</span>
                <input className="input" type="text" value={draft.languageCode} onChange={(event) => onDraftChange('languageCode', event.target.value)} />
                {duplicateHint && (
                  <PanelFeedback level="warn">
                    {tf(locale, 'workspace.languageMetadata.duplicateCodeHint', { name: duplicateHint.name, id: duplicateHint.id })}
                    {' '}
                    <button type="button" className="lm-inline-link" onClick={() => onSelectEntry(duplicateHint.id)}>
                      {t(locale, 'workspace.languageMetadata.duplicateCodeJump')}
                    </button>
                  </PanelFeedback>
                )}
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.canonicalTagLabel')}</span>
                <input className="input" type="text" value={draft.canonicalTag} onChange={(event) => onDraftChange('canonicalTag', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.localNameLabel')}</span>
                <input className="input" type="text" value={draft.localName} onChange={(event) => onDraftChange('localName', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.englishNameLabel')}</span>
                <input className="input" type="text" value={draft.englishName} onChange={(event) => onDraftChange('englishName', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.nativeNameLabel')}</span>
                <input className="input" type="text" value={draft.nativeName} onChange={(event) => onDraftChange('nativeName', event.target.value)} />
              </label>
            </div>

            <div className="lm-subgroup">
              <div className="lm-subgroup-header">
                <span className="panel-title-secondary lm-subgroup-title">{t(locale, 'workspace.languageMetadata.aliasesLabel')}</span>
                <p className="lm-subgroup-description">{t(locale, 'workspace.languageMetadata.aliasesPlaceholder')}</p>
              </div>
              <div className="lm-field lm-field-block">
                <input
                  className="input"
                  type="text"
                  value={draft.aliasesText}
                  onChange={(event) => onDraftChange('aliasesText', event.target.value)}
                  placeholder={t(locale, 'workspace.languageMetadata.aliasesPlaceholder')}
                  aria-label={t(locale, 'workspace.languageMetadata.aliasesLabel')}
                />
              </div>
            </div>

            <details className="lm-subgroup lm-matrix-fieldset">
              <summary className="lm-matrix-header">
                <div>
                  <span className="lm-matrix-title">{t(locale, 'workspace.languageMetadata.matrixTitle')}</span>
                  <p className="lm-matrix-description">{t(locale, 'workspace.languageMetadata.matrixDescription')}</p>
                </div>
              </summary>
              <div className="lm-matrix-actions">
                <button type="button" className="btn btn-ghost" onClick={() => onAddDisplayNameRow()}>{t(locale, 'workspace.languageMetadata.matrixAddRow')}</button>
              </div>

              {draft.displayNameRows.length > 0 ? (
                <div className="lm-matrix-list" role="list" aria-label={t(locale, 'workspace.languageMetadata.matrixTitle')}>
                  {draft.displayNameRows.map((row) => (
                    <div key={row.key} className="lm-matrix-row" role="listitem">
                      <label className="lm-field">
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
                      <label className="lm-field lm-field-block">
                        <span>{t(locale, 'workspace.languageMetadata.matrixValueLabel')}</span>
                        <input className="input" type="text" value={row.value} onChange={(event) => onDisplayNameRowChange(row.key, 'value', event.target.value)} />
                      </label>
                      <label className="lm-checkbox-field">
                        <input type="checkbox" checked={row.isPreferred} onChange={(event) => onDisplayNameRowChange(row.key, 'isPreferred', event.target.checked)} />
                        <span>{t(locale, 'workspace.languageMetadata.matrixPreferredLabel')}</span>
                      </label>
                      <button type="button" className="btn btn-ghost btn-danger" onClick={() => onRemoveDisplayNameRow(row.key)}>{t(locale, 'workspace.languageMetadata.matrixRemoveRow')}</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="lm-state">{t(locale, 'workspace.languageMetadata.matrixEmpty')}</p>
              )}
            </details>
          </details>

          <details className="ws-subsection lm-subsection">
            <summary className="lm-subsection-header">
              <h3 className="panel-title-primary">{t(locale, 'workspace.languageMetadata.sectionStandards')}</h3>
              <p className="lm-subsection-description">{t(locale, 'workspace.languageMetadata.sectionStandardsDescription')}</p>
            </summary>
            <div className="lm-grid">
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.iso6391Label')}</span>
                <input className="input" type="text" value={draft.iso6391} onChange={(event) => onDraftChange('iso6391', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.iso6392BLabel')}</span>
                <input className="input" type="text" value={draft.iso6392B} onChange={(event) => onDraftChange('iso6392B', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.iso6392TLabel')}</span>
                <input className="input" type="text" value={draft.iso6392T} onChange={(event) => onDraftChange('iso6392T', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.iso6393Label')}</span>
                <input className="input" type="text" value={draft.iso6393} onChange={(event) => onDraftChange('iso6393', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.glottocodeLabel')}</span>
                <input className="input" type="text" value={draft.glottocode} onChange={(event) => onDraftChange('glottocode', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.wikidataIdLabel')}</span>
                <input className="input" type="text" value={draft.wikidataId} onChange={(event) => onDraftChange('wikidataId', event.target.value)} />
              </label>
            </div>
          </details>

          <details className="ws-subsection lm-subsection" open>
            <summary className="lm-subsection-header">
              <h3 className="panel-title-primary">{t(locale, 'workspace.languageMetadata.sectionClassification')}</h3>
              <p className="lm-subsection-description">{t(locale, 'workspace.languageMetadata.sectionClassificationDescription')}</p>
            </summary>
            <div className="lm-grid">
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.genusLabel')}</span>
                <input className="input" type="text" value={draft.genus} onChange={(event) => {
                  onDraftChange('genus', event.target.value);
                  syncClassificationPath({ genus: event.target.value });
                }} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.subfamilyLabel')}</span>
                <input className="input" type="text" value={draft.subfamily} onChange={(event) => {
                  onDraftChange('subfamily', event.target.value);
                  syncClassificationPath({ subfamily: event.target.value });
                }} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.branchLabel')}</span>
                <input className="input" type="text" value={draft.branch} onChange={(event) => {
                  onDraftChange('branch', event.target.value);
                  syncClassificationPath({ branch: event.target.value });
                }} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.macrolanguageLabel')}</span>
                <input className="input" type="text" value={draft.macrolanguage} onChange={(event) => onDraftChange('macrolanguage', event.target.value)} />
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.scopeLabel')}</span>
                <select className="input" value={draft.scope} onChange={(event) => onDraftChange('scope', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="individual">{t(locale, 'workspace.languageMetadata.scopeIndividual')}</option>
                  <option value="macrolanguage">{t(locale, 'workspace.languageMetadata.scopeMacrolanguage')}</option>
                  <option value="collection">{t(locale, 'workspace.languageMetadata.scopeCollection')}</option>
                  <option value="special">{t(locale, 'workspace.languageMetadata.scopeSpecial')}</option>
                  <option value="private-use">{t(locale, 'workspace.languageMetadata.scopePrivateUse')}</option>
                </select>
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.languageTypeLabel')}</span>
                <select className="input" value={draft.languageType} onChange={(event) => onDraftChange('languageType', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="living">{t(locale, 'workspace.languageMetadata.languageTypeLiving')}</option>
                  <option value="historical">{t(locale, 'workspace.languageMetadata.languageTypeHistorical')}</option>
                  <option value="extinct">{t(locale, 'workspace.languageMetadata.languageTypeExtinct')}</option>
                  <option value="ancient">{t(locale, 'workspace.languageMetadata.languageTypeAncient')}</option>
                  <option value="constructed">{t(locale, 'workspace.languageMetadata.languageTypeConstructed')}</option>
                  <option value="special">{t(locale, 'workspace.languageMetadata.languageTypeSpecial')}</option>
                </select>
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.visibilityLabel')}</span>
                <select className="input" value={draft.visibility} onChange={(event) => onDraftChange('visibility', event.target.value as LanguageCatalogVisibility)}>
                  <option value="visible">{t(locale, 'workspace.languageMetadata.visibilityVisible')}</option>
                  <option value="hidden">{t(locale, 'workspace.languageMetadata.visibilityHidden')}</option>
                </select>
              </label>
            </div>
            <div className="lm-grid">
              <label className="lm-field lm-field-block">
                <span>{t(locale, 'workspace.languageMetadata.dialectsLabel')}</span>
                <textarea className="input lm-textarea" value={draft.dialectsText} onChange={(event) => {
                  onDraftChange('dialectsText', event.target.value);
                  syncClassificationPath({ dialectsText: event.target.value });
                }} placeholder={t(locale, 'workspace.languageMetadata.dialectsPlaceholder')} />
              </label>
              <label className="lm-field lm-field-block">
                <span>{t(locale, 'workspace.languageMetadata.vernacularsLabel')}</span>
                <textarea className="input lm-textarea" value={draft.vernacularsText} onChange={(event) => {
                  onDraftChange('vernacularsText', event.target.value);
                  syncClassificationPath({ vernacularsText: event.target.value });
                }} placeholder={t(locale, 'workspace.languageMetadata.vernacularsPlaceholder')} />
              </label>
              <label className="lm-field lm-field-block">
                <span>{t(locale, 'workspace.languageMetadata.classificationPathLabel')}</span>
                <input className="input" type="text" value={classificationPathPreview} readOnly aria-readonly="true" />
              </label>
            </div>
          </details>

          <LanguageMetadataWorkspaceGeographySection locale={locale} draft={draft} onDraftChange={onDraftChange} map={map} />

          <details className="ws-subsection lm-subsection">
            <summary className="lm-subsection-header">
              <h3 className="panel-title-primary">{t(locale, 'workspace.languageMetadata.sectionPopulation')}</h3>
              <p className="lm-subsection-description">{t(locale, 'workspace.languageMetadata.sectionPopulationDescription')}</p>
            </summary>
            <div className="lm-subgroup">
              <div className="lm-subgroup-header">
                <span className="panel-title-secondary lm-subgroup-title">{t(locale, 'workspace.languageMetadata.subgroupUsagePopulationTitle')}</span>
                <p className="lm-subgroup-description">{t(locale, 'workspace.languageMetadata.subgroupUsagePopulationDescription')}</p>
              </div>
              <div className="lm-grid">
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.speakerCountL1Label')}</span>
                  <input className="input" type="text" inputMode="numeric" value={draft.speakerCountL1} onChange={(event) => onDraftChange('speakerCountL1', event.target.value)} />
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.speakerCountL2Label')}</span>
                  <input className="input" type="text" inputMode="numeric" value={draft.speakerCountL2} onChange={(event) => onDraftChange('speakerCountL2', event.target.value)} />
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.speakerCountSourceLabel')}</span>
                  <input className="input" type="text" value={draft.speakerCountSource} onChange={(event) => onDraftChange('speakerCountSource', event.target.value)} />
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.speakerCountYearLabel')}</span>
                  <input className="input" type="text" inputMode="numeric" value={draft.speakerCountYear} onChange={(event) => onDraftChange('speakerCountYear', event.target.value)} />
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.speakerTrendLabel')}</span>
                  <select className="input" value={draft.speakerTrend} onChange={(event) => onDraftChange('speakerTrend', event.target.value)}>
                    <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                    <option value="growing">{t(locale, 'workspace.languageMetadata.speakerTrendGrowing')}</option>
                    <option value="stable">{t(locale, 'workspace.languageMetadata.speakerTrendStable')}</option>
                    <option value="shrinking">{t(locale, 'workspace.languageMetadata.speakerTrendShrinking')}</option>
                    <option value="unknown">{t(locale, 'workspace.languageMetadata.speakerTrendUnknown')}</option>
                  </select>
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.literacyRateLabel')}</span>
                  <input className="input" type="text" inputMode="decimal" value={draft.literacyRate} onChange={(event) => onDraftChange('literacyRate', event.target.value)} />
                </label>
              </div>
            </div>

            <div className="lm-subgroup">
              <div className="lm-subgroup-header">
                <span className="panel-title-secondary lm-subgroup-title">{t(locale, 'workspace.languageMetadata.subgroupUsageVitalityTitle')}</span>
                <p className="lm-subgroup-description">{t(locale, 'workspace.languageMetadata.subgroupUsageVitalityDescription')}</p>
              </div>
              <div className="lm-grid">
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.endangermentLevelLabel')}</span>
                  <select className="input" value={draft.endangermentLevel} onChange={(event) => onDraftChange('endangermentLevel', event.target.value)}>
                    <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                    <option value="safe">{t(locale, 'workspace.languageMetadata.endangermentLevelSafe')}</option>
                    <option value="vulnerable">{t(locale, 'workspace.languageMetadata.endangermentLevelVulnerable')}</option>
                    <option value="definitely_endangered">{t(locale, 'workspace.languageMetadata.endangermentLevelDefinitelyEndangered')}</option>
                    <option value="severely_endangered">{t(locale, 'workspace.languageMetadata.endangermentLevelSeverelyEndangered')}</option>
                    <option value="critically_endangered">{t(locale, 'workspace.languageMetadata.endangermentLevelCriticallyEndangered')}</option>
                    <option value="extinct">{t(locale, 'workspace.languageMetadata.endangermentLevelExtinct')}</option>
                  </select>
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.aesStatusLabel')}</span>
                  <select className="input" value={draft.aesStatus} onChange={(event) => onDraftChange('aesStatus', event.target.value)}>
                    <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                    <option value="not_endangered">{t(locale, 'workspace.languageMetadata.aesNotEndangered')}</option>
                    <option value="threatened">{t(locale, 'workspace.languageMetadata.aesThreatened')}</option>
                    <option value="shifting">{t(locale, 'workspace.languageMetadata.aesShifting')}</option>
                    <option value="moribund">{t(locale, 'workspace.languageMetadata.aesMoribund')}</option>
                    <option value="nearly_extinct">{t(locale, 'workspace.languageMetadata.aesNearlyExtinct')}</option>
                    <option value="extinct">{t(locale, 'workspace.languageMetadata.aesExtinct')}</option>
                  </select>
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.endangermentSourceLabel')}</span>
                  <input className="input" type="text" value={draft.endangermentSource} onChange={(event) => onDraftChange('endangermentSource', event.target.value)} />
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.endangermentAssessmentYearLabel')}</span>
                  <input className="input" type="text" inputMode="numeric" value={draft.endangermentAssessmentYear} onChange={(event) => onDraftChange('endangermentAssessmentYear', event.target.value)} />
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.intergenerationalTransmissionLabel')}</span>
                  <select className="input" value={draft.intergenerationalTransmission} onChange={(event) => onDraftChange('intergenerationalTransmission', event.target.value)}>
                    <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                    <option value="all_ages">{t(locale, 'workspace.languageMetadata.intergenerationalAllAges')}</option>
                    <option value="adults_only">{t(locale, 'workspace.languageMetadata.intergenerationalAdultsOnly')}</option>
                    <option value="elderly_only">{t(locale, 'workspace.languageMetadata.intergenerationalElderlyOnly')}</option>
                    <option value="very_few">{t(locale, 'workspace.languageMetadata.intergenerationalVeryFew')}</option>
                    <option value="none">{t(locale, 'workspace.languageMetadata.intergenerationalNone')}</option>
                  </select>
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.domainsLabel')}</span>
                  <input className="input" type="text" value={draft.domainsText} onChange={(event) => onDraftChange('domainsText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.domainsPlaceholder')} />
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.officialStatusLabel')}</span>
                  <select className="input" value={draft.officialStatus} onChange={(event) => onDraftChange('officialStatus', event.target.value)}>
                    <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                    <option value="national">{t(locale, 'workspace.languageMetadata.officialStatusNational')}</option>
                    <option value="regional">{t(locale, 'workspace.languageMetadata.officialStatusRegional')}</option>
                    <option value="recognized_minority">{t(locale, 'workspace.languageMetadata.officialStatusRecognizedMinority')}</option>
                    <option value="none">{t(locale, 'workspace.languageMetadata.officialStatusNone')}</option>
                  </select>
                </label>
                <label className="lm-field">
                  <span>{t(locale, 'workspace.languageMetadata.egidsLabel')}</span>
                  <input className="input" type="text" value={draft.egids} onChange={(event) => onDraftChange('egids', event.target.value)} />
                </label>
              </div>
            </div>
          </details>

          {/* 文献与文字 | Documentation & writing */}
          <details className="ws-subsection lm-subsection">
            <summary className="lm-subsection-header">
              <h3 className="panel-title-primary">{t(locale, 'workspace.languageMetadata.sectionDocumentation')}</h3>
              <p className="lm-subsection-description">{t(locale, 'workspace.languageMetadata.sectionDocumentationDescription')}</p>
            </summary>
            <div className="lm-grid">
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.documentationLevelLabel')}</span>
                <select className="input" value={draft.documentationLevel} onChange={(event) => onDraftChange('documentationLevel', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="undocumented">{t(locale, 'workspace.languageMetadata.documentationUndocumented')}</option>
                  <option value="marginally">{t(locale, 'workspace.languageMetadata.documentationMarginally')}</option>
                  <option value="fragmentary">{t(locale, 'workspace.languageMetadata.documentationFragmentary')}</option>
                  <option value="fair">{t(locale, 'workspace.languageMetadata.documentationFair')}</option>
                  <option value="well_documented">{t(locale, 'workspace.languageMetadata.documentationWellDocumented')}</option>
                </select>
              </label>
              <label className="lm-field">
                <span>{t(locale, 'workspace.languageMetadata.writingSystemsLabel')}</span>
                <input className="input" type="text" value={draft.writingSystemsText} onChange={(event) => onDraftChange('writingSystemsText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.writingSystemsPlaceholder')} />
              </label>
            </div>
          </details>

          <details className="ws-subsection lm-subsection">
            <summary className="lm-subsection-header">
              <h3 className="panel-title-primary">{t(locale, 'workspace.languageMetadata.sectionNotes')}</h3>
              <p className="lm-subsection-description">{t(locale, 'workspace.languageMetadata.sectionNotesDescription')}</p>
            </summary>
            <div className="lm-grid">
              <label className="lm-field lm-field-block">
                <span>{locale === 'zh-CN' ? t(locale, 'workspace.languageMetadata.notesZhLabel') : t(locale, 'workspace.languageMetadata.notesEnLabel')}</span>
                <textarea className="input lm-textarea" value={locale === 'zh-CN' ? draft.notesZh : draft.notesEn} onChange={(event) => onDraftChange(locale === 'zh-CN' ? 'notesZh' : 'notesEn', event.target.value)} />
              </label>
              <label className="lm-field lm-field-block">
                <span>{t(locale, 'workspace.languageMetadata.changeReasonLabel')}</span>
                <textarea
                  className="input lm-textarea"
                  value={draft.changeReason}
                  onChange={(event) => onDraftChange('changeReason', event.target.value)}
                  placeholder={t(locale, 'workspace.languageMetadata.changeReasonPlaceholder')}
                />
              </label>
            </div>
          </details>

          <LanguageMetadataWorkspaceCustomFieldsSection locale={locale} draft={draft} cf={cf} />
        </div>
      </PanelSection>

      <PanelSection className="lm-editor-panel lm-history-panel la-panel-section" title={t(locale, 'workspace.languageMetadata.historyTitle')} description={t(locale, 'workspace.languageMetadata.historyDescription')}>
        {historyItems.length > 0 ? (
          <ol className="lm-history-list">
            {historyItems.map((item) => (
              <li key={item.id} className="lm-history-item">
                <strong>{item.summary}</strong>
                <span>{item.createdAt}</span>
                {item.changedFields?.length ? <p>{t(locale, 'workspace.languageMetadata.historyChangedFieldsLabel')}{item.changedFields.map((field) => readHistoryFieldLabel(locale, field)).join('、')}</p> : null}
                {item.reason ? <p>{item.reason}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="lm-state">{t(locale, 'workspace.languageMetadata.historyEmpty')}</p>
        )}
      </PanelSection>
    </div>
  );
}