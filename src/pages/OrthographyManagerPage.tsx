import '../styles/pages/orthography-manager-panel.css';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getOrthographyCatalogBadgeInfo } from '../components/orthographyCatalogUi';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import type { OrthographyDocType } from '../db';
import { formatOrthographyOptionLabel } from '../hooks/useOrthographyPicker';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { useListKeyboardNav } from '../hooks/useListKeyboardNav';
import { useProjectLanguageIds } from '../hooks/useProjectLanguageIds';
import { t, useLocale } from '../i18n';
import { getOrthographyBuilderMessages } from '../i18n/orthographyBuilderMessages';
import {
  listOrthographyRecords,
  updateOrthographyRecord,
} from '../services/LinguisticService.orthography';
import { OrthographyManagerPanel } from './OrthographyManagerPanel';
import {
  buildOrthographyBrowseSelector,
  buildOrthographyBrowseState,
  WORKSPACE_LANGUAGE_SEARCH_LIMIT,
} from './orthographyBrowse.shared';
import {
  areDraftsEqual,
  buildOrthographyDraft,
  parseConversionRulesJson,
  parseDraftList,
  parseOptionalNumber,
  type OrthographyDraft,
  type NormalizationForm,
} from './orthographyManager.shared';
import type { LanguageIsoInputValue } from '../components/LanguageIsoInput';
import { buildPrimaryAndEnglishLabels } from '../utils/multiLangLabels';
import { normalizeLanguageInputAssetId } from '../utils/languageInputHostState';
import {
  type LanguageCatalogSearchSuggestion,
  searchLanguageCatalogSuggestions,
} from '../services/LanguageCatalogSearchService';

const ORTHOGRAPHY_ID_PARAM = 'orthographyId';

export function OrthographyManagerPage({
  registerSidePane = true,
  onClose,
}: {
  registerSidePane?: boolean;
  onClose?: () => void;
} = {}) {
  const locale = useLocale();
  const builderMessages = getOrthographyBuilderMessages(locale);
  const [searchParams, setSearchParams] = useSearchParams();
  const [orthographies, setOrthographies] = useState<OrthographyDocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<LanguageCatalogSearchSuggestion[]>([]);
  const [searchSuggestionActiveIndex, setSearchSuggestionActiveIndex] = useState(-1);
  const [searchInputFocused, setSearchInputFocused] = useState(false);
  const [browseAllWithoutProject, setBrowseAllWithoutProject] = useState(false);
  const [draft, setDraft] = useState<OrthographyDraft | null>(null);
  const [languageInput, setLanguageInput] = useState<LanguageIsoInputValue>({ languageName: '', languageCode: '' });
  const deferredSearchText = useDeferredValue(searchText);
  const { projectLanguageIds } = useProjectLanguageIds();
  // 默认仅显示项目语言的正字法（有项目语言时） | Default to project-only when project has languages
  const [projectOnly, setProjectOnly] = useState(true);
  const orthographyLanguageIds = useMemo(() => Array.from(new Set(
    orthographies
      .map((orthography) => orthography.languageId?.trim().toLowerCase())
      .filter((languageId): languageId is string => Boolean(languageId)),
  )), [orthographies]);
  const { resolveLanguageCode, resolveLabel, resolveLanguageDisplayName } = useLanguageCatalogLabelMap(locale, {
    languageIds: orthographyLanguageIds,
  });
  const selectedOrthographyId = searchParams.get(ORTHOGRAPHY_ID_PARAM) ?? '';
  const browseState = useMemo(() => buildOrthographyBrowseState({
    projectLanguageIds,
    projectOnly,
    selectedOrthographyId,
    searchText: deferredSearchText,
    browseAllWithoutProject,
  }), [browseAllWithoutProject, deferredSearchText, projectLanguageIds, projectOnly, selectedOrthographyId]);
  const {
    normalizedSearchText,
    showUnscopedIdleState,
  } = browseState;
  const hasVisibleSearchSuggestions = searchInputFocused && searchSuggestions.length > 0;

  // 用 ref 追踪最新值，避免加载 effect 依赖 searchParams 导致循环 | Track latest via refs to avoid circular deps
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const selectedOrthographyIdRef = useRef(selectedOrthographyId);
  selectedOrthographyIdRef.current = selectedOrthographyId;

  // M3: 正字法数据不依赖 locale，移除多余的重取触发 | Orthography data is locale-independent; remove unnecessary refetch trigger
  useEffect(() => {
    let cancelled = false;
    const loadOrthographies = async () => {
      setLoading(true);

      try {
        const suggestions = normalizedSearchText
          ? (await searchLanguageCatalogSuggestions({
            query: normalizedSearchText,
            locale,
            limit: WORKSPACE_LANGUAGE_SEARCH_LIMIT,
          }))
          : [];
        const searchLanguageIds = suggestions.map((suggestion) => suggestion.id);
        const selector = buildOrthographyBrowseSelector({
          selectedOrthographyId,
          searchLanguageIds,
          state: browseState,
        });

        if (!selector) {
          if (cancelled) return;
          setSearchSuggestions(suggestions);
          setSearchSuggestionActiveIndex(-1);
          setOrthographies([]);
          setError('');
          return;
        }

        const records = await listOrthographyRecords(selector);
        if (cancelled) return;
        setSearchSuggestions(suggestions);
        setSearchSuggestionActiveIndex((prev) => (prev >= 0 && prev < suggestions.length ? prev : -1));
        setOrthographies(records);
        setError('');

        // 仅在无当前选择时自动选中首项，搜索缩窄时不强制切换 | Only auto-select first on initial load; do NOT force-switch when current is filtered out
        const currentId = selectedOrthographyIdRef.current;
        if (records.length > 0 && !currentId) {
          const nextParams = new URLSearchParams(searchParamsRef.current);
          nextParams.set(ORTHOGRAPHY_ID_PARAM, records[0]!.id);
          setSearchParams(nextParams, { replace: true });
        }
      } catch (loadError) {
        if (cancelled) return;
        setSearchSuggestions([]);
        setSearchSuggestionActiveIndex(-1);
        setOrthographies([]);
        setError(loadError instanceof Error ? loadError.message : t(locale, 'workspace.orthography.errorFallback'));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadOrthographies();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 数据加载不依赖 locale，但 catch 中错误文案需要 locale；用 ref 读取 selectedOrthographyId/searchParams 以避免循环 | Data fetch is locale-independent, but error message formatting needs locale; read via refs to avoid circular deps
  }, [browseState, locale, normalizedSearchText, selectedOrthographyId]);

  const filteredOrthographies = orthographies;

  // 列表键盘导航 | List keyboard navigation
  const getOrthographyId = useCallback((o: OrthographyDocType) => o.id, []);
  const selectOrthographyRef = useRef<(id: string) => void>(() => {});
  const { activeIndex: kbActiveIndex, handleSearchKeyDown: kbSearchKeyDown, listRef: kbListRef, resetActiveIndex: kbReset } = useListKeyboardNav({
    items: filteredOrthographies,
    getItemId: getOrthographyId,
    onSelect: (id) => { selectOrthographyRef.current(id); },
  });
  // 列表变化时重置高亮 | Reset highlight when list changes
  useEffect(() => { kbReset(); }, [filteredOrthographies, kbReset]);

  const selectedOrthography = orthographies.find((orthography) => orthography.id === selectedOrthographyId) ?? null;
  const selectedBadge = selectedOrthography ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography) : null;
  const fromLayerId = searchParams.get('fromLayerId');
  const baselineDraft = useMemo(
    () => (selectedOrthography ? buildOrthographyDraft(selectedOrthography) : null),
    [selectedOrthography],
  );
  const isDirty = useMemo(
    () => (draft && baselineDraft ? !areDraftsEqual(draft, baselineDraft) : false),
    [baselineDraft, draft],
  );

  // 草稿初始化：仅在 baselineDraft 变化时重置 | Draft init: only reset when baselineDraft changes
  useEffect(() => {
    if (!baselineDraft) {
      setDraft(null);
      setLanguageInput({ languageName: '', languageCode: '' });
      setSaveError('');
      setSaveSuccess('');
      return;
    }
    setDraft(baselineDraft);
    setLanguageInput({
      languageName: resolveLabel(baselineDraft.languageId),
      languageCode: resolveLanguageCode(baselineDraft.languageId),
      languageAssetId: baselineDraft.languageId,
      ...(baselineDraft.localeTag ? { localeTag: baselineDraft.localeTag } : {}),
      ...(baselineDraft.regionTag ? { regionTag: baselineDraft.regionTag } : {}),
      ...(baselineDraft.variantTag ? { variantTag: baselineDraft.variantTag } : {}),
    });
    setSaveError('');
    setSaveSuccess('');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveLabel/resolveLanguageCode 仅用于初始赋值，不做后续同步 | resolveLabel/resolveLanguageCode used only for initial assignment
  }, [baselineDraft]);

  // 目录加载后同步语言标签显示（不重置草稿） | Sync language display labels after catalog loads (without resetting draft)
  useEffect(() => {
    if (!baselineDraft?.languageId) return;
    const nextName = resolveLabel(baselineDraft.languageId);
    const nextCode = resolveLanguageCode(baselineDraft.languageId);
    setLanguageInput((prev) => {
      if (prev.languageAssetId !== baselineDraft.languageId) return prev;
      if (prev.languageName === nextName && prev.languageCode === nextCode) return prev;
      return { ...prev, languageName: nextName, languageCode: nextCode };
    });
  }, [baselineDraft?.languageId, resolveLabel, resolveLanguageCode]);

  useEffect(() => {
    if (!isDirty || typeof window === 'undefined') {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // M5: 用 useCallback 稳定引用，避免破坏 sidePaneContent useMemo | Stabilize with useCallback to prevent breaking sidePaneContent useMemo
  const confirmDiscardDirtyDraft = useCallback(() => {
    if (!isDirty || typeof window === 'undefined') {
      return true;
    }
    return window.confirm(t(locale, 'workspace.orthography.unsavedConfirmSwitch'));
  }, [isDirty, locale]);

  const handleSelectOrthography = (orthographyId: string) => {
    if (orthographyId === selectedOrthography?.id) {
      return;
    }
    if (!confirmDiscardDirtyDraft()) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(ORTHOGRAPHY_ID_PARAM, orthographyId);
    setSearchParams(nextParams);
  };
  selectOrthographyRef.current = handleSelectOrthography;

  const handleSearchTextChange = useCallback((value: string) => {
    setSearchText(value);
    setSearchSuggestionActiveIndex(-1);
    setSearchInputFocused(true);
  }, []);

  const handleSearchSuggestionSelect = useCallback((suggestion: LanguageCatalogSearchSuggestion) => {
    setSearchText(suggestion.primaryLabel);
    setSearchSuggestionActiveIndex(-1);
    setSearchInputFocused(false);
  }, []);

  const handleSearchInputKeyDown = useCallback((event: React.KeyboardEvent<Element>) => {
    if (!hasVisibleSearchSuggestions) {
      kbSearchKeyDown(event);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSearchSuggestionActiveIndex((prev) => {
        if (searchSuggestions.length === 0) return -1;
        if (prev < 0) return 0;
        return Math.min(prev + 1, searchSuggestions.length - 1);
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchSuggestionActiveIndex((prev) => {
        if (searchSuggestions.length === 0) return -1;
        if (prev <= 0) return 0;
        return prev - 1;
      });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setSearchSuggestionActiveIndex(-1);
      setSearchInputFocused(false);
      return;
    }

    if (event.key === 'Enter') {
      if (searchSuggestions.length === 0) return;
      event.preventDefault();
      const targetIndex = searchSuggestionActiveIndex >= 0
        ? searchSuggestionActiveIndex
        : 0;
      const suggestion = searchSuggestions[targetIndex];
      if (suggestion) {
        handleSearchSuggestionSelect(suggestion);
      }
      return;
    }

    kbSearchKeyDown(event);
  }, [hasVisibleSearchSuggestions, handleSearchSuggestionSelect, kbSearchKeyDown, searchSuggestionActiveIndex, searchSuggestions]);

  const handleDraftChange = <K extends keyof OrthographyDraft>(key: K, value: OrthographyDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaveError('');
    setSaveSuccess('');
  };

  const handleLanguageInputChange = (nextValue: LanguageIsoInputValue) => {
    setLanguageInput(nextValue);
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        languageId: normalizeLanguageInputAssetId(nextValue),
        localeTag: nextValue.localeTag ?? '',
        regionTag: nextValue.regionTag ?? '',
        variantTag: nextValue.variantTag ?? '',
      };
    });
    setSaveError('');
    setSaveSuccess('');
  };

  const handleResetDraft = () => {
    if (!baselineDraft) return;
    setDraft(baselineDraft);
    setLanguageInput({
      languageName: resolveLabel(baselineDraft.languageId),
      languageCode: resolveLanguageCode(baselineDraft.languageId),
      languageAssetId: baselineDraft.languageId,
      ...(baselineDraft.localeTag ? { localeTag: baselineDraft.localeTag } : {}),
      ...(baselineDraft.regionTag ? { regionTag: baselineDraft.regionTag } : {}),
      ...(baselineDraft.variantTag ? { variantTag: baselineDraft.variantTag } : {}),
    });
    setSaveError('');
    setSaveSuccess('');
  };

  const bridgeWorkspaceHref = useMemo(() => {
    if (!selectedOrthography) {
      return '/assets/orthography-bridges';
    }
    const params = new URLSearchParams({ targetOrthographyId: selectedOrthography.id });
    if (fromLayerId) {
      params.set('fromLayerId', fromLayerId);
    }
    return `/assets/orthography-bridges?${params.toString()}`;
  }, [fromLayerId, selectedOrthography]);

  const sidePaneContent = useMemo(() => (
    <div className="app-side-pane-feature-stack">
      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.orthography.sidePaneCurrent')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.orthography.sidePaneCurrent')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          {selectedOrthography ? (
            <>
              <span className="app-side-pane-feature-badge">{selectedBadge?.label ?? t(locale, 'workspace.orthography.notSet')}</span>
              <p className="app-side-pane-feature-summary">{formatOrthographyOptionLabel(selectedOrthography, locale)}</p>
              <p className="app-side-pane-feature-note">{t(locale, 'workspace.orthography.sidePaneSelectedHint')}</p>
            </>
          ) : (
            <p className="app-side-pane-feature-note">{t(locale, 'workspace.orthography.sidePaneEmpty')}</p>
          )}
        </div>
      </section>

      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.orthography.sidePaneQuickAccess')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.orthography.sidePaneQuickAccess')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          <Link
            to="/transcription"
            className="side-pane-nav-link app-side-pane-feature-link"
            onClick={(event) => {
              if (!confirmDiscardDirtyDraft()) {
                event.preventDefault();
              }
            }}
          >
            {t(locale, 'app.featureAvailability.backToTranscription')}
          </Link>
          <Link
            to={bridgeWorkspaceHref}
            className="side-pane-nav-link app-side-pane-feature-link"
            onClick={(event) => {
              if (!confirmDiscardDirtyDraft()) {
                event.preventDefault();
              }
            }}
          >
            {t(locale, 'workspace.orthography.openBridgeWorkspace')}
          </Link>
        </div>
      </section>
    </div>
  ), [bridgeWorkspaceHref, confirmDiscardDirtyDraft, locale, selectedBadge?.label, selectedOrthography]);

  useRegisterAppSidePane({
    title: t(locale, 'workspace.orthography.sidePaneTitle'),
    subtitle: selectedOrthography
      ? formatOrthographyOptionLabel(selectedOrthography, locale)
      : t(locale, 'workspace.orthography.sidePaneSubtitle'),
    content: sidePaneContent,
    enabled: registerSidePane,
  });

  const handleSaveDraft = async () => {
    if (!selectedOrthography || !draft) return;

    const primaryName = draft.namePrimary.trim();
    const englishFallbackName = draft.nameEnglishFallback.trim();
    if (!primaryName && !englishFallbackName) {
      setSaveError(t(locale, 'workspace.orthography.editNameRequired'));
      setSaveSuccess('');
      return;
    }

    const primaryFonts = parseDraftList(draft.primaryFonts);
    const fallbackFonts = parseDraftList(draft.fallbackFonts);
    const monoFonts = parseDraftList(draft.monoFonts);
    const exemplarMain = parseDraftList(draft.exemplarMain);
    const exemplarAuxiliary = parseDraftList(draft.exemplarAuxiliary);
    const exemplarNumbers = parseDraftList(draft.exemplarNumbers);
    const exemplarPunctuation = parseDraftList(draft.exemplarPunctuation);
    const exemplarIndex = parseDraftList(draft.exemplarIndex);
    const deadKeys = parseDraftList(draft.deadKeys);
    const lineHeightScale = parseOptionalNumber(draft.lineHeightScale);
    const sizeAdjust = parseOptionalNumber(draft.sizeAdjust);
    const conversionRules = parseConversionRulesJson(draft.conversionRulesJson);

    if (!lineHeightScale.valid) {
      setSaveError(t(locale, 'workspace.orthography.invalidNumber').replace('{field}', t(locale, 'workspace.orthography.lineHeightScaleLabel')));
      return;
    }
    if (!sizeAdjust.valid) {
      setSaveError(t(locale, 'workspace.orthography.invalidNumber').replace('{field}', t(locale, 'workspace.orthography.sizeAdjustLabel')));
      return;
    }
    if (!conversionRules.valid) {
      setSaveError(t(locale, 'workspace.orthography.conversionRulesParseError'));
      return;
    }

    const normalizedLanguageId = normalizeLanguageInputAssetId(languageInput);

    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const updated = await updateOrthographyRecord({
        id: selectedOrthography.id,
        languageId: normalizedLanguageId,
        name: {
          ...buildPrimaryAndEnglishLabels({
            primaryLabel: primaryName,
            englishFallbackLabel: englishFallbackName,
            additionalLabels: draft.localizedNameEntries,
          }),
        },
        ...(draft.abbreviation.trim() ? { abbreviation: draft.abbreviation.trim() } : {}),
        ...(draft.scriptTag.trim() ? { scriptTag: draft.scriptTag.trim() } : {}),
        type: draft.type,
        direction: draft.direction,
        ...(draft.localeTag.trim() ? { localeTag: draft.localeTag.trim() } : {}),
        ...(draft.regionTag.trim() ? { regionTag: draft.regionTag.trim() } : {}),
        ...(draft.variantTag.trim() ? { variantTag: draft.variantTag.trim() } : {}),
        ...((draft.catalogReviewStatus || draft.catalogPriority)
          ? {
            catalogMetadata: {
              ...(draft.catalogReviewStatus ? { reviewStatus: draft.catalogReviewStatus } : {}),
              ...(draft.catalogPriority ? { priority: draft.catalogPriority } : {}),
            },
          }
          : {}),
        ...((exemplarMain.length || exemplarAuxiliary.length || exemplarNumbers.length || exemplarPunctuation.length || exemplarIndex.length)
          ? {
            exemplarCharacters: {
              ...(exemplarMain.length ? { main: exemplarMain } : {}),
              ...(exemplarAuxiliary.length ? { auxiliary: exemplarAuxiliary } : {}),
              ...(exemplarNumbers.length ? { numbers: exemplarNumbers } : {}),
              ...(exemplarPunctuation.length ? { punctuation: exemplarPunctuation } : {}),
              ...(exemplarIndex.length ? { index: exemplarIndex } : {}),
            },
          }
          : {}),
        ...((draft.normalizationForm || draft.normalizationCaseSensitive || draft.normalizationStripDefaultIgnorables)
          ? {
            normalization: {
              ...(draft.normalizationForm
                ? { form: draft.normalizationForm as NormalizationForm }
                : {}),
              ...(draft.normalizationCaseSensitive ? { caseSensitive: true } : {}),
              ...(draft.normalizationStripDefaultIgnorables ? { stripDefaultIgnorables: true } : {}),
            },
          }
          : {}),
        ...((draft.collationBase.trim() || draft.collationRules.trim())
          ? {
            collation: {
              ...(draft.collationBase.trim() ? { base: draft.collationBase.trim() } : {}),
              ...(draft.collationRules.trim() ? { customRules: draft.collationRules.trim() } : {}),
            },
          }
          : {}),
        ...((primaryFonts.length || fallbackFonts.length || monoFonts.length || lineHeightScale.value !== undefined || sizeAdjust.value !== undefined)
          ? {
            fontPreferences: {
              ...(primaryFonts.length ? { primary: primaryFonts } : {}),
              ...(fallbackFonts.length ? { fallback: fallbackFonts } : {}),
              ...(monoFonts.length ? { mono: monoFonts } : {}),
              ...(lineHeightScale.value !== undefined ? { lineHeightScale: lineHeightScale.value } : {}),
              ...(sizeAdjust.value !== undefined ? { sizeAdjust: sizeAdjust.value } : {}),
            },
          }
          : {}),
        ...((draft.keyboardLayout.trim() || draft.imeId.trim() || deadKeys.length)
          ? {
            inputHints: {
              ...(draft.keyboardLayout.trim() ? { keyboardLayout: draft.keyboardLayout.trim() } : {}),
              ...(draft.imeId.trim() ? { imeId: draft.imeId.trim() } : {}),
              ...(deadKeys.length ? { deadKeys } : {}),
            },
          }
          : {}),
        bidiPolicy: {
          isolateInlineRuns: draft.bidiIsolate,
          preferDirAttribute: draft.preferDirAttribute,
        },
        ...(conversionRules.value ? { conversionRules: conversionRules.value } : {}),
        ...((draft.notesZh.trim() || draft.notesEn.trim())
          ? {
            notes: {
              ...(draft.notesZh.trim() ? { 'zh-CN': draft.notesZh.trim() } : {}),
              ...(draft.notesEn.trim() ? { 'en-US': draft.notesEn.trim() } : {}),
            },
          }
          : {}),
      });

      setOrthographies((prev) => prev.map((orthography) => (orthography.id === updated.id ? updated : orthography)));
      setDraft(buildOrthographyDraft(updated));
      setSaveSuccess(t(locale, 'workspace.orthography.saveSuccess'));
    } catch (saveDraftError) {
      setSaveError(saveDraftError instanceof Error ? saveDraftError.message : t(locale, 'workspace.orthography.saveErrorFallback'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="om-page">
      <OrthographyManagerPanel
        {...(onClose !== undefined ? { onClose } : {})}
        locale={locale}
        builderMessages={builderMessages}
        fromLayerId={fromLayerId}
        projectLanguageIds={projectLanguageIds}
        searchText={searchText}
        projectOnly={projectOnly}
        showUnscopedIdleState={showUnscopedIdleState}
        loading={loading}
        error={error}
        filteredOrthographies={filteredOrthographies}
        selectedOrthography={selectedOrthography}
        {...(selectedBadge?.label ? { selectedBadgeLabel: selectedBadge.label } : {})}
        draft={draft}
        languageInput={languageInput}
        resolveLabel={resolveLabel}
        resolveLanguageDisplayName={resolveLanguageDisplayName}
        isDirty={isDirty}
        saving={saving}
        saveError={saveError}
        saveSuccess={saveSuccess}
        bridgeWorkspaceHref={bridgeWorkspaceHref}
        onSearchTextChange={handleSearchTextChange}
        onProjectOnlyChange={setProjectOnly}
        onBrowseAll={() => setBrowseAllWithoutProject(true)}
        onSelectOrthography={handleSelectOrthography}
        onDraftChange={handleDraftChange}
        onLanguageInputChange={handleLanguageInputChange}
        onResetDraft={handleResetDraft}
        onSaveDraft={() => {
          void handleSaveDraft();
        }}
        onBeforeOpenBridge={confirmDiscardDirtyDraft}
        onSearchKeyDown={handleSearchInputKeyDown}
        activeIndex={kbActiveIndex}
        listRef={kbListRef}
        searchSuggestions={hasVisibleSearchSuggestions ? searchSuggestions : []}
        searchSuggestionActiveIndex={searchSuggestionActiveIndex}
        onSearchSuggestionHover={setSearchSuggestionActiveIndex}
        onSearchSuggestionSelect={handleSearchSuggestionSelect}
        onSearchInputFocus={() => setSearchInputFocused(true)}
        onSearchInputBlur={() => {
          setSearchInputFocused(false);
          setSearchSuggestionActiveIndex(-1);
        }}
      />
    </section>
  );
}
