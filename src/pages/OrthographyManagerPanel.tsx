import '../styles/components/orthography-builder.css';
import '../styles/foundation/dialog-shell.css';
import '../styles/foundation/panel-design-presets.css';
import '../styles/foundation/panel-primitives.css';
import { Link } from 'react-router-dom';
import { getOrthographyCatalogBadgeInfo } from '../components/orthographyCatalogUi';
import { LanguageIsoInput, type LanguageIsoInputValue } from '../components/LanguageIsoInput';
import { ScriptTagCombobox } from '../components/ScriptTagCombobox';
import { EmbeddedPanelShell } from '../components/ui/EmbeddedPanelShell';
import type { OrthographyDocType } from '../db';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import type { OrthographyBuilderMessages } from '../i18n/orthographyBuilderMessages';
import { formatOrthographyOptionLabel } from '../hooks/useOrthographyPicker';
import type { ResolveLanguageDisplayName } from '../utils/languageDisplayNameResolver';
import {
  resolveCatalogPriorityLabel,
  resolveCatalogReviewStatusLabel,
  resolveCatalogSourceLabel,
  type OrthographyDraft,
} from './orthographyManager.shared';

type OrthographyManagerPanelProps = {
  locale: Locale;
  builderMessages: OrthographyBuilderMessages;
  fromLayerId?: string | null;
  projectLanguageIds: readonly string[];
  searchText: string;
  projectOnly: boolean;
  showUnscopedIdleState: boolean;
  loading: boolean;
  error: string;
  filteredOrthographies: OrthographyDocType[];
  selectedOrthography: OrthographyDocType | null;
  selectedBadgeLabel?: string;
  draft: OrthographyDraft | null;
  languageInput: LanguageIsoInputValue;
  resolveLabel: (languageId: string | undefined) => string;
  resolveLanguageDisplayName?: ResolveLanguageDisplayName;
  isDirty: boolean;
  saving: boolean;
  saveError: string;
  saveSuccess: string;
  bridgeWorkspaceHref: string;
  onSearchTextChange: (value: string) => void;
  onProjectOnlyChange: (projectOnly: boolean) => void;
  onBrowseAll: () => void;
  onSelectOrthography: (orthographyId: string) => void;
  onDraftChange: <K extends keyof OrthographyDraft>(key: K, value: OrthographyDraft[K]) => void;
  onLanguageInputChange: (value: LanguageIsoInputValue) => void;
  onResetDraft: () => void;
  onSaveDraft: () => void;
  onBeforeOpenBridge: () => boolean;
};

export function OrthographyManagerPanel({
  locale,
  builderMessages,
  fromLayerId,
  projectLanguageIds,
  searchText,
  projectOnly,
  showUnscopedIdleState,
  loading,
  error,
  filteredOrthographies,
  selectedOrthography,
  selectedBadgeLabel,
  draft,
  languageInput,
  resolveLabel,
  resolveLanguageDisplayName,
  isDirty,
  saving,
  saveError,
  saveSuccess,
  bridgeWorkspaceHref,
  onSearchTextChange,
  onProjectOnlyChange,
  onBrowseAll,
  onSelectOrthography,
  onDraftChange,
  onLanguageInputChange,
  onResetDraft,
  onSaveDraft,
  onBeforeOpenBridge,
}: OrthographyManagerPanelProps) {
  const panelActions = selectedOrthography ? (
    <Link
      to={bridgeWorkspaceHref}
      className="panel-button panel-button--ghost orthography-manager-panel-link"
      onClick={(event) => {
        if (!onBeforeOpenBridge()) {
          event.preventDefault();
        }
      }}
    >
      {t(locale, 'workspace.orthography.openBridgeWorkspace')}
    </Link>
  ) : undefined;

  return (
    <EmbeddedPanelShell
      className="orthography-manager-panel-shell"
      bodyClassName="orthography-manager-panel-body"
      footerClassName="orthography-manager-panel-footer"
      title={t(locale, 'workspace.orthography.title')}
      actions={panelActions}
      footer={selectedOrthography ? (
        <>
          <button type="button" className="panel-button panel-button--ghost" onClick={onResetDraft} disabled={!draft || saving || !isDirty}>
            {t(locale, 'workspace.orthography.resetButton')}
          </button>
          <button type="button" className="panel-button panel-button--primary" onClick={onSaveDraft} disabled={!draft || saving || !isDirty}>
            {saving ? t(locale, 'workspace.orthography.saving') : t(locale, 'workspace.orthography.saveButton')}
          </button>
        </>
      ) : null}
    >
      {fromLayerId ? <p className="orthography-manager-context-note">{t(locale, 'workspace.orthography.fromLayerHint')}</p> : null}

      <section className="orthography-manager-toolbar" aria-label={t(locale, 'workspace.orthography.listTitle')}>
        <input
          className="panel-input orthography-manager-search"
          type="search"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder={t(locale, 'workspace.orthography.searchPlaceholder')}
          aria-label={t(locale, 'workspace.orthography.searchPlaceholder')}
        />
        {projectLanguageIds.length > 0 ? (
          <div className="orthography-manager-filter-toggle" role="radiogroup" aria-label={t(locale, 'workspace.orthography.filterProjectOnly')}>
            <button
              type="button"
              role="radio"
              aria-checked={projectOnly}
              className={`panel-button${projectOnly ? ' panel-button--primary' : ' panel-button--ghost'}`}
              onClick={() => onProjectOnlyChange(true)}
            >
              {t(locale, 'workspace.orthography.filterProjectOnly')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!projectOnly}
              className={`panel-button${!projectOnly ? ' panel-button--primary' : ' panel-button--ghost'}`}
              onClick={() => onProjectOnlyChange(false)}
            >
              {t(locale, 'workspace.orthography.filterShowAll')}
            </button>
          </div>
        ) : null}
      </section>

      {!projectLanguageIds.length && showUnscopedIdleState ? (
        <div className="orthography-manager-callout">
          <p className="orthography-manager-state orthography-manager-state-warning">{t(locale, 'workspace.orthography.unscopedPrompt')}</p>
          <button type="button" className="panel-button panel-button--ghost" onClick={onBrowseAll}>
            {t(locale, 'workspace.orthography.filterShowAll')}
          </button>
        </div>
      ) : null}

      {loading ? <p className="orthography-manager-state">{t(locale, 'workspace.orthography.loading')}</p> : null}
      {!loading && error ? <p className="orthography-manager-state orthography-manager-state-error">{t(locale, 'workspace.orthography.errorPrefix').replace('{message}', error)}</p> : null}
      {!loading && !error && !showUnscopedIdleState && filteredOrthographies.length === 0 ? <p className="orthography-manager-state">{t(locale, 'workspace.orthography.emptyList')}</p> : null}

      <div className="orthography-manager-list" role="list" aria-label={t(locale, 'workspace.orthography.listTitle')}>
        {filteredOrthographies.map((orthography) => {
          const badge = getOrthographyCatalogBadgeInfo(locale, orthography);
          const active = orthography.id === selectedOrthography?.id;
          return (
            <button
              key={orthography.id}
              type="button"
              className={`orthography-manager-list-item${active ? ' orthography-manager-list-item-active' : ''}`}
              onClick={() => onSelectOrthography(orthography.id)}
            >
              <span className="orthography-manager-list-label">{formatOrthographyOptionLabel(orthography, locale)}</span>
              <span className="orthography-manager-list-meta">
                <span>{resolveLabel(orthography.languageId)}</span>
                <span className={badge.className}>{badge.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <hr className="orthography-manager-divider" />

      {selectedOrthography ? (
        <>
          <section className="orthography-manager-highlight-card" aria-label={t(locale, 'workspace.orthography.detailTitle')}>
            <div>
              <p className="orthography-manager-highlight-label">{t(locale, 'workspace.orthography.languageAssetIdLabel')}</p>
              <p className="orthography-manager-highlight-value">{selectedOrthography.languageId ?? t(locale, 'workspace.orthography.notSet')}</p>
            </div>
            <div className="orthography-manager-highlight-meta">
              <span className="panel-chip">{resolveLabel(selectedOrthography.languageId)}</span>
              {selectedBadgeLabel ? <span className="panel-chip">{selectedBadgeLabel}</span> : null}
            </div>
          </section>

          {isDirty ? <p className="orthography-manager-state orthography-manager-state-warning">{t(locale, 'workspace.orthography.unsavedHint')}</p> : null}

          {draft ? (
            <div className="orthography-manager-form-stack">
              <div className="orthography-manager-form-grid">
                <div className="orthography-manager-form-span-2">
                  <LanguageIsoInput
                    locale={locale}
                    value={languageInput}
                    onChange={onLanguageInputChange}
                    {...(resolveLanguageDisplayName ? { resolveLanguageDisplayName } : {})}
                    nameLabel={t(locale, 'workspace.orthography.languageLabel')}
                    codeLabel={builderMessages.sourceLanguageCodeLabel}
                    namePlaceholder={t(locale, 'workspace.orthography.languageLabel')}
                    codePlaceholder={builderMessages.sourceLanguageCodePlaceholder}
                  />
                  <label className="dialog-field">
                    <span>{t(locale, 'workspace.orthography.languageAssetIdLabel')}</span>
                    <input
                      className="panel-input"
                      type="text"
                      value={languageInput.languageAssetId ?? ''}
                      onChange={(event) => onLanguageInputChange({
                        ...languageInput,
                        languageAssetId: event.target.value.trim().toLowerCase(),
                      })}
                      placeholder={t(locale, 'workspace.orthography.languageAssetIdPlaceholder')}
                      aria-label={t(locale, 'workspace.orthography.languageAssetIdLabel')}
                    />
                  </label>
                </div>
                <div className="orthography-builder-script-type-row">
                  <label className="dialog-field">
                    <span>{builderMessages.scriptTagLabel}</span>
                    <ScriptTagCombobox
                      value={draft.scriptTag}
                      onChange={(val) => onDraftChange('scriptTag', val)}
                      locale={locale}
                      placeholder={builderMessages.scriptTagPlaceholder}
                      className="panel-input"
                      ariaLabel={builderMessages.scriptTagLabel}
                    />
                  </label>
                  <label className="dialog-field">
                    <span>{builderMessages.typeLabel}</span>
                    <select className="panel-input" value={draft.type} onChange={(event) => onDraftChange('type', event.target.value as OrthographyDraft['type'])}>
                      <option value="phonemic">{builderMessages.typePhonemic}</option>
                      <option value="phonetic">{builderMessages.typePhonetic}</option>
                      <option value="practical">{builderMessages.typePractical}</option>
                      <option value="historical">{builderMessages.typeHistorical}</option>
                      <option value="other">{builderMessages.typeOther}</option>
                    </select>
                  </label>
                </div>
                <label className="dialog-field">
                  <span>{builderMessages.nameZhLabel}</span>
                  <input className="panel-input" type="text" value={draft.namePrimary} onChange={(event) => onDraftChange('namePrimary', event.target.value)} placeholder={builderMessages.nameZhPlaceholder} />
                </label>
                <label className="dialog-field">
                  <span>{builderMessages.nameEnLabel}</span>
                  <input className="panel-input" type="text" value={draft.nameEnglishFallback} onChange={(event) => onDraftChange('nameEnglishFallback', event.target.value)} placeholder={builderMessages.nameEnPlaceholder} />
                </label>
                <label className="dialog-field">
                  <span>{builderMessages.abbreviationLabel}</span>
                  <input className="panel-input" type="text" value={draft.abbreviation} onChange={(event) => onDraftChange('abbreviation', event.target.value)} placeholder={builderMessages.abbreviationPlaceholder} />
                </label>
                <label className="dialog-field">
                  <span>{builderMessages.advancedDirectionLabel}</span>
                  <select className="panel-input" value={draft.direction} onChange={(event) => onDraftChange('direction', event.target.value as OrthographyDraft['direction'])}>
                    <option value="ltr">{builderMessages.advancedDirectionLtr}</option>
                    <option value="rtl">{builderMessages.advancedDirectionRtl}</option>
                    <option value="ttb">{t(locale, 'workspace.orthography.directionTtb')}</option>
                    <option value="btt">{t(locale, 'workspace.orthography.directionBtt')}</option>
                  </select>
                </label>
                <label className="dialog-field">
                  <span>{builderMessages.advancedLocaleLabel}</span>
                  <input className="panel-input" type="text" value={draft.localeTag} onChange={(event) => onDraftChange('localeTag', event.target.value)} placeholder={builderMessages.localePlaceholder} />
                </label>
                <label className="dialog-field">
                  <span>{builderMessages.advancedRegionLabel}</span>
                  <input className="panel-input" type="text" value={draft.regionTag} onChange={(event) => onDraftChange('regionTag', event.target.value)} placeholder={builderMessages.regionPlaceholder} />
                </label>
                <label className="dialog-field">
                  <span>{builderMessages.advancedVariantLabel}</span>
                  <input className="panel-input" type="text" value={draft.variantTag} onChange={(event) => onDraftChange('variantTag', event.target.value)} placeholder={builderMessages.variantPlaceholder} />
                </label>
              </div>

              <section className="orthography-manager-subsection">
                <h3 className="orthography-manager-subsection-title">{t(locale, 'workspace.orthography.sectionRenderingTitle')}</h3>
                <div className="orthography-manager-form-grid">
                  <label className="dialog-field">
                    <span>{builderMessages.primaryFontLabel}</span>
                    <input className="panel-input" type="text" value={draft.primaryFonts} onChange={(event) => onDraftChange('primaryFonts', event.target.value)} placeholder={builderMessages.primaryFontPlaceholder} />
                  </label>
                  <label className="dialog-field">
                    <span>{builderMessages.fallbackFontLabel}</span>
                    <input className="panel-input" type="text" value={draft.fallbackFonts} onChange={(event) => onDraftChange('fallbackFonts', event.target.value)} placeholder={builderMessages.fallbackFontPlaceholder} />
                  </label>
                  <label className="dialog-field">
                    <span>{t(locale, 'workspace.orthography.monoFontLabel')}</span>
                    <input className="panel-input" type="text" value={draft.monoFonts} onChange={(event) => onDraftChange('monoFonts', event.target.value)} placeholder={builderMessages.fallbackFontPlaceholder} />
                  </label>
                  <label className="dialog-field">
                    <span>{t(locale, 'workspace.orthography.lineHeightScaleLabel')}</span>
                    <input className="panel-input" type="text" value={draft.lineHeightScale} onChange={(event) => onDraftChange('lineHeightScale', event.target.value)} />
                  </label>
                  <label className="dialog-field">
                    <span>{t(locale, 'workspace.orthography.sizeAdjustLabel')}</span>
                    <input className="panel-input" type="text" value={draft.sizeAdjust} onChange={(event) => onDraftChange('sizeAdjust', event.target.value)} />
                  </label>
                </div>
                <div className="orthography-manager-checkbox-row">
                  <label className="orthography-builder-checkbox">
                    <input type="checkbox" checked={draft.bidiIsolate} onChange={(event) => onDraftChange('bidiIsolate', event.target.checked)} />
                    <span>{builderMessages.bidiIsolationLabel}</span>
                  </label>
                  <label className="orthography-builder-checkbox">
                    <input type="checkbox" checked={draft.preferDirAttribute} onChange={(event) => onDraftChange('preferDirAttribute', event.target.checked)} />
                    <span>{builderMessages.preferDirLabel}</span>
                  </label>
                </div>
              </section>

              <section className="orthography-manager-subsection">
                <h3 className="orthography-manager-subsection-title">{t(locale, 'workspace.orthography.sectionLocalizedNamesTitle')}</h3>
                <div className="orthography-manager-array-list">
                  {draft.localizedNameEntries.map((entry, index) => (
                    <div key={`${entry.languageTag}-${index}`} className="orthography-manager-array-row">
                      <label className="dialog-field">
                        <span>{t(locale, 'workspace.orthography.localizedNameTagLabel')}</span>
                        <input
                          className="panel-input"
                          type="text"
                          value={entry.languageTag}
                          onChange={(event) => onDraftChange('localizedNameEntries', draft.localizedNameEntries.map((current, currentIndex) => (
                            currentIndex === index ? { ...current, languageTag: event.target.value } : current
                          )))}
                          placeholder={t(locale, 'workspace.orthography.localizedNameTagPlaceholder')}
                        />
                      </label>
                      <label className="dialog-field orthography-manager-array-value">
                        <span>{t(locale, 'workspace.orthography.localizedNameValueLabel')}</span>
                        <input
                          className="panel-input"
                          type="text"
                          value={entry.label}
                          onChange={(event) => onDraftChange('localizedNameEntries', draft.localizedNameEntries.map((current, currentIndex) => (
                            currentIndex === index ? { ...current, label: event.target.value } : current
                          )))}
                          placeholder={t(locale, 'workspace.orthography.localizedNameValuePlaceholder')}
                        />
                      </label>
                      <button
                        className="panel-button panel-button--ghost"
                        type="button"
                        onClick={() => onDraftChange('localizedNameEntries', draft.localizedNameEntries.filter((_, currentIndex) => currentIndex !== index))}
                      >
                        {t(locale, 'workspace.orthography.localizedNameRemove')}
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="panel-button panel-button--ghost orthography-manager-array-add"
                  type="button"
                  onClick={() => onDraftChange('localizedNameEntries', [...draft.localizedNameEntries, { languageTag: '', label: '' }])}
                >
                  {t(locale, 'workspace.orthography.localizedNameAdd')}
                </button>

                <hr className="orthography-manager-divider" />

                <h3 className="orthography-manager-subsection-title">{t(locale, 'workspace.orthography.sectionExamplesTitle')}</h3>
                <div className="orthography-manager-form-grid">
                  <label className="dialog-field">
                    <span>{builderMessages.exemplarLabel}</span>
                    <textarea className="panel-input orthography-manager-textarea" value={draft.exemplarMain} onChange={(event) => onDraftChange('exemplarMain', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </label>
                  <label className="dialog-field">
                    <span>{t(locale, 'workspace.orthography.auxiliaryExemplarLabel')}</span>
                    <textarea className="panel-input orthography-manager-textarea" value={draft.exemplarAuxiliary} onChange={(event) => onDraftChange('exemplarAuxiliary', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </label>
                  <label className="dialog-field">
                    <span>{t(locale, 'workspace.orthography.numberExemplarLabel')}</span>
                    <input className="panel-input" type="text" value={draft.exemplarNumbers} onChange={(event) => onDraftChange('exemplarNumbers', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </label>
                  <label className="dialog-field">
                    <span>{t(locale, 'workspace.orthography.punctuationExemplarLabel')}</span>
                    <input className="panel-input" type="text" value={draft.exemplarPunctuation} onChange={(event) => onDraftChange('exemplarPunctuation', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </label>
                  <label className="dialog-field">
                    <span>{t(locale, 'workspace.orthography.indexExemplarLabel')}</span>
                    <input className="panel-input" type="text" value={draft.exemplarIndex} onChange={(event) => onDraftChange('exemplarIndex', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </label>
                </div>
              </section>

              <details className="orthography-manager-advanced">
                <summary className="orthography-manager-advanced-summary">
                  <span>{t(locale, 'workspace.orthography.sectionAdvancedTitle')}</span>
                  <span className="orthography-manager-advanced-meta">
                    {draft.catalogReviewStatus ? resolveCatalogReviewStatusLabel(locale, draft.catalogReviewStatus) : null}
                    {draft.catalogPriority ? ` · ${resolveCatalogPriorityLabel(locale, draft.catalogPriority)}` : null}
                  </span>
                </summary>

                <div className="orthography-manager-advanced-body">
                  <div className="orthography-manager-form-grid">
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.catalogReviewStatusLabel')}</span>
                      <select className="panel-input" value={draft.catalogReviewStatus} onChange={(event) => onDraftChange('catalogReviewStatus', event.target.value as OrthographyDraft['catalogReviewStatus'])}>
                        <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                        <option value="needs-review">{resolveCatalogReviewStatusLabel(locale, 'needs-review')}</option>
                        <option value="verified-primary">{resolveCatalogReviewStatusLabel(locale, 'verified-primary')}</option>
                        <option value="verified-secondary">{resolveCatalogReviewStatusLabel(locale, 'verified-secondary')}</option>
                        <option value="historical">{resolveCatalogReviewStatusLabel(locale, 'historical')}</option>
                        <option value="legacy">{resolveCatalogReviewStatusLabel(locale, 'legacy')}</option>
                        <option value="experimental">{resolveCatalogReviewStatusLabel(locale, 'experimental')}</option>
                      </select>
                    </label>
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.catalogPriorityLabel')}</span>
                      <select className="panel-input" value={draft.catalogPriority} onChange={(event) => onDraftChange('catalogPriority', event.target.value as OrthographyDraft['catalogPriority'])}>
                        <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                        <option value="primary">{resolveCatalogPriorityLabel(locale, 'primary')}</option>
                        <option value="secondary">{resolveCatalogPriorityLabel(locale, 'secondary')}</option>
                      </select>
                    </label>
                    <div className="orthography-manager-basic-grid orthography-manager-form-span-2">
                      <div><dt>{t(locale, 'workspace.orthography.catalogSourceLabel')}</dt><dd>{resolveCatalogSourceLabel(locale, selectedOrthography.catalogMetadata?.catalogSource)}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.catalogLabel')}</dt><dd>{selectedBadgeLabel ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.updatedAtLabel')}</dt><dd>{selectedOrthography.updatedAt ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.catalogSourceNoteLabel')}</dt><dd>{selectedOrthography.catalogMetadata?.source ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                    </div>
                  </div>

                  <hr className="orthography-manager-divider" />

                  <div className="orthography-manager-form-grid">
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.keyboardLayoutLabel')}</span>
                      <input className="panel-input" type="text" value={draft.keyboardLayout} onChange={(event) => onDraftChange('keyboardLayout', event.target.value)} placeholder={t(locale, 'workspace.orthography.keyboardLayoutPlaceholder')} />
                    </label>
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.imeIdLabel')}</span>
                      <input className="panel-input" type="text" value={draft.imeId} onChange={(event) => onDraftChange('imeId', event.target.value)} placeholder={t(locale, 'workspace.orthography.imeIdPlaceholder')} />
                    </label>
                    <label className="dialog-field orthography-manager-form-span-2">
                      <span>{t(locale, 'workspace.orthography.deadKeysLabel')}</span>
                      <textarea className="panel-input orthography-manager-textarea" value={draft.deadKeys} onChange={(event) => onDraftChange('deadKeys', event.target.value)} placeholder={t(locale, 'workspace.orthography.deadKeysPlaceholder')} />
                    </label>
                  </div>

                  <hr className="orthography-manager-divider" />

                  <div className="orthography-manager-form-grid">
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.normalizationFormLabel')}</span>
                      <select className="panel-input" value={draft.normalizationForm} onChange={(event) => onDraftChange('normalizationForm', event.target.value as OrthographyDraft['normalizationForm'])}>
                        <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                        <option value="NFC">NFC</option>
                        <option value="NFD">NFD</option>
                        <option value="NFKC">NFKC</option>
                        <option value="NFKD">NFKD</option>
                      </select>
                    </label>
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.collationBaseLabel')}</span>
                      <input className="panel-input" type="text" value={draft.collationBase} onChange={(event) => onDraftChange('collationBase', event.target.value)} placeholder={t(locale, 'workspace.orthography.collationBasePlaceholder')} />
                    </label>
                  </div>
                  <div className="orthography-manager-checkbox-row">
                    <label className="orthography-builder-checkbox">
                      <input type="checkbox" checked={draft.normalizationCaseSensitive} onChange={(event) => onDraftChange('normalizationCaseSensitive', event.target.checked)} />
                      <span>{t(locale, 'workspace.orthography.normalizationCaseLabel')}</span>
                    </label>
                    <label className="orthography-builder-checkbox">
                      <input type="checkbox" checked={draft.normalizationStripDefaultIgnorables} onChange={(event) => onDraftChange('normalizationStripDefaultIgnorables', event.target.checked)} />
                      <span>{t(locale, 'workspace.orthography.normalizationIgnorableLabel')}</span>
                    </label>
                  </div>
                  <div className="orthography-manager-form-grid">
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.collationRulesLabel')}</span>
                      <textarea className="panel-input orthography-manager-textarea orthography-manager-codearea" value={draft.collationRules} onChange={(event) => onDraftChange('collationRules', event.target.value)} />
                    </label>
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.conversionRulesLabel')}</span>
                      <textarea className="panel-input orthography-manager-textarea orthography-manager-codearea" value={draft.conversionRulesJson} onChange={(event) => onDraftChange('conversionRulesJson', event.target.value)} placeholder={t(locale, 'workspace.orthography.conversionRulesPlaceholder')} />
                    </label>
                  </div>

                  <hr className="orthography-manager-divider" />

                  <div className="orthography-manager-form-grid">
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.notesZhLabel')}</span>
                      <textarea className="panel-input orthography-manager-textarea" value={draft.notesZh} onChange={(event) => onDraftChange('notesZh', event.target.value)} />
                    </label>
                    <label className="dialog-field">
                      <span>{t(locale, 'workspace.orthography.notesEnLabel')}</span>
                      <textarea className="panel-input orthography-manager-textarea" value={draft.notesEn} onChange={(event) => onDraftChange('notesEn', event.target.value)} />
                    </label>
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {saveError ? <p className="orthography-manager-state orthography-manager-state-error">{saveError}</p> : null}
          {saveSuccess ? <p className="orthography-manager-state orthography-manager-state-success">{saveSuccess}</p> : null}
        </>
      ) : (
        <p className="orthography-manager-state">{t(locale, 'workspace.orthography.emptySelection')}</p>
      )}
    </EmbeddedPanelShell>
  );
}