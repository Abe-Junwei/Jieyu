import { useEffect, useState, type ReactNode } from 'react';
import { formatOrthographyOptionLabel, groupOrthographiesForSelect, type UseOrthographyPickerResult } from '../hooks/useOrthographyPicker';
import { useLocale } from '../i18n';
import {
  getOrthographyBuilderMessages,
  getOrthographyCatalogGroupLabel,
  getOrthographyBridgeRulePlaceholder,
  getOrthographyBridgeSyntaxHint,
} from '../i18n/orthographyBuilderMessages';
import { EmbeddedPanelShell } from './ui/EmbeddedPanelShell';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import {
  describeFontVerificationStatus,
  getCachedFontCoverageVerification,
  verifyFontCoverage,
  type FontCoverageVerification,
} from '../utils/layerDisplayStyle';
import { getLanguageDisplayName } from '../utils/langMapping';

type LanguageOption = {
  code: string;
  label: string;
};

type OrthographyBuilderPanelProps = {
  picker: UseOrthographyPickerResult;
  languageOptions: readonly LanguageOption[];
  compact?: boolean;
  sourceLanguagePlaceholder?: string;
  sourceLanguageCodePlaceholder?: string;
  nameZhPlaceholder?: string;
  nameEnPlaceholder?: string;
};

function renderField(label: string, control: ReactNode, compact: boolean, key: string) {
  if (compact) {
    return <div key={key}>{control}</div>;
  }
  return (
    <label key={key} className="dialog-field">
      <span>{label}</span>
      {control}
    </label>
  );
}

export function OrthographyBuilderPanel({
  picker,
  languageOptions,
  compact = false,
  sourceLanguagePlaceholder,
  sourceLanguageCodePlaceholder,
  nameZhPlaceholder,
  nameEnPlaceholder,
}: OrthographyBuilderPanelProps) {
  const locale = useLocale();
  const messages = getOrthographyBuilderMessages(locale);
  const resolvedSourceLanguagePlaceholder = sourceLanguagePlaceholder ?? messages.sourceLanguagePlaceholder;
  const resolvedSourceLanguageCodePlaceholder = sourceLanguageCodePlaceholder ?? messages.sourceLanguageCodePlaceholder;
  const resolvedNameZhPlaceholder = nameZhPlaceholder ?? messages.nameZhPlaceholder;
  const resolvedNameEnPlaceholder = nameEnPlaceholder ?? messages.nameEnPlaceholder;
  const fieldClassName = compact ? 'input layer-action-dialog-input' : 'input';
  const containerClassName = compact
    ? 'orthography-builder-panel orthography-builder-panel-compact'
    : 'orthography-builder-panel';
  const gridClassName = compact ? 'orthography-builder-grid orthography-builder-grid-compact' : 'orthography-builder-grid';
  const [fontVerification, setFontVerification] = useState<FontCoverageVerification | null>(null);
  const [sourceLanguageInput, setSourceLanguageInput] = useState<LanguageIsoInputValue>({
    languageName: '',
    languageCode: '',
  });
  const groupedSourceOrthographies = groupOrthographiesForSelect(picker.sourceOrthographies);
  const bridgeRulePlaceholder = getOrthographyBridgeRulePlaceholder(messages, picker.draftBridgeEngine);
  const bridgeSyntaxHint = getOrthographyBridgeSyntaxHint(messages, picker.draftBridgeEngine);
  const resolvedSourceLanguageCode = picker.sourceLanguageId === '__custom__'
    ? picker.sourceCustomLanguageId
    : picker.sourceLanguageId;

  useEffect(() => {
    const normalizedCode = resolvedSourceLanguageCode.trim().toLowerCase();
    setSourceLanguageInput((prev) => ({
      ...prev,
      languageName: normalizedCode ? getLanguageDisplayName(normalizedCode, locale) : '',
      languageCode: normalizedCode,
    }));
  }, [locale, resolvedSourceLanguageCode]);

  const handleSourceLanguageInputChange = (nextValue: LanguageIsoInputValue) => {
    const normalizedCode = nextValue.languageCode.trim().toLowerCase();
    setSourceLanguageInput(nextValue);
    picker.setSourceOrthographyId('');
    if (!normalizedCode) {
      picker.setSourceLanguageId('');
      picker.setSourceCustomLanguageId('');
      return;
    }
    const knownLanguage = languageOptions.some((option) => option.code === normalizedCode);
    picker.setSourceLanguageId(knownLanguage ? normalizedCode : '__custom__');
    picker.setSourceCustomLanguageId(knownLanguage ? '' : normalizedCode);
  };

  useEffect(() => {
    let disposed = false;
    const renderPolicy = picker.draftRenderPolicy;
    if (!renderPolicy || renderPolicy.defaultFontKey === messages.systemDefaultFontKey) {
      setFontVerification(null);
      return () => {
        disposed = true;
      };
    }

    const cached = getCachedFontCoverageVerification(renderPolicy.defaultFontKey, renderPolicy);
    setFontVerification(cached ?? null);

    void verifyFontCoverage(renderPolicy.defaultFontKey, renderPolicy)
      .then((verification) => {
        if (!disposed) {
          setFontVerification(verification);
        }
      })
      .catch(() => {
        if (!disposed) {
          setFontVerification(null);
        }
      });

    return () => {
      disposed = true;
    };
  }, [messages.systemDefaultFontKey, picker.draftRenderPolicy]);

  const fontVerificationLabel = picker.draftRenderPolicy
    ? describeFontVerificationStatus(
      picker.draftRenderPolicy.defaultFontKey,
      picker.draftRenderPolicy,
      fontVerification,
    )
    : null;

  const content = (
    <div className={containerClassName}>
      <div className={gridClassName}>
        {renderField(
          messages.createModeLabel,
          <select
            className={fieldClassName}
            value={picker.createMode}
            onChange={(e) => picker.setCreateMode(e.target.value as 'ipa' | 'copy-current' | 'derive-other')}
            aria-label={messages.createModeLabel}
          >
            <option value="ipa">{messages.createModeIpa}</option>
            <option value="copy-current">{messages.createModeCopyCurrent}</option>
            <option value="derive-other">{messages.createModeDeriveOther}</option>
          </select>,
          compact,
          'create-mode',
        )}

        {picker.createMode === 'derive-other' && (
          <div className="orthography-builder-language-field" key="source-language-input">
            <LanguageIsoInput
              locale={locale}
              value={sourceLanguageInput}
              onChange={handleSourceLanguageInputChange}
              nameLabel={messages.sourceLanguageLabel}
              codeLabel={messages.sourceLanguageCodeLabel}
              namePlaceholder={compact ? messages.sourceLanguageCompactPlaceholder : resolvedSourceLanguagePlaceholder}
              codePlaceholder={resolvedSourceLanguageCodePlaceholder}
            />
          </div>
        )}

        {picker.createMode !== 'ipa' && picker.sourceOrthographies.length > 0 && renderField(
          messages.sourceOrthographyLabel,
          <select
            className={fieldClassName}
            value={picker.sourceOrthographyId}
            onChange={(e) => picker.setSourceOrthographyId(e.target.value)}
            aria-label={messages.sourceOrthographyLabel}
          >
            {groupedSourceOrthographies.map((group) => (
              <optgroup key={group.key} label={getOrthographyCatalogGroupLabel(locale, group.key)}>
                {group.orthographies.map((orthography) => (
                  <option key={orthography.id} value={orthography.id}>
                    {formatOrthographyOptionLabel(orthography)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>,
          compact,
          'source-orthography',
        )}

        {picker.createMode !== 'ipa' && picker.sourceOrthographies.length === 0 && (
          <p className="orthography-builder-hint" key="source-hint">{messages.sourceOrthographyHint}</p>
        )}

        {renderField(
          messages.nameZhLabel,
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftNameZh}
            onChange={(e) => picker.setDraftNameZh(e.target.value)}
            placeholder={compact ? messages.nameZhCompactPlaceholder : resolvedNameZhPlaceholder}
            aria-label={messages.nameZhLabel}
          />,
          compact,
          'name-zh',
        )}

        {renderField(
          messages.nameEnLabel,
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftNameEn}
            onChange={(e) => picker.setDraftNameEn(e.target.value)}
            placeholder={compact ? messages.nameEnCompactPlaceholder : resolvedNameEnPlaceholder}
            aria-label={messages.nameEnLabel}
          />,
          compact,
          'name-en',
        )}

        {renderField(
          messages.abbreviationLabel,
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftAbbreviation}
            onChange={(e) => picker.setDraftAbbreviation(e.target.value)}
            placeholder={messages.abbreviationPlaceholder}
            aria-label={messages.abbreviationLabel}
          />,
          compact,
          'abbr',
        )}

        {renderField(
          messages.scriptTagLabel,
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftScriptTag}
            onChange={(e) => picker.setDraftScriptTag(e.target.value)}
            placeholder={messages.scriptTagPlaceholder}
            aria-label={messages.scriptTagLabel}
          />,
          compact,
          'script',
        )}

        {renderField(
          messages.typeLabel,
          <select
            className={fieldClassName}
            value={picker.draftType}
            onChange={(e) => picker.setDraftType(e.target.value as 'phonemic' | 'phonetic' | 'practical' | 'historical' | 'other')}
            aria-label={messages.typeLabel}
          >
            <option value="phonemic">{messages.typePhonemic}</option>
            <option value="phonetic">{messages.typePhonetic}</option>
            <option value="practical">{messages.typePractical}</option>
            <option value="historical">{messages.typeHistorical}</option>
            <option value="other">{messages.typeOther}</option>
          </select>,
          compact,
          'type',
        )}
      </div>

      {picker.draftRenderPolicy && (
        <div className="orthography-builder-preview-box orthography-builder-render-preview">
          <span className="orthography-builder-rule-label">{messages.renderPreviewTitle}</span>
          <div className="orthography-builder-render-preview-meta">
            <span>{messages.scriptLabel}{picker.draftRenderPolicy.scriptTag}</span>
            <span>{messages.directionLabel}{picker.draftRenderPolicy.textDirection.toUpperCase()}</span>
            <span>
              {messages.fontCoverageLabel}{picker.draftRenderPolicy.coverageSummary.confidence === 'sample-backed'
                ? messages.fontCoverageSample(picker.draftRenderPolicy.coverageSummary.exemplarCharacterCount)
                : messages.fontCoverageMissingSample}
            </span>
          </div>
          <div className="orthography-builder-render-preview-meta">
            <span>{messages.finalFontStackLabel}{picker.draftRenderPolicy.resolvedFontKeys.join(' -> ')}</span>
          </div>
          {fontVerificationLabel && (
            <div className="orthography-builder-render-preview-meta">
              <span>{messages.defaultFontVerificationLabel}{picker.draftRenderPolicy.defaultFontKey} · {fontVerificationLabel}</span>
            </div>
          )}
          {picker.draftRenderPolicy.coverageSummary.warning && (
            <div className="orthography-builder-render-preview-warning">
              {picker.draftRenderPolicy.coverageSummary.warning}
            </div>
          )}
          <div
            className="orthography-builder-render-preview-sample"
            style={{
              fontFamily: picker.draftRenderPolicy.defaultFontCss,
              direction: picker.draftRenderPolicy.textDirection,
              unicodeBidi: picker.draftRenderPolicy.isolateInlineRuns ? 'isolate' : 'normal',
            }}
            {...(picker.draftRenderPolicy.preferDirAttribute ? { dir: picker.draftRenderPolicy.textDirection } : {})}
          >
            {picker.draftRenderPreviewText}
          </div>
        </div>
      )}

      {picker.draftRenderWarnings.length > 0 && (
        <div className="orthography-builder-validation-box orthography-builder-validation-box-warn">
          <span className="orthography-builder-rule-label">{messages.createRiskTitle}</span>
          <ul className="orthography-builder-validation-list">
            {picker.draftRenderWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <div className="orthography-builder-warning-actions">
            <span className="orthography-builder-warning-note">
              {picker.requiresRenderWarningConfirmation
                ? messages.createRiskFirstConfirm
                : messages.createRiskAlreadyConfirmed}
            </span>
            {picker.requiresRenderWarningConfirmation && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={picker.acknowledgeRenderWarnings}
              >
                {messages.confirmRiskButton}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="orthography-builder-section-toggle-row">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => picker.setShowAdvancedFields(!picker.showAdvancedFields)}
        >
          {picker.showAdvancedFields ? messages.collapseAdvanced : messages.expandAdvanced}
        </button>
      </div>

      {picker.showAdvancedFields && (
        <div className="orthography-builder-advanced-grid">
          {renderField(
            messages.advancedLocaleLabel,
            <input className={fieldClassName} type="text" value={picker.draftLocaleTag} onChange={(e) => picker.setDraftLocaleTag(e.target.value)} placeholder={messages.localePlaceholder} aria-label={messages.advancedLocaleLabel} />,
            compact,
            'locale',
          )}
          {renderField(
            messages.advancedRegionLabel,
            <input className={fieldClassName} type="text" value={picker.draftRegionTag} onChange={(e) => picker.setDraftRegionTag(e.target.value)} placeholder={messages.regionPlaceholder} aria-label={messages.advancedRegionLabel} />,
            compact,
            'region',
          )}
          {renderField(
            messages.advancedVariantLabel,
            <input className={fieldClassName} type="text" value={picker.draftVariantTag} onChange={(e) => picker.setDraftVariantTag(e.target.value)} placeholder={messages.variantPlaceholder} aria-label={messages.advancedVariantLabel} />,
            compact,
            'variant',
          )}
          {renderField(
            messages.advancedDirectionLabel,
            <select className={fieldClassName} value={picker.draftDirection} onChange={(e) => picker.setDraftDirection(e.target.value as 'ltr' | 'rtl')} aria-label={messages.advancedDirectionLabel}>
              <option value="ltr">{messages.advancedDirectionLtr}</option>
              <option value="rtl">{messages.advancedDirectionRtl}</option>
            </select>,
            compact,
            'direction',
          )}
          {renderField(
            messages.exemplarLabel,
            <input className={fieldClassName} type="text" value={picker.draftExemplarMain} onChange={(e) => picker.setDraftExemplarMain(e.target.value)} placeholder={messages.exemplarPlaceholder} aria-label={messages.exemplarLabel} />,
            compact,
            'exemplar',
          )}
          {renderField(
            messages.primaryFontLabel,
            <input className={fieldClassName} type="text" value={picker.draftPrimaryFonts} onChange={(e) => picker.setDraftPrimaryFonts(e.target.value)} placeholder={messages.primaryFontPlaceholder} aria-label={messages.primaryFontLabel} />,
            compact,
            'primary-fonts',
          )}
          {renderField(
            messages.fallbackFontLabel,
            <input className={fieldClassName} type="text" value={picker.draftFallbackFonts} onChange={(e) => picker.setDraftFallbackFonts(e.target.value)} placeholder={messages.fallbackFontPlaceholder} aria-label={messages.fallbackFontLabel} />,
            compact,
            'fallback-fonts',
          )}
          <label className="orthography-builder-checkbox">
            <input type="checkbox" checked={picker.draftBidiIsolate} onChange={(e) => picker.setDraftBidiIsolate(e.target.checked)} />
            <span>{messages.bidiIsolationLabel}</span>
          </label>
          <label className="orthography-builder-checkbox">
            <input type="checkbox" checked={picker.draftPreferDirAttribute} onChange={(e) => picker.setDraftPreferDirAttribute(e.target.checked)} />
            <span>{messages.preferDirLabel}</span>
          </label>
        </div>
      )}

      {picker.canConfigureBridge && (
        <div className="orthography-builder-bridge-panel">
          <label className="orthography-builder-checkbox">
            <input type="checkbox" checked={picker.bridgeEnabled} onChange={(e) => picker.setBridgeEnabled(e.target.checked)} />
            <span>{messages.bridgeEnabledLabel}</span>
          </label>

          {picker.bridgeEnabled && (
            <div className="orthography-builder-bridge-grid">
              {renderField(
                messages.bridgeEngineLabel,
                <select className={fieldClassName} value={picker.draftBridgeEngine} onChange={(e) => picker.setDraftBridgeEngine(e.target.value as 'table-map' | 'icu-rule' | 'manual')} aria-label={messages.bridgeEngineLabel}>
                  <option value="table-map">{messages.bridgeEngineTableMap}</option>
                  <option value="icu-rule">{messages.bridgeEngineIcuRule}</option>
                  <option value="manual">{messages.bridgeEngineManual}</option>
                </select>,
                compact,
                'bridge-engine',
              )}
              {renderField(
                messages.bridgeInputPreviewLabel,
                <input className={fieldClassName} type="text" value={picker.draftBridgeSampleInput} onChange={(e) => picker.setDraftBridgeSampleInput(e.target.value)} placeholder={messages.bridgeInputPreviewPlaceholder} aria-label={messages.bridgeInputPreviewLabel} />,
                compact,
                'bridge-sample',
              )}
              <label className="orthography-builder-checkbox">
                <input type="checkbox" checked={picker.draftBridgeIsReversible} onChange={(e) => picker.setDraftBridgeIsReversible(e.target.checked)} />
                <span>{messages.bridgeReversibleLabel}</span>
              </label>
              <div className="orthography-builder-rule-block">
                <span className="orthography-builder-rule-label">{messages.bridgeRuleTextLabel}</span>
                <textarea
                  className="input orthography-builder-rule-textarea"
                  value={picker.draftBridgeRuleText}
                  onChange={(e) => picker.setDraftBridgeRuleText(e.target.value)}
                  placeholder={bridgeRulePlaceholder}
                  aria-label={messages.bridgeRuleTextLabel}
                  rows={compact ? 5 : 6}
                />
              </div>
              <div className="orthography-builder-preview-box orthography-builder-bridge-hint-box">
                <span className="orthography-builder-rule-label">{messages.bridgeRuleSyntaxTitle}</span>
                <span>{bridgeSyntaxHint}</span>
              </div>
              <div className="orthography-builder-rule-block">
                <span className="orthography-builder-rule-label">{messages.bridgeSampleCaseLabel}</span>
                <textarea
                  className="input orthography-builder-rule-textarea"
                  value={picker.draftBridgeSampleCasesText}
                  onChange={(e) => picker.setDraftBridgeSampleCasesText(e.target.value)}
                  placeholder={messages.bridgeSampleCasePlaceholder}
                  aria-label={messages.bridgeSampleCaseLabel}
                  rows={compact ? 4 : 5}
                />
              </div>
              {picker.bridgeValidationIssues.length > 0 && (
                <div className="orthography-builder-validation-box orthography-builder-validation-box-error">
                  <span className="orthography-builder-rule-label">{messages.bridgeValidationTitle}</span>
                  <ul className="orthography-builder-validation-list">
                    {picker.bridgeValidationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {picker.bridgePreviewOutput && (
                <div className="orthography-builder-preview-box">
                  <span className="orthography-builder-rule-label">{messages.bridgePreviewOutputTitle}</span>
                  <code>{picker.bridgePreviewOutput}</code>
                </div>
              )}
              {picker.bridgeSampleCaseResults.length > 0 && (
                <div className="orthography-builder-validation-box orthography-builder-validation-box-neutral">
                  <span className="orthography-builder-rule-label">{messages.bridgeSampleResultTitle}</span>
                  <ul className="orthography-builder-validation-list">
                    {picker.bridgeSampleCaseResults.map((sampleCase, index) => {
                      const status = sampleCase.matchesExpectation === false
                        ? messages.sampleStatusFail
                        : sampleCase.matchesExpectation === true
                        ? messages.sampleStatusPass
                        : messages.sampleStatusPreview;
                      return (
                        <li key={`${sampleCase.input}-${sampleCase.expectedOutput ?? ''}-${index}`}>
                          <strong>{status}</strong>
                          <span>{sampleCase.input} → {sampleCase.actualOutput}</span>
                          {sampleCase.expectedOutput !== undefined && (
                            <span>{messages.sampleExpected}{sampleCase.expectedOutput}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {picker.error && (
        compact
          ? (
            <div className="layer-create-feedback-stack">
              <p className="layer-create-feedback layer-create-feedback-error">{picker.error}</p>
            </div>
          )
          : <p className="error">{picker.error}</p>
      )}

      <div className="orthography-builder-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={picker.submitting}
          onClick={picker.cancelCreate}
        >
          {messages.cancelCreate}
        </button>
        <button
          type="button"
          className="btn"
          disabled={picker.submitting}
          onClick={() => {
            void picker.createOrthography();
          }}
        >
          {picker.submitting ? messages.creating : picker.requiresRenderWarningConfirmation ? messages.confirmRiskAndCreate : messages.createAndSelect}
        </button>
      </div>
    </div>
  );

  if (compact) {
    return content;
  }

  return (
    <EmbeddedPanelShell
      className="orthography-builder-panel-shell"
      bodyClassName="orthography-builder-panel-shell-body"
      title={messages.panelTitle}
    >
      {content}
    </EmbeddedPanelShell>
  );
}
