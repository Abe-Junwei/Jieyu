import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDb, type OrthographyDocType, type OrthographyBridgeDocType } from '../db';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { useOrthographies } from '../hooks/useOrthographies';
import { formatOrthographyOptionLabel, groupOrthographiesForSelect } from '../hooks/useOrthographyPicker';
import { useLocale } from '../i18n';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import { FormField } from './ui';
import {
  getOrthographyBuilderMessages,
  getOrthographyCatalogGroupLabel,
  getOrthographyBridgeRulePlaceholder,
  getOrthographyBridgeSyntaxHint,
} from '../i18n/orthographyBuilderMessages';
import { getOrthographyBridgeManagerMessages } from '../i18n/orthographyBridgeManagerMessages';
import {
  createOrthographyBridgeRecord,
  deleteOrthographyBridgeRecord,
  listOrthographyBridgeRecords,
  updateOrthographyBridgeRecord,
} from '../services/LinguisticService.orthography';
import {
  buildPrimaryAndEnglishLabels,
  readEnglishFallbackMultiLangLabel,
  readPrimaryMultiLangLabel,
} from '../utils/multiLangLabels';
import {
  buildBridgeRulesFromRuleText,
  evaluateOrthographyBridgeSampleCases,
  parseBridgeSampleCases,
  previewOrthographyBridge,
  validateOrthographyBridge,
} from '../utils/orthographyBridges';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';
import {
  buildLanguageInputSeed,
  normalizeLanguageInputAssetId,
  resolveLanguageHostSelection,
} from '../utils/languageInputHostState';
import { listBuiltInOrthographiesByIds } from '../data/builtInOrthographies';

type LanguageOption = {
  code: string;
  label: string;
};

export type OrthographyBridgeShellFooterState = {
  visible: boolean;
  saving: boolean;
  saveLabel: string;
  cancelLabel: string;
  onSave: () => void;
  onCancel: () => void;
};

const NOOP = () => {};

type OrthographyBridgeManagerProps = {
  targetOrthography: OrthographyDocType | undefined;
  languageOptions: readonly LanguageOption[];
  compact?: boolean;
  initialExpanded?: boolean;
  hideToggleButton?: boolean;
  useShellFooter?: boolean;
  onShellFooterStateChange?: (state: OrthographyBridgeShellFooterState) => void;
};

function formatBridgeRuleText(bridge: OrthographyBridgeDocType): string {
  if (bridge.rules.ruleText?.trim()) return bridge.rules.ruleText;
  return (bridge.rules.mappings ?? [])
    .map((mapping) => `${mapping.from} => ${mapping.to}`)
    .join('\n');
}

function formatBridgeSampleCasesText(bridge: OrthographyBridgeDocType): string {
  return (bridge.sampleCases ?? [])
    .map((sampleCase) => sampleCase.expectedOutput !== undefined
      ? `${sampleCase.input} => ${sampleCase.expectedOutput}`
      : sampleCase.input)
    .join('\n');
}

export function OrthographyBridgeManager({
  targetOrthography,
  languageOptions,
  compact = false,
  initialExpanded = false,
  hideToggleButton = false,
  useShellFooter = false,
  onShellFooterStateChange,
}: OrthographyBridgeManagerProps) {
  const locale = useLocale();
  const { resolveLanguageCode, resolveLanguageDisplayName } = useLanguageCatalogLabelMap(locale);
  const builderMessages = getOrthographyBuilderMessages(locale);
  const managerMessages = getOrthographyBridgeManagerMessages(locale);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bridges, setBridges] = useState<OrthographyBridgeDocType[]>([]);
  const [sourceOrthographyById, setSourceOrthographyById] = useState<Record<string, OrthographyDocType>>();
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editingBridgeId, setEditingBridgeId] = useState<string | null>(null);
  const [sourceLanguageInput, setSourceLanguageInput] = useState<LanguageIsoInputValue>({ languageName: '', languageCode: '' });
  const [sourceLanguageId, setSourceLanguageId] = useState('');
  const [sourceCustomLanguageId, setSourceCustomLanguageId] = useState('');
  const [sourceOrthographyId, setSourceOrthographyId] = useState('');
  const [draftPrimaryName, setDraftPrimaryName] = useState('');
  const [draftEnglishFallbackName, setDraftEnglishFallbackName] = useState('');
  const [draftStatus, setDraftStatus] = useState<NonNullable<OrthographyBridgeDocType['status']>>('draft');
  const [draftBridgeEngine, setDraftBridgeEngine] = useState<OrthographyBridgeDocType['engine']>('table-map');
  const [draftBridgeRuleText, setDraftBridgeRuleText] = useState('');
  const [draftBridgeSampleInput, setDraftBridgeSampleInput] = useState('');
  const [draftBridgeSampleCasesText, setDraftBridgeSampleCasesText] = useState('');
  const [draftBridgeIsReversible, setDraftBridgeIsReversible] = useState(false);
  const loadRequestVersionRef = useRef(0);

  const targetLabel = targetOrthography ? formatOrthographyOptionLabel(targetOrthography, locale) : '';
  const fieldClassName = compact ? 'input layer-action-dialog-input' : 'input';
  const panelClassName = compact
    ? 'orthography-builder-panel orthography-builder-panel-compact'
    : 'orthography-builder-panel';
  const isExpanded = hideToggleButton ? true : expanded;
  const resolvedSourceLanguageId = sourceLanguageId === '__custom__' ? sourceCustomLanguageId.trim() : sourceLanguageId;
  const sourceOrthographies = useOrthographies(resolvedSourceLanguageId ? [resolvedSourceLanguageId] : []);
  const groupedSourceOrthographies = useMemo(() => groupOrthographiesForSelect(sourceOrthographies), [sourceOrthographies]);
  const bridgeRulePlaceholder = getOrthographyBridgeRulePlaceholder(builderMessages, draftBridgeEngine);
  const bridgeSyntaxHint = getOrthographyBridgeSyntaxHint(builderMessages, draftBridgeEngine);
  const targetBadge = targetOrthography ? getOrthographyCatalogBadgeInfo(locale, targetOrthography) : null;
  const bridgeDraftRules = useMemo(
    () => buildBridgeRulesFromRuleText(draftBridgeRuleText, { caseSensitive: true }),
    [draftBridgeRuleText],
  );
  const bridgeDraftSampleCases = useMemo(
    () => parseBridgeSampleCases(draftBridgeSampleCasesText),
    [draftBridgeSampleCasesText],
  );
  const bridgeValidationIssues = useMemo(() => validateOrthographyBridge({
    engine: draftBridgeEngine,
    rules: bridgeDraftRules,
  }).issues, [draftBridgeEngine, bridgeDraftRules]);
  const bridgeSampleCaseResults = useMemo(() => {
    if (bridgeDraftSampleCases.length === 0) return [];
    return evaluateOrthographyBridgeSampleCases({
      engine: draftBridgeEngine,
      rules: bridgeDraftRules,
      sampleCases: bridgeDraftSampleCases,
    });
  }, [draftBridgeEngine, bridgeDraftRules, bridgeDraftSampleCases]);
  const bridgePreviewOutput = useMemo(() => {
    const sampleInput = draftBridgeSampleInput.trim();
    if (!sampleInput) return '';
    return previewOrthographyBridge({
      engine: draftBridgeEngine,
      rules: bridgeDraftRules,
      text: sampleInput,
    });
  }, [draftBridgeEngine, draftBridgeSampleInput, bridgeDraftRules]);

  const resetEditor = useCallback(() => {
    setIsCreatingNew(false);
    setEditingBridgeId(null);
    setSourceLanguageInput({ languageName: '', languageCode: '' });
    setSourceLanguageId('');
    setSourceCustomLanguageId('');
    setSourceOrthographyId('');
    setDraftPrimaryName('');
    setDraftEnglishFallbackName('');
    setDraftStatus('draft');
    setDraftBridgeEngine('table-map');
    setDraftBridgeRuleText('');
    setDraftBridgeSampleInput('');
    setDraftBridgeSampleCasesText('');
    setDraftBridgeIsReversible(false);
    setError('');
  }, []);

  const loadBridges = useCallback(async () => {
    const requestVersion = loadRequestVersionRef.current + 1;
    loadRequestVersionRef.current = requestVersion;
    if (!targetOrthography?.id) {
      setBridges([]);
      setSourceOrthographyById({});
      return;
    }
    setLoading(true);
    try {
      const nextBridges = await listOrthographyBridgeRecords({
        targetOrthographyId: targetOrthography.id,
      });
      if (loadRequestVersionRef.current !== requestVersion) return;
      setBridges(nextBridges);
      const sourceIds = Array.from(new Set(nextBridges.map((item) => item.sourceOrthographyId)));
      if (sourceIds.length === 0) {
        setSourceOrthographyById({});
      } else {
        const db = await getDb();
        const [dbOrthographies, builtInOrthographies] = await Promise.all([
          db.dexie.orthographies.bulkGet(sourceIds),
          listBuiltInOrthographiesByIds(sourceIds),
        ]);
        if (loadRequestVersionRef.current !== requestVersion) return;
        const mergedOrthographies = new Map<string, OrthographyDocType>();
        builtInOrthographies.forEach((item) => {
          mergedOrthographies.set(item.id, item);
        });
        dbOrthographies
          .filter((item): item is OrthographyDocType => Boolean(item))
          .forEach((item) => {
            mergedOrthographies.set(item.id, item);
          });
        setSourceOrthographyById(Object.fromEntries(Array.from(mergedOrthographies.entries())));
      }
      setError('');
    } catch (loadError) {
      if (loadRequestVersionRef.current !== requestVersion) return;
      setError(loadError instanceof Error ? loadError.message : managerMessages.errorLoad);
    } finally {
      if (loadRequestVersionRef.current === requestVersion) {
        setLoading(false);
      }
    }
  }, [managerMessages.errorLoad, targetOrthography?.id]);

  useEffect(() => {
    loadRequestVersionRef.current += 1;
    setLoading(false);
    resetEditor();
    setExpanded(initialExpanded);
    setBridges([]);
    setSourceOrthographyById({});
  }, [initialExpanded, resetEditor, targetOrthography?.id]);

  useEffect(() => {
    if (!isExpanded) return;
    void loadBridges();
  }, [isExpanded, loadBridges]);

  useEffect(() => () => {
    loadRequestVersionRef.current += 1;
  }, []);

  const beginCreate = useCallback(() => {
    resetEditor();
    setIsCreatingNew(true);
  }, [resetEditor]);

  const beginEdit = useCallback((bridge: OrthographyBridgeDocType) => {
    const sourceOrthography = sourceOrthographyById?.[bridge.sourceOrthographyId];
    const nextSourceLanguageId = sourceOrthography?.languageId ?? '';
    const hostSelection = resolveLanguageHostSelection(nextSourceLanguageId, languageOptions);
    setIsCreatingNew(false);
    setEditingBridgeId(bridge.id);
    setSourceLanguageInput(buildLanguageInputSeed(nextSourceLanguageId, locale, resolveLanguageDisplayName, resolveLanguageCode));
    setSourceLanguageId(hostSelection.languageId);
    setSourceCustomLanguageId(hostSelection.customLanguageId);
    setSourceOrthographyId(bridge.sourceOrthographyId);
    setDraftPrimaryName(readPrimaryMultiLangLabel(bridge.name) ?? '');
    setDraftEnglishFallbackName(readEnglishFallbackMultiLangLabel(bridge.name) ?? '');
    setDraftStatus(bridge.status ?? 'draft');
    setDraftBridgeEngine(bridge.engine);
    setDraftBridgeRuleText(formatBridgeRuleText(bridge));
    setDraftBridgeSampleInput(bridge.sampleInput ?? '');
    setDraftBridgeSampleCasesText(formatBridgeSampleCasesText(bridge));
    setDraftBridgeIsReversible(Boolean(bridge.isReversible));
    setError('');
  }, [languageOptions, locale, resolveLanguageCode, resolveLanguageDisplayName, sourceOrthographyById]);

  const toggleBridgeStatus = useCallback(async (bridge: OrthographyBridgeDocType) => {
    setSaving(true);
    try {
      await updateOrthographyBridgeRecord({
        id: bridge.id,
        status: bridge.status === 'active' ? 'draft' : 'active',
      });
      await loadBridges();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : managerMessages.errorToggle);
    } finally {
      setSaving(false);
    }
  }, [loadBridges, managerMessages.errorToggle]);

  const deleteBridge = useCallback(async (bridgeId: string) => {
    setSaving(true);
    try {
      await deleteOrthographyBridgeRecord(bridgeId);
      await loadBridges();
      if (editingBridgeId === bridgeId) {
        resetEditor();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : managerMessages.errorDelete);
    } finally {
      setSaving(false);
    }
  }, [editingBridgeId, loadBridges, managerMessages.errorDelete, resetEditor]);

  useEffect(() => {
    if (!isCreatingNew && !editingBridgeId) return;
    if (!resolvedSourceLanguageId) {
      if (sourceOrthographyId) setSourceOrthographyId('');
      return;
    }
    if (sourceOrthographies.length === 0) {
      return;
    }
    if (sourceOrthographies.some((orthography) => orthography.id === sourceOrthographyId)) {
      return;
    }
    // 新建时不自动选首项，留空让用户显式选择；编辑已有桥接时回退到首项以恢复匹配
    // New: leave empty for explicit choice; Editing: fall back to first to restore match
    if (isCreatingNew) {
      setSourceOrthographyId('');
    } else {
      setSourceOrthographyId(sourceOrthographies[0]?.id ?? '');
    }
  }, [editingBridgeId, isCreatingNew, resolvedSourceLanguageId, sourceOrthographies, sourceOrthographyId]);

  const saveBridge = useCallback(async () => {
    if (!targetOrthography?.id) return;
    if (!resolvedSourceLanguageId || !sourceOrthographyId) {
      setError(managerMessages.errorMissingSource);
      return;
    }
    const selectedSourceOrthography = sourceOrthographies.find((orthography) => orthography.id === sourceOrthographyId);
    if (!selectedSourceOrthography) {
      setError(managerMessages.errorMissingSource);
      return;
    }
    if (sourceOrthographyId === targetOrthography.id) {
      setError(managerMessages.errorSameOrthography);
      return;
    }
    if (bridgeValidationIssues.length > 0) {
      setError(bridgeValidationIssues[0] ?? managerMessages.errorValidation);
      return;
    }
    const failedSampleCases = bridgeSampleCaseResults.filter((item) => item.matchesExpectation === false);
    if (failedSampleCases.length > 0) {
      setError(managerMessages.sampleCaseFailureCount(failedSampleCases.length));
      return;
    }

    setSaving(true);
    try {
      const existingBridge = editingBridgeId
        ? bridges.find((bridge) => bridge.id === editingBridgeId)
        : undefined;
      const name = buildPrimaryAndEnglishLabels({
        primaryLabel: draftPrimaryName,
        englishFallbackLabel: draftEnglishFallbackName,
        existing: existingBridge?.name,
      });
      const sampleInput = draftBridgeSampleInput.trim();
      const sampleOutput = sampleInput
        ? previewOrthographyBridge({
          engine: draftBridgeEngine,
          rules: bridgeDraftRules,
          text: sampleInput,
        })
        : null;
      if (isCreatingNew) {
        await createOrthographyBridgeRecord({
          sourceOrthographyId,
          targetOrthographyId: targetOrthography.id,
          ...(Object.keys(name).length ? { name } : {}),
          engine: draftBridgeEngine,
          rules: bridgeDraftRules,
          ...(sampleInput ? { sampleInput } : {}),
          ...(sampleOutput ? { sampleOutput } : {}),
          ...(bridgeDraftSampleCases.length > 0 ? { sampleCases: bridgeDraftSampleCases } : {}),
          isReversible: draftBridgeIsReversible,
          status: draftStatus,
        });
      } else if (editingBridgeId) {
        const shouldClearName = !Object.keys(name).length && existingBridge?.name !== undefined;
        await updateOrthographyBridgeRecord({
          id: editingBridgeId,
          sourceOrthographyId,
          targetOrthographyId: targetOrthography.id,
          ...(Object.keys(name).length ? { name } : {}),
          ...(shouldClearName ? { name: null } : {}),
          engine: draftBridgeEngine,
          rules: bridgeDraftRules,
          sampleInput: sampleInput || null,
          sampleOutput,
          sampleCases: bridgeDraftSampleCases.length > 0 ? bridgeDraftSampleCases : null,
          isReversible: draftBridgeIsReversible,
          status: draftStatus,
        });
      }
      await loadBridges();
      resetEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : managerMessages.errorSave);
    } finally {
      setSaving(false);
    }
  }, [bridgeDraftRules, bridgeDraftSampleCases, bridgeSampleCaseResults, bridgeValidationIssues, bridges, draftBridgeEngine, draftBridgeIsReversible, draftBridgeSampleInput, draftEnglishFallbackName, draftPrimaryName, draftStatus, editingBridgeId, isCreatingNew, loadBridges, managerMessages, resetEditor, resolvedSourceLanguageId, sourceOrthographies, sourceOrthographyId, targetOrthography?.id]);

  const handleSaveBridge = useCallback(() => {
    void saveBridge();
  }, [saveBridge]);

  const handleSourceLanguageInputChange = useCallback((nextValue: LanguageIsoInputValue) => {
    setSourceLanguageInput(nextValue);
    setSourceOrthographyId('');
    const hostSelection = resolveLanguageHostSelection(normalizeLanguageInputAssetId(nextValue), languageOptions);
    setSourceLanguageId(hostSelection.languageId);
    setSourceCustomLanguageId(hostSelection.customLanguageId);
  }, [languageOptions]);

  const handleSourceLanguageAssetIdChange = useCallback((nextAssetId: string) => {
    const normalizedAssetId = nextAssetId.trim().toLowerCase();
    setSourceLanguageInput((prev) => ({
      ...prev,
      languageAssetId: normalizedAssetId,
    }));
    setSourceOrthographyId('');
    const hostSelection = resolveLanguageHostSelection(normalizedAssetId, languageOptions);
    setSourceLanguageId(hostSelection.languageId);
    setSourceCustomLanguageId(hostSelection.customLanguageId);
  }, [languageOptions]);

  useEffect(() => {
    if (!onShellFooterStateChange) return;
    const showShellFooter = useShellFooter && (isCreatingNew || Boolean(editingBridgeId));
    if (!showShellFooter) {
      onShellFooterStateChange({
        visible: false,
        saving: false,
        saveLabel: '',
        cancelLabel: '',
        onSave: NOOP,
        onCancel: NOOP,
      });
      return;
    }

    onShellFooterStateChange({
      visible: true,
      saving,
      saveLabel: saving ? managerMessages.savingRule : managerMessages.saveRule,
      cancelLabel: managerMessages.cancelEdit,
      onSave: handleSaveBridge,
      onCancel: resetEditor,
    });
  }, [editingBridgeId, handleSaveBridge, isCreatingNew, managerMessages.cancelEdit, managerMessages.saveRule, managerMessages.savingRule, onShellFooterStateChange, resetEditor, saving, useShellFooter]);

  useEffect(() => () => {
    onShellFooterStateChange?.({
      visible: false,
      saving: false,
      saveLabel: '',
      cancelLabel: '',
      onSave: NOOP,
      onCancel: NOOP,
    });
  }, [onShellFooterStateChange]);

  if (!targetOrthography) return null;

  return (
    <div className={panelClassName}>
      <div className="orthography-builder-actions orthography-builder-toolbar-actions">
        {!hideToggleButton && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? managerMessages.toggleClose : managerMessages.toggleOpen}
          </button>
        )}
        {isExpanded && !isCreatingNew && !editingBridgeId && (
          <button
            type="button"
            className="btn"
            onClick={beginCreate}
            disabled={saving}
          >
            {managerMessages.createRule}
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="orthography-builder-grid">
          <div className="orthography-builder-preview-box">
            <span className="orthography-builder-rule-label">{managerMessages.targetOrthographyLabel}</span>
            <div className="orthography-builder-inline-badges">
              <span>{targetLabel}</span>
              {targetBadge ? <span className={targetBadge.className}>{targetBadge.label}</span> : null}
            </div>
          </div>

          {loading ? (
            <p className="orthography-builder-hint">{managerMessages.loadingRules}</p>
          ) : bridges.length === 0 && !isCreatingNew && !editingBridgeId ? (
            <p className="orthography-builder-hint">{managerMessages.emptyHint}</p>
          ) : null}

          {!isCreatingNew && !editingBridgeId && bridges.map((bridge) => {
            const sourceOrth = sourceOrthographyById?.[bridge.sourceOrthographyId];
            const sourceLabel = sourceOrth
              ? formatOrthographyOptionLabel(sourceOrth, locale)
              : bridge.sourceOrthographyId;
            return (
              <div key={bridge.id} className="orthography-builder-bridge-panel">
                <span>{sourceLabel} -&gt; {targetLabel}</span>
                {bridge.name ? (
                  <span className="orthography-builder-rule-label">
                    {readPrimaryMultiLangLabel(bridge.name) ?? readEnglishFallbackMultiLangLabel(bridge.name) ?? ''}
                  </span>
                ) : null}
                {bridge.status === 'active' ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void toggleBridgeStatus(bridge)} disabled={saving}>
                    {managerMessages.setDraft}
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => void toggleBridgeStatus(bridge)} disabled={saving}>
                    {managerMessages.setActive}
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => beginEdit(bridge)} disabled={saving}>
                  {managerMessages.edit}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => {
                    if (typeof window !== 'undefined' && !window.confirm(managerMessages.deleteConfirm ?? managerMessages.deleteRule)) return;
                    void deleteBridge(bridge.id);
                  }}
                  disabled={saving}
                >
                  {managerMessages.deleteRule}
                </button>
              </div>
            );
          })}

          {(isCreatingNew || editingBridgeId) && (
            <div className="orthography-builder-bridge-panel">
              <div className="orthography-builder-bridge-grid">
                <div className="ob-bridge-group ob-bridge-group-source">
                  <div className="orthography-builder-language-field">
                    <LanguageIsoInput
                      locale={locale}
                      value={sourceLanguageInput}
                      onChange={handleSourceLanguageInputChange}
                      resolveLanguageDisplayName={resolveLanguageDisplayName}
                      nameLabel={managerMessages.sourceLanguageLabel}
                      codeLabel={managerMessages.sourceLanguageCodeLabel}
                      namePlaceholder={managerMessages.sourceLanguagePlaceholder}
                      codePlaceholder={managerMessages.sourceLanguageCodePlaceholder}
                      disabled={saving}
                      error=""
                    />
                    <FormField label={managerMessages.sourceLanguageAssetIdLabel}>
                      <input
                        className={fieldClassName}
                        type="text"
                        value={sourceLanguageInput.languageAssetId ?? ''}
                        onChange={(event) => handleSourceLanguageAssetIdChange(event.target.value)}
                        placeholder={managerMessages.sourceLanguageAssetIdPlaceholder}
                        aria-label={managerMessages.sourceLanguageAssetIdLabel}
                        disabled={saving}
                      />
                    </FormField>
                  </div>

                  <FormField label={managerMessages.sourceOrthographyLabel}>
                    <select
                      className={fieldClassName}
                      value={sourceOrthographyId}
                      onChange={(event) => setSourceOrthographyId(event.target.value)}
                      disabled={sourceOrthographies.length === 0}
                    >
                      <option value="">{managerMessages.sourceOrthographyPlaceholder}</option>
                      {groupedSourceOrthographies.map((group) => (
                        <optgroup key={group.key} label={getOrthographyCatalogGroupLabel(locale, group.key)}>
                          {group.orthographies.map((orthography) => (
                            <option key={orthography.id} value={orthography.id}>
                              {formatOrthographyOptionLabel(orthography, locale)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="ob-bridge-group ob-bridge-group-meta">
                  <FormField label={managerMessages.ruleNameZhLabel}>
                    <input
                      className={fieldClassName}
                      type="text"
                      value={draftPrimaryName}
                      onChange={(event) => setDraftPrimaryName(event.target.value)}
                      placeholder={managerMessages.ruleNameZhPlaceholder}
                    />
                  </FormField>

                  <FormField label={managerMessages.ruleNameEnLabel}>
                    <input
                      className={fieldClassName}
                      type="text"
                      value={draftEnglishFallbackName}
                      onChange={(event) => setDraftEnglishFallbackName(event.target.value)}
                      placeholder={managerMessages.ruleNameEnPlaceholder}
                    />
                  </FormField>

                  <FormField label={managerMessages.statusLabel}>
                    <select
                      className={fieldClassName}
                      value={draftStatus}
                      onChange={(event) => setDraftStatus(event.target.value as NonNullable<OrthographyBridgeDocType['status']>)}
                    >
                      <option value="draft">{managerMessages.statusDraft}</option>
                      <option value="active">{managerMessages.statusActive}</option>
                      <option value="deprecated">{managerMessages.statusDeprecated}</option>
                    </select>
                  </FormField>

                  <FormField label={builderMessages.bridgeEngineLabel}>
                    <select
                      className={fieldClassName}
                      value={draftBridgeEngine}
                      onChange={(event) => setDraftBridgeEngine(event.target.value as OrthographyBridgeDocType['engine'])}
                    >
                      <option value="table-map">{builderMessages.bridgeEngineTableMap}</option>
                      <option value="icu-rule">{builderMessages.bridgeEngineIcuRule}</option>
                      <option value="manual">{builderMessages.bridgeEngineManual}</option>
                    </select>
                  </FormField>

                  <label className="orthography-builder-checkbox ob-bridge-checkbox-row">
                    <input
                      type="checkbox"
                      checked={draftBridgeIsReversible}
                      onChange={(event) => setDraftBridgeIsReversible(event.target.checked)}
                    />
                    <span>{builderMessages.bridgeReversibleLabel}</span>
                  </label>
                </div>

                <div className="ob-bridge-group ob-bridge-group-content">
                  <div className="orthography-builder-rule-block">
                    <span className="orthography-builder-rule-label">{builderMessages.bridgeRuleTextLabel}</span>
                    <textarea
                      className="input orthography-builder-rule-textarea"
                      value={draftBridgeRuleText}
                      onChange={(event) => setDraftBridgeRuleText(event.target.value)}
                      placeholder={bridgeRulePlaceholder}
                      rows={compact ? 5 : 6}
                    />
                  </div>

                  <div className="orthography-builder-preview-box orthography-builder-bridge-hint-box">
                    <span className="orthography-builder-rule-label">{builderMessages.bridgeRuleSyntaxTitle}</span>
                    <span>{bridgeSyntaxHint}</span>
                  </div>

                  <FormField label={builderMessages.bridgeInputPreviewLabel}>
                    <input
                      className={fieldClassName}
                      type="text"
                      value={draftBridgeSampleInput}
                      onChange={(event) => setDraftBridgeSampleInput(event.target.value)}
                      placeholder={builderMessages.bridgeInputPreviewPlaceholder}
                    />
                  </FormField>

                  <div className="orthography-builder-rule-block">
                    <span className="orthography-builder-rule-label">{builderMessages.bridgeSampleCaseLabel}</span>
                    <textarea
                      className="input orthography-builder-rule-textarea"
                      value={draftBridgeSampleCasesText}
                      onChange={(event) => setDraftBridgeSampleCasesText(event.target.value)}
                      placeholder={builderMessages.bridgeSampleCasePlaceholder}
                      rows={compact ? 4 : 5}
                    />
                  </div>

                  {bridgeValidationIssues.length > 0 && (
                    <div className="orthography-builder-validation-box orthography-builder-validation-box-error">
                      <span className="orthography-builder-rule-label">{builderMessages.bridgeValidationTitle}</span>
                      <ul className="orthography-builder-validation-list">
                        {bridgeValidationIssues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {bridgePreviewOutput && (
                    <div className="orthography-builder-preview-box">
                      <span className="orthography-builder-rule-label">{builderMessages.bridgePreviewOutputTitle}</span>
                      <code>{bridgePreviewOutput}</code>
                    </div>
                  )}

                  {bridgeSampleCaseResults.length > 0 && (
                    <div className="orthography-builder-validation-box orthography-builder-validation-box-neutral">
                      <span className="orthography-builder-rule-label">{builderMessages.bridgeSampleResultTitle}</span>
                      <ul className="orthography-builder-validation-list">
                        {bridgeSampleCaseResults.map((sampleCase, index) => {
                          const status = sampleCase.matchesExpectation === false
                            ? builderMessages.sampleStatusFail
                            : sampleCase.matchesExpectation === true
                            ? builderMessages.sampleStatusPass
                            : builderMessages.sampleStatusPreview;
                          return (
                            <li key={`${sampleCase.input}-${sampleCase.expectedOutput ?? ''}-${index}`}>
                              <strong>{status}</strong>
                              <span>{sampleCase.input}{' -> '}{sampleCase.actualOutput}</span>
                              {sampleCase.expectedOutput !== undefined && (
                                <span>{builderMessages.sampleExpected}{sampleCase.expectedOutput}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                {!useShellFooter ? (
                  <div className="orthography-builder-actions orthography-builder-footer-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={handleSaveBridge}
                      disabled={saving}
                    >
                      {saving ? managerMessages.savingRule : managerMessages.saveRule}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={resetEditor}
                      disabled={saving}
                    >
                      {managerMessages.cancelEdit}
                    </button>
                  </div>
                ) : null}
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
