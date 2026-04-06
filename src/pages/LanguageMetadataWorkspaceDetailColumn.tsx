import { PanelSection } from '../components/ui/PanelSection';
import { PanelSummary } from '../components/ui/PanelSummary';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, tf } from '../i18n';
import { readMapProviderConfig, writeMapProviderConfig, MAP_PROVIDERS, geocodeSearch, getMapStyles, getDefaultStyleId, type MapProviderKind, type MapProviderConfig, type GeocodeSuggestion } from '../components/LanguageMapEmbed';
import type { LanguageCatalogDisplayNameEntry, LanguageCatalogEntry, LanguageCatalogVisibility } from '../services/LinguisticService';
import { LinguisticService } from '../services/LinguisticService';
import type { CustomFieldDefinitionDocType, CustomFieldValueType } from '../db';
import {
  LANGUAGE_DISPLAY_NAME_ROLE_OPTIONS,
  readEntryKindLabel,
  readHistoryFieldLabel,
  type HistoryItem,
  type LanguageDisplayNameDraftRow,
  type LanguageDisplayNameRowChangeHandler,
  type LanguageMetadataDraft,
  type LanguageMetadataDraftChangeHandler,
  type WorkspaceLocale,
} from './languageMetadataWorkspace.shared';

// 地图组件懒加载，避免增加主包体积 | Lazy-load map component to keep main bundle small
const LanguageMapEmbed = lazy(() => import('../components/LanguageMapEmbed').then((m) => ({ default: m.LanguageMapEmbed })));

// ─── 自定义字段常量（组件外不变） | Custom field constants (static, outside component) ───
const CUSTOM_FIELD_TYPES: CustomFieldValueType[] = ['text', 'number', 'boolean', 'select', 'multiselect', 'url'];
const customFieldTypeLabelKey: Record<CustomFieldValueType, Parameters<typeof t>[1]> = {
  text: 'workspace.languageMetadata.customFieldTypeText',
  number: 'workspace.languageMetadata.customFieldTypeNumber',
  boolean: 'workspace.languageMetadata.customFieldTypeBoolean',
  select: 'workspace.languageMetadata.customFieldTypeSelect',
  multiselect: 'workspace.languageMetadata.customFieldTypeMultiselect',
  url: 'workspace.languageMetadata.customFieldTypeUrl',
};
// multiselect 分隔符：统一用 ', ' 显示，保存时用同一分隔符拆分 | multiselect delimiter: uniform ', '
const MULTISELECT_DELIMITER = ', ';

function readDisplayNameRoleLabel(locale: WorkspaceLocale, role: LanguageCatalogDisplayNameEntry['role']): string {
  const keyByRole: Record<LanguageCatalogDisplayNameEntry['role'], string> = {
    preferred: 'workspace.languageMetadata.matrixRolePreferred',
    menu: 'workspace.languageMetadata.matrixRoleMenu',
    autonym: 'workspace.languageMetadata.matrixRoleAutonym',
    exonym: 'workspace.languageMetadata.matrixRoleExonym',
    academic: 'workspace.languageMetadata.matrixRoleAcademic',
    historical: 'workspace.languageMetadata.matrixRoleHistorical',
    search: 'workspace.languageMetadata.matrixRoleSearch',
  };
  return t(locale, keyByRole[role] as Parameters<typeof t>[1]);
}

type LanguageMetadataWorkspaceDetailColumnProps = {
  locale: WorkspaceLocale;
  draft: LanguageMetadataDraft;
  selectedEntry: LanguageCatalogEntry | null;
  duplicateHint: { id: string; name: string } | null;
  historyItems: HistoryItem[];
  saving: boolean;
  deleting: boolean;
  saveError: string;
  saveSuccess: string;
  onDraftChange: LanguageMetadataDraftChangeHandler;
  onDisplayNameRowChange: LanguageDisplayNameRowChangeHandler;
  onAddDisplayNameRow: () => void;
  onRemoveDisplayNameRow: (rowKey: string) => void;
  onResetDraft: () => void;
  onDelete: () => void;
  onSave: () => void;
  onSelectEntry: (languageId: string) => void;
};

export function LanguageMetadataWorkspaceDetailColumn({
  locale,
  draft,
  selectedEntry,
  duplicateHint,
  historyItems,
  saving,
  deleting,
  saveError,
  saveSuccess,
  onDraftChange,
  onDisplayNameRowChange,
  onAddDisplayNameRow,
  onRemoveDisplayNameRow,
  onResetDraft,
  onDelete,
  onSave,
  onSelectEntry,
}: LanguageMetadataWorkspaceDetailColumnProps) {
  // ─── 地图服务商状态 | Map provider state ───
  const [mapProviderConfig, setMapProviderConfig] = useState<MapProviderConfig>(readMapProviderConfig);
  const [mapKeyInput, setMapKeyInput] = useState(() => readMapProviderConfig().apiKey);
  const [showMapConfig, setShowMapConfig] = useState(false);
  const activeProviderDef = useMemo(
    () => MAP_PROVIDERS.find((p) => p.kind === mapProviderConfig.kind) ?? MAP_PROVIDERS[0]!,
    [mapProviderConfig.kind],
  );
  const handleMapProviderChange = useCallback((kind: MapProviderKind) => {
    // 保存当前 provider 的 key，恢复目标 provider 之前的 key | Save current key, restore target key
    const savedKeys: Partial<Record<MapProviderKind, string>> = {
      ...mapProviderConfig.apiKeysByProvider,
      ...(mapProviderConfig.apiKey ? { [mapProviderConfig.kind]: mapProviderConfig.apiKey } : {}),
    };
    const restoredKey = savedKeys[kind] ?? '';
    const next: MapProviderConfig = { kind, apiKey: restoredKey, styleId: getDefaultStyleId(kind), apiKeysByProvider: savedKeys };
    writeMapProviderConfig(next);
    setMapProviderConfig(next);
    setMapKeyInput(restoredKey);
    setShowMapConfig(!restoredKey && (MAP_PROVIDERS.find((p) => p.kind === kind)?.requiresKey ?? false));
  }, [mapProviderConfig]);
  const handleSaveMapKey = useCallback(() => {
    const trimmed = mapKeyInput.trim();
    if (!trimmed) return; // 空 Key 不保存 | Do not save empty key
    const savedKeys = { ...mapProviderConfig.apiKeysByProvider, [mapProviderConfig.kind]: trimmed };
    const next: MapProviderConfig = { ...mapProviderConfig, apiKey: trimmed, apiKeysByProvider: savedKeys };
    writeMapProviderConfig(next);
    setMapProviderConfig(next);
    setShowMapConfig(false);
  }, [mapKeyInput, mapProviderConfig]);
  const handleClearMapKey = useCallback(() => {
    const savedKeys = { ...mapProviderConfig.apiKeysByProvider };
    delete savedKeys[mapProviderConfig.kind];
    const next: MapProviderConfig = { ...mapProviderConfig, apiKey: '', apiKeysByProvider: savedKeys };
    writeMapProviderConfig(next);
    setMapProviderConfig(next);
    setMapKeyInput('');
    setShowMapConfig(false);
  }, [mapProviderConfig]);

  const handleMapStyleChange = useCallback((styleId: string) => {
    const next: MapProviderConfig = { ...mapProviderConfig, styleId };
    writeMapProviderConfig(next);
    setMapProviderConfig(next);
  }, [mapProviderConfig]);

  const availableStyles = useMemo(() => getMapStyles(mapProviderConfig.kind), [mapProviderConfig.kind]);

  // ─── 地名搜索状态 | Geocode search state ───
  const [geocodeQuery, setGeocodeQuery] = useState('');
  const [geocodeResults, setGeocodeResults] = useState<GeocodeSuggestion[]>([]);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeOpen, setGeocodeOpen] = useState(false);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const geocodeContainerRef = useRef<HTMLDivElement>(null);

  const handleGeocodeSearch = useCallback(() => {
    const q = geocodeQuery.trim();
    if (!q) { setGeocodeResults([]); setGeocodeOpen(false); return; }
    geocodeAbortRef.current?.abort();
    const ac = new AbortController();
    geocodeAbortRef.current = ac;
    setGeocodeLoading(true);
    geocodeSearch(q, locale, ac.signal)
      .then((results) => { if (!ac.signal.aborted) { setGeocodeResults(results); setGeocodeOpen(true); } })
      .catch(() => { /* aborted or network error */ })
      .finally(() => { if (!ac.signal.aborted) setGeocodeLoading(false); });
  }, [geocodeQuery, locale]);

  const handleGeocodeSelect = useCallback((s: GeocodeSuggestion) => {
    onDraftChange('latitude', String(s.lat));
    onDraftChange('longitude', String(s.lng));
    setGeocodeQuery('');
    setGeocodeResults([]);
    setGeocodeOpen(false);
  }, [onDraftChange]);

  // 点击外部关闭下拉 | Close dropdown on outside click
  useEffect(() => {
    if (!geocodeOpen) return;
    const handler = (e: MouseEvent) => {
      if (geocodeContainerRef.current && !geocodeContainerRef.current.contains(e.target as Node)) {
        setGeocodeOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [geocodeOpen]);

  const handleMapCoordinateClick = useCallback((lat: number, lng: number) => {
    onDraftChange('latitude', String(lat));
    onDraftChange('longitude', String(lng));
  }, [onDraftChange]);

  // ─── 自定义字段定义状态 | Custom field definitions state ───
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDefinitionDocType[]>([]);
  const [showFieldManage, setShowFieldManage] = useState(false);
  // 管理模式下本地暂存定义编辑，失焦后再写入 DB | Buffer edits in manage mode, persist on blur
  const [editingDefs, setEditingDefs] = useState<Map<string, CustomFieldDefinitionDocType>>(new Map());
  const editingDefsRef = useRef(editingDefs);
  editingDefsRef.current = editingDefs;

  // 加载自定义字段定义 | Load custom field definitions
  useEffect(() => {
    LinguisticService.listCustomFieldDefinitions().then(setFieldDefs).catch(() => {/* ignore */});
  }, []);

  const handleAddFieldDef = useCallback(async () => {
    const name = locale === 'zh-CN' ? '新字段' : 'New field';
    try {
      const saved = await LinguisticService.upsertCustomFieldDefinition({
        name: { 'zh-CN': name, 'en-US': name },
        fieldType: 'text',
      });
      setFieldDefs((prev) => [...prev, saved]);
    } catch (err) {
      console.error('Failed to add field definition | 新增字段定义失败', err);
    }
  }, [locale]);

  // 本地编辑暂存 | Local edit buffer
  const handleFieldDefLocalChange = useCallback((def: CustomFieldDefinitionDocType) => {
    setEditingDefs((prev) => new Map(prev).set(def.id, def));
    setFieldDefs((prev) => prev.map((d) => d.id === def.id ? def : d));
  }, []);

  // 失焦时持久化（用 ref 避免闭包捕获过期 state）| Persist on blur (ref avoids stale closure)
  const handleFieldDefBlur = useCallback(async (defId: string) => {
    const buffered = editingDefsRef.current.get(defId);
    if (!buffered) return;
    try {
      const saved = await LinguisticService.upsertCustomFieldDefinition({
        id: buffered.id,
        name: buffered.name,
        fieldType: buffered.fieldType,
        ...(buffered.options?.length ? { options: buffered.options } : {}),
        ...(buffered.description ? { description: buffered.description } : {}),
      });
      setFieldDefs((prev) => prev.map((d) => d.id === saved.id ? saved : d));
      setEditingDefs((prev) => { const next = new Map(prev); next.delete(defId); return next; });
    } catch (err) {
      console.error('Failed to persist field definition | 持久化字段定义失败', err);
    }
  }, []);

  // 类型切换立即持久化（不频繁） | Type change: persist immediately (infrequent)
  const handleFieldTypeChange = useCallback(async (def: CustomFieldDefinitionDocType, newType: CustomFieldValueType) => {
    const previous = def;
    const updated = { ...def, fieldType: newType };
    setEditingDefs((prev) => new Map(prev).set(def.id, updated));
    setFieldDefs((prev) => prev.map((d) => d.id === def.id ? updated : d));
    try {
      const saved = await LinguisticService.upsertCustomFieldDefinition({
        id: updated.id,
        name: updated.name,
        fieldType: updated.fieldType,
        ...(updated.options?.length ? { options: updated.options } : {}),
        ...(updated.description ? { description: updated.description } : {}),
      });
      setFieldDefs((prev) => prev.map((d) => d.id === saved.id ? saved : d));
      setEditingDefs((prev) => { const next = new Map(prev); next.delete(def.id); return next; });
    } catch (err) {
      setFieldDefs((prev) => prev.map((d) => d.id === previous.id ? previous : d));
      setEditingDefs((prev) => new Map(prev).set(previous.id, previous));
      console.error('Failed to update field type | 更新字段类型失败', err);
    }
  }, []);

  const handleDeleteFieldDef = useCallback(async (def: CustomFieldDefinitionDocType) => {
    const label = def.name[locale] || def.name['en-US'] || def.name['zh-CN'] || '';
    if (!window.confirm(tf(locale, 'workspace.languageMetadata.customFieldDeleteConfirm', { '0': label }))) return;
    try {
      await LinguisticService.deleteCustomFieldDefinition(def.id);
      setFieldDefs((prev) => prev.filter((d) => d.id !== def.id));
      setEditingDefs((prev) => { const next = new Map(prev); next.delete(def.id); return next; });
      // 清除该字段的值 | Clear value of deleted field
      const next = { ...draft.customFieldValues };
      delete next[def.id];
      onDraftChange('customFieldValues', next);
    } catch (err) {
      console.error('Failed to delete field definition | 删除字段定义失败', err);
    }
  }, [locale, draft.customFieldValues, onDraftChange]);

  const handleCustomFieldValueChange = useCallback((fieldId: string, value: string) => {
    onDraftChange('customFieldValues', { ...draft.customFieldValues, [fieldId]: value });
  }, [draft.customFieldValues, onDraftChange]);

  const entryKindLabel = readEntryKindLabel(locale, selectedEntry);
  const visibilityLabel = draft.visibility === 'hidden'
    ? t(locale, 'workspace.languageMetadata.visibilityHidden')
    : t(locale, 'workspace.languageMetadata.visibilityVisible');
  const summaryName = draft.localName.trim() || selectedEntry?.localName || t(locale, 'workspace.languageMetadata.createCustom');
  const summaryEnglish = draft.englishName.trim() || selectedEntry?.englishName || t(locale, 'workspace.languageMetadata.notSet');
  const summaryCode = draft.languageCode.trim() || draft.iso6393.trim() || selectedEntry?.languageCode || t(locale, 'workspace.languageMetadata.notSet');
  const summaryCanonicalTag = draft.canonicalTag.trim() || selectedEntry?.canonicalTag || t(locale, 'workspace.languageMetadata.notSet');
  const summaryId = selectedEntry?.id || draft.idInput.trim() || t(locale, 'workspace.languageMetadata.notSet');

  return (
    <div className="language-metadata-workspace-detail-column">
      <PanelSummary
        className="language-metadata-workspace-summary-card"
        title={t(locale, 'workspace.languageMetadata.detailTitle')}
        description={selectedEntry?.localName ?? t(locale, 'workspace.languageMetadata.createCustom')}
        meta={(
          <span className="language-metadata-workspace-summary-meta-row">
            <span className="language-metadata-workspace-chip language-metadata-workspace-chip-subtle">{entryKindLabel}</span>
            <span className="language-metadata-workspace-chip">{visibilityLabel}</span>
          </span>
        )}
        supportingText={selectedEntry?.englishName ?? t(locale, 'workspace.languageMetadata.detailDescription')}
      />

      <div className="language-metadata-workspace-insights" aria-label={t(locale, 'workspace.languageMetadata.detailTitle')}>
        <article className="language-metadata-workspace-insight-card">
          <span className="language-metadata-workspace-insight-label">{t(locale, 'workspace.languageMetadata.localNameLabel')}</span>
          <strong className="language-metadata-workspace-insight-value">{summaryName}</strong>
          <span className="language-metadata-workspace-insight-note">{summaryEnglish}</span>
        </article>
        <article className="language-metadata-workspace-insight-card">
          <span className="language-metadata-workspace-insight-label">{t(locale, 'workspace.languageMetadata.languageCodeLabel')}</span>
          <strong className="language-metadata-workspace-insight-value">{summaryCode}</strong>
          <span className="language-metadata-workspace-insight-note">{t(locale, 'workspace.languageMetadata.canonicalTagLabel')} · {summaryCanonicalTag}</span>
        </article>
        <article className="language-metadata-workspace-insight-card">
          <span className="language-metadata-workspace-insight-label">{t(locale, 'workspace.languageMetadata.idLabel')}</span>
          <strong className="language-metadata-workspace-insight-value">{summaryId}</strong>
          <span className="language-metadata-workspace-insight-note">{entryKindLabel} · {visibilityLabel}</span>
        </article>
      </div>

      <PanelSection className="language-metadata-workspace-detail-panel" title={t(locale, 'workspace.languageMetadata.editTitle')} description={t(locale, 'workspace.languageMetadata.editDescription')}>
        <div className="language-metadata-workspace-form-stack">
          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionIdentity')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionIdentityDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.idLabel')}</span>
                <input className="input" type="text" value={draft.idInput} onChange={(event) => onDraftChange('idInput', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.idPlaceholder')} disabled={Boolean(selectedEntry && !selectedEntry.id.startsWith('user:'))} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.languageCodeLabel')}</span>
                <input className="input" type="text" value={draft.languageCode} onChange={(event) => onDraftChange('languageCode', event.target.value)} />
                {duplicateHint && (
                  <span className="panel-feedback panel-feedback--warn">
                    {tf(locale, 'workspace.languageMetadata.duplicateCodeHint', { name: duplicateHint.name, id: duplicateHint.id })}
                    {' '}
                    <button type="button" className="language-metadata-workspace-inline-link" onClick={() => onSelectEntry(duplicateHint.id)}>
                      {t(locale, 'workspace.languageMetadata.duplicateCodeJump')}
                    </button>
                  </span>
                )}
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.canonicalTagLabel')}</span>
                <input className="input" type="text" value={draft.canonicalTag} onChange={(event) => onDraftChange('canonicalTag', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.localNameLabel')}</span>
                <input className="input" type="text" value={draft.localName} onChange={(event) => onDraftChange('localName', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.englishNameLabel')}</span>
                <input className="input" type="text" value={draft.englishName} onChange={(event) => onDraftChange('englishName', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.nativeNameLabel')}</span>
                <input className="input" type="text" value={draft.nativeName} onChange={(event) => onDraftChange('nativeName', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionStandards')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionStandardsDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.iso6391Label')}</span>
                <input className="input" type="text" value={draft.iso6391} onChange={(event) => onDraftChange('iso6391', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.iso6392BLabel')}</span>
                <input className="input" type="text" value={draft.iso6392B} onChange={(event) => onDraftChange('iso6392B', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.iso6392TLabel')}</span>
                <input className="input" type="text" value={draft.iso6392T} onChange={(event) => onDraftChange('iso6392T', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.iso6393Label')}</span>
                <input className="input" type="text" value={draft.iso6393} onChange={(event) => onDraftChange('iso6393', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.glottocodeLabel')}</span>
                <input className="input" type="text" value={draft.glottocode} onChange={(event) => onDraftChange('glottocode', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.wikidataIdLabel')}</span>
                <input className="input" type="text" value={draft.wikidataId} onChange={(event) => onDraftChange('wikidataId', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionClassification')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionClassificationDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.genusLabel')}</span>
                <input className="input" type="text" value={draft.genus} onChange={(event) => onDraftChange('genus', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.classificationPathLabel')}</span>
                <input className="input" type="text" value={draft.classificationPath} onChange={(event) => onDraftChange('classificationPath', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.macrolanguageLabel')}</span>
                <input className="input" type="text" value={draft.macrolanguage} onChange={(event) => onDraftChange('macrolanguage', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.scopeLabel')}</span>
                <select className="input" value={draft.scope} onChange={(event) => onDraftChange('scope', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="individual">{t(locale, 'workspace.languageMetadata.scopeIndividual')}</option>
                  <option value="macrolanguage">{t(locale, 'workspace.languageMetadata.scopeMacrolanguage')}</option>
                  <option value="collection">{t(locale, 'workspace.languageMetadata.scopeCollection')}</option>
                  <option value="special">{t(locale, 'workspace.languageMetadata.scopeSpecial')}</option>
                  <option value="private-use">{t(locale, 'workspace.languageMetadata.scopePrivateUse')}</option>
                </select>
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.languageTypeLabel')}</span>
                <select className="input" value={draft.languageType} onChange={(event) => onDraftChange('languageType', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="living">{t(locale, 'workspace.languageMetadata.languageTypeLiving')}</option>
                  <option value="historical">{t(locale, 'workspace.languageMetadata.languageTypeHistorical')}</option>
                  <option value="extinct">{t(locale, 'workspace.languageMetadata.languageTypeExtinct')}</option>
                  <option value="ancient">{t(locale, 'workspace.languageMetadata.languageTypeAncient')}</option>
                  <option value="constructed">{t(locale, 'workspace.languageMetadata.languageTypeConstructed')}</option>
                  <option value="special">{t(locale, 'workspace.languageMetadata.languageTypeSpecial')}</option>
                </select>
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.visibilityLabel')}</span>
                <select className="input" value={draft.visibility} onChange={(event) => onDraftChange('visibility', event.target.value as LanguageCatalogVisibility)}>
                  <option value="visible">{t(locale, 'workspace.languageMetadata.visibilityVisible')}</option>
                  <option value="hidden">{t(locale, 'workspace.languageMetadata.visibilityHidden')}</option>
                </select>
              </label>
            </div>
          </section>

          {/* 使用人口 | Speaker population */}
          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionPopulation')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionPopulationDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.speakerCountL1Label')}</span>
                <input className="input" type="number" min="0" value={draft.speakerCountL1} onChange={(event) => onDraftChange('speakerCountL1', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.speakerCountL2Label')}</span>
                <input className="input" type="number" min="0" value={draft.speakerCountL2} onChange={(event) => onDraftChange('speakerCountL2', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.speakerCountSourceLabel')}</span>
                <input className="input" type="text" value={draft.speakerCountSource} onChange={(event) => onDraftChange('speakerCountSource', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.speakerCountYearLabel')}</span>
                <input className="input" type="number" value={draft.speakerCountYear} onChange={(event) => onDraftChange('speakerCountYear', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.speakerTrendLabel')}</span>
                <select className="input" value={draft.speakerTrend} onChange={(event) => onDraftChange('speakerTrend', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="growing">{t(locale, 'workspace.languageMetadata.speakerTrendGrowing')}</option>
                  <option value="stable">{t(locale, 'workspace.languageMetadata.speakerTrendStable')}</option>
                  <option value="shrinking">{t(locale, 'workspace.languageMetadata.speakerTrendShrinking')}</option>
                  <option value="unknown">{t(locale, 'workspace.languageMetadata.speakerTrendUnknown')}</option>
                </select>
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.literacyRateLabel')}</span>
                <input className="input" type="number" min="0" max="100" step="0.1" value={draft.literacyRate} onChange={(event) => onDraftChange('literacyRate', event.target.value)} />
              </label>
            </div>
          </section>

          {/* 扩展地理信息 | Extended geography */}
          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionGeographyExtended')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionGeographyExtendedDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.countriesLabel')}</span>
                <input className="input" type="text" value={draft.countriesText} onChange={(event) => onDraftChange('countriesText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.countriesPlaceholder')} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.macroareaLabel')}</span>
                <select className="input" value={draft.macroarea} onChange={(event) => onDraftChange('macroarea', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="Africa">{t(locale, 'workspace.languageMetadata.macroareaAfrica')}</option>
                  <option value="Eurasia">{t(locale, 'workspace.languageMetadata.macroareaEurasia')}</option>
                  <option value="Papunesia">{t(locale, 'workspace.languageMetadata.macroareaPapunesia')}</option>
                  <option value="Australia">{t(locale, 'workspace.languageMetadata.macroareaAustralia')}</option>
                  <option value="North America">{t(locale, 'workspace.languageMetadata.macroareaNorthAmerica')}</option>
                  <option value="South America">{t(locale, 'workspace.languageMetadata.macroareaSouthAmerica')}</option>
                </select>
              </label>
            </div>
            <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
              <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionsLabel')}</span>
              <textarea className="input language-metadata-workspace-textarea" value={draft.administrativeDivisionsText} onChange={(event) => onDraftChange('administrativeDivisionsText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionsPlaceholder')} />
            </label>
          </section>

          {/* 语言活力 | Language vitality */}
          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionVitality')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionVitalityDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.endangermentLevelLabel')}</span>
                <select className="input" value={draft.endangermentLevel} onChange={(event) => onDraftChange('endangermentLevel', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="safe">{t(locale, 'workspace.languageMetadata.endangermentLevelSafe')}</option>
                  <option value="vulnerable">{t(locale, 'workspace.languageMetadata.endangermentLevelVulnerable')}</option>
                  <option value="definitely_endangered">{t(locale, 'workspace.languageMetadata.endangermentLevelDefinitelyEndangered')}</option>
                  <option value="severely_endangered">{t(locale, 'workspace.languageMetadata.endangermentLevelSeverelyEndangered')}</option>
                  <option value="critically_endangered">{t(locale, 'workspace.languageMetadata.endangermentLevelCriticallyEndangered')}</option>
                  <option value="extinct">{t(locale, 'workspace.languageMetadata.endangermentLevelExtinct')}</option>
                </select>
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.aesStatusLabel')}</span>
                <select className="input" value={draft.aesStatus} onChange={(event) => onDraftChange('aesStatus', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="not_endangered">{t(locale, 'workspace.languageMetadata.aesNotEndangered')}</option>
                  <option value="threatened">{t(locale, 'workspace.languageMetadata.aesThreatened')}</option>
                  <option value="shifting">{t(locale, 'workspace.languageMetadata.aesShifting')}</option>
                  <option value="moribund">{t(locale, 'workspace.languageMetadata.aesMoribund')}</option>
                  <option value="nearly_extinct">{t(locale, 'workspace.languageMetadata.aesNearlyExtinct')}</option>
                  <option value="extinct">{t(locale, 'workspace.languageMetadata.aesExtinct')}</option>
                </select>
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.endangermentSourceLabel')}</span>
                <input className="input" type="text" value={draft.endangermentSource} onChange={(event) => onDraftChange('endangermentSource', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.endangermentAssessmentYearLabel')}</span>
                <input className="input" type="number" value={draft.endangermentAssessmentYear} onChange={(event) => onDraftChange('endangermentAssessmentYear', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.intergenerationalTransmissionLabel')}</span>
                <select className="input" value={draft.intergenerationalTransmission} onChange={(event) => onDraftChange('intergenerationalTransmission', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="all_ages">{t(locale, 'workspace.languageMetadata.intergenerationalAllAges')}</option>
                  <option value="adults_only">{t(locale, 'workspace.languageMetadata.intergenerationalAdultsOnly')}</option>
                  <option value="elderly_only">{t(locale, 'workspace.languageMetadata.intergenerationalElderlyOnly')}</option>
                  <option value="very_few">{t(locale, 'workspace.languageMetadata.intergenerationalVeryFew')}</option>
                  <option value="none">{t(locale, 'workspace.languageMetadata.intergenerationalNone')}</option>
                </select>
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.domainsLabel')}</span>
                <input className="input" type="text" value={draft.domainsText} onChange={(event) => onDraftChange('domainsText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.domainsPlaceholder')} />
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.officialStatusLabel')}</span>
                <select className="input" value={draft.officialStatus} onChange={(event) => onDraftChange('officialStatus', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="national">{t(locale, 'workspace.languageMetadata.officialStatusNational')}</option>
                  <option value="regional">{t(locale, 'workspace.languageMetadata.officialStatusRegional')}</option>
                  <option value="recognized_minority">{t(locale, 'workspace.languageMetadata.officialStatusRecognizedMinority')}</option>
                  <option value="none">{t(locale, 'workspace.languageMetadata.officialStatusNone')}</option>
                </select>
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.egidsLabel')}</span>
                <input className="input" type="text" value={draft.egids} onChange={(event) => onDraftChange('egids', event.target.value)} />
              </label>
            </div>
          </section>

          {/* 文献与文字 | Documentation & writing */}
          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionDocumentation')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionDocumentationDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.documentationLevelLabel')}</span>
                <select className="input" value={draft.documentationLevel} onChange={(event) => onDraftChange('documentationLevel', event.target.value)}>
                  <option value="">{t(locale, 'workspace.languageMetadata.notSet')}</option>
                  <option value="undocumented">{t(locale, 'workspace.languageMetadata.documentationUndocumented')}</option>
                  <option value="marginally">{t(locale, 'workspace.languageMetadata.documentationMarginally')}</option>
                  <option value="fragmentary">{t(locale, 'workspace.languageMetadata.documentationFragmentary')}</option>
                  <option value="fair">{t(locale, 'workspace.languageMetadata.documentationFair')}</option>
                  <option value="well_documented">{t(locale, 'workspace.languageMetadata.documentationWellDocumented')}</option>
                </select>
              </label>
              <label className="language-metadata-workspace-field">
                <span>{t(locale, 'workspace.languageMetadata.writingSystemsLabel')}</span>
                <input className="input" type="text" value={draft.writingSystemsText} onChange={(event) => onDraftChange('writingSystemsText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.writingSystemsPlaceholder')} />
              </label>
            </div>
            <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
              <span>{t(locale, 'workspace.languageMetadata.dialectsLabel')}</span>
              <textarea className="input language-metadata-workspace-textarea" value={draft.dialectsText} onChange={(event) => onDraftChange('dialectsText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.dialectsPlaceholder')} />
            </label>
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.aliasesLabel')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.aliasesPlaceholder')}</p>
            </div>
            <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
              <span>{t(locale, 'workspace.languageMetadata.aliasesLabel')}</span>
              <textarea className="input language-metadata-workspace-textarea" value={draft.aliasesText} onChange={(event) => onDraftChange('aliasesText', event.target.value)} placeholder={t(locale, 'workspace.languageMetadata.aliasesPlaceholder')} />
            </label>
          </section>

          <section className="language-metadata-workspace-subsection language-metadata-workspace-matrix-fieldset">
            <div className="language-metadata-workspace-matrix-header">
              <div>
                <span className="language-metadata-workspace-matrix-title">{t(locale, 'workspace.languageMetadata.matrixTitle')}</span>
                <p className="language-metadata-workspace-matrix-description">{t(locale, 'workspace.languageMetadata.matrixDescription')}</p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={onAddDisplayNameRow}>{t(locale, 'workspace.languageMetadata.matrixAddRow')}</button>
            </div>

            {draft.displayNameRows.length > 0 ? (
              <div className="language-metadata-workspace-matrix-list" role="list" aria-label={t(locale, 'workspace.languageMetadata.matrixTitle')}>
                {draft.displayNameRows.map((row) => (
                  <div key={row.key} className="language-metadata-workspace-matrix-row" role="listitem">
                    <label className="language-metadata-workspace-field">
                      <span>{t(locale, 'workspace.languageMetadata.matrixLocaleLabel')}</span>
                      <input
                        className="input"
                        type="text"
                        value={row.locale}
                        onChange={(event) => onDisplayNameRowChange(row.key, 'locale', event.target.value)}
                        placeholder={t(locale, 'workspace.languageMetadata.matrixLocalePlaceholder')}
                      />
                    </label>
                    <label className="language-metadata-workspace-field">
                      <span>{t(locale, 'workspace.languageMetadata.matrixRoleLabel')}</span>
                      <select
                        className="input"
                        value={row.role}
                        onChange={(event) => onDisplayNameRowChange(row.key, 'role', event.target.value as LanguageDisplayNameDraftRow['role'])}
                      >
                        {LANGUAGE_DISPLAY_NAME_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>{readDisplayNameRoleLabel(locale, role)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
                      <span>{t(locale, 'workspace.languageMetadata.matrixValueLabel')}</span>
                      <input className="input" type="text" value={row.value} onChange={(event) => onDisplayNameRowChange(row.key, 'value', event.target.value)} />
                    </label>
                    <label className="language-metadata-workspace-checkbox-field">
                      <input type="checkbox" checked={row.isPreferred} onChange={(event) => onDisplayNameRowChange(row.key, 'isPreferred', event.target.checked)} />
                      <span>{t(locale, 'workspace.languageMetadata.matrixPreferredLabel')}</span>
                    </label>
                    <button type="button" className="btn btn-ghost btn-danger" onClick={() => onRemoveDisplayNameRow(row.key)}>{t(locale, 'workspace.languageMetadata.matrixRemoveRow')}</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.matrixEmpty')}</p>
            )}
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionGeography')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionGeographyDescription')}</p>
            </div>
            {/* 纬度 + 经度 + 地名搜索 + 服务商一行 | Lat + Lng + Geocode + Provider in one row */}
            <div className="language-metadata-workspace-geo-row">
              <label className="language-metadata-workspace-geo-field">
                <span>{t(locale, 'workspace.languageMetadata.latitudeLabel')}</span>
                <input className="input" type="text" inputMode="decimal" value={draft.latitude} onChange={(event) => onDraftChange('latitude', event.target.value)} placeholder="-90 ~ 90" />
              </label>
              <label className="language-metadata-workspace-geo-field">
                <span>{t(locale, 'workspace.languageMetadata.longitudeLabel')}</span>
                <input className="input" type="text" inputMode="decimal" value={draft.longitude} onChange={(event) => onDraftChange('longitude', event.target.value)} placeholder="-180 ~ 180" />
              </label>
              {/* 地名搜索 | Place name geocode search */}
              <div className="language-metadata-workspace-geocode-wrapper language-metadata-workspace-geo-field" ref={geocodeContainerRef}>
                <span>{t(locale, 'workspace.languageMetadata.geocodePlaceholder').replace(/[…\.]+$/, '')}</span>
                <div className="language-metadata-workspace-geocode-bar">
                  <input
                    className="input"
                    type="text"
                    value={geocodeQuery}
                    onChange={(e) => setGeocodeQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGeocodeSearch(); }}
                    placeholder={t(locale, 'workspace.languageMetadata.geocodePlaceholder')}
                  />
                  <button type="button" className="btn btn-ghost language-metadata-workspace-geocode-btn" onClick={handleGeocodeSearch} disabled={geocodeLoading}>
                    {geocodeLoading ? t(locale, 'workspace.languageMetadata.geocodeSearching') : '🔍'}
                  </button>
                </div>
                {geocodeOpen && (
                  <ul className="language-metadata-workspace-geocode-results">
                    {geocodeResults.length === 0 ? (
                      <li className="language-metadata-workspace-geocode-empty">{t(locale, 'workspace.languageMetadata.geocodeNoResults')}</li>
                    ) : geocodeResults.map((s, i) => (
                      <li key={i}>
                        <button type="button" className="language-metadata-workspace-geocode-item" onClick={() => handleGeocodeSelect(s)}>
                          <span className="language-metadata-workspace-geocode-name">{s.displayName}</span>
                          <span className="language-metadata-workspace-geocode-coords">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="language-metadata-workspace-geo-field">
                <span className="language-metadata-workspace-geo-label">{t(locale, 'workspace.languageMetadata.mapProviderLabel')}</span>
                <div className="language-metadata-workspace-map-provider-bar">
                  <select
                    className="language-metadata-workspace-map-provider-select"
                    value={mapProviderConfig.kind}
                    onChange={(e) => handleMapProviderChange(e.currentTarget.value as MapProviderKind)}
                  >
                    {MAP_PROVIDERS.map((p) => (
                      <option key={p.kind} value={p.kind}>
                        {locale === 'zh-CN' ? p.label : p.labelEn}
                        {!p.requiresKey ? t(locale, 'workspace.languageMetadata.mapProviderFree') : ''}
                      </option>
                    ))}
                  </select>
                  {availableStyles.length > 1 && (
                    <select
                      className="language-metadata-workspace-map-provider-select"
                      value={mapProviderConfig.styleId}
                      onChange={(e) => handleMapStyleChange(e.currentTarget.value)}
                    >
                      {availableStyles.map((s) => (
                        <option key={s.id} value={s.id}>{locale === 'zh-CN' ? s.label : s.labelEn}</option>
                      ))}
                    </select>
                  )}
                  {activeProviderDef.requiresKey && (
                    <button
                      type="button"
                      className="btn btn-ghost language-metadata-workspace-map-config-btn"
                      aria-label={t(locale, 'workspace.languageMetadata.mapConfigToggle')}
                      title={t(locale, 'workspace.languageMetadata.mapConfigToggle')}
                      onClick={() => setShowMapConfig((v) => !v)}
                    >
                      ⚙
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 服务商配置面板（可折叠）| Provider config panel (collapsible) */}
            {showMapConfig && activeProviderDef.requiresKey && (
              <div className="language-metadata-workspace-map-config-panel">
                <label className="language-metadata-workspace-field">
                  <span>{activeProviderDef.keyLabel}</span>
                  <input
                    className="input"
                    type="password"
                    autoComplete="off"
                    value={mapKeyInput}
                    onChange={(event) => setMapKeyInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') handleSaveMapKey(); }}
                    placeholder={activeProviderDef.keyPlaceholderI18nKey ? t(locale, activeProviderDef.keyPlaceholderI18nKey as Parameters<typeof t>[1]) : ''}
                  />
                </label>
                <div className="language-metadata-workspace-map-config-actions">
                  <button type="button" className="btn" onClick={handleSaveMapKey}>{t(locale, 'workspace.languageMetadata.mapApiKeySave')}</button>
                  {mapProviderConfig.apiKey && (
                    <button type="button" className="btn btn-ghost btn-danger" onClick={handleClearMapKey}>{t(locale, 'workspace.languageMetadata.mapApiKeyClear')}</button>
                  )}
                </div>
              </div>
            )}

            {draft.latitude.trim() && draft.longitude.trim() && !Number.isNaN(Number(draft.latitude)) && !Number.isNaN(Number(draft.longitude)) ? (
              <Suspense fallback={<div className="language-metadata-workspace-map-placeholder" />}>
                <LanguageMapEmbed
                  latitude={Number(draft.latitude)}
                  longitude={Number(draft.longitude)}
                  locale={locale}
                  providerConfig={mapProviderConfig}
                  className="language-metadata-workspace-map-container"
                  {...(draft.localName.trim() || draft.englishName.trim() ? { languageLabel: draft.localName.trim() || draft.englishName.trim() } : {})}
                  onCoordinateClick={handleMapCoordinateClick}
                />
              </Suspense>
            ) : (
              <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.mapNoCoordinates')}</p>
            )}
          </section>

          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionNotes')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionNotesDescription')}</p>
            </div>
            <div className="language-metadata-workspace-grid">
              <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
                <span>{locale === 'zh-CN' ? t(locale, 'workspace.languageMetadata.notesZhLabel') : t(locale, 'workspace.languageMetadata.notesEnLabel')}</span>
                <textarea className="input language-metadata-workspace-textarea" value={locale === 'zh-CN' ? draft.notesZh : draft.notesEn} onChange={(event) => onDraftChange(locale === 'zh-CN' ? 'notesZh' : 'notesEn', event.target.value)} />
              </label>
              <label className="language-metadata-workspace-field language-metadata-workspace-field-block">
                <span>{t(locale, 'workspace.languageMetadata.changeReasonLabel')}</span>
                <textarea
                  className="input language-metadata-workspace-textarea"
                  value={draft.changeReason}
                  onChange={(event) => onDraftChange('changeReason', event.target.value)}
                  placeholder={t(locale, 'workspace.languageMetadata.changeReasonPlaceholder')}
                />
              </label>
            </div>
          </section>

          {/* ─── 自定义字段 | Custom fields ─── */}
          <section className="language-metadata-workspace-subsection">
            <div className="language-metadata-workspace-subsection-header">
              <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionCustomFields')}</h3>
              <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionCustomFieldsDescription')}</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddFieldDef}>{t(locale, 'workspace.languageMetadata.customFieldAdd')}</button>
                {fieldDefs.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFieldManage((prev) => !prev)}>
                    {t(locale, 'workspace.languageMetadata.customFieldManage')}
                  </button>
                )}
              </div>
            </div>

            {fieldDefs.length === 0 ? (
              <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.customFieldEmpty')}</p>
            ) : (
              <div className="language-metadata-workspace-grid">
                {fieldDefs.map((def) => (
                  <div key={def.id} className="language-metadata-workspace-field language-metadata-workspace-field-block">
                    {/* 管理模式：编辑字段定义 | Manage mode: edit field definition */}
                    {showFieldManage ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', padding: '0.5rem', border: '1px solid var(--color-border, #e0e0e0)', borderRadius: '0.25rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ minWidth: '4em' }}>{t(locale, 'workspace.languageMetadata.customFieldName')}</span>
                          <input
                            className="input"
                            value={def.name[locale] || ''}
                            onChange={(e) => handleFieldDefLocalChange({ ...def, name: { ...def.name, [locale]: e.target.value } })}
                            onBlur={() => handleFieldDefBlur(def.id)}
                          />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ minWidth: '4em' }}>{t(locale, 'workspace.languageMetadata.customFieldType')}</span>
                          <select
                            className="input"
                            value={def.fieldType}
                            onChange={(e) => handleFieldTypeChange(def, e.target.value as CustomFieldValueType)}
                          >
                            {CUSTOM_FIELD_TYPES.map((ft) => (
                              <option key={ft} value={ft}>{t(locale, customFieldTypeLabelKey[ft])}</option>
                            ))}
                          </select>
                        </label>
                        {(def.fieldType === 'select' || def.fieldType === 'multiselect') && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ minWidth: '4em' }}>{t(locale, 'workspace.languageMetadata.customFieldOptions')}</span>
                            <input
                              className="input"
                              value={(def.options ?? []).join(', ')}
                              placeholder={t(locale, 'workspace.languageMetadata.customFieldOptionsPlaceholder')}
                              onChange={(e) => handleFieldDefLocalChange({ ...def, options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                              onBlur={() => handleFieldDefBlur(def.id)}
                            />
                          </label>
                        )}
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteFieldDef(def)}>
                          {t(locale, 'workspace.languageMetadata.customFieldDelete')}
                        </button>
                      </div>
                    ) : (
                      /* 普通模式：显示值输入 | Normal mode: value input */
                      <label>
                        <span>{def.name[locale] || def.name['en-US'] || def.name['zh-CN'] || def.id}</span>
                        {def.fieldType === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={draft.customFieldValues[def.id] === 'true'}
                            onChange={(e) => handleCustomFieldValueChange(def.id, String(e.target.checked))}
                          />
                        ) : def.fieldType === 'select' ? (
                          <select className="input" value={draft.customFieldValues[def.id] ?? ''} onChange={(e) => handleCustomFieldValueChange(def.id, e.target.value)}>
                            <option value="" />
                            {(def.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : def.fieldType === 'multiselect' ? (
                          <select
                            className="input"
                            multiple
                            value={(draft.customFieldValues[def.id] ?? '').split(MULTISELECT_DELIMITER).filter(Boolean)}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                              handleCustomFieldValueChange(def.id, selected.join(MULTISELECT_DELIMITER));
                            }}
                          >
                            {(def.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input
                            className="input"
                            type={def.fieldType === 'number' ? 'number' : def.fieldType === 'url' ? 'url' : 'text'}
                            value={draft.customFieldValues[def.id] ?? ''}
                            onChange={(e) => handleCustomFieldValueChange(def.id, e.target.value)}
                          />
                        )}
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {saveError ? <p className="language-metadata-workspace-state language-metadata-workspace-state-error">{saveError}</p> : null}
        {saveSuccess ? <p className="language-metadata-workspace-state language-metadata-workspace-state-success">{saveSuccess}</p> : null}

        <div className="language-metadata-workspace-actions">
          <button type="button" className="btn btn-ghost" onClick={onResetDraft}>{t(locale, 'workspace.languageMetadata.resetButton')}</button>
          {selectedEntry?.hasPersistedRecord ? (
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={deleting}>
              {deleting
                ? t(locale, 'workspace.languageMetadata.deleting')
                : selectedEntry.entryKind === 'custom'
                  ? t(locale, 'workspace.languageMetadata.deleteCustomButton')
                  : t(locale, 'workspace.languageMetadata.deleteOverrideButton')}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onSave} disabled={saving}>{saving ? t(locale, 'workspace.languageMetadata.saving') : t(locale, 'workspace.languageMetadata.saveButton')}</button>
        </div>
      </PanelSection>

      <PanelSection className="language-metadata-workspace-detail-panel" title={t(locale, 'workspace.languageMetadata.historyTitle')} description={t(locale, 'workspace.languageMetadata.historyDescription')}>
        {historyItems.length > 0 ? (
          <ol className="language-metadata-workspace-history-list">
            {historyItems.map((item) => (
              <li key={item.id} className="language-metadata-workspace-history-item">
                <strong>{item.summary}</strong>
                <span>{item.createdAt}</span>
                {item.changedFields?.length ? <p>{t(locale, 'workspace.languageMetadata.historyChangedFieldsLabel')}{item.changedFields.map((field) => readHistoryFieldLabel(locale, field)).join('、')}</p> : null}
                {item.reason ? <p>{item.reason}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.historyEmpty')}</p>
        )}
      </PanelSection>
    </div>
  );
}