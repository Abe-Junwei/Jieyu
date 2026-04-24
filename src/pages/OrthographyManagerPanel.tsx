import '../styles/foundation/dialog-shell.css';
import '../styles/foundation/panel-design-presets.css';
import '../styles/foundation/panel-primitives.css';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { JIEYU_MATERIAL_PANEL } from '../utils/jieyuMaterialIcon';
import { LanguageAssetRouteLink } from '../components/LanguageAssetRouteLink';
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
import type { OrthographyBuilderMessages } from '../i18n/messages';
import type { LanguageCatalogSearchSuggestion } from '../services/LanguageCatalogSearchService';
import { formatOrthographyOptionLabel } from '../hooks/useOrthographyPicker';
import type { ResolveLanguageDisplayName } from '../utils/languageDisplayNameResolver';
import { formatLanguageCatalogSearchSuggestion } from '../utils/langMapping';
import { resolveCatalogPriorityLabel, resolveCatalogReviewStatusLabel, resolveCatalogSourceLabel, type OrthographyDraft } from './orthographyManager.shared';

type OrthographyManagerPanelProps = {
  onClose?: () => void;
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
  /** 键盘导航：搜索框 keydown | Keyboard nav: search input keydown */
  onSearchKeyDown?: (event: React.KeyboardEvent) => void;
  /** 键盘导航：当前高亮索引 | Keyboard nav: current highlight index */
  activeIndex?: number;
  /** 键盘导航：列表容器 ref | Keyboard nav: list container ref */
  listRef?: React.Ref<HTMLDivElement>;
  searchSuggestions?: LanguageCatalogSearchSuggestion[];
  searchSuggestionActiveIndex?: number;
  onSearchSuggestionHover?: (index: number) => void;
  onSearchSuggestionSelect?: (suggestion: LanguageCatalogSearchSuggestion) => void;
  onSearchInputFocus?: () => void;
  onSearchInputBlur?: () => void;
};

export function OrthographyManagerPanel({
  onClose,
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
  onSearchKeyDown,
  activeIndex = -1,
  listRef,
  searchSuggestions = [],
  searchSuggestionActiveIndex = -1,
  onSearchSuggestionHover,
  onSearchSuggestionSelect,
  onSearchInputFocus,
  onSearchInputBlur,
}: OrthographyManagerPanelProps) {
  const hasVisibleSearchSuggestions = searchSuggestions.length > 0;
  const searchSuggestionListId = 'orthography-manager-search-suggestions';
  const activeSearchSuggestionId = searchSuggestionActiveIndex >= 0 && searchSuggestionActiveIndex < searchSuggestions.length
    ? `om-search-suggestion-${searchSuggestionActiveIndex}`
    : undefined;

  const bridgeButton = selectedOrthography ? (
    <LanguageAssetRouteLink
      to={bridgeWorkspaceHref}
      className="panel-button panel-button--ghost om-panel-link"
      onClick={(event) => {
        if (!onBeforeOpenBridge()) {
          event.preventDefault();
        }
      }}
    >
      {t(locale, 'workspace.orthography.openBridgeWorkspace')}
    </LanguageAssetRouteLink>
  ) : null;

  const closeButton = onClose ? (
    <button
      type="button"
      className="icon-btn"
      onClick={onClose}
      aria-label={t(locale, 'transcription.importDialog.close')}
      title={t(locale, 'transcription.importDialog.close')}
    >
      <MaterialSymbol name="close" className={JIEYU_MATERIAL_PANEL} />
    </button>
  ) : null;

  const panelActions = bridgeButton || closeButton
    ? <>{bridgeButton}{closeButton}</>
    : undefined;

  return (
    <EmbeddedPanelShell
      className="om-shell la-shell"
      headerClassName="om-header"
      bodyClassName="ws-flow om-body la-panel-stack"
      footerClassName="om-footer"
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
      {fromLayerId ? <p className="om-context-note orthography-builder-workspace-note">{t(locale, 'workspace.orthography.fromLayerHint')}</p> : null}

      {selectedOrthography ? (
        <>
          <section className="ws-summary-card om-summary la-panel-section" aria-labelledby="om-summary-title">
            <div className="ws-summary-header">
              <div className="ws-summary-copy">
                <h2 id="om-summary-title" className="ws-summary-title">{formatOrthographyOptionLabel(selectedOrthography, locale)}</h2>
              </div>
              <div className="om-summary-meta">
                <PanelChip>{resolveLabel(selectedOrthography.languageId)}</PanelChip>
                {selectedBadgeLabel ? <PanelChip>{selectedBadgeLabel}</PanelChip> : null}
              </div>
            </div>

            <div className="ws-summary-facts">
              <article className="ws-summary-fact">
                <span className="ws-summary-fact-label">{t(locale, 'workspace.orthography.languageAssetIdLabel')}</span>
                <strong className="ws-summary-fact-value">{selectedOrthography.languageId ?? t(locale, 'workspace.orthography.notSet')}</strong>
                <span className="ws-summary-fact-note">{selectedOrthography.id}</span>
              </article>
              <article className="ws-summary-fact">
                <span className="ws-summary-fact-label">{builderMessages.scriptTagLabel}</span>
                <strong className="ws-summary-fact-value">{draft?.scriptTag || selectedOrthography.scriptTag || t(locale, 'workspace.orthography.notSet')}</strong>
                <span className="ws-summary-fact-note">{resolveLabel(selectedOrthography.languageId)}</span>
              </article>
              <article className="ws-summary-fact">
                <span className="ws-summary-fact-label">{builderMessages.typeLabel}</span>
                <strong className="ws-summary-fact-value">{draft?.type || selectedOrthography.type || t(locale, 'workspace.orthography.notSet')}</strong>
                <span className="ws-summary-fact-note">
                  {builderMessages.advancedDirectionLabel}
                  {' · '}
                  {draft?.direction || t(locale, 'workspace.orthography.notSet')}
                </span>
              </article>
            </div>
          </section>

          {isDirty ? <PanelNote className="om-state om-state-warning">{t(locale, 'workspace.orthography.unsavedHint')}</PanelNote> : null}
        </>
      ) : null}

      <section className="om-browser panel-section la-panel-section" aria-label={t(locale, 'workspace.orthography.listTitle')}>
        <div className="panel-section__body om-browser-body">
          <div className="om-browser-header">
            <p className="om-browser-title">{t(locale, 'workspace.orthography.listTitle')}</p>
            <p className="panel-section__description">{t(locale, 'workspace.orthography.listDescription')}</p>
          </div>
          <div className="om-toolbar orthography-builder-group-body">
            <div className="om-search-combobox">
              <input
                className="panel-input om-search"
                type="search"
                role="combobox"
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
                onKeyDown={onSearchKeyDown}
                onFocus={onSearchInputFocus}
                onBlur={onSearchInputBlur}
                placeholder={t(locale, 'workspace.orthography.searchPlaceholder')}
                aria-label={t(locale, 'workspace.orthography.searchPlaceholder')}
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={hasVisibleSearchSuggestions}
                aria-controls={hasVisibleSearchSuggestions ? searchSuggestionListId : undefined}
                aria-activedescendant={hasVisibleSearchSuggestions
                  ? activeSearchSuggestionId
                  : (activeIndex >= 0 ? `om-item-${filteredOrthographies[activeIndex]?.id ?? ''}` : undefined)}
              />
              <div
                className={`language-iso-input-suggestions om-search-suggestions${hasVisibleSearchSuggestions ? '' : ' is-empty'}`}
                {...(hasVisibleSearchSuggestions
                  ? {
                    id: searchSuggestionListId,
                    role: 'listbox' as const,
                    'aria-label': t(locale, 'workspace.orthography.searchPlaceholder'),
                  }
                  : { 'aria-hidden': 'true' as const })}
              >
                {hasVisibleSearchSuggestions
                  ? searchSuggestions.map((suggestion, index) => (
                    <div
                      id={`om-search-suggestion-${index}`}
                      key={`${suggestion.id}-${index}`}
                      role="option"
                      aria-selected={searchSuggestionActiveIndex === index}
                      className={`language-iso-input-suggestion${searchSuggestionActiveIndex === index ? ' is-active' : ''}`}
                      onMouseEnter={() => onSearchSuggestionHover?.(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSearchSuggestionSelect?.(suggestion)}
                    >
                      <span className="om-search-suggestion-label">{formatLanguageCatalogSearchSuggestion(suggestion, locale)}</span>
                    </div>
                  ))
                  : null}
              </div>
            </div>
            {projectLanguageIds.length > 0 ? (
              <div className="om-filter-toggle" role="radiogroup" aria-label={t(locale, 'workspace.orthography.filterProjectOnly')}>
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
            <div className="om-callout orthography-builder-hint">
              <PanelNote className="om-state om-state-warning">{t(locale, 'workspace.orthography.unscopedPrompt')}</PanelNote>
              <PanelButton variant="ghost" onClick={onBrowseAll}>
                {t(locale, 'workspace.orthography.filterShowAll')}
              </PanelButton>
            </div>
          ) : null}

          {loading ? <PanelNote className="om-state">{t(locale, 'workspace.orthography.loading')}</PanelNote> : null}
          {!loading && error ? <PanelNote variant="danger" className="om-state om-state-error">{t(locale, 'workspace.orthography.errorPrefix').replace('{message}', error)}</PanelNote> : null}
          {!loading && !error && !showUnscopedIdleState && searchText.trim() && filteredOrthographies.length === 0 ? <PanelNote className="om-state om-state-warning">{t(locale, 'workspace.orthography.searchNoResults')}</PanelNote> : null}
          {!loading && !error && !showUnscopedIdleState && !searchText.trim() && filteredOrthographies.length === 0 ? <PanelNote className="om-state">{t(locale, 'workspace.orthography.emptyList')}</PanelNote> : null}

          <div className="om-list la-list-scroll" role="list" ref={listRef} aria-label={t(locale, 'workspace.orthography.listTitle')}>
            {filteredOrthographies.map((orthography, index) => {
              const badge = getOrthographyCatalogBadgeInfo(locale, orthography);
              const active = orthography.id === selectedOrthography?.id;
              const highlighted = index === activeIndex;
              return (
                <button
                  key={orthography.id}
                  id={`om-item-${orthography.id}`}
                  type="button"
                  className={`om-list-item${active ? ' om-list-item-active' : ''}${highlighted ? ' om-list-item-highlight' : ''}`}
                  onClick={() => onSelectOrthography(orthography.id)}
                >
                  <span className="om-list-label">{formatOrthographyOptionLabel(orthography, locale)}</span>
                  <span className="om-list-meta">
                    <span>{resolveLabel(orthography.languageId)}</span>
                    <span className={badge.className}>{badge.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {selectedOrthography ? (
        <>
          <hr className="om-divider" />

          {draft ? (
            <div className="om-form-stack orthography-builder-panel orthography-builder-panel-compact">
              <section className="om-subsection orthography-builder-group orthography-builder-group-divided">
                <h3 className="panel-title-primary om-subsection-title orthography-builder-group-title">{builderMessages.identitySectionTitle}</h3>
                <div className="om-form-grid">
                  <div className="om-form-span-2">
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
                  <div className="orthography-builder-script-type-row om-form-pair om-form-span-two-thirds">
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
                  <FormField label={builderMessages.advancedDirectionLabel} className="om-form-span-third">
                    <select className="panel-input" value={draft.direction} onChange={(event) => onDraftChange('direction', event.target.value as OrthographyDraft['direction'])}>
                      <option value="ltr">{builderMessages.advancedDirectionLtr}</option>
                      <option value="rtl">{builderMessages.advancedDirectionRtl}</option>
                      <option value="ttb">{t(locale, 'workspace.orthography.directionTtb')}</option>
                      <option value="btt">{t(locale, 'workspace.orthography.directionBtt')}</option>
                    </select>
                  </FormField>
                  <FormField label={builderMessages.nameZhLabel} className="om-form-span-half">
                    <input className="panel-input" type="text" value={draft.namePrimary} onChange={(event) => onDraftChange('namePrimary', event.target.value)} placeholder={builderMessages.nameZhPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.nameEnLabel} className="om-form-span-half">
                    <input className="panel-input" type="text" value={draft.nameEnglishFallback} onChange={(event) => onDraftChange('nameEnglishFallback', event.target.value)} placeholder={builderMessages.nameEnPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.abbreviationLabel} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.abbreviation} onChange={(event) => onDraftChange('abbreviation', event.target.value)} placeholder={builderMessages.abbreviationPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.advancedLocaleLabel} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.localeTag} onChange={(event) => onDraftChange('localeTag', event.target.value)} placeholder={builderMessages.localePlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.advancedRegionLabel} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.regionTag} onChange={(event) => onDraftChange('regionTag', event.target.value)} placeholder={builderMessages.regionPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.advancedVariantLabel} className="om-form-span-half">
                    <input className="panel-input" type="text" value={draft.variantTag} onChange={(event) => onDraftChange('variantTag', event.target.value)} placeholder={builderMessages.variantPlaceholder} />
                  </FormField>
                </div>
              </section>

              <section className="om-subsection orthography-builder-group orthography-builder-group-divided">
                <h3 className="panel-title-primary om-subsection-title orthography-builder-group-title">{builderMessages.renderSectionTitle}</h3>
                <div className="om-form-grid">
                  <FormField label={builderMessages.primaryFontLabel} className="om-form-span-half">
                    <input className="panel-input" type="text" value={draft.primaryFonts} onChange={(event) => onDraftChange('primaryFonts', event.target.value)} placeholder={builderMessages.primaryFontPlaceholder} />
                  </FormField>
                  <FormField label={builderMessages.fallbackFontLabel} className="om-form-span-half">
                    <input className="panel-input" type="text" value={draft.fallbackFonts} onChange={(event) => onDraftChange('fallbackFonts', event.target.value)} placeholder={builderMessages.fallbackFontPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.monoFontLabel')} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.monoFonts} onChange={(event) => onDraftChange('monoFonts', event.target.value)} placeholder={builderMessages.fallbackFontPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.lineHeightScaleLabel')} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.lineHeightScale} onChange={(event) => onDraftChange('lineHeightScale', event.target.value)} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.sizeAdjustLabel')} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.sizeAdjust} onChange={(event) => onDraftChange('sizeAdjust', event.target.value)} />
                  </FormField>
                </div>
                <div className="om-checkbox-row">
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

              <section className="om-subsection orthography-builder-group orthography-builder-group-divided">
                <h3 className="panel-title-primary om-subsection-title orthography-builder-group-title">{builderMessages.localizedNamesSectionTitle}</h3>
                <div className="om-array-list">
                  {draft.localizedNameEntries.map((entry, index) => (
                    <div key={`${entry.languageTag}-${index}`} className="om-array-row">
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
                      <FormField label={t(locale, 'workspace.orthography.localizedNameValueLabel')} className="om-array-value">
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
                  className="om-array-add"
                  onClick={() => onDraftChange('localizedNameEntries', [...draft.localizedNameEntries, { languageTag: '', label: '' }])}
                >
                  {t(locale, 'workspace.orthography.localizedNameAdd')}
                </PanelButton>

                <hr className="om-divider" />

                <h3 className="panel-title-primary om-subsection-title orthography-builder-group-title">{builderMessages.examplesSectionTitle}</h3>
                <div className="om-form-grid">
                  <FormField label={builderMessages.exemplarLabel} className="om-form-span-half">
                    <textarea className="panel-input om-textarea" value={draft.exemplarMain} onChange={(event) => onDraftChange('exemplarMain', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.auxiliaryExemplarLabel')} className="om-form-span-half">
                    <textarea className="panel-input om-textarea" value={draft.exemplarAuxiliary} onChange={(event) => onDraftChange('exemplarAuxiliary', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.numberExemplarLabel')} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.exemplarNumbers} onChange={(event) => onDraftChange('exemplarNumbers', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.punctuationExemplarLabel')} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.exemplarPunctuation} onChange={(event) => onDraftChange('exemplarPunctuation', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                  <FormField label={t(locale, 'workspace.orthography.indexExemplarLabel')} className="om-form-span-third">
                    <input className="panel-input" type="text" value={draft.exemplarIndex} onChange={(event) => onDraftChange('exemplarIndex', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
                  </FormField>
                </div>
              </section>

              <details className="om-advanced orthography-builder-advanced-group">
                <summary className="om-advanced-summary">
                  <span className="panel-title-secondary orthography-builder-group-title">{builderMessages.advancedSectionTitle}</span>
                  <span className="om-advanced-meta">
                    {draft.catalogReviewStatus ? resolveCatalogReviewStatusLabel(locale, draft.catalogReviewStatus) : null}
                    {draft.catalogPriority ? ` · ${resolveCatalogPriorityLabel(locale, draft.catalogPriority)}` : null}
                  </span>
                </summary>

                <div className="om-advanced-body orthography-builder-advanced-panel">
                  <div className="om-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.catalogReviewStatusLabel')} className="om-form-span-half">
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
                    <FormField label={t(locale, 'workspace.orthography.catalogPriorityLabel')} className="om-form-span-half">
                      <select className="panel-input" value={draft.catalogPriority} onChange={(event) => onDraftChange('catalogPriority', event.target.value as OrthographyDraft['catalogPriority'])}>
                        <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                        <option value="primary">{resolveCatalogPriorityLabel(locale, 'primary')}</option>
                        <option value="secondary">{resolveCatalogPriorityLabel(locale, 'secondary')}</option>
                      </select>
                    </FormField>
                    <div className="om-basic-grid om-form-span-2">
                      <div><dt>{t(locale, 'workspace.orthography.catalogSourceLabel')}</dt><dd>{resolveCatalogSourceLabel(locale, selectedOrthography.catalogMetadata?.catalogSource)}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.catalogLabel')}</dt><dd>{selectedBadgeLabel ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.updatedAtLabel')}</dt><dd>{selectedOrthography.updatedAt ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                      <div><dt>{t(locale, 'workspace.orthography.catalogSourceNoteLabel')}</dt><dd>{selectedOrthography.catalogMetadata?.source ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                    </div>
                  </div>

                  <hr className="om-divider" />

                  <div className="om-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.keyboardLayoutLabel')} className="om-form-span-half">
                      <input className="panel-input" type="text" value={draft.keyboardLayout} onChange={(event) => onDraftChange('keyboardLayout', event.target.value)} placeholder={t(locale, 'workspace.orthography.keyboardLayoutPlaceholder')} />
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.imeIdLabel')} className="om-form-span-half">
                      <input className="panel-input" type="text" value={draft.imeId} onChange={(event) => onDraftChange('imeId', event.target.value)} placeholder={t(locale, 'workspace.orthography.imeIdPlaceholder')} />
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.deadKeysLabel')} className="om-form-span-2">
                      <textarea className="panel-input om-textarea" value={draft.deadKeys} onChange={(event) => onDraftChange('deadKeys', event.target.value)} placeholder={t(locale, 'workspace.orthography.deadKeysPlaceholder')} />
                    </FormField>
                  </div>

                  <hr className="om-divider" />

                  <div className="om-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.normalizationFormLabel')} className="om-form-span-half">
                      <select className="panel-input" value={draft.normalizationForm} onChange={(event) => onDraftChange('normalizationForm', event.target.value as OrthographyDraft['normalizationForm'])}>
                        <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                        <option value="NFC">NFC</option>
                        <option value="NFD">NFD</option>
                        <option value="NFKC">NFKC</option>
                        <option value="NFKD">NFKD</option>
                      </select>
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.collationBaseLabel')} className="om-form-span-half">
                      <input className="panel-input" type="text" value={draft.collationBase} onChange={(event) => onDraftChange('collationBase', event.target.value)} placeholder={t(locale, 'workspace.orthography.collationBasePlaceholder')} />
                    </FormField>
                  </div>
                  <div className="om-checkbox-row">
                    <label className="orthography-builder-checkbox">
                      <input type="checkbox" checked={draft.normalizationCaseSensitive} onChange={(event) => onDraftChange('normalizationCaseSensitive', event.target.checked)} />
                      <span>{t(locale, 'workspace.orthography.normalizationCaseLabel')}</span>
                    </label>
                    <label className="orthography-builder-checkbox">
                      <input type="checkbox" checked={draft.normalizationStripDefaultIgnorables} onChange={(event) => onDraftChange('normalizationStripDefaultIgnorables', event.target.checked)} />
                      <span>{t(locale, 'workspace.orthography.normalizationIgnorableLabel')}</span>
                    </label>
                  </div>
                  <div className="om-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.collationRulesLabel')} className="om-form-span-half">
                      <textarea className="panel-input om-textarea om-codearea" value={draft.collationRules} onChange={(event) => onDraftChange('collationRules', event.target.value)} />
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.conversionRulesLabel')} className="om-form-span-half">
                      <textarea className="panel-input om-textarea om-codearea" value={draft.conversionRulesJson} onChange={(event) => onDraftChange('conversionRulesJson', event.target.value)} placeholder={t(locale, 'workspace.orthography.conversionRulesPlaceholder')} />
                    </FormField>
                  </div>

                  <hr className="om-divider" />

                  <div className="om-form-grid">
                    <FormField label={t(locale, 'workspace.orthography.notesZhLabel')} className="om-form-span-half">
                      <textarea className="panel-input om-textarea" value={draft.notesZh} onChange={(event) => onDraftChange('notesZh', event.target.value)} />
                    </FormField>
                    <FormField label={t(locale, 'workspace.orthography.notesEnLabel')} className="om-form-span-half">
                      <textarea className="panel-input om-textarea" value={draft.notesEn} onChange={(event) => onDraftChange('notesEn', event.target.value)} />
                    </FormField>
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {saveError ? <p className="om-state om-state-error">{saveError}</p> : null}
          {saveSuccess ? <p className="om-state om-state-success">{saveSuccess}</p> : null}
        </>
      ) : (
        <p className="om-state">{t(locale, 'workspace.orthography.emptySelection')}</p>
      )}
    </EmbeddedPanelShell>
  );
}