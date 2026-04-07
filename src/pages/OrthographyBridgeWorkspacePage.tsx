import '../styles/pages/orthography-bridge-workspace.css';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { OrthographyBridgeManager } from '../components/OrthographyBridgeManager';
import { OrthographyPanelLink } from '../components/OrthographyPanelLink';
import { getOrthographyCatalogBadgeInfo } from '../components/orthographyCatalogUi';
import { PanelSection } from '../components/ui/PanelSection';
import { PanelSummary } from '../components/ui/PanelSummary';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import type { OrthographyDocType } from '../db';
import { formatOrthographyOptionLabel } from '../hooks/useOrthographyPicker';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { useProjectLanguageIds } from '../hooks/useProjectLanguageIds';
import { t, useLocale } from '../i18n';
import { listOrthographyRecords } from '../services/LinguisticService.orthography';
import { searchLanguageCatalogSuggestions } from '../services/LanguageCatalogSearchService';
import {
  buildOrthographyBrowseSelector,
  buildOrthographyBrowseState,
} from './orthographyBrowse.shared';

const TARGET_ORTHOGRAPHY_ID_PARAM = 'targetOrthographyId';

export function OrthographyBridgeWorkspacePage() {
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orthographies, setOrthographies] = useState<OrthographyDocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
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

  // M4: 正字法数据不依赖 locale，移除多余的重取触发 | Orthography data is locale-independent; remove unnecessary refetch trigger
  useEffect(() => {
    let cancelled = false;
    const loadOrthographies = async () => {
      setLoading(true);

      try {
        const searchLanguageIds = normalizedSearchText
          ? (await searchLanguageCatalogSuggestions({
            query: normalizedSearchText,
            locale,
            limit: 24,
          })).map((suggestion) => suggestion.id)
          : [];
        const selector = buildOrthographyBrowseSelector({
          selectedOrthographyId,
          searchLanguageIds,
          state: browseState,
        });

        if (!selector) {
          if (cancelled) return;
          setOrthographies([]);
          setError('');
          return;
        }

        const records = await listOrthographyRecords(selector);
        if (cancelled) return;
        setOrthographies(records);
        setError('');
      } catch (loadError) {
        if (cancelled) return;
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

  const selectedOrthography = orthographies.find((orthography) => orthography.id === selectedOrthographyId) ?? null;
  const selectedBadge = selectedOrthography ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography) : null;

  useEffect(() => {
    if (filteredOrthographies.length === 0 || selectedOrthography) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(TARGET_ORTHOGRAPHY_ID_PARAM, filteredOrthographies[0]!.id);
    setSearchParams(nextParams, { replace: true });
  }, [filteredOrthographies, searchParams, selectedOrthography, setSearchParams]);

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
          <Link to="/assets/language-metadata" className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.orthographyBridge.openLanguageMetadata')}</Link>
          <OrthographyPanelLink className="side-pane-nav-link app-side-pane-feature-link">{t(locale, 'workspace.orthographyBridge.openOrthographyManager')}</OrthographyPanelLink>
        </div>
      </section>
    </div>
  ), [locale, selectedBadge?.label, selectedOrthography]);

  useRegisterAppSidePane({
    title: t(locale, 'workspace.orthographyBridge.sidePaneTitle'),
    subtitle: selectedOrthography ? formatOrthographyOptionLabel(selectedOrthography, locale) : t(locale, 'workspace.orthographyBridge.sidePaneSubtitle'),
    content: sidePaneContent,
  });

  return (
    <section className="panel orthography-workspace" aria-labelledby="orthography-bridge-workspace-title">
      <header className="orthography-workspace-hero">
        <span className="orthography-workspace-badge">{t(locale, 'workspace.orthographyBridge.badge')}</span>
        <h2 id="orthography-bridge-workspace-title">{t(locale, 'workspace.orthographyBridge.title')}</h2>
        <p className="orthography-workspace-summary">{t(locale, 'workspace.orthographyBridge.summary')}</p>
      </header>

      <div className="orthography-workspace-layout">
        <PanelSection
          className="orthography-workspace-list-panel"
          title={t(locale, 'workspace.orthographyBridge.listTitle')}
          description={t(locale, 'workspace.orthographyBridge.listDescription')}
        >
          <input
            className="input orthography-workspace-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t(locale, 'workspace.orthographyBridge.searchPlaceholder')}
            aria-label={t(locale, 'workspace.orthographyBridge.searchPlaceholder')}
          />
          {projectLanguageIds.length > 0 ? (
            <div className="orthography-workspace-filter-toggle" role="radiogroup" aria-label={t(locale, 'workspace.orthographyBridge.filterProjectOnly')}>
              <button type="button" role="radio" aria-checked={projectOnly} className={`btn${projectOnly ? ' btn-active' : ''}`} onClick={() => setProjectOnly(true)}>{t(locale, 'workspace.orthographyBridge.filterProjectOnly')}</button>
              <button type="button" role="radio" aria-checked={!projectOnly} className={`btn${!projectOnly ? ' btn-active' : ''}`} onClick={() => setProjectOnly(false)}>{t(locale, 'workspace.orthographyBridge.filterShowAll')}</button>
            </div>
          ) : null}
          {!projectLanguageIds.length && showUnscopedIdleState ? (
            <div className="orthography-workspace-empty-callout">
              <p className="orthography-workspace-state orthography-workspace-state-warning">{t(locale, 'workspace.orthographyBridge.unscopedPrompt')}</p>
              <div className="orthography-workspace-inline-actions">
                <button type="button" className="btn" onClick={() => setBrowseAllWithoutProject(true)}>{t(locale, 'workspace.orthographyBridge.filterShowAll')}</button>
              </div>
            </div>
          ) : null}

          {loading ? <p className="orthography-workspace-state">{t(locale, 'workspace.orthographyBridge.loading')}</p> : null}
          {!loading && error ? <p className="orthography-workspace-state orthography-workspace-state-error">{t(locale, 'workspace.orthographyBridge.errorPrefix').replace('{message}', error)}</p> : null}
          {!loading && !error && !showUnscopedIdleState && filteredOrthographies.length === 0 ? <p className="orthography-workspace-state">{t(locale, 'workspace.orthographyBridge.emptyList')}</p> : null}

          <div className="orthography-workspace-list" role="list" aria-label={t(locale, 'workspace.orthographyBridge.listTitle')}>
            {filteredOrthographies.map((orthography) => {
              const active = orthography.id === selectedOrthography?.id;
              return (
                <button
                  key={orthography.id}
                  type="button"
                  className={`orthography-workspace-list-item${active ? ' orthography-workspace-list-item-active' : ''}`}
                  onClick={() => {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.set(TARGET_ORTHOGRAPHY_ID_PARAM, orthography.id);
                    setSearchParams(nextParams);
                  }}
                >
                  <span className="orthography-workspace-list-item-label">{formatOrthographyOptionLabel(orthography, locale)}</span>
                  <span className="orthography-workspace-list-item-meta">{orthography.languageId ?? t(locale, 'workspace.orthographyBridge.notSet')}</span>
                </button>
              );
            })}
          </div>
        </PanelSection>

        <div className="orthography-workspace-detail-column">
          <PanelSummary
            className="orthography-workspace-summary-card"
            title={t(locale, 'workspace.orthographyBridge.detailTitle')}
            description={selectedOrthography ? formatOrthographyOptionLabel(selectedOrthography, locale) : t(locale, 'workspace.orthographyBridge.emptySelection')}
            meta={<span className="orthography-workspace-summary-meta">{selectedBadge?.label ?? t(locale, 'workspace.orthographyBridge.notSet')}</span>}
            supportingText={t(locale, 'workspace.orthographyBridge.detailDescription')}
          />

          <PanelSection className="orthography-workspace-bridge-panel" title={t(locale, 'workspace.orthographyBridge.managerTitle')} description={t(locale, 'workspace.orthographyBridge.managerDescription')}>
            <OrthographyBridgeManager
              targetOrthography={selectedOrthography ?? undefined}
              languageOptions={languageOptions}
              initialExpanded
              hideToggleButton
            />
          </PanelSection>
        </div>
      </div>
    </section>
  );
}