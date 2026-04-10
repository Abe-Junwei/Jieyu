import '../styles/pages/language-metadata-workspace.css';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { LanguageAssetRouteLink } from '../components/LanguageAssetRouteLink';
import { OrthographyPanelLink } from '../components/OrthographyPanelLink';
import { EmbeddedPanelShell } from '../components/ui/EmbeddedPanelShell';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { t, useLocale } from '../i18n';
import { buildPersistedCustomFieldValues } from '../services/LanguageMetadataCustomFields';
import {
  deleteLanguageCatalogEntry,
  listCustomFieldDefinitions,
  listLanguageCatalogEntries,
  listLanguageCatalogHistory,
  upsertLanguageCatalogEntry,
  type LanguageCatalogEntry,
} from '../services/LinguisticService.languageCatalog';
import { lookupIso639_3Seed } from '../services/languageCatalogSeedLookup';
import { useProjectLanguageIds } from '../hooks/useProjectLanguageIds';
import { LanguageMetadataWorkspaceDetailColumn } from './LanguageMetadataWorkspaceDetailColumn';
import {
  LANGUAGE_ID_PARAM,
  NEW_LANGUAGE_ID,
  buildClassificationPathValue,
  buildDraft,
  createDisplayNameDraftRow,
  normalizeDisplayNameRows,
  parseAdministrativeDivisionText,
  parseAliasText,
  parseLineSeparatedText,
  readDisplayNameMatrixFallback,
  readEntryKindLabel,
  type HistoryItem,
  type LanguageDisplayNameDraftRow,
  type LanguageMetadataDraft,
  type WorkspaceLocale,
} from './languageMetadataWorkspace.shared';

export function LanguageMetadataWorkspacePage({
  registerSidePane = true,
  onClose,
}: {
  registerSidePane?: boolean;
  onClose?: () => void;
} = {}) {
  // M1: useLocale() 返回 Locale 与 WorkspaceLocale 类型一致，无需强转 | useLocale() returns Locale which matches WorkspaceLocale
  const locale: WorkspaceLocale = useLocale();
  const { projectLanguageIds } = useProjectLanguageIds();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<LanguageCatalogEntry[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [searchText, setSearchText] = useState('');
  const [draft, setDraft] = useState<LanguageMetadataDraft>(() => buildDraft(null, locale));
  const deferredSearchText = useDeferredValue(searchText);
  const selectedLanguageId = searchParams.get(LANGUAGE_ID_PARAM) ?? '';
  // 跟踪最近一次已完成草稿装载的语言 ID，避免仅 entries 变化时覆盖未保存草稿 | Track last hydrated language id to avoid clobbering unsaved draft on entries-only refreshes
  const lastHydratedLanguageIdRef = useRef<string | null>(null);

  const browseLanguageIds = useMemo(() => {
    const ids = new Set<string>();
    projectLanguageIds.forEach((languageId) => {
      const normalizedId = languageId.trim();
      if (normalizedId) {
        ids.add(normalizedId);
      }
    });
    const normalizedSelectedId = selectedLanguageId.trim();
    if (normalizedSelectedId && normalizedSelectedId !== NEW_LANGUAGE_ID) {
      ids.add(normalizedSelectedId);
    }
    return Array.from(ids);
  }, [projectLanguageIds, selectedLanguageId]);

  const loadEntries = async (nextSearchText: string) => {
    setLoading(true);
    try {
      const normalizedSearchText = nextSearchText.trim();
      const records = normalizedSearchText
        ? await listLanguageCatalogEntries({
          locale,
          searchText: normalizedSearchText,
          includeHidden: true,
        })
        : browseLanguageIds.length > 0
          ? await listLanguageCatalogEntries({
            locale,
            includeHidden: true,
            languageIds: browseLanguageIds,
          })
          : [];
      setEntries(records);
      setError('');
      return records;
    } catch (loadError) {
      setEntries([]);
      setError(loadError instanceof Error ? loadError.message : t(locale, 'workspace.languageMetadata.errorFallback'));
      return [] as LanguageCatalogEntry[];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries(deferredSearchText.trim());
  }, [browseLanguageIds, deferredSearchText, locale]);

  useEffect(() => {
    if (selectedLanguageId === NEW_LANGUAGE_ID) {
      // 仅在首次进入新建模式时初始化草稿，搜索导致的 entries 变化不重置 | Only initialize on first entry into new mode, not on entries-only refreshes
      if (lastHydratedLanguageIdRef.current !== NEW_LANGUAGE_ID) {
        setDraft(buildDraft(null, locale));
        lastHydratedLanguageIdRef.current = NEW_LANGUAGE_ID;
      }
      return;
    }

    const selectedEntry = entries.find((entry) => entry.id === selectedLanguageId) ?? null;
    if (!selectedLanguageId && entries.length > 0) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set(LANGUAGE_ID_PARAM, entries[0]!.id);
      setSearchParams(nextParams, { replace: true });
      return;
    }

    // 搜索定位语义：当前条目不在结果里时，自动切到首个匹配项
    // Search-as-locate semantics: switch to first match when current entry is absent from results
    if (!selectedEntry && selectedLanguageId && entries.length > 0) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set(LANGUAGE_ID_PARAM, entries[0]!.id);
      setSearchParams(nextParams, { replace: true });
      return;
    }

    if (selectedEntry) {
      if (lastHydratedLanguageIdRef.current !== selectedEntry.id) {
        setDraft(buildDraft(selectedEntry, locale));
        lastHydratedLanguageIdRef.current = selectedEntry.id;
      }
      return;
    }

    if (entries.length === 0 && !selectedLanguageId) {
      setDraft(buildDraft(null, locale));
      lastHydratedLanguageIdRef.current = null;
    }
  }, [entries, locale, searchParams, selectedLanguageId, setSearchParams]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedLanguageId) ?? null,
    [entries, selectedLanguageId],
  );

  // 新建模式下检测 languageCode 是否已有相同条目 | Detect duplicate languageCode in new-entry mode
  const duplicateHint = useMemo(() => {
    if (selectedLanguageId !== NEW_LANGUAGE_ID) return null;
    const code = draft.languageCode.trim().toLowerCase();
    if (!code) return null;
    const match = entries.find(
      (entry) => entry.languageCode.toLowerCase() === code || entry.id.toLowerCase() === code,
    );
    if (!match) return null;
    return { id: match.id, name: match.localName || match.englishName || match.id };
  }, [selectedLanguageId, draft.languageCode, entries]);

  useEffect(() => {
    if (!selectedEntry?.hasPersistedRecord) {
      setHistoryItems([]);
      return;
    }

    let cancelled = false;
    void listLanguageCatalogHistory(selectedEntry.id)
      .then((records) => {
        if (!cancelled) {
          setHistoryItems(records.slice(-6).reverse());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryItems([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEntry?.hasPersistedRecord, selectedEntry?.id]);

  const handleDraftChange = <K extends keyof LanguageMetadataDraft>(key: K, value: LanguageMetadataDraft[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      // 新建模式下输入 ISO 代码时同步预填充种子数据（仅填充空字段） | Sync pre-fill seed data when typing ISO code in new-entry mode (empty fields only)
      if ((key === 'idInput' || key === 'languageCode') && selectedLanguageId === NEW_LANGUAGE_ID) {
        const code = (value as string).trim().toLowerCase();
        if (code.length >= 2) {
          const seed = lookupIso639_3Seed(code);
          if (seed) {
            if (next.englishName === '' && seed.name) next.englishName = seed.name;
            if (next.iso6391 === '' && seed.iso6391) next.iso6391 = seed.iso6391;
            if (next.iso6392B === '' && seed.iso6392B) next.iso6392B = seed.iso6392B;
            if (next.iso6392T === '' && seed.iso6392T) next.iso6392T = seed.iso6392T;
            if (next.scope === '' && seed.scope) next.scope = seed.scope;
            if (next.languageType === '' && seed.type) next.languageType = seed.type;
          }
        }
      }
      return next;
    });
    setSaveError('');
    setSaveSuccess('');
  };

  const handleDisplayNameRowChange = <K extends keyof Omit<LanguageDisplayNameDraftRow, 'key'>>(rowKey: string, key: K, value: LanguageDisplayNameDraftRow[K]) => {
    setDraft((prev) => ({
      ...prev,
      displayNameRows: prev.displayNameRows.map((row) => (row.key === rowKey ? { ...row, [key]: value } : row)),
    }));
    setSaveError('');
    setSaveSuccess('');
  };

  const handleAddDisplayNameRow = () => {
    setDraft((prev) => ({
      ...prev,
      displayNameRows: [...prev.displayNameRows, createDisplayNameDraftRow({ locale })],
    }));
    setSaveError('');
    setSaveSuccess('');
  };

  const handleRemoveDisplayNameRow = (rowKey: string) => {
    setDraft((prev) => ({
      ...prev,
      displayNameRows: prev.displayNameRows.filter((row) => row.key !== rowKey),
    }));
    setSaveError('');
    setSaveSuccess('');
  };

  const handleSelectEntry = (languageId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(LANGUAGE_ID_PARAM, languageId);
    setSearchParams(nextParams);
  };

  const handleCreateCustom = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(LANGUAGE_ID_PARAM, NEW_LANGUAGE_ID);
    setSearchParams(nextParams);
    setSaveError('');
    setSaveSuccess('');
  };

  const handleResetDraft = () => {
    setDraft(buildDraft(selectedEntry, locale));
    setSaveError('');
    setSaveSuccess('');
  };

  const handleSave = async () => {
    const matrixRows = normalizeDisplayNameRows([...draft.displayNameHiddenRows, ...draft.displayNameRows]);
    const matrixFallback = readDisplayNameMatrixFallback(matrixRows, locale);
    const englishName = draft.englishName.trim() || matrixFallback.englishName || '';
    const localName = draft.localName.trim() || matrixFallback.localName || '';
    const nativeName = draft.nativeName.trim() || matrixFallback.nativeName || '';
    const dialects = parseLineSeparatedText(draft.dialectsText);
    const vernaculars = parseLineSeparatedText(draft.vernacularsText);
    const classificationPath = buildClassificationPathValue({
      genus: draft.genus,
      subfamily: draft.subfamily,
      branch: draft.branch,
      dialects,
      vernaculars,
    }) || draft.classificationPath.trim();

    if (!englishName && !localName && matrixRows.length === 0) {
      setSaveError(t(locale, 'workspace.languageMetadata.errorNameRequired'));
      setSaveSuccess('');
      return;
    }

    setSaving(true);
    try {
      const saved = await upsertLanguageCatalogEntry({
        ...(selectedEntry ? { id: selectedEntry.id } : draft.idInput.trim() ? { id: draft.idInput.trim() } : {}),
        languageCode: draft.languageCode.trim(),
        canonicalTag: draft.canonicalTag.trim(),
        iso6391: draft.iso6391.trim(),
        iso6392B: draft.iso6392B.trim(),
        iso6392T: draft.iso6392T.trim(),
        iso6393: draft.iso6393.trim(),
        englishName,
        localName,
        nativeName,
        displayNames: matrixRows,
        aliases: parseAliasText(draft.aliasesText),
        genus: draft.genus.trim(),
        subfamily: draft.subfamily.trim(),
        branch: draft.branch.trim(),
        classificationPath,
        macrolanguage: draft.macrolanguage.trim(),
        scope: draft.scope.trim() ? draft.scope as LanguageCatalogEntry['scope'] : undefined,
        languageType: draft.languageType.trim() ? draft.languageType as LanguageCatalogEntry['languageType'] : undefined,
        ...(draft.endangermentLevel.trim() ? { endangermentLevel: draft.endangermentLevel as NonNullable<LanguageCatalogEntry['endangermentLevel']> } : {}),
        ...(draft.aesStatus.trim() ? { aesStatus: draft.aesStatus as NonNullable<LanguageCatalogEntry['aesStatus']> } : {}),
        endangermentSource: draft.endangermentSource.trim(),
        ...(draft.endangermentAssessmentYear.trim() ? { endangermentAssessmentYear: Number(draft.endangermentAssessmentYear.trim()) } : {}),
        ...(draft.speakerCountL1.trim() ? { speakerCountL1: Number(draft.speakerCountL1.trim()) } : {}),
        ...(draft.speakerCountL2.trim() ? { speakerCountL2: Number(draft.speakerCountL2.trim()) } : {}),
        speakerCountSource: draft.speakerCountSource.trim(),
        ...(draft.speakerCountYear.trim() ? { speakerCountYear: Number(draft.speakerCountYear.trim()) } : {}),
        ...(draft.speakerTrend.trim() ? { speakerTrend: draft.speakerTrend as NonNullable<LanguageCatalogEntry['speakerTrend']> } : {}),
        ...(draft.countriesText.trim() ? { countries: draft.countriesText.split(',').map((c) => c.trim()).filter(Boolean) } : {}),
        ...(draft.macroarea.trim() ? { macroarea: draft.macroarea as NonNullable<LanguageCatalogEntry['macroarea']> } : {}),
        ...(draft.administrativeDivisionsText.trim() ? { administrativeDivisions: parseAdministrativeDivisionText(draft.administrativeDivisionsText) } : {}),
        ...(draft.intergenerationalTransmission.trim() ? { intergenerationalTransmission: draft.intergenerationalTransmission as NonNullable<LanguageCatalogEntry['intergenerationalTransmission']> } : {}),
        ...(draft.domainsText.trim() ? { domains: draft.domainsText.split(',').map((d) => d.trim()).filter(Boolean) as NonNullable<LanguageCatalogEntry['domains']> } : {}),
        ...(draft.officialStatus.trim() ? { officialStatus: draft.officialStatus as NonNullable<LanguageCatalogEntry['officialStatus']> } : {}),
        egids: draft.egids.trim(),
        ...(draft.documentationLevel.trim() ? { documentationLevel: draft.documentationLevel as NonNullable<LanguageCatalogEntry['documentationLevel']> } : {}),
        ...(dialects.length ? { dialects } : {}),
        ...(vernaculars.length ? { vernaculars } : {}),
        ...(draft.writingSystemsText.trim() ? { writingSystems: draft.writingSystemsText.split(',').map((w) => w.trim()).filter(Boolean) } : {}),
        ...(draft.literacyRate.trim() ? { literacyRate: Number(draft.literacyRate.trim()) } : {}),
        glottocode: draft.glottocode.trim(),
        wikidataId: draft.wikidataId.trim(),
        visibility: draft.visibility,
        ...(draft.latitude.trim() ? { latitude: Number(draft.latitude.trim()) } : {}),
        ...(draft.longitude.trim() ? { longitude: Number(draft.longitude.trim()) } : {}),
        notes: {
          ...(draft.notesZh.trim() ? { 'zh-CN': draft.notesZh.trim() } : {}),
          ...(draft.notesEn.trim() ? { 'en-US': draft.notesEn.trim() } : {}),
        },
        // 自定义字段：按字段定义还原类型，并以完整对象覆盖持久层 | Custom fields: restore typed values and replace the persisted object as a whole
        customFields: await (async () => {
          const defs = await listCustomFieldDefinitions();
          return buildPersistedCustomFieldValues(draft.customFieldValues, defs, locale);
        })(),
        ...(draft.changeReason.trim() ? { reason: draft.changeReason.trim() } : {}),
        locale,
      });

      await loadEntries(deferredSearchText.trim());
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set(LANGUAGE_ID_PARAM, saved.id);
      setSearchParams(nextParams, { replace: true });
      setSaveError('');
      setSaveSuccess(t(locale, 'workspace.languageMetadata.saveSuccess'));
    } catch (saveDraftError) {
      setSaveSuccess('');
      setSaveError(saveDraftError instanceof Error ? saveDraftError.message : t(locale, 'workspace.languageMetadata.saveErrorFallback'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEntry?.hasPersistedRecord) {
      return;
    }

    setDeleting(true);
    try {
      await deleteLanguageCatalogEntry({
        languageId: selectedEntry.id,
        ...(draft.changeReason.trim() ? { reason: draft.changeReason.trim() } : {}),
        locale,
      });
      const refreshed = await loadEntries(deferredSearchText.trim());
      const nextParams = new URLSearchParams(searchParams);
      if (selectedEntry.entryKind === 'custom') {
        if (refreshed[0]) {
          nextParams.set(LANGUAGE_ID_PARAM, refreshed[0].id);
        } else {
          nextParams.delete(LANGUAGE_ID_PARAM);
        }
      } else {
        nextParams.set(LANGUAGE_ID_PARAM, selectedEntry.id);
      }
      setSearchParams(nextParams, { replace: true });
      setSaveError('');
      setSaveSuccess(
        selectedEntry.entryKind === 'custom'
          ? t(locale, 'workspace.languageMetadata.deleteCustomSuccess')
          : t(locale, 'workspace.languageMetadata.deleteOverrideSuccess'),
      );
    } catch (deleteError) {
      setSaveSuccess('');
      setSaveError(deleteError instanceof Error ? deleteError.message : t(locale, 'workspace.languageMetadata.deleteErrorFallback'));
    } finally {
      setDeleting(false);
    }
  };

  const sidePaneContent = useMemo(() => (
    <div className="app-side-pane-feature-stack">
      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.languageMetadata.sidePaneCurrent')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.languageMetadata.sidePaneCurrent')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          {selectedEntry ? (
            <>
              <span className="app-side-pane-feature-badge">{readEntryKindLabel(locale, selectedEntry)}</span>
              <p className="app-side-pane-feature-summary">{selectedEntry.localName}</p>
              <p className="app-side-pane-feature-note">{selectedEntry.englishName}</p>
              <p className="app-side-pane-feature-note">{selectedEntry.languageCode}</p>
            </>
          ) : (
            <p className="app-side-pane-feature-note">{t(locale, 'workspace.languageMetadata.sidePaneEmpty')}</p>
          )}
        </div>
      </section>

      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.languageMetadata.sidePaneQuickAccess')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.languageMetadata.sidePaneQuickAccess')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          <OrthographyPanelLink className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.languageMetadata.openOrthographyManager')}</OrthographyPanelLink>
          <LanguageAssetRouteLink to="/assets/orthography-bridges" className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.languageMetadata.openBridgeWorkspace')}</LanguageAssetRouteLink>
        </div>
      </section>
    </div>
  ), [locale, selectedEntry]);

  useRegisterAppSidePane({
    title: t(locale, 'workspace.languageMetadata.sidePaneTitle'),
    subtitle: selectedEntry?.localName ?? t(locale, 'workspace.languageMetadata.sidePaneSubtitle'),
    content: sidePaneContent,
    enabled: registerSidePane,
  });

  const panelActions = onClose ? (
    <button
      type="button"
      className="icon-btn"
      onClick={onClose}
      aria-label={t(locale, 'transcription.importDialog.close')}
      title={t(locale, 'transcription.importDialog.close')}
    >
      <X size={16} />
    </button>
  ) : undefined;

  return (
    <EmbeddedPanelShell
      className="lm-shell lm-workspace"
      bodyClassName="lm-layout"
      title={t(locale, 'workspace.languageMetadata.title')}
      actions={panelActions}
      aria-label={t(locale, 'workspace.languageMetadata.title')}
    >
      <div className="lm-toolbar">
        <input
          className="input lm-search"
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={t(locale, 'workspace.languageMetadata.searchPlaceholder')}
          aria-label={t(locale, 'workspace.languageMetadata.searchPlaceholder')}
        />
        <button type="button" className="btn btn-ghost" onClick={handleCreateCustom}>{t(locale, 'workspace.languageMetadata.createCustom')}</button>
        <p className="lm-toolbar-hint">{t(locale, 'workspace.languageMetadata.searchLocateHint')}</p>
      </div>

      <LanguageMetadataWorkspaceDetailColumn
        locale={locale}
        draft={draft}
        selectedEntry={selectedEntry}
        duplicateHint={duplicateHint}
        historyItems={historyItems}
        saving={saving}
        deleting={deleting}
        saveError={saveError}
        saveSuccess={saveSuccess}
        onDraftChange={handleDraftChange}
        onDisplayNameRowChange={handleDisplayNameRowChange}
        onAddDisplayNameRow={handleAddDisplayNameRow}
        onRemoveDisplayNameRow={handleRemoveDisplayNameRow}
        onResetDraft={handleResetDraft}
        onDelete={handleDelete}
        onSave={handleSave}
        onSelectEntry={handleSelectEntry}
      />
    </EmbeddedPanelShell>
  );
}