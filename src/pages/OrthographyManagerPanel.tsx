import '../styles/components/orthography-builder.css';
import '../styles/foundation/dialog-shell.css';
import '../styles/foundation/panel-design-presets.css';
import '../styles/foundation/panel-primitives.css';
import { Link } from 'react-router-dom';
import { getOrthographyCatalogBadgeInfo } from '../components/orthographyCatalogUi';
import { LanguageIsoInput, type LanguageIsoInputValue } from '../components/LanguageIsoInput';
import { ScriptTagCombobox } from '../components/ScriptTagCombobox';
import { EmbeddedPanelShell } from '../components/ui/EmbeddedPanelShell';
import { FormField } from '../components/ui/FormField';
import { PanelButton } from '../components/ui/PanelButton';
import { PanelChip } from '../components/ui/PanelChip';
import { PanelNote } from '../components/ui/PanelNote';
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
          <PanelButton variant="ghost" onClick={onResetDraft} disabled={!draft || saving || !isDirty}>
            {t(locale, 'workspace.orthography.resetButton')}
          </PanelButton>
          <PanelButton variant="primary" onClick={onSaveDraft} disabled={!draft || saving || !isDirty}>
            {saving ? t(locale, 'workspace.orthography.saving') : t(locale, 'workspace.orthography.saveButton')}
          </PanelButton>
        </>
      ) : null}
    >
      {fromLayerId ? <p className="orthography-manager-context-note orthography-builder-workspace-note">{t(locale, 'workspace.orthography.fromLayerHint')}</p> : null}

      <section className="orthography-manager-browser panel-section" aria-label={t(locale, 'workspace.orthography.listTitle')}>
        <div className="panel-section__body orthography-builder-group-body orthography-manager-browser-body">
          <div className="orthography-manager-toolbar orthography-builder-group-body">
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
                <PanelButton
                  role="radio"
                  aria-checked={projectOnly}
                  variant={projectOnly ? 'primary' : 'ghost'}
                  onClick={() => onProjectOnlyChange(true)}
                >
                  {t(locale, 'workspace.orthography.filterProjectOnly')}
                </PanelButton>
                <PanelButton
                  role="radio"
                  aria-checked={!projectOnly}
                  variant={!projectOnly ? 'primary' : 'ghost'}
                  onClick={() => onProjectOnlyChange(false)}
                >
                  {t(locale, 'workspace.orthography.filterShowAll')}
                </PanelButton>
              </div>
            ) : null}
          </div>

          {!projectLanguageIds.length && showUnscopedIdleState ? (
            <div className="orthography-manager-callout orthography-builder-hint">
              <PanelNote className="orthography-manager-state orthography-manager-state-warning">{t(locale, 'workspace.orthography.unscopedPrompt')}</PanelNote>
              <PanelButton variant="ghost" onClick={onBrowseAll}>
                {t(locale, 'workspace.orthography.filterShowAll')}
              </PanelButton>
            </div>
          ) : null}

          {loading ? <PanelNote className="orthography-manager-state">{t(locale, 'workspace.orthography.loading')}</PanelNote> : null}
          {!loading && error ? <PanelNote variant="danger" className="orthography-manager-state orthography-manager-state-error">{t(locale, 'workspace.orthography.errorPrefix').replace('{message}', error)}</PanelNote> : null}
          {!loading && !error && !showUnscopedIdleState && filteredOrthographies.length === 0 ? <PanelNote className="orthography-manager-state">{t(locale, 'workspace.orthography.emptyList')}</PanelNote> : null}

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
        </div>
      </section>

      <hr className="orthography-manager-divider" />

      {selectedOrthography ? (
        <>
          <section className="orthography-manager-highlight-card panel-section panel-section--emphasis" aria-label={t(locale, 'workspace.orthography.detailTitle')}>
            <div className="panel-section__header">
              <div className="panel-section__copy">
                <p className="orthography-manager-highlight-label">{t(locale, 'workspace.orthography.languageAssetIdLabel')}</p>
                <p className="orthography-manager-highlight-value">{selectedOrthography.languageId ?? t(locale, 'workspace.orthography.notSet')}</p>
              </div>
              <div className="panel-section__meta orthography-manager-highlight-meta">
                <PanelChip>{resolveLabel(selectedOrthography.languageId)}</PanelChip>
                {selectedBadgeLabel ? <PanelChip>{selectedBadgeLabel}</PanelChip> : null}
              </div>
            </div>
          </section>

          {isDirty ? <PanelNote className="orthography-manager-state orthography-manager-state-warning">{t(locale, 'workspace.orthography.unsavedHint')}</PanelNote> : null}

          {draft ? (
            <div className="orthography-manager-form-stack orthography-builder-panel orthography-builder-panel-compact">
              <section className="orthography-manager-subsection orthography-builder-group orthography-builder-group-divided">
                <h3 className="orthography-manager-subsection-title orthography-builder-group-title">{builderMessages.identitySectionTitle}</h3>
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
                    <FormField label={t(locale, 'workspace.orthography.languageAssetIdLabel')}>
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
                    </FormField>
                  </div>
                  <div className="orthography-builder-script-type-row orthography-manager-form-pair orthography-manager-form-span-two-thirds">
                    <FormField label={builderMessages.scriptTagLabel}>
                      <ScriptTagCombobox
                        value={draft.scriptTag}
                        onChange={(val) => onDraftChange('scriptTag', val)}
                        locale={locale}
                        placeholder={builderMessages.scriptTagPlaceholder}
                        className="panel-input"
                        ariaLabel={builderMessages.scriptTagLabel}
                      />
                    </FormField>
                    <FormField label={builderMessages.typeLabel}>
                      <select className="panel-input" value={draft.type} onChange={(event) => onDraftChange('type', event.target.value as OrthographyDraft['type'])}>
                        <option value="phonemic">{builderMessages.typePhonemic}</option>
                        <option value="phonetic">{builderMessages.typePhonetic}</option>
                        <option value="practical">{builderMessages.typePractical}</option>
                        <option value="historical">{builderMessages.typeHistorical}</option>
                        <option value="other">{builderMessages.typeOther}</option>
                      </select>
                    </FormField>
                  </div>
                  <FormField label={builderMessages.advancedDirectionLabel} className="orthography-manager-form-span-third">
                    <select className="panel-input" value={draft.direction} onChange={(event) => onDraftChange('direction', event.target.value as OrthographyDraft['direction'])}>
                      <option value="ltr">{builderMessages.advancedDirectionLtr}</option>
                      <option value="rtl">{builderMessages.advancedDirectionRtl}</option>
                      <option value="ttb">{t(locale, 'workspace.orthography.directionTtb')}</option>
                      <option value="btt">{t(locale, 'workspace.orthography.directionBtt')}</option>
                    </select>
                  </FormField>
                  <FormField label={builderMessages.nameZhLabel} className="orthography-manager-form-span-half">
                    <input className="panel-input" type="text" value={draft.namePrimary} onChange={(event) => onDraftChange('namePrimary', event.target.value)} placeholder={builderMessages.nameZhPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.nameEnLabel} className="orthography-manager-form-span-half">
                    <input className="panel-input" type="text" value={draft.nameEnglishFallback} onChange={(event) => onDraftChange('nameEnglishFallback', event.target.value)} placeholder={builderMessages.nameEnPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.abbreviationLabel} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.abbreviation} onChange={(event) => onDraftChange('abbreviation', event.target.value)} placeholder={builderMessages.abbreviationPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.advancedLocaleLabel} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.localeTag} onChange={(event) => onDraftChange('localeTag', event.target.value)} placeholder={builderMessages.localePlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.advancedRegionLabel} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.regionTag} onChange={(event) => onDraftChange('regionTag', event.target.value)} placeholder={builderMessages.regionPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.advancedVariantLabel} className="orthography-manager-form-span-half">
                    <input className="panel-input" type="text" value={draft.variantTag} onChange={(event) => onDraftChange('variantTag', event.target.value)} placeholder={builderMessages.variantPlaceholder} />
                  </FormField>
                </div>
              </section>

              <section className="orthography-manager-subsection orthography-builder-group orthography-builder-group-divided">
                <h3 className="orthography-manager-subsection-title orthography-builder-group-title">{builderMessages.renderSectionTitle}</h3>
                <div className="orthography-manager-form-grid">
                  <FormField label={builderMessages.primaryFontLabel} className="orthography-manager-form-span-half">
                    <input className="panel-input" type="text" value={draft.primaryFonts} onChange={(event) => onDraftChange('primaryFonts', event.target.value)} placeholder={builderMessages.primaryFontPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.fallbackFontLabel} className="orthography-manager-form-span-half">
                    <input className="panel-input" type="text" value={draft.fallbackFonts} onChange={(event) => onDraftChange('fallbackFonts', event.target.value)} placeholder={builderMessages.fallbackFontPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.monoFontLabel')} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.monoFonts} onChange={(event) => onDraftChange('monoFonts', event.target.value)} placeholder={builderMessages.fallbackFontPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.lineHeightScaleLabel')} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.lineHeightScale} onChange={(event) => onDraftChange('lineHeightScale', event.target.value)} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.sizeAdjustLabel')} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.sizeAdjust} onChange={(event) => onDraftChange('sizeAdjust', event.target.value)} />
                  </FormField>
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

              <section className="orthography-manager-subsection orthography-builder-group orthography-builder-group-divided">
                <h3 className="orthography-manager-subsection-title orthography-builder-group-title">{builderMessages.localizedNamesSectionTitle}</h3>
                <div className="orthography-manager-array-list">
                  {draft.localizedNameEntries.map((entry, index) => (
                    <div key={`${entry.languageTag}-${index}`} className="orthography-manager-array-row">
                      <FormField label={t(locale, 'workspace.orthography.localizedNameTagLabel')}>
                        <input
                          className="panel-input"
                          type="text"
                          value={entry.languageTag}
                          onChange={(event) => onDraftChange('localizedNameEntries', draft.localizedNameEntries.map((current, currentIndex) => (
                            currentIndex === index ? { ...current, languageTag: event.target.value } : current
                          )))}
                          placeholder={t(locale, 'workspace.orthography.localizedNameTagPlaceholder')}
                        />
                      </FormField>
                      <FormField label={t(locale, 'workspace.orthography.localizedNameValueLabel')} className="orthography-manager-array-value">
                        <input
                          className="panel-input"
                          type="text"
                          value={entry.label}
                          onChange={(event) => onDraftChange('localizedNameEntries', draft.localizedNameEntries.map((current, currentIndex) => (
                            currentIndex === index ? { ...current, label: event.target.value } : current
                          )))}
                          placeholder={t(locale, 'workspace.orthography.localizedNameValuePlaceholder')}
                        />
                      </FormField>
                      <PanelButton
                        variant="ghost"
                        onClick={() => onDraftChange('localizedNameEntries', draft.localizedNameEntries.filter((_, currentIndex) => currentIndex !== index))}
                      >
                        {t(locale, 'workspace.orthography.localizedNameRemove')}
                      </PanelButton>
                    </div>
                  ))}
                </div>
                <PanelButton
                  variant="ghost"
                  className="orthography-manager-array-add"
                  onClick={() => onDraftChange('localizedNameEntries', [...draft.localizedNameEntries, { languageTag: '', label: '' }])}
                >
                  {t(locale, 'workspace.orthography.localizedNameAdd')}
                </PanelButton>

                <hr className="orthography-manager-divider" />

                <h3 className="orthography-manager-subsection-title orthography-builder-group-title">{builderMessages.examplesSectionTitle}</h3>
                <div className="orthography-manager-form-grid">
                  <FormField label={builderMessages.exemplarLabel} className="orthography-manager-form-span-half">
                    <textarea className="panel-input orthography-manager-textarea" value={draft.exemplarMain} onChange={(event) => onDraftChange('exemplarMain', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.auxiliaryExemplarLabel')} className="orthography-manager-form-span-half">
                    <textarea className="panel-input orthography-manager-textarea" value={draft.exemplarAuxiliary} onChange={(event) => onDraftChange('exemplarAuxiliary', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.numberExemplarLabel')} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.exemplarNumbers} onChange={(event) => onDraftChange('exemplarNumbers', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.punctuationExemplarLabel')} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.exemplarPunctuation} onChange={(event) => onDraftChange('exemplarPunctuation', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.indexExemplarLabel')} className="orthography-manager-form-span-third">
                    <input className="panel-input" type="text" value={draft.exemplarIndex} onChange={(event) => onDraftChange('exemplarIndex', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                </div>
              </section>

              <details className="orthography-manager-advanced orthography-builder-advanced-group">
                <summary className="orthography-manager-advanced-summary">
                  <span className="orthography-builder-group-title">{builderMessages.advancedSectionTitle}</span>
                  <span className="orthography-manager-advanced-meta">
                    {draft.catalogReviewStatus ? resolveCatalogReviewStatusLabel(locale, draft.catalogReviewStatus) : null}
                    {draft.catalogPriority ? ` · ${resolveCatalogPriorityLabel(locale, draft.catalogPriority)}` : null}
                  </span>
                </summary>

                <div className="orthography-manager-advanced-body orthography-builder-advanced-panel">
                  <div className="orthography-manager-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.catalogReviewStatusLabel')} className="orthography-manager-form-span-half">
                      <select className="panel-input" value={draft.catalogReviewStatus} onChange={(event) => onDraftChange('catalogReviewStatus', event.target.value as OrthographyDraft['catalogReviewStatus'])}>
                        <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                        <option value="needs-review">{resolveCatalogReviewStatusLabel(locale, 'needs-review')}</option>
                        <option value="verified-primary">{resolveCatalogReviewStatusLabel(locale, 'verified-primary')}</option>
                        <option value="verified-secondary">{resolveCatalogReviewStatusLabel(locale, 'verified-secondary')}</option>
                        <option value="historical">{resolveCatalogReviewStatusLabel(locale, 'historical')}</option>
                        <option value="legacy">{resolveCatalogReviewStatusLabel(locale, 'legacy')}</option>
                        <option value="experimental">{resolveCatalogReviewStatusLabel(locale, 'experimental')}</option>
                      </select>
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.catalogPriorityLabel')} className="orthography-manager-form-span-half">
                      <select className="panel-input" value={draft.catalogPriority} onChange={(event) => onDraftChange('catalogPriority', event.target.value as OrthographyDraft['catalogPriority'])}>
                        <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                        <option value="primary">{resolveCatalogPriorityLabel(locale, 'primary')}</option>
                        <option value="secondary">{resolveCatalogPriorityLabel(locale, 'secondary')}</option>
                      </select>
                    </FormField>
                    <div className="orthography-manager-basic-grid orthography-manager-form-span-2">
                      <div><dt>{t(locale, 'workspace.orthography.catalogSourceLabel')}</dt><dd>{resolveCatalogSourceLabel(locale, selectedOrthography.catalogMetadata?.catalogSource)}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.catalogLabel')}</dt><dd>{selectedBadgeLabel ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.updatedAtLabel')}</dt><dd>{selectedOrthography.updatedAt ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.catalogSourceNoteLabel')}</dt><dd>{selectedOrthography.catalogMetadata?.source ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                    </div>
                  </div>

                  <hr className="orthography-manager-divider" />

                  <div className="orthography-manager-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.keyboardLayoutLabel')} className="orthography-manager-form-span-half">
                      <input className="panel-input" type="text" value={draft.keyboardLayout} onChange={(event) => onDraftChange('keyboardLayout', event.target.value)} placeholder={t(locale, 'workspace.orthography.keyboardLayoutPlaceholder')} />
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.imeIdLabel')} className="orthography-manager-form-span-half">
                      <input className="panel-input" type="text" value={draft.imeId} onChange={(event) => onDraftChange('imeId', event.target.value)} placeholder={t(locale, 'workspace.orthography.imeIdPlaceholder')} />
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.deadKeysLabel')} className="orthography-manager-form-span-2">
                      <textarea className="panel-input orthography-manager-textarea" value={draft.deadKeys} onChange={(event) => onDraftChange('deadKeys', event.target.value)} placeholder={t(locale, 'workspace.orthography.deadKeysPlaceholder')} />
                    </FormField>
                  </div>

                  <hr className="orthography-manager-divider" />

                  <div className="orthography-manager-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.normalizationFormLabel')} className="orthography-manager-form-span-half">
                      <select className="panel-input" value={draft.normalizationForm} onChange={(event) => onDraftChange('normalizationForm', event.target.value as OrthographyDraft['normalizationForm'])}>
                        <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                        <option value="NFC">NFC</option>
                        <option value="NFD">NFD</option>
                        <option value="NFKC">NFKC</option>
                        <option value="NFKD">NFKD</option>
                      </select>
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.collationBaseLabel')} className="orthography-manager-form-span-half">
                      <input className="panel-input" type="text" value={draft.collationBase} onChange={(event) => onDraftChange('collationBase', event.target.value)} placeholder={t(locale, 'workspace.orthography.collationBasePlaceholder')} />
                    </FormField>
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
                    <FormField label={t(locale, 'workspace.orthography.collationRulesLabel')} className="orthography-manager-form-span-half">
                      <textarea className="panel-input orthography-manager-textarea orthography-manager-codearea" value={draft.collationRules} onChange={(event) => onDraftChange('collationRules', event.target.value)} />
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.conversionRulesLabel')} className="orthography-manager-form-span-half">
                      <textarea className="panel-input orthography-manager-textarea orthography-manager-codearea" value={draft.conversionRulesJson} onChange={(event) => onDraftChange('conversionRulesJson', event.target.value)} placeholder={t(locale, 'workspace.orthography.conversionRulesPlaceholder')} />
                    </FormField>
                  </div>

                  <hr className="orthography-manager-divider" />

                  <div className="orthography-manager-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.notesZhLabel')} className="orthography-manager-form-span-half">
                      <textarea className="panel-input orthography-manager-textarea" value={draft.notesZh} onChange={(event) => onDraftChange('notesZh', event.target.value)} />
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.notesEnLabel')} className="orthography-manager-form-span-half">
                      <textarea className="panel-input orthography-manager-textarea" value={draft.notesEn} onChange={(event) => onDraftChange('notesEn', event.target.value)} />
                    </FormField>
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