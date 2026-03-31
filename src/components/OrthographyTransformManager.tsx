import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDb, type OrthographyDocType, type OrthographyTransformDocType } from '../db';
import { useOrthographies } from '../hooks/useOrthographies';
import { formatOrthographyOptionLabel } from '../hooks/useOrthographyPicker';
import { LinguisticService } from '../services/LinguisticService';
import {
  buildTransformRulesFromRuleText,
  evaluateOrthographyTransformSampleCases,
  parseTransformSampleCases,
  previewOrthographyTransform,
  validateOrthographyTransform,
} from '../utils/orthographyTransforms';

type LanguageOption = {
  code: string;
  label: string;
};

type OrthographyTransformManagerProps = {
  targetOrthography: OrthographyDocType | undefined;
  languageOptions: readonly LanguageOption[];
  compact?: boolean;
};

function formatTransformRuleText(transform: OrthographyTransformDocType): string {
  if (transform.rules.ruleText?.trim()) return transform.rules.ruleText;
  return (transform.rules.mappings ?? [])
    .map((mapping) => `${mapping.from} => ${mapping.to}`)
    .join('\n');
}

function formatTransformSampleCasesText(transform: OrthographyTransformDocType): string {
  return (transform.sampleCases ?? [])
    .map((sampleCase) => sampleCase.expectedOutput !== undefined
      ? `${sampleCase.input} => ${sampleCase.expectedOutput}`
      : sampleCase.input)
    .join('\n');
}

function formatTransformStatus(status: OrthographyTransformDocType['status'] | undefined): string {
  if (status === 'active') return '启用';
  if (status === 'deprecated') return '弃用';
  return '草稿';
}

function buildOptionalName(nameZh: string, nameEn: string): OrthographyTransformDocType['name'] | null {
  const nextName: NonNullable<OrthographyTransformDocType['name']> = {};
  const trimmedZh = nameZh.trim();
  const trimmedEn = nameEn.trim();
  if (trimmedZh) nextName.zho = trimmedZh;
  if (trimmedEn) nextName.eng = trimmedEn;
  return Object.keys(nextName).length > 0 ? nextName : null;
}

export function OrthographyTransformManager({
  targetOrthography,
  languageOptions,
  compact = false,
}: OrthographyTransformManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [transforms, setTransforms] = useState<OrthographyTransformDocType[]>([]);
  const [sourceOrthographyById, setSourceOrthographyById] = useState<Record<string, OrthographyDocType>>({});
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editingTransformId, setEditingTransformId] = useState<string | null>(null);
  const [sourceLanguageId, setSourceLanguageId] = useState('');
  const [sourceCustomLanguageId, setSourceCustomLanguageId] = useState('');
  const [sourceOrthographyId, setSourceOrthographyId] = useState('');
  const [draftNameZh, setDraftNameZh] = useState('');
  const [draftNameEn, setDraftNameEn] = useState('');
  const [draftStatus, setDraftStatus] = useState<NonNullable<OrthographyTransformDocType['status']>>('draft');
  const [draftTransformEngine, setDraftTransformEngine] = useState<OrthographyTransformDocType['engine']>('table-map');
  const [draftTransformRuleText, setDraftTransformRuleText] = useState('');
  const [draftTransformSampleInput, setDraftTransformSampleInput] = useState('');
  const [draftTransformSampleCasesText, setDraftTransformSampleCasesText] = useState('');
  const [draftTransformIsReversible, setDraftTransformIsReversible] = useState(false);

  const targetLabel = targetOrthography ? formatOrthographyOptionLabel(targetOrthography) : '';
  const fieldClassName = compact ? 'input transcription-layer-rail-action-input' : 'input';
  const panelClassName = compact
    ? 'orthography-builder-panel orthography-builder-panel-compact'
    : 'orthography-builder-panel';
  const resolvedSourceLanguageId = sourceLanguageId === '__custom__' ? sourceCustomLanguageId.trim() : sourceLanguageId;
  const sourceOrthographies = useOrthographies(resolvedSourceLanguageId ? [resolvedSourceLanguageId] : []);
  const transformDraftRules = useMemo(
    () => buildTransformRulesFromRuleText(draftTransformRuleText, { caseSensitive: true }),
    [draftTransformRuleText],
  );
  const transformDraftSampleCases = useMemo(
    () => parseTransformSampleCases(draftTransformSampleCasesText),
    [draftTransformSampleCasesText],
  );
  const transformValidationIssues = useMemo(() => validateOrthographyTransform({
    engine: draftTransformEngine,
    rules: transformDraftRules,
  }).issues, [draftTransformEngine, transformDraftRules]);
  const transformSampleCaseResults = useMemo(() => {
    if (transformDraftSampleCases.length === 0) return [];
    return evaluateOrthographyTransformSampleCases({
      engine: draftTransformEngine,
      rules: transformDraftRules,
      sampleCases: transformDraftSampleCases,
    });
  }, [draftTransformEngine, transformDraftRules, transformDraftSampleCases]);
  const transformPreviewOutput = useMemo(() => {
    const sampleInput = draftTransformSampleInput.trim();
    if (!sampleInput) return '';
    return previewOrthographyTransform({
      engine: draftTransformEngine,
      rules: transformDraftRules,
      text: sampleInput,
    });
  }, [draftTransformEngine, draftTransformSampleInput, transformDraftRules]);

  const resetEditor = useCallback(() => {
    setIsCreatingNew(false);
    setEditingTransformId(null);
    setSourceLanguageId('');
    setSourceCustomLanguageId('');
    setSourceOrthographyId('');
    setDraftNameZh('');
    setDraftNameEn('');
    setDraftStatus('draft');
    setDraftTransformEngine('table-map');
    setDraftTransformRuleText('');
    setDraftTransformSampleInput('');
    setDraftTransformSampleCasesText('');
    setDraftTransformIsReversible(false);
    setError('');
  }, []);

  const loadTransforms = useCallback(async () => {
    if (!targetOrthography?.id) {
      setTransforms([]);
      setSourceOrthographyById({});
      return;
    }
    setLoading(true);
    try {
      const nextTransforms = await LinguisticService.listOrthographyTransforms({
        targetOrthographyId: targetOrthography.id,
      });
      setTransforms(nextTransforms);
      const sourceIds = Array.from(new Set(nextTransforms.map((item) => item.sourceOrthographyId)));
      if (sourceIds.length === 0) {
        setSourceOrthographyById({});
      } else {
        const db = await getDb();
        const orthographies = (await db.dexie.orthographies.bulkGet(sourceIds)).filter(
          (item): item is OrthographyDocType => Boolean(item),
        );
        setSourceOrthographyById(Object.fromEntries(orthographies.map((item) => [item.id, item])));
      }
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '变换规则加载失败');
    } finally {
      setLoading(false);
    }
  }, [targetOrthography?.id]);

  useEffect(() => {
    if (!expanded) return;
    void loadTransforms();
  }, [expanded, loadTransforms]);

  useEffect(() => {
    resetEditor();
    setExpanded(false);
    setTransforms([]);
    setSourceOrthographyById({});
  }, [resetEditor, targetOrthography?.id]);

  const beginCreate = useCallback(() => {
    resetEditor();
    setIsCreatingNew(true);
  }, [resetEditor]);

  const beginEdit = useCallback((transform: OrthographyTransformDocType) => {
    const sourceOrthography = sourceOrthographyById[transform.sourceOrthographyId];
    const nextSourceLanguageId = sourceOrthography?.languageId ?? '';
    const knownLanguage = nextSourceLanguageId && languageOptions.some((option) => option.code === nextSourceLanguageId);
    setIsCreatingNew(false);
    setEditingTransformId(transform.id);
    setSourceLanguageId(knownLanguage ? nextSourceLanguageId : (nextSourceLanguageId ? '__custom__' : ''));
    setSourceCustomLanguageId(knownLanguage ? '' : nextSourceLanguageId);
    setSourceOrthographyId(transform.sourceOrthographyId);
    setDraftNameZh(transform.name?.zho ?? '');
    setDraftNameEn(transform.name?.eng ?? '');
    setDraftStatus(transform.status ?? 'draft');
    setDraftTransformEngine(transform.engine);
    setDraftTransformRuleText(formatTransformRuleText(transform));
    setDraftTransformSampleInput(transform.sampleInput ?? '');
    setDraftTransformSampleCasesText(formatTransformSampleCasesText(transform));
    setDraftTransformIsReversible(Boolean(transform.isReversible));
    setError('');
  }, [languageOptions, sourceOrthographyById]);

  const saveTransform = useCallback(async () => {
    if (!targetOrthography?.id) return;
    if (!resolvedSourceLanguageId || !sourceOrthographyId) {
      setError('请先选择来源语言与来源正字法');
      return;
    }
    if (sourceOrthographyId === targetOrthography.id) {
      setError('来源与目标正字法不能相同');
      return;
    }
    if (transformValidationIssues.length > 0) {
      setError(transformValidationIssues[0] ?? '变换规则校验失败');
      return;
    }
    const failedSampleCases = transformSampleCaseResults.filter((item) => item.matchesExpectation === false);
    if (failedSampleCases.length > 0) {
      setError(`样例用例校验失败，共 ${failedSampleCases.length} 条未通过。`);
      return;
    }

    setSaving(true);
    try {
      const name = buildOptionalName(draftNameZh, draftNameEn);
      const sampleInput = draftTransformSampleInput.trim();
      const sampleOutput = sampleInput
        ? previewOrthographyTransform({
          engine: draftTransformEngine,
          rules: transformDraftRules,
          text: sampleInput,
        })
        : null;
      if (isCreatingNew) {
        await LinguisticService.createOrthographyTransform({
          sourceOrthographyId,
          targetOrthographyId: targetOrthography.id,
          ...(name ? { name } : {}),
          engine: draftTransformEngine,
          rules: transformDraftRules,
          ...(sampleInput ? { sampleInput } : {}),
          ...(sampleOutput ? { sampleOutput } : {}),
          ...(transformDraftSampleCases.length > 0 ? { sampleCases: transformDraftSampleCases } : {}),
          isReversible: draftTransformIsReversible,
          status: draftStatus,
        });
      } else if (editingTransformId) {
        await LinguisticService.updateOrthographyTransform({
          id: editingTransformId,
          sourceOrthographyId,
          targetOrthographyId: targetOrthography.id,
          ...(name !== undefined ? { name } : {}),
          engine: draftTransformEngine,
          rules: transformDraftRules,
          sampleInput: sampleInput || null,
          sampleOutput,
          sampleCases: transformDraftSampleCases.length > 0 ? transformDraftSampleCases : null,
          isReversible: draftTransformIsReversible,
          status: draftStatus,
        });
      }
      await loadTransforms();
      resetEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '变换规则保存失败');
    } finally {
      setSaving(false);
    }
  }, [draftNameEn, draftNameZh, draftStatus, draftTransformEngine, draftTransformIsReversible, draftTransformSampleInput, editingTransformId, isCreatingNew, loadTransforms, resetEditor, resolvedSourceLanguageId, sourceOrthographyId, targetOrthography?.id, transformDraftRules, transformDraftSampleCases, transformSampleCaseResults, transformValidationIssues]);

  const toggleTransformStatus = useCallback(async (transform: OrthographyTransformDocType) => {
    setSaving(true);
    try {
      await LinguisticService.updateOrthographyTransform({
        id: transform.id,
        status: transform.status === 'active' ? 'draft' : 'active',
      });
      await loadTransforms();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : '变换状态更新失败');
    } finally {
      setSaving(false);
    }
  }, [loadTransforms]);

  const deleteTransform = useCallback(async (transformId: string) => {
    setSaving(true);
    try {
      await LinguisticService.deleteOrthographyTransform(transformId);
      await loadTransforms();
      if (editingTransformId === transformId) {
        resetEditor();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '变换规则删除失败');
    } finally {
      setSaving(false);
    }
  }, [editingTransformId, loadTransforms, resetEditor]);

  if (!targetOrthography) return null;

  return (
    <div className={panelClassName}>
      <div className={compact ? 'transcription-layer-rail-action-row' : 'orthography-builder-actions'}>
        <button
          type="button"
          className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? '收起导入变换规则' : '管理导入变换规则'}
        </button>
        {expanded && !isCreatingNew && !editingTransformId && (
          <button
            type="button"
            className={compact ? 'btn btn-sm' : 'btn'}
            onClick={beginCreate}
            disabled={saving}
          >
            新建规则
          </button>
        )}
      </div>

      {expanded && (
        <div className="orthography-builder-grid">
          <div className="orthography-builder-preview-box">
            <span className="orthography-builder-rule-label">目标正字法</span>
            <span>{targetLabel}</span>
          </div>

          {loading ? (
            <p className="orthography-builder-hint">正在加载变换规则…</p>
          ) : transforms.length === 0 && !isCreatingNew && !editingTransformId ? (
            <p className="orthography-builder-hint">当前正字法尚未配置入站 transform，导入时会保留原文本。</p>
          ) : null}

          {transforms.map((transform) => {
            const sourceOrthography = sourceOrthographyById[transform.sourceOrthographyId];
            const sourceLabel = sourceOrthography ? formatOrthographyOptionLabel(sourceOrthography) : transform.sourceOrthographyId;
            return (
              <div key={transform.id} className="orthography-builder-validation-box orthography-builder-validation-box-neutral">
                <span className="orthography-builder-rule-label">{sourceLabel}{' -> '}{targetLabel}</span>
                <span>{transform.engine} · {formatTransformStatus(transform.status)}{transform.isReversible ? ' · 可逆' : ''}</span>
                {transform.sampleInput && transform.sampleOutput && (
                  <span>样例：{transform.sampleInput}{' -> '}{transform.sampleOutput}</span>
                )}
                <div className={compact ? 'transcription-layer-rail-action-row' : 'orthography-builder-actions'}>
                  <button
                    type="button"
                    className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'}
                    onClick={() => void toggleTransformStatus(transform)}
                    disabled={saving}
                  >
                    {transform.status === 'active' ? '设为草稿' : '设为启用'}
                  </button>
                  <button
                    type="button"
                    className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'}
                    onClick={() => beginEdit(transform)}
                    disabled={saving}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'}
                    onClick={() => void deleteTransform(transform.id)}
                    disabled={saving}
                  >
                    删除规则
                  </button>
                </div>
              </div>
            );
          })}

          {(isCreatingNew || editingTransformId) && (
            <div className="orthography-builder-transform-panel">
              <div className="orthography-builder-transform-grid">
                <label className="dialog-field">
                  <span>来源语言</span>
                  <select
                    className={fieldClassName}
                    value={sourceLanguageId}
                    onChange={(event) => setSourceLanguageId(event.target.value)}
                  >
                    <option value="">选择来源语言…</option>
                    {languageOptions.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label} ({lang.code})</option>
                    ))}
                    <option value="__custom__">其他（手动输入 ISO 639-3 代码）</option>
                  </select>
                </label>

                {sourceLanguageId === '__custom__' && (
                  <label className="dialog-field">
                    <span>来源语言代码</span>
                    <input
                      className={fieldClassName}
                      type="text"
                      value={sourceCustomLanguageId}
                      onChange={(event) => setSourceCustomLanguageId(event.target.value)}
                      placeholder="例：eng"
                    />
                  </label>
                )}

                <label className="dialog-field">
                  <span>来源正字法</span>
                  <select
                    className={fieldClassName}
                    value={sourceOrthographyId}
                    onChange={(event) => setSourceOrthographyId(event.target.value)}
                    disabled={sourceOrthographies.length === 0}
                  >
                    <option value="">选择来源正字法…</option>
                    {sourceOrthographies.map((orthography) => (
                      <option key={orthography.id} value={orthography.id}>
                        {formatOrthographyOptionLabel(orthography)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="dialog-field">
                  <span>规则名（中文）</span>
                  <input
                    className={fieldClassName}
                    type="text"
                    value={draftNameZh}
                    onChange={(event) => setDraftNameZh(event.target.value)}
                    placeholder="例：导入映射"
                  />
                </label>

                <label className="dialog-field">
                  <span>规则名（英文）</span>
                  <input
                    className={fieldClassName}
                    type="text"
                    value={draftNameEn}
                    onChange={(event) => setDraftNameEn(event.target.value)}
                    placeholder="e.g. Import mapping"
                  />
                </label>

                <label className="dialog-field">
                  <span>状态</span>
                  <select
                    className={fieldClassName}
                    value={draftStatus}
                    onChange={(event) => setDraftStatus(event.target.value as NonNullable<OrthographyTransformDocType['status']>)}
                  >
                    <option value="draft">草稿</option>
                    <option value="active">启用</option>
                    <option value="deprecated">弃用</option>
                  </select>
                </label>

                <label className="dialog-field">
                  <span>变换引擎</span>
                  <select
                    className={fieldClassName}
                    value={draftTransformEngine}
                    onChange={(event) => setDraftTransformEngine(event.target.value as OrthographyTransformDocType['engine'])}
                  >
                    <option value="table-map">Table Map</option>
                    <option value="icu-rule">ICU Rule</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>

                <label className="orthography-builder-checkbox">
                  <input
                    type="checkbox"
                    checked={draftTransformIsReversible}
                    onChange={(event) => setDraftTransformIsReversible(event.target.checked)}
                  />
                  <span>标记为可逆变换</span>
                </label>

                <div className="orthography-builder-rule-block">
                  <span className="orthography-builder-rule-label">规则文本</span>
                  <textarea
                    className="input orthography-builder-rule-textarea"
                    value={draftTransformRuleText}
                    onChange={(event) => setDraftTransformRuleText(event.target.value)}
                    placeholder="每行一条映射，如 aa -> a"
                    rows={compact ? 5 : 6}
                  />
                </div>

                <label className="dialog-field">
                  <span>预览输入</span>
                  <input
                    className={fieldClassName}
                    type="text"
                    value={draftTransformSampleInput}
                    onChange={(event) => setDraftTransformSampleInput(event.target.value)}
                    placeholder="输入一段样例文本预览转换结果"
                  />
                </label>

                <div className="orthography-builder-rule-block">
                  <span className="orthography-builder-rule-label">样例用例</span>
                  <textarea
                    className="input orthography-builder-rule-textarea"
                    value={draftTransformSampleCasesText}
                    onChange={(event) => setDraftTransformSampleCasesText(event.target.value)}
                    placeholder="每行一条样例，格式如 shaa => saa"
                    rows={compact ? 4 : 5}
                  />
                </div>

                {transformValidationIssues.length > 0 && (
                  <div className="orthography-builder-validation-box orthography-builder-validation-box-error">
                    <span className="orthography-builder-rule-label">规则校验</span>
                    <ul className="orthography-builder-validation-list">
                      {transformValidationIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {transformPreviewOutput && (
                  <div className="orthography-builder-preview-box">
                    <span className="orthography-builder-rule-label">预览输出</span>
                    <code>{transformPreviewOutput}</code>
                  </div>
                )}

                {transformSampleCaseResults.length > 0 && (
                  <div className="orthography-builder-validation-box orthography-builder-validation-box-neutral">
                    <span className="orthography-builder-rule-label">样例结果</span>
                    <ul className="orthography-builder-validation-list">
                      {transformSampleCaseResults.map((sampleCase, index) => {
                        const status = sampleCase.matchesExpectation === false
                          ? '未通过'
                          : sampleCase.matchesExpectation === true
                          ? '通过'
                          : '预览';
                        return (
                          <li key={`${sampleCase.input}-${sampleCase.expectedOutput ?? ''}-${index}`}>
                            <strong>{status}</strong>
                              <span>{sampleCase.input}{' -> '}{sampleCase.actualOutput}</span>
                            {sampleCase.expectedOutput !== undefined && (
                              <span>期望：{sampleCase.expectedOutput}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className={compact ? 'transcription-layer-rail-action-row' : 'orthography-builder-actions'}>
                  <button
                    type="button"
                    className={compact ? 'btn btn-sm' : 'btn'}
                    onClick={() => void saveTransform()}
                    disabled={saving}
                  >
                    {saving ? '保存中...' : '保存规则'}
                  </button>
                  <button
                    type="button"
                    className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'}
                    onClick={resetEditor}
                    disabled={saving}
                  >
                    取消编辑
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="orthography-builder-validation-box orthography-builder-validation-box-error">
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}