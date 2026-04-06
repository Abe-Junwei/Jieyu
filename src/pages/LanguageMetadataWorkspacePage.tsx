import '../styles/pages/language-metadata-workspace.css';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import type { LanguageCatalogEntry } from '../services/LinguisticService';
import { t, useLocale } from '../i18n';
import { LinguisticService } from '../services/LinguisticService';
import { LanguageMetadataWorkspaceCatalogPanel } from './LanguageMetadataWorkspaceCatalogPanel';
import { LanguageMetadataWorkspaceDetailColumn } from './LanguageMetadataWorkspaceDetailColumn';
import {
  LANGUAGE_ID_PARAM,
  NEW_LANGUAGE_ID,
  buildDraft,
  createDisplayNameDraftRow,
  normalizeDisplayNameRows,
  parseAliasText,
  readDisplayNameMatrixFallback,
  readEntryKindLabel,
  type HistoryItem,
  type LanguageDisplayNameDraftRow,
  type LanguageMetadataDraft,
  type WorkspaceLocale,
} from './languageMetadataWorkspace.shared';

export function LanguageMetadataWorkspacePage() {
  // M1: useLocale() 返回 Locale 与 WorkspaceLocale 类型一致，无需强转 | useLocale() returns Locale which matches WorkspaceLocale
  const locale: WorkspaceLocale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<LanguageCatalogEntry[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [searchText, setSearchText] = useState('');
  const [draft, setDraft] = useState<LanguageMetadataDraft>(() => buildDraft(null, locale));
  const deferredSearchText = useDeferredValue(searchText);
  const selectedLanguageId = searchParams.get(LANGUAGE_ID_PARAM) ?? '';
  // 跟踪上一次选中 ID，避免仅 entries 变化时重置未保存草稿 | Track previous selection to prevent resetting unsaved draft on entries-only change
  const prevSelectedLanguageIdRef = useRef<string | null>(null);

  const loadEntries = async (nextSearchText: string) => {
    setLoading(true);
    try {
      const records = await LinguisticService.listLanguageCatalogEntries({
        locale,
        searchText: nextSearchText,
        includeHidden: true,
      });
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
  }, [deferredSearchText, locale]);

  useEffect(() => {
    const selectionChanged = prevSelectedLanguageIdRef.current !== selectedLanguageId;
    prevSelectedLanguageIdRef.current = selectedLanguageId;

    if (selectedLanguageId === NEW_LANGUAGE_ID) {
      // 仅在切换到新建时初始化草稿，搜索导致的 entries 变化不重置 | Only init draft on switch-to-new, not on entries-only change
      if (selectionChanged) {
        setDraft(buildDraft(null, locale));
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

    if (selectedEntry) {
      setDraft(buildDraft(selectedEntry, locale));
      return;
    }

    if (entries.length === 0) {
      setDraft(buildDraft(null, locale));
    }
  }, [entries, locale, searchParams, selectedLanguageId, setSearchParams]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedLanguageId) ?? null,
    [entries, selectedLanguageId],
  );

  useEffect(() => {
    if (!selectedEntry?.hasPersistedRecord) {
      setHistoryItems([]);
      return;
    }

    let cancelled = false;
    void LinguisticService.listLanguageCatalogHistory(selectedEntry.id)
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
    setDraft((prev) => ({ ...prev, [key]: value }));
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
      displayNameRows: [...prev.displayNameRows, createDisplayNameDraftRow()],
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
    const matrixRows = normalizeDisplayNameRows(draft.displayNameRows);
    const matrixFallback = readDisplayNameMatrixFallback(matrixRows, locale);
    const englishName = draft.englishName.trim() || matrixFallback.englishName || '';
    const localName = draft.localName.trim() || matrixFallback.localName || '';
    const nativeName = draft.nativeName.trim() || matrixFallback.nativeName || '';

    if (!englishName && !localName && matrixRows.length === 0) {
      setSaveError(t(locale, 'workspace.languageMetadata.errorNameRequired'));
      setSaveSuccess('');
      return;
    }

    setSaving(true);
    try {
      const saved = await LinguisticService.upsertLanguageCatalogEntry({
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
        family: draft.family.trim(),
        subfamily: draft.subfamily.trim(),
        macrolanguage: draft.macrolanguage.trim(),
        scope: draft.scope.trim() ? draft.scope as LanguageCatalogEntry['scope'] : undefined,
        languageType: draft.languageType.trim() ? draft.languageType as LanguageCatalogEntry['languageType'] : undefined,
        glottocode: draft.glottocode.trim(),
        wikidataId: draft.wikidataId.trim(),
        visibility: draft.visibility,
        notes: {
          ...(draft.notesZh.trim() ? { 'zh-CN': draft.notesZh.trim() } : {}),
          ...(draft.notesEn.trim() ? { 'en-US': draft.notesEn.trim() } : {}),
        },
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
      await LinguisticService.deleteLanguageCatalogEntry({
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
          <Link to="/assets/orthographies" className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.languageMetadata.openOrthographyWorkspace')}</Link>
          <Link to="/assets/orthography-bridges" className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.languageMetadata.openBridgeWorkspace')}</Link>
        </div>
      </section>
    </div>
  ), [locale, selectedEntry]);

  useRegisterAppSidePane({
    title: t(locale, 'workspace.languageMetadata.sidePaneTitle'),
    subtitle: selectedEntry?.localName ?? t(locale, 'workspace.languageMetadata.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  return (
    <section className="panel language-metadata-workspace" aria-labelledby="language-metadata-workspace-title">
      <header className="language-metadata-workspace-hero">
        <span className="language-metadata-workspace-badge">{t(locale, 'workspace.languageMetadata.badge')}</span>
        <h2 id="language-metadata-workspace-title">{t(locale, 'workspace.languageMetadata.title')}</h2>
        <p className="language-metadata-workspace-summary">{t(locale, 'workspace.languageMetadata.summary')}</p>
      </header>

      <div className="language-metadata-workspace-layout">
        <LanguageMetadataWorkspaceCatalogPanel
          locale={locale}
          entries={entries}
          selectedEntryId={selectedEntry?.id ?? ''}
          loading={loading}
          error={error}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          onCreateCustom={handleCreateCustom}
          onSelectEntry={handleSelectEntry}
        />

        <LanguageMetadataWorkspaceDetailColumn
          locale={locale}
          draft={draft}
          selectedEntry={selectedEntry}
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
        />
      </div>
    </section>
  );
}