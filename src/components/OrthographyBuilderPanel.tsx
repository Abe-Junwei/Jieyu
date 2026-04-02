import { useEffect, useState, type ReactNode } from 'react';
import { formatOrthographyOptionLabel, type UseOrthographyPickerResult } from '../hooks/useOrthographyPicker';
import { useLocale } from '../i18n';
import { getOrthographyBuilderMessages } from '../i18n/orthographyBuilderMessages';
import {
  describeFontVerificationStatus,
  getCachedFontCoverageVerification,
  verifyFontCoverage,
  type FontCoverageVerification,
} from '../utils/layerDisplayStyle';

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
  const fieldClassName = compact ? 'input transcription-side-pane-action-input' : 'input';
  const containerClassName = compact
    ? 'orthography-builder-panel orthography-builder-panel-compact'
    : 'orthography-builder-panel';
  const gridClassName = compact ? 'orthography-builder-grid orthography-builder-grid-compact' : 'orthography-builder-grid';
  const [fontVerification, setFontVerification] = useState<FontCoverageVerification | null>(null);

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

  return (
    <div className={containerClassName}>
      <div className={gridClassName}>
        {renderField(
          messages.createModeLabel,
          <select
            className={fieldClassName}
            value={picker.createMode}
            onChange={(e) => picker.setCreateMode(e.target.value as 'ipa' | 'copy-current' | 'derive-other')}
          >
            <option value="ipa">{messages.createModeIpa}</option>
            <option value="copy-current">{messages.createModeCopyCurrent}</option>
            <option value="derive-other">{messages.createModeDeriveOther}</option>
          </select>,
          compact,
          'create-mode',
        )}

        {picker.createMode === 'derive-other' && renderField(
          messages.sourceLanguageLabel,
          <select
            className={fieldClassName}
            value={picker.sourceLanguageId}
            onChange={(e) => picker.setSourceLanguageId(e.target.value)}
          >
            <option value="">{compact ? messages.sourceLanguageCompactPlaceholder : resolvedSourceLanguagePlaceholder}</option>
            {languageOptions.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label} ({lang.code})</option>
            ))}
            <option value="__custom__">{messages.sourceLanguageCustom}</option>
          </select>,
          compact,
          'source-language',
        )}

        {picker.createMode === 'derive-other' && picker.sourceLanguageId === '__custom__' && renderField(
          messages.sourceLanguageCodeLabel,
          <input
            className={fieldClassName}
            type="text"
            maxLength={8}
            value={picker.sourceCustomLanguageId}
            onChange={(e) => picker.setSourceCustomLanguageId(e.target.value)}
            placeholder={resolvedSourceLanguageCodePlaceholder}
          />,
          compact,
          'source-language-code',
        )}

        {picker.createMode !== 'ipa' && picker.sourceOrthographies.length > 0 && renderField(
          messages.sourceOrthographyLabel,
          <select
            className={fieldClassName}
            value={picker.sourceOrthographyId}
            onChange={(e) => picker.setSourceOrthographyId(e.target.value)}
          >
            {picker.sourceOrthographies.map((orthography) => (
              <option key={orthography.id} value={orthography.id}>
                {formatOrthographyOptionLabel(orthography)}
              </option>
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
                className="btn btn-ghost btn-sm"
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
          className="btn btn-ghost btn-sm"
          onClick={() => picker.setShowAdvancedFields(!picker.showAdvancedFields)}
        >
          {picker.showAdvancedFields ? messages.collapseAdvanced : messages.expandAdvanced}
        </button>
      </div>

      {picker.showAdvancedFields && (
        <div className="orthography-builder-advanced-grid">
          {renderField(
            messages.advancedLocaleLabel,
            <input className={fieldClassName} type="text" value={picker.draftLocaleTag} onChange={(e) => picker.setDraftLocaleTag(e.target.value)} placeholder={messages.localePlaceholder} />,
            compact,
            'locale',
          )}
          {renderField(
            messages.advancedRegionLabel,
            <input className={fieldClassName} type="text" value={picker.draftRegionTag} onChange={(e) => picker.setDraftRegionTag(e.target.value)} placeholder={messages.regionPlaceholder} />,
            compact,
            'region',
          )}
          {renderField(
            messages.advancedVariantLabel,
            <input className={fieldClassName} type="text" value={picker.draftVariantTag} onChange={(e) => picker.setDraftVariantTag(e.target.value)} placeholder={messages.variantPlaceholder} />,
            compact,
            'variant',
          )}
          {renderField(
            messages.advancedDirectionLabel,
            <select className={fieldClassName} value={picker.draftDirection} onChange={(e) => picker.setDraftDirection(e.target.value as 'ltr' | 'rtl')}>
              <option value="ltr">{messages.advancedDirectionLtr}</option>
              <option value="rtl">{messages.advancedDirectionRtl}</option>
            </select>,
            compact,
            'direction',
          )}
          {renderField(
            messages.exemplarLabel,
            <input className={fieldClassName} type="text" value={picker.draftExemplarMain} onChange={(e) => picker.setDraftExemplarMain(e.target.value)} placeholder={messages.exemplarPlaceholder} />,
            compact,
            'exemplar',
          )}
          {renderField(
            messages.primaryFontLabel,
            <input className={fieldClassName} type="text" value={picker.draftPrimaryFonts} onChange={(e) => picker.setDraftPrimaryFonts(e.target.value)} placeholder={messages.primaryFontPlaceholder} />,
            compact,
            'primary-fonts',
          )}
          {renderField(
            messages.fallbackFontLabel,
            <input className={fieldClassName} type="text" value={picker.draftFallbackFonts} onChange={(e) => picker.setDraftFallbackFonts(e.target.value)} placeholder={messages.fallbackFontPlaceholder} />,
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

      {picker.canConfigureTransform && (
        <div className="orthography-builder-transform-panel">
          <label className="orthography-builder-checkbox">
            <input type="checkbox" checked={picker.transformEnabled} onChange={(e) => picker.setTransformEnabled(e.target.checked)} />
            <span>{messages.transformEnabledLabel}</span>
          </label>

          {picker.transformEnabled && (
            <div className="orthography-builder-transform-grid">
              {renderField(
                messages.transformEngineLabel,
                <select className={fieldClassName} value={picker.draftTransformEngine} onChange={(e) => picker.setDraftTransformEngine(e.target.value as 'table-map' | 'icu-rule' | 'manual')}>
                  <option value="table-map">{messages.transformEngineTableMap}</option>
                  <option value="icu-rule">{messages.transformEngineIcuRule}</option>
                  <option value="manual">{messages.transformEngineManual}</option>
                </select>,
                compact,
                'transform-engine',
              )}
              {renderField(
                messages.transformInputPreviewLabel,
                <input className={fieldClassName} type="text" value={picker.draftTransformSampleInput} onChange={(e) => picker.setDraftTransformSampleInput(e.target.value)} placeholder={messages.transformInputPreviewPlaceholder} />,
                compact,
                'transform-sample',
              )}
              <label className="orthography-builder-checkbox">
                <input type="checkbox" checked={picker.draftTransformIsReversible} onChange={(e) => picker.setDraftTransformIsReversible(e.target.checked)} />
                <span>{messages.transformReversibleLabel}</span>
              </label>
              <div className="orthography-builder-rule-block">
                <span className="orthography-builder-rule-label">{messages.transformRuleTextLabel}</span>
                <textarea
                  className="input orthography-builder-rule-textarea"
                  value={picker.draftTransformRuleText}
                  onChange={(e) => picker.setDraftTransformRuleText(e.target.value)}
                  placeholder={messages.transformRuleTextPlaceholder}
                  rows={compact ? 5 : 6}
                />
              </div>
              <div className="orthography-builder-rule-block">
                <span className="orthography-builder-rule-label">{messages.transformSampleCaseLabel}</span>
                <textarea
                  className="input orthography-builder-rule-textarea"
                  value={picker.draftTransformSampleCasesText}
                  onChange={(e) => picker.setDraftTransformSampleCasesText(e.target.value)}
                  placeholder={messages.transformSampleCasePlaceholder}
                  rows={compact ? 4 : 5}
                />
              </div>
              {picker.transformValidationIssues.length > 0 && (
                <div className="orthography-builder-validation-box orthography-builder-validation-box-error">
                  <span className="orthography-builder-rule-label">{messages.transformValidationTitle}</span>
                  <ul className="orthography-builder-validation-list">
                    {picker.transformValidationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {picker.transformPreviewOutput && (
                <div className="orthography-builder-preview-box">
                  <span className="orthography-builder-rule-label">{messages.transformPreviewOutputTitle}</span>
                  <code>{picker.transformPreviewOutput}</code>
                </div>
              )}
              {picker.transformSampleCaseResults.length > 0 && (
                <div className="orthography-builder-validation-box orthography-builder-validation-box-neutral">
                  <span className="orthography-builder-rule-label">{messages.transformSampleResultTitle}</span>
                  <ul className="orthography-builder-validation-list">
                    {picker.transformSampleCaseResults.map((sampleCase, index) => {
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

      <div className={compact ? 'transcription-side-pane-action-row' : 'orthography-builder-actions'}>
        <button
          type="button"
          className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'}
          disabled={picker.submitting}
          onClick={picker.cancelCreate}
        >
          {messages.cancelCreate}
        </button>
        <button
          type="button"
          className={compact ? 'btn btn-sm' : 'btn'}
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
}
