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
import { decodeEscapedUnicode } from '../utils/decodeEscapedUnicode';

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
  if (status === 'active') return decodeEscapedUnicode('\\u542f\\u7528');
  if (status === 'deprecated') return decodeEscapedUnicode('\\u5f03\\u7528');
  return decodeEscapedUnicode('\\u8349\\u7a3f');
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
  const fieldClassName = compact ? 'input layer-action-dialog-input' : 'input';
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
      setError(loadError instanceof Error ? loadError.message : decodeEscapedUnicode('\\u53d8\\u6362\\u89c4\\u5219\\u52a0\\u8f7d\\u5931\\u8d25'));
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
      setError(decodeEscapedUnicode('\\u8bf7\\u5148\\u9009\\u62e9\\u6765\\u6e90\\u8bed\\u8a00\\u4e0e\\u6765\\u6e90\\u6b63\\u5b57\\u6cd5'));
      return;
    }
    if (sourceOrthographyId === targetOrthography.id) {
      setError(decodeEscapedUnicode('\\u6765\\u6e90\\u4e0e\\u76ee\\u6807\\u6b63\\u5b57\\u6cd5\\u4e0d\\u80fd\\u76f8\\u540c'));
      return;
    }
    if (transformValidationIssues.length > 0) {
      setError(transformValidationIssues[0] ?? decodeEscapedUnicode('\\u53d8\\u6362\\u89c4\\u5219\\u6821\\u9a8c\\u5931\\u8d25'));
      return;
    }
    const failedSampleCases = transformSampleCaseResults.filter((item) => item.matchesExpectation === false);
    if (failedSampleCases.length > 0) {
      setError(decodeEscapedUnicode(`\\u6837\\u4f8b\\u7528\\u4f8b\\u6821\\u9a8c\\u5931\\u8d25，\\u5171 ${failedSampleCases.length} \\u6761\\u672a\\u901a\\u8fc7。`));
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
      setError(saveError instanceof Error ? saveError.message : decodeEscapedUnicode('\\u53d8\\u6362\\u89c4\\u5219\\u4fdd\\u5b58\\u5931\\u8d25'));
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
      setError(toggleError instanceof Error ? toggleError.message : decodeEscapedUnicode('\\u53d8\\u6362\\u72b6\\u6001\\u66f4\\u65b0\\u5931\\u8d25'));
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
      setError(deleteError instanceof Error ? deleteError.message : decodeEscapedUnicode('\\u53d8\\u6362\\u89c4\\u5219\\u5220\\u9664\\u5931\\u8d25'));
    } finally {
      setSaving(false);
    }
  }, [editingTransformId, loadTransforms, resetEditor]);

  if (!targetOrthography) return null;

  return (
    <div className={panelClassName}>
      <div className="orthography-builder-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? decodeEscapedUnicode('\u6536\u8d77\u5bfc\u5165\u53d8\u6362\u89c4\u5219') : decodeEscapedUnicode('\u7ba1\u7406\u5bfc\u5165\u53d8\u6362\u89c4\u5219')}
        </button>
        {expanded && !isCreatingNew && !editingTransformId && (
          <button
            type="button"
            className="btn"
            onClick={beginCreate}
            disabled={saving}
          >
            {decodeEscapedUnicode('\\u65b0\\u5efa\\u89c4\\u5219')}
          </button>
        )}
      </div>

      {expanded && (
        <div className="orthography-builder-grid">
          <div className="orthography-builder-preview-box">
            <span className="orthography-builder-rule-label">{decodeEscapedUnicode('\\u76ee\\u6807\\u6b63\\u5b57\\u6cd5')}</span>
            <span>{targetLabel}</span>
          </div>

          {loading ? (
            <p className="orthography-builder-hint">{decodeEscapedUnicode('\\u6b63\\u5728\\u52a0\\u8f7d\\u53d8\\u6362\\u89c4\\u5219…')}</p>
          ) : transforms.length === 0 && !isCreatingNew && !editingTransformId ? (
            <p className="orthography-builder-hint">{decodeEscapedUnicode('\\u5f53\\u524d\\u6b63\\u5b57\\u6cd5\\u5c1a\\u672a\\u914d\\u7f6e\\u5165\\u7ad9 transform，\\u5bfc\\u5165\\u65f6\\u4f1a\\u4fdd\\u7559\\u539f\\u6587\\u672c。')}</p>
          ) : null}

          {transforms.map((transform) => {
            const sourceOrthography = sourceOrthographyById[transform.sourceOrthographyId];
            const sourceLabel = sourceOrthography ? formatOrthographyOptionLabel(sourceOrthography) : transform.sourceOrthographyId;
            return (
              <div key={transform.id} className="orthography-builder-validation-box orthography-builder-validation-box-neutral">
                <span className="orthography-builder-rule-label">{sourceLabel}{' -> '}{targetLabel}</span>
                <span>{transform.engine} · {formatTransformStatus(transform.status)}{transform.isReversible ? ` · ${decodeEscapedUnicode('\\u53ef\\u9006')}` : ''}</span>
                {transform.sampleInput && transform.sampleOutput && (
                  <span>{decodeEscapedUnicode('\\u6837\\u4f8b：')}{transform.sampleInput}{' -> '}{transform.sampleOutput}</span>
                )}
                <div className="orthography-builder-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void toggleTransformStatus(transform)}
                    disabled={saving}
                  >
                    {transform.status === 'active' ? decodeEscapedUnicode('\\u8bbe\\u4e3a\\u8349\\u7a3f') : decodeEscapedUnicode('\\u8bbe\\u4e3a\\u542f\\u7528')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => beginEdit(transform)}
                    disabled={saving}
                  >
                    {decodeEscapedUnicode('\\u7f16\\u8f91')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void deleteTransform(transform.id)}
                    disabled={saving}
                  >
                    {decodeEscapedUnicode('\\u5220\\u9664\\u89c4\\u5219')}
                  </button>
                </div>
              </div>
            );
          })}

          {(isCreatingNew || editingTransformId) && (
            <div className="orthography-builder-transform-panel">
              <div className="orthography-builder-transform-grid">
                <label className="dialog-field">
                  <span>{decodeEscapedUnicode('\\u6765\\u6e90\\u8bed\\u8a00')}</span>
                  <select
                    className={fieldClassName}
                    value={sourceLanguageId}
                    onChange={(event) => setSourceLanguageId(event.target.value)}
                  >
                    <option value="">{decodeEscapedUnicode('\\u9009\\u62e9\\u6765\\u6e90\\u8bed\\u8a00…')}</option>
                    {languageOptions.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label} ({lang.code})</option>
                    ))}
                    <option value="__custom__">{decodeEscapedUnicode('\\u5176\\u4ed6（\\u624b\\u52a8\\u8f93\\u5165 ISO 639-3 \\u4ee3\\u7801）')}</option>
                  </select>
                </label>

                {sourceLanguageId === '__custom__' && (
                  <label className="dialog-field">
                    <span>{decodeEscapedUnicode('\\u6765\\u6e90\\u8bed\\u8a00\\u4ee3\\u7801')}</span>
                    <input
                      className={fieldClassName}
                      type="text"
                      value={sourceCustomLanguageId}
                      onChange={(event) => setSourceCustomLanguageId(event.target.value)}
                      placeholder={decodeEscapedUnicode('\\u4f8b：eng')}
                    />
                  </label>
                )}

                <label className="dialog-field">
                  <span>{decodeEscapedUnicode('\\u6765\\u6e90\\u6b63\\u5b57\\u6cd5')}</span>
                  <select
                    className={fieldClassName}
                    value={sourceOrthographyId}
                    onChange={(event) => setSourceOrthographyId(event.target.value)}
                    disabled={sourceOrthographies.length === 0}
                  >
                    <option value="">{decodeEscapedUnicode('\\u9009\\u62e9\\u6765\\u6e90\\u6b63\\u5b57\\u6cd5…')}</option>
                    {sourceOrthographies.map((orthography) => (
                      <option key={orthography.id} value={orthography.id}>
                        {formatOrthographyOptionLabel(orthography)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="dialog-field">
                  <span>{decodeEscapedUnicode('\\u89c4\\u5219\\u540d（\\u4e2d\\u6587）')}</span>
                  <input
                    className={fieldClassName}
                    type="text"
                    value={draftNameZh}
                    onChange={(event) => setDraftNameZh(event.target.value)}
                    placeholder={decodeEscapedUnicode('\\u4f8b：\\u5bfc\\u5165\\u6620\\u5c04')}
                  />
                </label>

                <label className="dialog-field">
                  <span>{decodeEscapedUnicode('\\u89c4\\u5219\\u540d（\\u82f1\\u6587）')}</span>
                  <input
                    className={fieldClassName}
                    type="text"
                    value={draftNameEn}
                    onChange={(event) => setDraftNameEn(event.target.value)}
                    placeholder="e.g. Import mapping"
                  />
                </label>

                <label className="dialog-field">
                  <span>{decodeEscapedUnicode('\\u72b6\\u6001')}</span>
                  <select
                    className={fieldClassName}
                    value={draftStatus}
                    onChange={(event) => setDraftStatus(event.target.value as NonNullable<OrthographyTransformDocType['status']>)}
                  >
                    <option value="draft">{decodeEscapedUnicode('\\u8349\\u7a3f')}</option>
                    <option value="active">{decodeEscapedUnicode('\\u542f\\u7528')}</option>
                    <option value="deprecated">{decodeEscapedUnicode('\\u5f03\\u7528')}</option>
                  </select>
                </label>

                <label className="dialog-field">
                  <span>{decodeEscapedUnicode('\\u53d8\\u6362\\u5f15\\u64ce')}</span>
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
                  <span>{decodeEscapedUnicode('\\u6807\\u8bb0\\u4e3a\\u53ef\\u9006\\u53d8\\u6362')}</span>
                </label>

                <div className="orthography-builder-rule-block">
                  <span className="orthography-builder-rule-label">{decodeEscapedUnicode('\\u89c4\\u5219\\u6587\\u672c')}</span>
                  <textarea
                    className="input orthography-builder-rule-textarea"
                    value={draftTransformRuleText}
                    onChange={(event) => setDraftTransformRuleText(event.target.value)}
                    placeholder={decodeEscapedUnicode('\\u6bcf\\u884c\\u4e00\\u6761\\u6620\\u5c04，\\u5982 aa -> a')}
                    rows={compact ? 5 : 6}
                  />
                </div>

                <label className="dialog-field">
                  <span>{decodeEscapedUnicode('\\u9884\\u89c8\\u8f93\\u5165')}</span>
                  <input
                    className={fieldClassName}
                    type="text"
                    value={draftTransformSampleInput}
                    onChange={(event) => setDraftTransformSampleInput(event.target.value)}
                    placeholder={decodeEscapedUnicode('\\u8f93\\u5165\\u4e00\\u6bb5\\u6837\\u4f8b\\u6587\\u672c\\u9884\\u89c8\\u8f6c\\u6362\\u7ed3\\u679c')}
                  />
                </label>

                <div className="orthography-builder-rule-block">
                  <span className="orthography-builder-rule-label">{decodeEscapedUnicode('\\u6837\\u4f8b\\u7528\\u4f8b')}</span>
                  <textarea
                    className="input orthography-builder-rule-textarea"
                    value={draftTransformSampleCasesText}
                    onChange={(event) => setDraftTransformSampleCasesText(event.target.value)}
                    placeholder={decodeEscapedUnicode('\\u6bcf\\u884c\\u4e00\\u6761\\u6837\\u4f8b，\\u683c\\u5f0f\\u5982 shaa => saa')}
                    rows={compact ? 4 : 5}
                  />
                </div>

                {transformValidationIssues.length > 0 && (
                  <div className="orthography-builder-validation-box orthography-builder-validation-box-error">
                    <span className="orthography-builder-rule-label">{decodeEscapedUnicode('\\u89c4\\u5219\\u6821\\u9a8c')}</span>
                    <ul className="orthography-builder-validation-list">
                      {transformValidationIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {transformPreviewOutput && (
                  <div className="orthography-builder-preview-box">
                    <span className="orthography-builder-rule-label">{decodeEscapedUnicode('\\u9884\\u89c8\\u8f93\\u51fa')}</span>
                    <code>{transformPreviewOutput}</code>
                  </div>
                )}

                {transformSampleCaseResults.length > 0 && (
                  <div className="orthography-builder-validation-box orthography-builder-validation-box-neutral">
                    <span className="orthography-builder-rule-label">{decodeEscapedUnicode('\\u6837\\u4f8b\\u7ed3\\u679c')}</span>
                    <ul className="orthography-builder-validation-list">
                      {transformSampleCaseResults.map((sampleCase, index) => {
                        const status = sampleCase.matchesExpectation === false
                          ? decodeEscapedUnicode('\\u672a\\u901a\\u8fc7')
                          : sampleCase.matchesExpectation === true
                          ? decodeEscapedUnicode('\\u901a\\u8fc7')
                          : decodeEscapedUnicode('\\u9884\\u89c8');
                        return (
                          <li key={`${sampleCase.input}-${sampleCase.expectedOutput ?? ''}-${index}`}>
                            <strong>{status}</strong>
                              <span>{sampleCase.input}{' -> '}{sampleCase.actualOutput}</span>
                            {sampleCase.expectedOutput !== undefined && (
                              <span>{decodeEscapedUnicode('\\u671f\\u671b：')}{sampleCase.expectedOutput}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="orthography-builder-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void saveTransform()}
                    disabled={saving}
                  >
                    {saving ? decodeEscapedUnicode('\\u4fdd\\u5b58\\u4e2d...') : decodeEscapedUnicode('\\u4fdd\\u5b58\\u89c4\\u5219')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={resetEditor}
                    disabled={saving}
                  >
                    {decodeEscapedUnicode('\\u53d6\\u6d88\\u7f16\\u8f91')}
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
