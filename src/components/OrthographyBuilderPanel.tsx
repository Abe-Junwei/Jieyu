import { useEffect, useState, type ReactNode } from 'react';
import { formatOrthographyOptionLabel, type UseOrthographyPickerResult } from '../hooks/useOrthographyPicker';
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
  sourceLanguagePlaceholder = '请选择来源语言…',
  sourceLanguageCodePlaceholder = '例：eng',
  nameZhPlaceholder = '例：苗文 IPA',
  nameEnPlaceholder = 'e.g. IPA for Miao',
}: OrthographyBuilderPanelProps) {
  const fieldClassName = compact ? 'input transcription-layer-rail-action-input' : 'input';
  const containerClassName = compact
    ? 'orthography-builder-panel orthography-builder-panel-compact'
    : 'orthography-builder-panel';
  const gridClassName = compact ? 'orthography-builder-grid orthography-builder-grid-compact' : 'orthography-builder-grid';
  const [fontVerification, setFontVerification] = useState<FontCoverageVerification | null>(null);

  useEffect(() => {
    let disposed = false;
    const renderPolicy = picker.draftRenderPolicy;
    if (!renderPolicy || renderPolicy.defaultFontKey === '系统默认') {
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
  }, [picker.draftRenderPolicy]);

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
          '创建方式',
          <select
            className={fieldClassName}
            value={picker.createMode}
            onChange={(e) => picker.setCreateMode(e.target.value as 'ipa' | 'copy-current' | 'derive-other')}
          >
            <option value="ipa">基于 IPA 创建</option>
            <option value="copy-current">复制当前语言已有正字法</option>
            <option value="derive-other">从其他语言正字法派生</option>
          </select>,
          compact,
          'create-mode',
        )}

        {picker.createMode === 'derive-other' && renderField(
          '来源语言',
          <select
            className={fieldClassName}
            value={picker.sourceLanguageId}
            onChange={(e) => picker.setSourceLanguageId(e.target.value)}
          >
            <option value="">{compact ? '选择来源语言…' : sourceLanguagePlaceholder}</option>
            {languageOptions.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label} ({lang.code})</option>
            ))}
            <option value="__custom__">其他（手动输入 ISO 639-3 代码）</option>
          </select>,
          compact,
          'source-language',
        )}

        {picker.createMode === 'derive-other' && picker.sourceLanguageId === '__custom__' && renderField(
          '来源语言代码',
          <input
            className={fieldClassName}
            type="text"
            maxLength={8}
            value={picker.sourceCustomLanguageId}
            onChange={(e) => picker.setSourceCustomLanguageId(e.target.value)}
            placeholder={sourceLanguageCodePlaceholder}
          />,
          compact,
          'source-language-code',
        )}

        {picker.createMode !== 'ipa' && picker.sourceOrthographies.length > 0 && renderField(
          '来源正字法',
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
          <p className="orthography-builder-hint" key="source-hint">当前模式下暂无可复制的来源正字法，请先切换来源语言或改用 IPA 创建。</p>
        )}

        {renderField(
          '名称（中文）',
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftNameZh}
            onChange={(e) => picker.setDraftNameZh(e.target.value)}
            placeholder={compact ? '正字法名称（中文，可选）' : nameZhPlaceholder}
          />,
          compact,
          'name-zh',
        )}

        {renderField(
          '名称（英文）',
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftNameEn}
            onChange={(e) => picker.setDraftNameEn(e.target.value)}
            placeholder={compact ? 'Orthography name (optional)' : nameEnPlaceholder}
          />,
          compact,
          'name-en',
        )}

        {renderField(
          '缩写',
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftAbbreviation}
            onChange={(e) => picker.setDraftAbbreviation(e.target.value)}
            placeholder="例：IPA"
          />,
          compact,
          'abbr',
        )}

        {renderField(
          'Script 标签',
          <input
            className={fieldClassName}
            type="text"
            value={picker.draftScriptTag}
            onChange={(e) => picker.setDraftScriptTag(e.target.value)}
            placeholder="例：Latn"
          />,
          compact,
          'script',
        )}

        {renderField(
          '类型',
          <select
            className={fieldClassName}
            value={picker.draftType}
            onChange={(e) => picker.setDraftType(e.target.value as 'phonemic' | 'phonetic' | 'practical' | 'historical' | 'other')}
          >
            <option value="phonemic">音位式</option>
            <option value="phonetic">音标式</option>
            <option value="practical">实用拼写</option>
            <option value="historical">历史拼写</option>
            <option value="other">其他</option>
          </select>,
          compact,
          'type',
        )}
      </div>

      {picker.draftRenderPolicy && (
        <div className="orthography-builder-preview-box orthography-builder-render-preview">
          <span className="orthography-builder-rule-label">渲染预览</span>
          <div className="orthography-builder-render-preview-meta">
            <span>脚本：{picker.draftRenderPolicy.scriptTag}</span>
            <span>方向：{picker.draftRenderPolicy.textDirection.toUpperCase()}</span>
            <span>
              字体覆盖：{picker.draftRenderPolicy.coverageSummary.confidence === 'sample-backed'
                ? `样例 ${picker.draftRenderPolicy.coverageSummary.exemplarCharacterCount} 项`
                : '未配置样例'}
            </span>
          </div>
          <div className="orthography-builder-render-preview-meta">
            <span>最终字体栈：{picker.draftRenderPolicy.resolvedFontKeys.join(' -> ')}</span>
          </div>
          {fontVerificationLabel && (
            <div className="orthography-builder-render-preview-meta">
              <span>默认字体验证：{picker.draftRenderPolicy.defaultFontKey} · {fontVerificationLabel}</span>
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
          <span className="orthography-builder-rule-label">创建风险提示</span>
          <ul className="orthography-builder-validation-list">
            {picker.draftRenderWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <div className="orthography-builder-warning-actions">
            <span className="orthography-builder-warning-note">
              {picker.requiresRenderWarningConfirmation
                ? '首次点击创建将进入确认状态，再次点击才会按当前配置创建。'
                : '已确认当前风险，再次修改脚本、字体或双向设置后会重新提示。'}
            </span>
            {picker.requiresRenderWarningConfirmation && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={picker.acknowledgeRenderWarnings}
              >
                先确认这些风险
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
          {picker.showAdvancedFields ? '收起高级字段' : '展开高级字段'}
        </button>
      </div>

      {picker.showAdvancedFields && (
        <div className="orthography-builder-advanced-grid">
          {renderField(
            'Locale',
            <input className={fieldClassName} type="text" value={picker.draftLocaleTag} onChange={(e) => picker.setDraftLocaleTag(e.target.value)} placeholder="例：zh-CN" />,
            compact,
            'locale',
          )}
          {renderField(
            'Region',
            <input className={fieldClassName} type="text" value={picker.draftRegionTag} onChange={(e) => picker.setDraftRegionTag(e.target.value)} placeholder="例：CN" />,
            compact,
            'region',
          )}
          {renderField(
            'Variant',
            <input className={fieldClassName} type="text" value={picker.draftVariantTag} onChange={(e) => picker.setDraftVariantTag(e.target.value)} placeholder="例：fonipa" />,
            compact,
            'variant',
          )}
          {renderField(
            'Direction',
            <select className={fieldClassName} value={picker.draftDirection} onChange={(e) => picker.setDraftDirection(e.target.value as 'ltr' | 'rtl')}>
              <option value="ltr">LTR</option>
              <option value="rtl">RTL</option>
            </select>,
            compact,
            'direction',
          )}
          {renderField(
            '示例字符',
            <input className={fieldClassName} type="text" value={picker.draftExemplarMain} onChange={(e) => picker.setDraftExemplarMain(e.target.value)} placeholder="以逗号分隔，如 a, b, c" />,
            compact,
            'exemplar',
          )}
          {renderField(
            '首选字体',
            <input className={fieldClassName} type="text" value={picker.draftPrimaryFonts} onChange={(e) => picker.setDraftPrimaryFonts(e.target.value)} placeholder="以逗号分隔，如 Noto Sans, Charis SIL" />,
            compact,
            'primary-fonts',
          )}
          {renderField(
            '回退字体',
            <input className={fieldClassName} type="text" value={picker.draftFallbackFonts} onChange={(e) => picker.setDraftFallbackFonts(e.target.value)} placeholder="以逗号分隔，如 Arial Unicode MS" />,
            compact,
            'fallback-fonts',
          )}
          <label className="orthography-builder-checkbox">
            <input type="checkbox" checked={picker.draftBidiIsolate} onChange={(e) => picker.setDraftBidiIsolate(e.target.checked)} />
            <span>行内双向文本启用隔离</span>
          </label>
          <label className="orthography-builder-checkbox">
            <input type="checkbox" checked={picker.draftPreferDirAttribute} onChange={(e) => picker.setDraftPreferDirAttribute(e.target.checked)} />
            <span>渲染时优先写入 dir 属性</span>
          </label>
        </div>
      )}

      {picker.canConfigureTransform && (
        <div className="orthography-builder-transform-panel">
          <label className="orthography-builder-checkbox">
            <input type="checkbox" checked={picker.transformEnabled} onChange={(e) => picker.setTransformEnabled(e.target.checked)} />
            <span>为派生正字法创建变换规则</span>
          </label>

          {picker.transformEnabled && (
            <div className="orthography-builder-transform-grid">
              {renderField(
                '变换引擎',
                <select className={fieldClassName} value={picker.draftTransformEngine} onChange={(e) => picker.setDraftTransformEngine(e.target.value as 'table-map' | 'icu-rule' | 'manual')}>
                  <option value="table-map">Table Map</option>
                  <option value="icu-rule">ICU Rule</option>
                  <option value="manual">Manual</option>
                </select>,
                compact,
                'transform-engine',
              )}
              {renderField(
                '预览输入',
                <input className={fieldClassName} type="text" value={picker.draftTransformSampleInput} onChange={(e) => picker.setDraftTransformSampleInput(e.target.value)} placeholder="输入一段样例文本预览转换结果" />,
                compact,
                'transform-sample',
              )}
              <label className="orthography-builder-checkbox">
                <input type="checkbox" checked={picker.draftTransformIsReversible} onChange={(e) => picker.setDraftTransformIsReversible(e.target.checked)} />
                <span>标记为可逆变换</span>
              </label>
              <div className="orthography-builder-rule-block">
                <span className="orthography-builder-rule-label">规则文本</span>
                <textarea
                  className="input orthography-builder-rule-textarea"
                  value={picker.draftTransformRuleText}
                  onChange={(e) => picker.setDraftTransformRuleText(e.target.value)}
                  placeholder="每行一条映射，如 aa -> a"
                  rows={compact ? 5 : 6}
                />
              </div>
              <div className="orthography-builder-rule-block">
                <span className="orthography-builder-rule-label">样例用例</span>
                <textarea
                  className="input orthography-builder-rule-textarea"
                  value={picker.draftTransformSampleCasesText}
                  onChange={(e) => picker.setDraftTransformSampleCasesText(e.target.value)}
                  placeholder="每行一条样例，格式如 shaa => saa"
                  rows={compact ? 4 : 5}
                />
              </div>
              {picker.transformValidationIssues.length > 0 && (
                <div className="orthography-builder-validation-box orthography-builder-validation-box-error">
                  <span className="orthography-builder-rule-label">规则校验</span>
                  <ul className="orthography-builder-validation-list">
                    {picker.transformValidationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {picker.transformPreviewOutput && (
                <div className="orthography-builder-preview-box">
                  <span className="orthography-builder-rule-label">预览输出</span>
                  <code>{picker.transformPreviewOutput}</code>
                </div>
              )}
              {picker.transformSampleCaseResults.length > 0 && (
                <div className="orthography-builder-validation-box orthography-builder-validation-box-neutral">
                  <span className="orthography-builder-rule-label">样例结果</span>
                  <ul className="orthography-builder-validation-list">
                    {picker.transformSampleCaseResults.map((sampleCase, index) => {
                      const status = sampleCase.matchesExpectation === false
                        ? '未通过'
                        : sampleCase.matchesExpectation === true
                        ? '通过'
                        : '预览';
                      return (
                        <li key={`${sampleCase.input}-${sampleCase.expectedOutput ?? ''}-${index}`}>
                          <strong>{status}</strong>
                          <span>{sampleCase.input} → {sampleCase.actualOutput}</span>
                          {sampleCase.expectedOutput !== undefined && (
                            <span>期望：{sampleCase.expectedOutput}</span>
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

      <div className={compact ? 'transcription-layer-rail-action-row' : 'orthography-builder-actions'}>
        <button
          type="button"
          className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'}
          disabled={picker.submitting}
          onClick={picker.cancelCreate}
        >
          取消新建
        </button>
        <button
          type="button"
          className={compact ? 'btn btn-sm' : 'btn'}
          disabled={picker.submitting}
          onClick={() => {
            void picker.createOrthography();
          }}
        >
          {picker.submitting ? '创建中...' : picker.requiresRenderWarningConfirmation ? '确认风险并创建' : '创建并选中'}
        </button>
      </div>
    </div>
  );
}
