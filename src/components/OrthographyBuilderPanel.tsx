import { useEffect, useRef, useState, type ReactNode } from 'react';
import '../styles/components/orthography-builder.css';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { formatOrthographyOptionLabel, groupOrthographiesForSelect, type UseOrthographyPickerResult } from '../hooks/useOrthographyPicker';
import { useLocale } from '../i18n';
import {
  getOrthographyBuilderMessages,
  getOrthographyCatalogGroupLabel,
  getOrthographyBridgeRulePlaceholder,
  getOrthographyBridgeSyntaxHint,
} from '../i18n/orthographyBuilderMessages';
import { EmbeddedPanelShell } from './ui/EmbeddedPanelShell';
import { PanelFeedback, PanelFeedbackStack } from './ui';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import { ScriptTagCombobox } from './ScriptTagCombobox';
import {
  describeFontVerificationStatus,
  getCachedFontCoverageVerification,
  verifyFontCoverage,
  type FontCoverageVerification,
} from '../utils/layerDisplayStyle';
import {
  normalizeLanguageInputAssetId,
  resolveLanguageHostSelection,
  syncLanguageInputWithExternalCode,
} from '../utils/languageInputHostState';

type LanguageOption = {
  code: string;
  label: string;
};

type OrthographyBuilderPanelProps = {
  picker: UseOrthographyPickerResult;
  languageOptions: readonly LanguageOption[];
  compact?: boolean;
  /** 隐藏底部操作按钮（由父级 footer 接管） | Hide bottom action buttons (parent footer takes over) */
  hideActions?: boolean;
  sourceLanguagePlaceholder?: string;
  sourceLanguageCodePlaceholder?: string;
  nameZhPlaceholder?: string;
  nameEnPlaceholder?: string;
  contextLines?: string[];
};

function renderGroup(title: string, children: ReactNode, key: string, description?: string, className?: string) {
  return (
    <section key={key} className={`orthography-builder-group${className ? ` ${className}` : ''}`}>
      <div className="orthography-builder-group-header">
        <h3 className="panel-title-primary orthography-builder-group-title">{title}</h3>
        {description ? <p className="orthography-builder-group-description">{description}</p> : null}
      </div>
      <div className="orthography-builder-group-body">{children}</div>
    </section>
  );
}

function renderField(label: string, control: ReactNode, compact: boolean, key: string) {
  if (compact) {
    return (
      <div key={key} className="orthography-builder-field-shell orthography-builder-field-shell-compact">
        <span className="orthography-builder-field-label">{label}</span>
        {control}
      </div>
    );
  }
  return (
    <label key={key} className="dialog-field orthography-builder-field-shell">
      <span>{label}</span>
      {control}
    </label>
  );
}

export function OrthographyBuilderPanel({
  picker,
  languageOptions,
  compact = false,
  hideActions = false,
  sourceLanguagePlaceholder,
  sourceLanguageCodePlaceholder,
  nameZhPlaceholder,
  nameEnPlaceholder,
  contextLines,
}: OrthographyBuilderPanelProps) {
  const locale = useLocale();
  const { resolveLanguageCode, resolveLanguageDisplayName } = useLanguageCatalogLabelMap(locale);
  const messages = getOrthographyBuilderMessages(locale);
  const resolvedSourceLanguagePlaceholder = sourceLanguagePlaceholder ?? messages.sourceLanguagePlaceholder;
  const resolvedSourceLanguageCodePlaceholder = sourceLanguageCodePlaceholder ?? messages.sourceLanguageCodePlaceholder;
  const resolvedNameZhPlaceholder = nameZhPlaceholder ?? messages.nameZhPlaceholder;
  const resolvedNameEnPlaceholder = nameEnPlaceholder ?? messages.nameEnPlaceholder;
  const fieldClassName = compact
    ? 'input orthography-builder-control orthography-builder-control-compact'
    : 'input orthography-builder-control';
  const ghostButtonClassName = 'btn orthography-builder-btn orthography-builder-btn-ghost';
  const primaryButtonClassName = 'btn orthography-builder-btn orthography-builder-btn-primary';
  const containerClassName = compact
    ? 'orthography-builder-panel orthography-builder-panel-compact'
    : 'orthography-builder-panel';
  const showAdvancedFields = compact ? picker.showAdvancedFields : true;
  const [fontVerification, setFontVerification] = useState<FontCoverageVerification | null>(null);
  const [sourceLanguageInput, setSourceLanguageInput] = useState<LanguageIsoInputValue>({
    languageName: '',
    languageCode: '',
  });
  const [bridgeChecksExpanded, setBridgeChecksExpanded] = useState(false);
  const groupedSourceOrthographies = groupOrthographiesForSelect(picker.sourceOrthographies);
  const bridgeRulePlaceholder = getOrthographyBridgeRulePlaceholder(messages, picker.draftBridgeEngine);
  const bridgeSyntaxHint = getOrthographyBridgeSyntaxHint(messages, picker.draftBridgeEngine);
  const resolvedSourceLanguageCode = picker.sourceLanguageId === '__custom__'
    ? picker.sourceCustomLanguageId
    : picker.sourceLanguageId;
  const normalizedResolvedSourceLanguageCode = resolvedSourceLanguageCode.trim().toLowerCase();
  const showBridgeSection = picker.canConfigureBridge && (!compact || picker.createMode === 'derive-other');
  const lastSyncedSourceLanguageCodeRef = useRef(normalizedResolvedSourceLanguageCode);
  const lastSyncedLocaleRef = useRef(locale);
  const hasSyncedSourceLanguageInputRef = useRef(false);

  useEffect(() => {
    const initialSyncNeeded = !hasSyncedSourceLanguageInputRef.current;
    const localeChanged = locale !== lastSyncedLocaleRef.current;
    const externalCodeChanged = normalizedResolvedSourceLanguageCode !== lastSyncedSourceLanguageCodeRef.current;
    if (!initialSyncNeeded && !externalCodeChanged && !localeChanged) {
      return;
    }

    hasSyncedSourceLanguageInputRef.current = true;
    lastSyncedLocaleRef.current = locale;
    lastSyncedSourceLanguageCodeRef.current = normalizedResolvedSourceLanguageCode;
    setSourceLanguageInput((prev) => {
      const next = syncLanguageInputWithExternalCode(prev, normalizedResolvedSourceLanguageCode, locale, resolveLanguageDisplayName, resolveLanguageCode);
      if (
        prev.languageName === next.languageName
        && prev.languageCode === next.languageCode
        && prev.languageAssetId === next.languageAssetId
      ) {
        return prev;
      }
      return next;
    });
  }, [locale, normalizedResolvedSourceLanguageCode, resolveLanguageCode, resolveLanguageDisplayName]);

  const handleSourceLanguageInputChange = (nextValue: LanguageIsoInputValue) => {
    setSourceLanguageInput(nextValue);
    picker.setSourceOrthographyId('');
    const hostSelection = resolveLanguageHostSelection(normalizeLanguageInputAssetId(nextValue), languageOptions);
    picker.setSourceLanguageId(hostSelection.languageId);
    picker.setSourceCustomLanguageId(hostSelection.customLanguageId);
  };

  const handleSourceLanguageAssetIdChange = (nextAssetId: string) => {
    const normalizedAssetId = nextAssetId.trim().toLowerCase();
    setSourceLanguageInput((prev) => ({
      ...prev,
      languageAssetId: normalizedAssetId,
    }));
    picker.setSourceOrthographyId('');
    const hostSelection = resolveLanguageHostSelection(normalizedAssetId, languageOptions);
    picker.setSourceLanguageId(hostSelection.languageId);
    picker.setSourceCustomLanguageId(hostSelection.customLanguageId);
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
  const hasBridgeChecks = picker.draftBridgeSampleCasesText.trim().length > 0 || picker.bridgeSampleCaseResults.length > 0;

  useEffect(() => {
    if (hasBridgeChecks) {
      setBridgeChecksExpanded(true);
    }
  }, [hasBridgeChecks]);

  const showBridgeChecks = bridgeChecksExpanded || hasBridgeChecks;
  const renderCoverageSummary = picker.draftRenderPolicy
    ? picker.draftRenderPolicy.coverageSummary.confidence === 'sample-backed'
      ? messages.fontCoverageSample(picker.draftRenderPolicy.coverageSummary.exemplarCharacterCount)
      : messages.fontCoverageMissingSample
    : null;
  const renderSummary = picker.draftRenderPolicy
    ? `${messages.scriptLabel}${picker.draftRenderPolicy.scriptTag} / ${messages.directionLabel}${picker.draftRenderPolicy.textDirection.toUpperCase()} / ${messages.fontCoverageLabel}${renderCoverageSummary}`
    : null;
  const identitySummary = [picker.draftNameZh, picker.draftScriptTag, picker.draftType].filter(Boolean).join(' / ') || null;
  const bridgeSummary = picker.canConfigureBridge && picker.bridgeEnabled
    ? `${messages.bridgeEngineLabel}${picker.draftBridgeEngine} / ${messages.bridgeReversibleLabel}${picker.draftBridgeIsReversible ? '✓' : '—'}`
    : null;
  const renderPreview = picker.draftRenderPolicy ? (
    <div className="orthography-builder-preview-box orthography-builder-render-preview">
      <span className="orthography-builder-rule-label">{messages.renderPreviewTitle}</span>
      <div className="orthography-builder-render-preview-meta">
        <span>{messages.scriptLabel}{picker.draftRenderPolicy.scriptTag}</span>
        <span>{messages.directionLabel}{picker.draftRenderPolicy.textDirection.toUpperCase()}</span>
        <span>
          {messages.fontCoverageLabel}{renderCoverageSummary}
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
  ) : null;

  const renderWarnings = picker.draftRenderWarnings.length > 0 ? (
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
            className={ghostButtonClassName}
            onClick={picker.acknowledgeRenderWarnings}
          >
            {messages.confirmRiskButton}
          </button>
        )}
      </div>
    </div>
  ) : null;

  const bridgeAdvancedContent = showBridgeSection && picker.bridgeEnabled && (!compact || showAdvancedFields) ? (
    <>
      <div className="orthography-builder-render-row">
        <label className="orthography-builder-checkbox orthography-builder-bridge-toggle">
          <input type="checkbox" checked={picker.draftBridgeIsReversible} onChange={(e) => picker.setDraftBridgeIsReversible(e.target.checked)} />
          <span>{messages.bridgeReversibleLabel}</span>
        </label>
        {renderField(
          messages.bridgeInputPreviewLabel,
          <input className={fieldClassName} type="text" value={picker.draftBridgeSampleInput} onChange={(e) => picker.setDraftBridgeSampleInput(e.target.value)} placeholder={messages.bridgeInputPreviewPlaceholder} aria-label={messages.bridgeInputPreviewLabel} />,
          compact,
          'bridge-sample',
        )}
      </div>

      <div className="orthography-builder-helper-text">
        <strong>{messages.bridgeRuleSyntaxTitle}</strong>
        <span>{bridgeSyntaxHint}</span>
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
      <div className="orthography-builder-bridge-group orthography-builder-bridge-group-secondary">
        <button
          type="button"
          className={ghostButtonClassName}
          onClick={() => setBridgeChecksExpanded((prev) => !prev)}
        >
          {showBridgeChecks ? messages.collapseBridgeChecks : messages.expandBridgeChecks}
        </button>
        {showBridgeChecks && (
          <div className="orthography-builder-rule-block">
            <span className="orthography-builder-rule-label">{messages.bridgeSampleCaseLabel}</span>
            <div className="orthography-builder-helper-text">
              <span>{messages.bridgeSampleCaseDescription}</span>
            </div>
            <textarea
              className="input orthography-builder-control orthography-builder-rule-textarea"
              value={picker.draftBridgeSampleCasesText}
              onChange={(e) => picker.setDraftBridgeSampleCasesText(e.target.value)}
              placeholder={messages.bridgeSampleCasePlaceholder}
              aria-label={messages.bridgeSampleCaseLabel}
              rows={compact ? 4 : 5}
            />
          </div>
        )}
        {showBridgeChecks && picker.bridgeSampleCaseResults.length > 0 && (
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
    </>
  ) : null;

  const handleCreate = async () => {
    await picker.createOrthography();
  };

  const advancedFields = showAdvancedFields ? (
    <div className="orthography-builder-advanced-stack orthography-builder-advanced-panel">
      <div className="orthography-builder-render-row">
        {renderField(
          messages.advancedLocaleLabel,
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftLocaleTag}
            onChange={(e) => picker.setDraftLocaleTag(e.target.value)}
            placeholder={messages.localePlaceholder}
            aria-label={messages.advancedLocaleLabel}
          />,
          compact,
          'locale-tag',
        )}
        {renderField(
          messages.advancedRegionLabel,
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftRegionTag}
            onChange={(e) => picker.setDraftRegionTag(e.target.value)}
            placeholder={messages.regionPlaceholder}
            aria-label={messages.advancedRegionLabel}
          />,
          compact,
          'region-tag',
        )}
      </div>
      {renderField(
        messages.advancedVariantLabel,
        <input
          className={fieldClassName}
          type="text"
          value={picker.draftVariantTag}
          onChange={(e) => picker.setDraftVariantTag(e.target.value)}
          placeholder={messages.variantPlaceholder}
          aria-label={messages.advancedVariantLabel}
        />,
        compact,
        'variant-tag',
      )}

      <div className="orthography-builder-checkbox-grid">
        <label className="orthography-builder-checkbox">
          <input type="checkbox" checked={picker.draftBidiIsolate} onChange={(e) => picker.setDraftBidiIsolate(e.target.checked)} />
          <span>{messages.bidiIsolationLabel}</span>
        </label>
        <label className="orthography-builder-checkbox">
          <input type="checkbox" checked={picker.draftPreferDirAttribute} onChange={(e) => picker.setDraftPreferDirAttribute(e.target.checked)} />
          <span>{messages.preferDirLabel}</span>
        </label>
      </div>

      {!compact ? renderPreview : null}

      {!compact ? renderWarnings : null}
    </div>
  ) : null;

  const content = (
    <div className={containerClassName}>
      {!compact && contextLines && contextLines.length > 0 ? (
        <div className="orthography-builder-top-notes">
          <div className="orthography-builder-top-note orthography-builder-context-box">
            <span className="orthography-builder-rule-label">{messages.contextTitle}</span>
            <ul className="orthography-builder-context-list">
              {contextLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {renderGroup(
        messages.createModeSectionTitle,
        <div className="orthography-builder-grid orthography-builder-grid-compact">
          <select
            className={fieldClassName}
            value={picker.createMode}
            onChange={(e) => picker.setCreateMode(e.target.value as 'ipa' | 'copy-current' | 'derive-other')}
            aria-label={messages.createModeLabel}
          >
            <option value="ipa">{messages.createModeIpa}</option>
            <option value="copy-current">{messages.createModeCopyCurrent}</option>
            <option value="derive-other">{messages.createModeDeriveOther}</option>
          </select>
        </div>,
        'create-mode',
        undefined,
        compact ? 'orthography-builder-group-create-mode' : undefined,
      )}

      {picker.createMode !== 'ipa' && (() => {
        const sourceFields = (
          <div className="orthography-builder-source-stack">
            {picker.createMode === 'derive-other' && (
              <div className="orthography-builder-language-field" key="source-language-input">
                <LanguageIsoInput
                  className="orthography-builder-language-input"
                  locale={locale}
                  value={sourceLanguageInput}
                  onChange={handleSourceLanguageInputChange}
                  resolveLanguageDisplayName={resolveLanguageDisplayName}
                  nameLabel={messages.sourceLanguageLabel}
                  codeLabel={messages.sourceLanguageCodeLabel}
                  namePlaceholder={compact ? messages.sourceLanguageCompactPlaceholder : resolvedSourceLanguagePlaceholder}
                  codePlaceholder={resolvedSourceLanguageCodePlaceholder}
                />
                {renderField(
                  messages.sourceLanguageAssetIdLabel,
                  <input
                    className={fieldClassName}
                    type="text"
                    value={sourceLanguageInput.languageAssetId ?? ''}
                    onChange={(e) => handleSourceLanguageAssetIdChange(e.target.value)}
                    placeholder={messages.sourceLanguageAssetIdPlaceholder}
                    aria-label={messages.sourceLanguageAssetIdLabel}
                  />,
                  compact,
                  'source-language-asset-id',
                )}
              </div>
            )}

            {picker.sourceOrthographies.length > 0 && renderField(
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
                        {formatOrthographyOptionLabel(orthography, locale)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>,
              compact,
              'source-orthography',
            )}

            {picker.sourceOrthographies.length === 0 && (
              <p className="orthography-builder-hint" key="source-hint">{messages.sourceOrthographyHint}</p>
            )}
          </div>
        );

        if (compact && picker.createMode === 'copy-current') {
          return sourceFields;
        }

        return renderGroup(
          messages.sourceSectionTitle,
          sourceFields,
          'source-section',
          !compact && picker.createMode === 'copy-current' ? messages.sourceSectionCopyDescription : undefined,
        );
      })()}

      {renderGroup(
        messages.identitySectionTitle,
        <div className="orthography-builder-field-stack">
          {!compact && identitySummary ? (
            <div className="orthography-builder-inline-summary">
              <span>{identitySummary}</span>
            </div>
          ) : null}
          <div className="orthography-builder-identity-row">
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
          </div>

          <div className="orthography-builder-script-type-row">
            {renderField(
              messages.scriptTagLabel,
              <ScriptTagCombobox
                value={picker.draftScriptTag}
                onChange={picker.setDraftScriptTag}
                locale={locale}
                placeholder={messages.scriptTagPlaceholder}
                className={fieldClassName}
                ariaLabel={messages.scriptTagLabel}
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
        </div>,
        'identity-section',
        undefined,
        compact ? 'orthography-builder-group-divided' : undefined,
      )}

      {showBridgeSection && picker.createMode === 'derive-other' && renderGroup(
        messages.bridgeSectionTitle,
        <>
          {!compact && bridgeSummary ? (
            <div className="orthography-builder-inline-summary">
              <span>{bridgeSummary}</span>
            </div>
          ) : null}
          <label className="orthography-builder-checkbox">
            <input type="checkbox" checked={picker.bridgeEnabled} onChange={(e) => picker.setBridgeEnabled(e.target.checked)} />
            <span>{messages.bridgeEnabledLabel}</span>
          </label>

          {picker.bridgeEnabled && (
            <div className="orthography-builder-bridge-grid">
              <div className="orthography-builder-bridge-group orthography-builder-bridge-group-settings">
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
              </div>
              <div className="orthography-builder-bridge-group orthography-builder-bridge-group-content">
                {renderField(
                  messages.bridgeRuleTextLabel,
                  <textarea
                    className="input orthography-builder-control orthography-builder-rule-textarea"
                    value={picker.draftBridgeRuleText}
                    onChange={(e) => picker.setDraftBridgeRuleText(e.target.value)}
                    placeholder={bridgeRulePlaceholder}
                    aria-label={messages.bridgeRuleTextLabel}
                    rows={compact ? 5 : 6}
                  />,
                  compact,
                  'bridge-rules',
                )}
              </div>
            </div>
          )}
          {bridgeAdvancedContent}
        </>,
        'bridge-section-before-render',
        !compact ? messages.bridgeSectionDescription : undefined,
        compact ? 'orthography-builder-group-divided' : undefined,
      )}

      {renderGroup(
        messages.renderSectionTitle,
        <>
          {!compact && renderSummary ? (
            <div className="orthography-builder-inline-summary">
              <span>{renderSummary}</span>
            </div>
          ) : null}
          <div className="orthography-builder-render-layout">
            <div className="orthography-builder-render-controls">
              <div className="orthography-builder-render-row">
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
              </div>
              <div className="orthography-builder-render-row">
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
              </div>
            </div>
          </div>
          {compact ? renderPreview : null}
          {compact ? renderWarnings : null}
        </>,
        'render-section',
        undefined,
        compact ? 'orthography-builder-group-divided' : undefined,
      )}

      {compact ? (
        <div className={`orthography-builder-advanced-group${showAdvancedFields ? ' orthography-builder-advanced-group-open' : ''}`}>
          <div className="orthography-builder-advanced-toggle-row">
            <button
              type="button"
              className="orthography-builder-advanced-toggle-btn"
              onClick={() => picker.setShowAdvancedFields(!picker.showAdvancedFields)}
              aria-expanded={showAdvancedFields}
            >
              {showAdvancedFields ? messages.collapseAdvanced : messages.expandAdvanced}
            </button>
          </div>
          {advancedFields}
        </div>
      ) : advancedFields}

      <div className="orthography-builder-workspace-note">
        {messages.workspaceNote}
      </div>

      {picker.error && (
        compact
          ? (
            <PanelFeedbackStack>
              <PanelFeedback level="error">{picker.error}</PanelFeedback>
            </PanelFeedbackStack>
          )
          : <PanelFeedback level="error">{picker.error}</PanelFeedback>
      )}

      {!hideActions && (
        <div className="orthography-builder-actions">
          <button
            type="button"
            className={ghostButtonClassName}
            disabled={picker.submitting}
            onClick={picker.cancelCreate}
          >
            {messages.cancelCreate}
          </button>
          <button
            type="button"
            className={primaryButtonClassName}
            disabled={picker.submitting}
            onClick={() => {
              void handleCreate();
            }}
          >
            {picker.submitting ? messages.creating : picker.requiresRenderWarningConfirmation ? messages.confirmRiskAndCreate : messages.createAndSelect}
          </button>
        </div>
      )}
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
