import '../styles/pages/orthography-bridge-workspace.css';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { JIEYU_MATERIAL_PANEL } from '../utils/jieyuMaterialIcon';
import { useSearchParams } from 'react-router-dom';
import { LanguageAssetRouteLink } from '../components/LanguageAssetRouteLink';
import { OrthographyBridgeManager } from '../components/OrthographyBridgeManager';
import type { OrthographyBridgeShellFooterState } from '../components/OrthographyBridgeManager';
import { OrthographyPanelLink } from '../components/OrthographyPanelLink';
import { getOrthographyCatalogBadgeInfo } from '../components/orthographyCatalogUi';
import { EmbeddedPanelShell } from '../components/ui/EmbeddedPanelShell';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import type { OrthographyDocType } from '../types/jieyuDbDocTypes';
import { formatOrthographyOptionLabel } from '../hooks/useOrthographyPicker';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { useListKeyboardNav } from '../hooks/useListKeyboardNav';
import { useProjectLanguageIds } from '../hooks/useProjectLanguageIds';
import { t, useLocale } from '../i18n';
import type { LanguageCatalogSearchSuggestion } from '../types/languageCatalogSearchSuggestion.types';
import { listOrthographyRecords, searchLanguageCatalogSuggestions } from '../app/languageAssetPageAccess';
import { formatLanguageCatalogSearchSuggestion } from '../utils/langMapping';
import { buildOrthographyBrowseSelector, buildOrthographyBrowseState, WORKSPACE_LANGUAGE_SEARCH_LIMIT } from './orthographyBrowse.shared';

const TARGET_ORTHOGRAPHY_ID_PARAM = 'targetOrthographyId';

export function OrthographyBridgeWorkspacePage({
  registerSidePane = true,
  onClose,
}: {
  registerSidePane?: boolean;
  onClose?: () => void;
} = {}) {
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orthographies, setOrthographies] = useState<OrthographyDocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shellFooterState, setShellFooterState] = useState<OrthographyBridgeShellFooterState | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<LanguageCatalogSearchSuggestion[]>([]);
  const [searchSuggestionActiveIndex, setSearchSuggestionActiveIndex] = useState(-1);
  const [searchInputFocused, setSearchInputFocused] = useState(false);
  const [browseAllWithoutProject, setBrowseAllWithoutProject] = useState(false);
  const deferredSearchText = useDeferredValue(searchText);
  const { projectLanguageIds } = useProjectLanguageIds();
  // 默认仅显示项目语言的正字法（有项目语言时） | Default to project-only when project has languages
  const [projectOnly, setProjectOnly] = useState(true);
  const orthographyLanguageIds = useMemo(() => Array.from(new Set(
    orthographies
      .map((orthography) => orthography.languageId?.trim().toLowerCase())
      .filter((languageId): languageId is string => Boolean(languageId)),
  )), [orthographies]);
  const { resolveLabel } = useLanguageCatalogLabelMap(locale, {
    languageIds: orthographyLanguageIds,
  });
  const selectedOrthographyId = searchParams.get(TARGET_ORTHOGRAPHY_ID_PARAM) ?? '';
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
  const handleShellFooterStateChange = useCallback((state: OrthographyBridgeShellFooterState) => {
    setShellFooterState(state.visible ? state : null);
  }, []);

  // M4: 正字法数据不依赖 locale，移除多余的重取触发 | Orthography data is locale-independent; remove unnecessary refetch trigger
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
          nextParams.set(TARGET_ORTHOGRAPHY_ID_PARAM, records[0]!.id);
          setSearchParams(nextParams, { replace: true });
        }
      } catch (loadError) {
        if (cancelled) return;
        setSearchSuggestions([]);
        setSearchSuggestionActiveIndex(-1);
        setOrthographies([]);
        setError(loadError instanceof Error ? loadError.message : t(locale, 'workspace.orthographyBridge.errorFallback'));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 数据加载不依赖 locale，但 catch 中错误文案需要 locale | Data fetch is locale-independent, but error message formatting needs locale
  }, [browseState, locale, normalizedSearchText, selectedOrthographyId]);

  const filteredOrthographies = orthographies;

  // 列表键盘导航 | List keyboard navigation
  const getOrthographyId = useCallback((o: OrthographyDocType) => o.id, []);
  const handleSelectForKeyboard = useCallback((id: string) => {
    const nextParams = new URLSearchParams(searchParamsRef.current);
    nextParams.set(TARGET_ORTHOGRAPHY_ID_PARAM, id);
    setSearchParams(nextParams);
  }, [setSearchParams]);
  const { activeIndex: kbActiveIndex, handleSearchKeyDown: kbSearchKeyDown, listRef: kbListRef, resetActiveIndex: kbReset } = useListKeyboardNav({
    items: filteredOrthographies,
    getItemId: getOrthographyId,
    onSelect: handleSelectForKeyboard,
  });
  useEffect(() => { kbReset(); }, [filteredOrthographies, kbReset]);

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

  const handleSearchInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
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

  const selectedOrthography = orthographies.find((orthography) => orthography.id === selectedOrthographyId) ?? null;
  const selectedBadge = selectedOrthography ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography) : null;
  const selectedOrthographyLabel = selectedOrthography
    ? formatOrthographyOptionLabel(selectedOrthography, locale)
    : t(locale, 'workspace.orthographyBridge.emptySelection');
  const selectedLanguageLabel = selectedOrthography
    ? resolveLabel(selectedOrthography.languageId)
    : t(locale, 'workspace.orthographyBridge.notSet');

  const languageOptions = useMemo(() => {
    const deduped = new Map<string, string>();
    orthographies.forEach((orthography) => {
      const languageId = orthography.languageId?.trim().toLowerCase();
      if (!languageId || deduped.has(languageId)) {
        return;
      }
      deduped.set(languageId, resolveLabel(languageId));
    });
    return Array.from(deduped.entries()).map(([code, label]) => ({ code, label }));
  }, [orthographies, resolveLabel]);

  const sidePaneContent = useMemo(() => (
    <div className="app-side-pane-feature-stack">
      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.orthographyBridge.sidePaneCurrent')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.orthographyBridge.sidePaneCurrent')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          {selectedOrthography ? (
            <>
              <span className="app-side-pane-feature-badge">{selectedBadge?.label ?? t(locale, 'workspace.orthographyBridge.notSet')}</span>
              <p className="app-side-pane-feature-summary">{formatOrthographyOptionLabel(selectedOrthography, locale)}</p>
              <p className="app-side-pane-feature-note">{t(locale, 'workspace.orthographyBridge.sidePaneSelectedHint')}</p>
            </>
          ) : (
            <p className="app-side-pane-feature-note">{t(locale, 'workspace.orthographyBridge.sidePaneEmpty')}</p>
          )}
        </div>
      </section>

      <section className="app-side-pane-group" aria-label={t(locale, 'workspace.orthographyBridge.sidePaneQuickAccess')}>
        <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
          <span className="app-side-pane-section-title">{t(locale, 'workspace.orthographyBridge.sidePaneQuickAccess')}</span>
        </div>
        <div className="app-side-pane-nav app-side-pane-feature-nav">
          <LanguageAssetRouteLink to="/assets/language-metadata" className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.orthographyBridge.openLanguageMetadata')}</LanguageAssetRouteLink>
          <OrthographyPanelLink className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.orthographyBridge.openOrthographyManager')}</OrthographyPanelLink>
        </div>
      </section>
    </div>
  ), [locale, selectedBadge?.label, selectedOrthography]);

  useRegisterAppSidePane({
    title: t(locale, 'workspace.orthographyBridge.sidePaneTitle'),
    subtitle: selectedOrthography ? selectedOrthographyLabel : t(locale, 'workspace.orthographyBridge.sidePaneSubtitle'),
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
      <MaterialSymbol name="close" className={JIEYU_MATERIAL_PANEL} />
    </button>
  ) : undefined;

  return (
    <EmbeddedPanelShell
      className="ob-shell ob-workspace la-shell"
      bodyClassName="ob-layout la-panel-stack"
      footerClassName="ob-shell-footer"
      title={t(locale, 'workspace.orthographyBridge.title')}
      actions={panelActions}
      footer={shellFooterState ? (
        <>
          <button type="button" className="btn btn-ghost" onClick={shellFooterState.onCancel} disabled={shellFooterState.saving}>
            {shellFooterState.cancelLabel}
          </button>
          <button type="button" className="btn" onClick={shellFooterState.onSave} disabled={shellFooterState.saving}>
            {shellFooterState.saveLabel}
          </button>
        </>
      ) : undefined}
      aria-label={t(locale, 'workspace.orthographyBridge.title')}
    >
      <section className="ws-summary-card ob-summary la-panel-section" aria-labelledby="orthography-bridge-workspace-title">
        <div className="ws-summary-header">
          <div className="ws-summary-copy">
            <h2 id="orthography-bridge-workspace-title" className="ws-summary-title">{selectedOrthographyLabel}</h2>
          </div>
          <div className="ob-summary-meta">
            {selectedBadge ? <span className={selectedBadge.className}>{selectedBadge.label}</span> : <span>{t(locale, 'workspace.orthographyBridge.notSet')}</span>}
          </div>
        </div>

        <div className="ws-summary-facts">
          <article className="ws-summary-fact">
            <span className="ws-summary-fact-label">{t(locale, 'workspace.orthographyBridge.detailTitle')}</span>
            <strong className="ws-summary-fact-value">{selectedOrthographyLabel}</strong>
            <span className="ws-summary-fact-note">{selectedBadge?.label ?? t(locale, 'workspace.orthographyBridge.notSet')}</span>
          </article>
          <article className="ws-summary-fact">
            <span className="ws-summary-fact-label">{t(locale, 'workspace.orthography.languageLabel')}</span>
            <strong className="ws-summary-fact-value">{selectedLanguageLabel}</strong>
            <span className="ws-summary-fact-note">{selectedOrthography?.languageId ?? t(locale, 'workspace.orthographyBridge.notSet')}</span>
          </article>
          <article className="ws-summary-fact">
            <span className="ws-summary-fact-label">{t(locale, 'workspace.orthography.languageAssetIdLabel')}</span>
            <strong className="ws-summary-fact-value">{selectedOrthography?.languageId ?? t(locale, 'workspace.orthographyBridge.notSet')}</strong>
            <span className="ws-summary-fact-note">{selectedOrthography?.id ?? t(locale, 'workspace.orthographyBridge.notSet')}</span>
          </article>
        </div>

        <div className="ob-summary-links">
          <LanguageAssetRouteLink to="/assets/language-metadata" className="btn btn-ghost">{t(locale, 'workspace.orthographyBridge.openLanguageMetadata')}</LanguageAssetRouteLink>
          <OrthographyPanelLink className="btn btn-ghost">{t(locale, 'workspace.orthographyBridge.openOrthographyManager')}</OrthographyPanelLink>
        </div>
      </section>

      <section className="ob-browser la-panel-section" aria-label={t(locale, 'workspace.orthographyBridge.listTitle')}>
        <div className="ob-browser-header">
          <h3 className="ob-browser-title">{t(locale, 'workspace.orthographyBridge.listTitle')}</h3>
          <p className="panel-section__description">{t(locale, 'workspace.orthographyBridge.listDescription')}</p>
        </div>
        <div className="ob-search-combobox">
          <input
            className="input ob-search"
            type="search"
            role="combobox"
            value={searchText}
            onChange={(event) => handleSearchTextChange(event.target.value)}
            onKeyDown={handleSearchInputKeyDown}
            onFocus={() => setSearchInputFocused(true)}
            onBlur={() => {
              setSearchInputFocused(false);
              setSearchSuggestionActiveIndex(-1);
            }}
            placeholder={t(locale, 'workspace.orthographyBridge.searchPlaceholder')}
            aria-label={t(locale, 'workspace.orthographyBridge.searchPlaceholder')}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={hasVisibleSearchSuggestions}
            aria-controls={hasVisibleSearchSuggestions ? 'ob-search-suggestions' : undefined}
            aria-activedescendant={hasVisibleSearchSuggestions
              ? (searchSuggestionActiveIndex >= 0 && searchSuggestionActiveIndex < searchSuggestions.length
                ? `ob-search-suggestion-${searchSuggestionActiveIndex}`
                : undefined)
              : (kbActiveIndex >= 0 ? `ob-item-${filteredOrthographies[kbActiveIndex]?.id ?? ''}` : undefined)}
          />
          <div
            className={`language-iso-input-suggestions ob-search-suggestions${hasVisibleSearchSuggestions ? '' : ' is-empty'}`}
            {...(hasVisibleSearchSuggestions
              ? {
                id: 'ob-search-suggestions',
                role: 'listbox' as const,
                'aria-label': t(locale, 'workspace.orthographyBridge.searchPlaceholder'),
              }
              : { 'aria-hidden': 'true' as const })}
          >
            {hasVisibleSearchSuggestions
              ? searchSuggestions.map((suggestion, index) => (
                <div
                  id={`ob-search-suggestion-${index}`}
                  key={`${suggestion.id}-${index}`}
                  role="option"
                  aria-selected={searchSuggestionActiveIndex === index}
                  className={`language-iso-input-suggestion${searchSuggestionActiveIndex === index ? ' is-active' : ''}`}
                  onMouseEnter={() => setSearchSuggestionActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSearchSuggestionSelect(suggestion)}
                >
                  <span className="ob-search-suggestion-label">{formatLanguageCatalogSearchSuggestion(suggestion, locale)}</span>
                </div>
              ))
              : null}
          </div>
        </div>
        {projectLanguageIds.length > 0 ? (
          <div className="ob-filter-toggle" role="radiogroup" aria-label={t(locale, 'workspace.orthographyBridge.filterProjectOnly')}>
            <button type="button" role="radio" aria-checked={projectOnly} className={`btn${projectOnly ? ' btn-active' : ''}`} onClick={() => setProjectOnly(true)}>{t(locale, 'workspace.orthographyBridge.filterProjectOnly')}</button>
            <button type="button" role="radio" aria-checked={!projectOnly} className={`btn${!projectOnly ? ' btn-active' : ''}`} onClick={() => setProjectOnly(false)}>{t(locale, 'workspace.orthographyBridge.filterShowAll')}</button>
          </div>
        ) : null}
        {!projectLanguageIds.length && showUnscopedIdleState ? (
          <div className="ob-empty-callout">
            <p className="ob-state ob-state-warning">{t(locale, 'workspace.orthographyBridge.unscopedPrompt')}</p>
            <div className="ob-inline-actions">
              <button type="button" className="btn" onClick={() => setBrowseAllWithoutProject(true)}>{t(locale, 'workspace.orthographyBridge.filterShowAll')}</button>
            </div>
          </div>
        ) : null}

        {loading ? <p className="ob-state">{t(locale, 'workspace.orthographyBridge.loading')}</p> : null}
        {!loading && error ? <p className="ob-state ob-state-error">{t(locale, 'workspace.orthographyBridge.errorPrefix').replace('{message}', error)}</p> : null}
        {!loading && !error && !showUnscopedIdleState && searchText.trim() && filteredOrthographies.length === 0 ? <p className="ob-state ob-state-warning">{t(locale, 'workspace.orthographyBridge.searchNoResults')}</p> : null}
        {!loading && !error && !showUnscopedIdleState && !searchText.trim() && filteredOrthographies.length === 0 ? <p className="ob-state">{t(locale, 'workspace.orthographyBridge.emptyList')}</p> : null}

        <div className="ob-list la-list-scroll" role="list" ref={kbListRef} aria-label={t(locale, 'workspace.orthographyBridge.listTitle')}>
          {filteredOrthographies.map((orthography, index) => {
            const active = orthography.id === selectedOrthography?.id;
            const highlighted = index === kbActiveIndex;
            return (
              <button
                key={orthography.id}
                id={`ob-item-${orthography.id}`}
                type="button"
                className={`ob-list-item${active ? ' ob-list-item-active' : ''}${highlighted ? ' ob-list-item-highlight' : ''}`}
                onClick={() => {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.set(TARGET_ORTHOGRAPHY_ID_PARAM, orthography.id);
                  setSearchParams(nextParams);
                }}
              >
                <span className="ob-list-item-label">{formatOrthographyOptionLabel(orthography, locale)}</span>
                <span className="ob-list-item-meta">{orthography.languageId ?? t(locale, 'workspace.orthographyBridge.notSet')}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="ob-detail-column la-panel-section">
        <section className="ob-bridge la-panel-section" aria-label={t(locale, 'workspace.orthographyBridge.managerTitle')}>
          <div className="ob-bridge-header">
            <h3 className="ob-bridge-title">{t(locale, 'workspace.orthographyBridge.managerTitle')}</h3>
            <p className="panel-section__description">{t(locale, 'workspace.orthographyBridge.managerDescription')}</p>
          </div>
          <OrthographyBridgeManager
            targetOrthography={selectedOrthography ?? undefined}
            languageOptions={languageOptions}
            initialExpanded
            hideToggleButton
            useShellFooter
            onShellFooterStateChange={handleShellFooterStateChange}
          />
        </section>
      </div>
    </EmbeddedPanelShell>
  );
}