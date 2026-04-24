import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppGlobalToastHost } from './components/AppGlobalToastHost';
import { DbIntegrityBlockingOverlay } from './components/DbIntegrityBlockingOverlay';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevErrorAggregationPanel } from './components/DevErrorAggregationPanel';
import { AiPanelProvider } from './contexts/AiPanelContext';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from './contexts/AppSidePaneContext';
import { usePanelAutoCollapse } from './hooks/usePanelAutoCollapse';
import { SettingsModal } from './components/SettingsModal';
import { resolveHostVersion } from './config/hostVersion';
import { persistUiFontScalePreference, readPersistedUiFontScalePreference, type UiFontScaleMode } from './utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from './hooks/useUiFontScaleRuntime';
import { useAppDataResilienceEffects } from './hooks/useAppDataResilienceEffects';
import { usePanelResize } from './hooks/usePanelResize';
import { LOCALE_PREFERENCE_STORAGE_KEY, LocaleProvider, detectLocale, preloadLocaleDictionary, setStoredLocalePreference, t, type Locale } from './i18n';
import { getCollaborationCloudPanelMessages } from './i18n/collaborationCloudPanelMessages';
import { LeftRailResourcesMenu } from './components/LeftRailResourcesMenu';
import { LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID } from './components/transcription/TranscriptionLeftRailLayerActions';
import { MaterialSymbol, ModalPanel } from './components/ui';
import { AssetPanelProvider, type AssetPanelContextValue, type LanguageAssetPanel } from './contexts/AssetPanelContext';
import { syncDocumentDataTheme, THEME_MODE_STORAGE_KEY } from './utils/theme';
import { type IconEffect, getIconEffect, setIconEffect } from './utils/iconEffect';
import { isTranscriptionWorkspacePathname } from './utils/transcriptionWorkspaceRoute';
import { JIEYU_MATERIAL_NAV, type LeftRailNavIconName } from './utils/jieyuMaterialIcon';

// 路由级代码分割，各页面按需加载 | Route-level code splitting, pages loaded on demand
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const TranscriptionPage = lazy(() => import('./pages/TranscriptionPage').then(m => ({ default: m.TranscriptionPage })));
const AnnotationPage = lazy(() => import('./pages/AnnotationPage').then(m => ({ default: m.AnnotationPage })));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })));
const CorpusLibraryPage = lazy(() => import('./pages/CorpusLibraryPage').then(m => ({ default: m.CorpusLibraryPage })));
const LexiconPage = lazy(() => import('./pages/LexiconPage').then(m => ({ default: m.LexiconPage })));
const LanguageMetadataWorkspacePage = lazy(() => import('./pages/LanguageMetadataWorkspacePage').then(m => ({ default: m.LanguageMetadataWorkspacePage })));
const OrthographyManagerPage = lazy(() => import('./pages/OrthographyManagerPage').then(m => ({ default: m.OrthographyManagerPage })));
const OrthographyBridgeWorkspacePage = lazy(() => import('./pages/OrthographyBridgeWorkspacePage').then(m => ({ default: m.OrthographyBridgeWorkspacePage })));

function mapAssetPathToPanel(pathname: string): LanguageAssetPanel {
  if (pathname === '/assets/language-metadata') return 'language-metadata';
  if (pathname === '/assets/orthographies') return 'orthographies';
  if (pathname === '/assets/orthography-bridges') return 'orthography-bridges';
  return 'none';
}

function prewarmLanguageAssetChunk(p: Promise<unknown>): void {
  void p.catch(() => undefined);
}

function prewarmLanguageAssetPanel(panel: LanguageAssetPanel): void {
  if (panel === 'language-metadata') {
    prewarmLanguageAssetChunk(import('./pages/LanguageMetadataWorkspacePage'));
    return;
  }
  if (panel === 'orthographies') {
    prewarmLanguageAssetChunk(import('./pages/OrthographyManagerPage'));
    return;
  }
  if (panel === 'orthography-bridges') {
    prewarmLanguageAssetChunk(import('./pages/OrthographyBridgeWorkspacePage'));
  }
}

const SHOULD_PREWARM_LANGUAGE_ASSET_PANELS = import.meta.env.MODE !== 'test';

type ThemeMode = 'light' | 'dark' | 'system';

type NavItem = {
  to: string;
  label: string;
  /** Material Symbols ligature | https://fonts.google.com/icons */
  icon: LeftRailNavIconName;
  summary: string;
};

type NavGroup = {
  id: string;
  title: string;
  items: NavItem[];
};

const SIDE_PANE_COLLAPSED_KEY = 'jieyu-side-pane-collapsed';
const SIDE_PANE_WIDTH_KEY = 'jieyu-side-pane-width';
const SIDE_PANE_DEFAULT_WIDTH = 272;

function readLocalStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readPersistedSidePaneWidth(): number {
  try {
    const raw = readLocalStorageValue(SIDE_PANE_WIDTH_KEY);
    if (raw) {
      const next = Number(raw);
      if (Number.isFinite(next) && next >= 240 && next <= 420) return next;
    }
  } catch {
    // 忽略存储读取失败，回退默认值 | Ignore storage read failures and fall back to default width
  }

  return SIDE_PANE_DEFAULT_WIDTH;
}

function readInitialThemeMode(): ThemeMode {
  const stored = readLocalStorageValue(THEME_MODE_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function readInitialSidePaneCollapsed(): boolean {
  return readLocalStorageValue(SIDE_PANE_COLLAPSED_KEY) === '1';
}

function NotFound({ locale }: { locale: ReturnType<typeof detectLocale> }) {
  return (
    <section className="panel">
      <h2>{t(locale, 'app.notFound.title')}</h2>
      <p>{t(locale, 'app.notFound.desc')}</p>
    </section>
  );
}

function AppShellSidePane({
  locale,
  activeNavItem,
  isTranscriptionRoute,
  isSidePaneCollapsed,
  handleSidePaneResizeStart,
  handleSidePaneToggle,
}: {
  locale: ReturnType<typeof detectLocale>;
  activeNavItem: NavItem | undefined;
  isTranscriptionRoute: boolean;
  isSidePaneCollapsed: boolean;
  handleSidePaneResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleSidePaneToggle: (event?: React.SyntheticEvent<HTMLElement>) => void;
}) {
  const sidePaneRegistration = useAppSidePaneRegistrationSnapshot();
  const sidePaneTitle = sidePaneRegistration?.title ?? activeNavItem?.label ?? t(locale, 'app.sidePane.defaultTitle');
  const sidePaneSubtitle = sidePaneRegistration?.subtitle ?? activeNavItem?.summary ?? t(locale, 'app.sidePane.defaultSubtitle');
  const sidePaneBody = sidePaneRegistration?.content ?? (
    <div className="app-side-pane-empty-state">
      <strong>{sidePaneTitle}</strong>
      <span>{sidePaneSubtitle}</span>
      <p>{t(locale, 'app.sidePane.emptyDesc')}</p>
    </div>
  );

  return (
    <>
      <aside className={`app-side-pane ${isTranscriptionRoute ? 'app-side-pane-transcription' : ''} ${isSidePaneCollapsed ? 'app-side-pane-collapsed' : ''}`} aria-label={t(locale, 'app.sidePane.aria.panel')}>
        <div className="app-side-pane-header">
          <p className="app-side-pane-title">{sidePaneTitle}</p>
          <p className="app-side-pane-subtitle">{sidePaneSubtitle}</p>
        </div>

        <div className="app-side-pane-body">
          <div id="app-side-pane-body-slot" className="app-side-pane-body-slot" aria-label={t(locale, 'app.sidePane.aria.content')}>
            {sidePaneBody}
          </div>
        </div>
      </aside>

      <div className={`app-side-pane-handle-cluster ${isTranscriptionRoute ? 'app-side-pane-handle-cluster-transcription' : ''}`}>
        <div
          className="app-side-pane-resizer"
          onPointerDown={handleSidePaneResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={t(locale, 'app.sidePane.aria.resize')}
        />
        <button
          type="button"
          className="app-side-pane-collapse-toggle"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleSidePaneToggle}
          aria-label={isSidePaneCollapsed ? t(locale, 'app.sidePane.expand') : t(locale, 'app.sidePane.collapse')}
          title={isSidePaneCollapsed ? t(locale, 'app.sidePane.expand') : t(locale, 'app.sidePane.collapse')}
        >
          <span aria-hidden="true">{isSidePaneCollapsed ? '›' : '‹'}</span>
        </button>
      </div>
    </>
  );
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const assetPanelFromRoute = useMemo(() => mapAssetPathToPanel(location.pathname), [location.pathname]);
  const isTranscriptionRoute = isTranscriptionWorkspacePathname(location.pathname);
  const [openAssetPanel, setOpenAssetPanel] = useState<LanguageAssetPanel>('none');
  const panelSearchRestoreRef = useRef<string | null>(null);
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const collaborationMessages = useMemo(() => getCollaborationCloudPanelMessages(locale), [locale]);
  const shellBodyRef = useRef<HTMLDivElement | null>(null);
  const shellDragCleanupRef = useRef<(() => void) | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [iconEffect, setIconEffectState] = useState<IconEffect>(() => getIconEffect());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { uiFontScale, uiFontScaleMode } = useUiFontScaleRuntime(locale);
  const { dbGate, dbOverlayHandlers } = useAppDataResilienceEffects(locale);

  const handleIconEffectChange = useCallback((next: IconEffect) => {
    setIconEffect(next);
    setIconEffectState(next);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
    } catch {
      // Ignore theme persistence failures and keep the current session theme.
    }
    syncDocumentDataTheme();
  }, [themeMode]);

  // 跟随系统主题变化 | Listen for system color-scheme changes when mode is 'system'
  useEffect(() => {
    if (themeMode !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      syncDocumentDataTheme();
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [themeMode]);

  // 首屏渲染后启用布局过渡，避免初始挂载产生 CLS | Enable layout transitions after first paint to prevent CLS
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.setAttribute('data-motion-ready', '');
      });
    });
  }, []);

  const [isSidePaneCollapsed, setIsSidePaneCollapsed] = useState<boolean>(readInitialSidePaneCollapsed);
  const [sidePaneWidth, setSidePaneWidth] = useState<number>(readPersistedSidePaneWidth);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDE_PANE_COLLAPSED_KEY, isSidePaneCollapsed ? '1' : '0');
    } catch {
      // Ignore persistence failures and keep the in-memory panel state.
    }
  }, [isSidePaneCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDE_PANE_WIDTH_KEY, String(sidePaneWidth));
    } catch {
      // 忽略存储写入失败 | Ignore storage write failures
    }
  }, [sidePaneWidth]);

  useEffect(() => () => {
    shellDragCleanupRef.current?.();
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === LOCALE_PREFERENCE_STORAGE_KEY) {
        setLocale(detectLocale());
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    // 启动后空闲时再刷新语言目录快照，避免把重模块评估放进首屏关键路径
    // | Refresh language-catalog read model during idle time to keep heavy module evaluation off the first-paint critical path
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const runRefresh = async () => {
      try {
        const { LinguisticService } = await import('./services/LinguisticService');
        if (cancelled) return;
        await LinguisticService.refreshLanguageCatalogReadModel();
      } catch {
        // 忽略启动期语言目录快照刷新失败，保留生成基线回退 | Ignore boot-time refresh failures and keep generated fallback behavior
      }
    };

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(() => {
        void runRefresh();
      }, { timeout: 5000 });
    } else {
      timeoutHandle = window.setTimeout(() => {
        void runRefresh();
      }, 800);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        idleWindow.cancelIdleCallback?.(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, []);

  useEffect(() => {
    // 仅转写路由预热重模块；首页不拉转写包 | Prewarm transcription chunks only on transcription routes
    if (!location.pathname.startsWith('/transcription')) {
      return;
    }
    prewarmLanguageAssetChunk(import('./pages/TranscriptionPage'));
    prewarmLanguageAssetChunk(import('./pages/TranscriptionPage.Orchestrator'));
    prewarmLanguageAssetChunk(import('./pages/TranscriptionPage.DataShell'));
    prewarmLanguageAssetChunk(import('./pages/TranscriptionPage.ReadyWorkspace'));
    prewarmLanguageAssetChunk(import('./pages/OrchestratorWaveformContent'));
  }, [location.pathname]);

  useEffect(() => {
    if (!SHOULD_PREWARM_LANGUAGE_ASSET_PANELS) {
      return;
    }
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const prewarm = () => {
      if (cancelled) return;
      prewarmLanguageAssetPanel('language-metadata');
      prewarmLanguageAssetPanel('orthographies');
      prewarmLanguageAssetPanel('orthography-bridges');
    };

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(prewarm, { timeout: 6500 });
    } else {
      timeoutHandle = window.setTimeout(prewarm, 1200);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        idleWindow.cancelIdleCallback?.(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, []);

  const navGroups = useMemo<NavGroup[]>(() => [
    {
      id: 'workspace-core',
      title: t(locale, 'app.navGroup.core'),
      items: [
        {
          to: '/',
          label: t(locale, 'app.nav.home'),
          icon: 'local_library',
          summary: t(locale, 'app.nav.summary.home'),
        },
        {
          to: '/transcription',
          label: t(locale, 'app.nav.transcription'),
          icon: 'speech_to_text',
          summary: t(locale, 'app.nav.summary.transcription'),
        },
        {
          to: '/annotation',
          label: t(locale, 'app.nav.annotation'),
          icon: 'draw',
          summary: t(locale, 'app.nav.summary.annotation'),
        },
        {
          to: '/lexicon',
          label: t(locale, 'app.nav.lexicon'),
          icon: 'menu_book',
          summary: t(locale, 'app.nav.summary.lexicon'),
        },
        {
          to: '/corpus',
          label: t(locale, 'app.nav.corpus'),
          icon: 'edit_note',
          summary: t(locale, 'app.nav.summary.corpus'),
        },
        {
          to: '/analysis',
          label: t(locale, 'app.nav.analysis'),
          icon: 'psychology',
          summary: t(locale, 'app.nav.summary.analysis'),
        },
      ],
    },
  ], [locale]);

  const secondaryNavItems = useMemo<NavItem[]>(() => [
    {
      to: '/assets/language-metadata',
      label: t(locale, 'app.nav.languageMetadata'),
      icon: 'translate',
      summary: t(locale, 'app.nav.summary.languageMetadata'),
    },
    {
      to: '/assets/orthographies',
      label: t(locale, 'app.nav.orthographies'),
      icon: 'auto_stories',
      summary: t(locale, 'app.nav.summary.orthographies'),
    },
    {
      to: '/assets/orthography-bridges',
      label: t(locale, 'app.nav.orthographyBridges'),
      icon: 'account_tree',
      summary: t(locale, 'app.nav.summary.orthographyBridges'),
    },
  ], [locale]);

  const primaryNavItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);
  const navItems = useMemo(() => [...primaryNavItems, ...secondaryNavItems], [primaryNavItems, secondaryNavItems]);
  const activePathname = assetPanelFromRoute !== 'none' ? '/transcription' : location.pathname;

  const activeNavItem = useMemo(() => (
    navItems.find((item) => activePathname === item.to || activePathname.startsWith(`${item.to}/`))
    ?? navItems[0]
  ), [activePathname, navItems]);

  const handleAssetPanelClose = useCallback(() => {
    setOpenAssetPanel('none');

    const restoreSearch = panelSearchRestoreRef.current;
    panelSearchRestoreRef.current = null;
    if (restoreSearch !== null && location.search !== restoreSearch) {
      navigate({ pathname: location.pathname, search: restoreSearch }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  /** 路径 → 面板 ID 映射 | Path → panel ID mapping */
  const pathToPanelId = useCallback((to: string): LanguageAssetPanel => {
    const pathname = to.split('?')[0]?.split('#')[0] ?? to;
    return mapAssetPathToPanel(pathname);
  }, []);

  const searchFromTarget = useCallback((to: string): string => {
    const queryStart = to.indexOf('?');
    if (queryStart < 0) {
      return '';
    }
    const hashStart = to.indexOf('#', queryStart);
    return hashStart < 0 ? to.slice(queryStart) : to.slice(queryStart, hashStart);
  }, []);

  const openAssetPanelFromTarget = useCallback((to: string) => {
    const panelId = pathToPanelId(to);
    if (SHOULD_PREWARM_LANGUAGE_ASSET_PANELS) {
      prewarmLanguageAssetPanel(panelId);
    }
    setOpenAssetPanel(panelId);

    const nextSearch = searchFromTarget(to);
    if (!nextSearch) {
      return;
    }

    if (panelSearchRestoreRef.current === null) {
      panelSearchRestoreRef.current = location.search;
    }

    if (location.search !== nextSearch) {
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
    }
  }, [location.pathname, location.search, navigate, pathToPanelId, searchFromTarget]);

  const handleAssetPanelToggle = useCallback((to: string) => {
    const panelId = pathToPanelId(to);
    if (panelId !== 'none' && openAssetPanel === panelId) {
      handleAssetPanelClose();
      return;
    }
    openAssetPanelFromTarget(to);
  }, [handleAssetPanelClose, openAssetPanel, openAssetPanelFromTarget, pathToPanelId]);

  const isAssetPanelActive = useCallback((to: string) => {
    return openAssetPanel === pathToPanelId(to);
  }, [openAssetPanel, pathToPanelId]);

  const assetPanelCtx = useMemo<AssetPanelContextValue>(() => ({
    openPanel: (to: string) => openAssetPanelFromTarget(to),
  }), [openAssetPanelFromTarget]);

  useEffect(() => {
    if (assetPanelFromRoute === 'none') {
      return;
    }
    openAssetPanelFromTarget(`${location.pathname}${location.search}`);
  }, [assetPanelFromRoute, location.pathname, location.search, openAssetPanelFromTarget]);

  const handleSidePaneToggle = useCallback((event?: React.SyntheticEvent<HTMLElement>) => {
    event?.stopPropagation();
    setIsSidePaneCollapsed((prev) => !prev);
  }, []);

  const handleLocaleChange = useCallback(async (nextLocale: Locale) => {
    await preloadLocaleDictionary(nextLocale);
    setStoredLocalePreference(nextLocale);
    setLocale(nextLocale);
  }, []);

  const handleFontScaleChange = useCallback((scale: number) => {
    persistUiFontScalePreference({ mode: 'manual', manualScale: scale });
  }, []);

  const handleFontScaleModeChange = useCallback((mode: UiFontScaleMode) => {
    const current = readPersistedUiFontScalePreference();
    persistUiFontScalePreference({
      mode,
      manualScale: mode === 'manual' ? uiFontScale : current.manualScale,
    });
  }, [uiFontScale]);

  const handleSettingsOpen = useCallback(() => setIsSettingsOpen(true), []);
  const handleSettingsClose = useCallback(() => setIsSettingsOpen(false), []);
  const handleCollaborationEntryOpen = useCallback(() => {
    if (!isTranscriptionRoute || typeof window === 'undefined') return;
    window.dispatchEvent(new Event('jieyu:open-collaboration-cloud-panel'));
  }, [isTranscriptionRoute]);

  const shellStyle = useMemo(() => ({
    ['--side-pane-width' as '--side-pane-width']: isSidePaneCollapsed ? '0px' : `${sidePaneWidth}px`,
  } as CSSProperties), [isSidePaneCollapsed, sidePaneWidth]);

  // 仅保留“点击空白区域收起”，禁用 hover/贴边自动展开
  // Keep click-outside collapse only; disable hover/edge auto-expand.
  usePanelAutoCollapse({
    isCollapsed: isSidePaneCollapsed,
    setIsCollapsed: setIsSidePaneCollapsed,
    boundaryRef: shellBodyRef,
    panelSelector: '.app-side-pane',
    toggleSelector: '.app-side-pane-collapse-toggle',
    resizerSelector: '.app-side-pane-resizer',
    ignoreSelectors: ['.app-left-rail'],
  });

  const { handleSidePaneResizeStart } = usePanelResize({
    sidePane: {
      isCollapsed: isSidePaneCollapsed,
      width: sidePaneWidth,
      setWidth: setSidePaneWidth,
      boundaryRef: shellBodyRef,
      dragCleanupRef: shellDragCleanupRef,
      side: 'left',
      minWidth: 240,
      maxWidth: 420,
      maxWidthRatio: 0.45,
    },
  });

  return (
    <ErrorBoundary>
      <LocaleProvider locale={locale}>
        <AppSidePaneProvider>
          <div
            className={`app-shell ${isTranscriptionRoute ? 'app-shell-transcription' : ''} ${isSidePaneCollapsed ? 'app-shell-side-pane-collapsed' : ''}`}
            style={shellStyle}
          >
            <div ref={shellBodyRef} className="app-shell-body">
            <aside className="app-left-rail" aria-label={t(locale, 'app.leftRail.aria.navigation')}>
              <nav className="app-left-rail-group app-left-rail-primary" aria-label={t(locale, 'app.navGroup.core')}>
                {primaryNavItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        isActive ? 'left-rail-btn left-rail-btn-active' : 'left-rail-btn'
                      }
                      title={item.label}
                      aria-label={item.label}
                    >
                      <MaterialSymbol name={item.icon} aria-hidden className={JIEYU_MATERIAL_NAV} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
              </nav>
              <div
                className="app-left-rail-bottom-slot"
                aria-hidden={!isTranscriptionRoute}
                {...(isTranscriptionRoute
                  ? { 'aria-label': t(locale, 'app.leftRail.aria.contextSlot') }
                  : {})}
              >
                {isTranscriptionRoute ? (
                  <div
                    id={LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID}
                    className="left-rail-context-actions-host"
                    data-testid={LEFT_RAIL_TRANSCRIPTION_LAYER_ACTIONS_SLOT_ID}
                  />
                ) : null}
              </div>
              <div className="app-left-rail-footer" aria-label={t(locale, 'app.leftRail.aria.footer')}>
                <div
                  id="left-rail-project-hub-slot"
                  className="left-rail-project-hub-anchor"
                  aria-hidden="true"
                />
                <LeftRailResourcesMenu
                  locale={locale}
                  items={secondaryNavItems.map((item) => ({
                    to: item.to,
                    label: item.label,
                  }))}
                  isItemActive={isAssetPanelActive}
                  onPick={handleAssetPanelToggle}
                />
                {isTranscriptionRoute ? (
                  <button
                    type="button"
                    className="left-rail-btn left-rail-btn-utility"
                    aria-label={collaborationMessages.title}
                    title={collaborationMessages.title}
                    onClick={handleCollaborationEntryOpen}
                  >
                    <MaterialSymbol name="cloud_sync" aria-hidden className={JIEYU_MATERIAL_NAV} />
                    <span>{collaborationMessages.entryLabel}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="left-rail-btn left-rail-btn-utility"
                  aria-label={t(locale, 'transcription.voiceWidget.settings.button')}
                  title={t(locale, 'transcription.voiceWidget.settings.button')}
                  onClick={handleSettingsOpen}
                >
                  <MaterialSymbol name="settings" aria-hidden className={JIEYU_MATERIAL_NAV} />
                </button>
              </div>
            </aside>

            <AppShellSidePane
              locale={locale}
              activeNavItem={activeNavItem}
              isTranscriptionRoute={isTranscriptionRoute}
              isSidePaneCollapsed={isSidePaneCollapsed}
              handleSidePaneResizeStart={handleSidePaneResizeStart}
              handleSidePaneToggle={handleSidePaneToggle}
            />

            <main
              className={`app-main ${isTranscriptionRoute ? 'app-main-transcription' : ''}`}
            >
              <AiPanelProvider>
                <AssetPanelProvider value={assetPanelCtx}>
                <Suspense fallback={<div className="app-route-loading" aria-busy="true" />}>
                  <Routes location={location}>
                    <Route path="/" element={<HomePage />} />
                    <Route
                      path="/transcription"
                      element={<TranscriptionPage />}
                    />
                    <Route path="/assets/language-metadata" element={<TranscriptionPage />} />
                    <Route path="/assets/orthographies" element={<TranscriptionPage />} />
                    <Route path="/assets/orthography-bridges" element={<TranscriptionPage />} />
                    <Route path="/annotation" element={<AnnotationPage />} />
                    <Route path="/analysis" element={<AnalysisPage />} />
                    <Route path="/writing" element={<Navigate to="/corpus" replace />} />
                    <Route path="/corpus" element={<CorpusLibraryPage />} />
                    <Route path="/lexicon" element={<LexiconPage />} />
                    <Route path="*" element={<NotFound locale={locale} />} />
                  </Routes>
                </Suspense>
                <Suspense fallback={null}>
                  <ModalPanel
                    isOpen={openAssetPanel === 'language-metadata'}
                    onClose={handleAssetPanelClose}
                    ariaLabel={t(locale, 'app.nav.languageMetadata')}
                    closeLabel={t(locale, 'transcription.importDialog.close')}
                    renderShell={false}
                    wide
                  >
                    <LanguageMetadataWorkspacePage registerSidePane={false} onClose={handleAssetPanelClose} />
                  </ModalPanel>
                  <ModalPanel
                    isOpen={openAssetPanel === 'orthographies'}
                    onClose={handleAssetPanelClose}
                    ariaLabel={t(locale, 'app.nav.orthographies')}
                    closeLabel={t(locale, 'transcription.importDialog.close')}
                    renderShell={false}
                    wide
                  >
                    <OrthographyManagerPage registerSidePane={false} onClose={handleAssetPanelClose} />
                  </ModalPanel>
                  <ModalPanel
                    isOpen={openAssetPanel === 'orthography-bridges'}
                    onClose={handleAssetPanelClose}
                    ariaLabel={t(locale, 'app.nav.orthographyBridges')}
                    closeLabel={t(locale, 'transcription.importDialog.close')}
                    renderShell={false}
                    wide
                  >
                    <OrthographyBridgeWorkspacePage registerSidePane={false} onClose={handleAssetPanelClose} />
                  </ModalPanel>
                </Suspense>
                </AssetPanelProvider>
              </AiPanelProvider>
            </main>
            </div>
            {import.meta.env.DEV ? <DevErrorAggregationPanel /> : null}
            <AppGlobalToastHost />
            {dbGate.kind === 'failed' ? (
              <DbIntegrityBlockingOverlay
                locale={locale}
                failureKind={dbGate.failureKind}
                reason={dbGate.reason}
                onReload={dbOverlayHandlers.onReload}
                onRetry={dbOverlayHandlers.onRetry}
                onContinueSession={dbOverlayHandlers.onContinueSession}
              />
            ) : null}
            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={handleSettingsClose}
              locale={locale}
              themeMode={themeMode}
              onThemeChange={setThemeMode}
              onLocaleChange={handleLocaleChange}
              fontScale={uiFontScale}
              fontScaleMode={uiFontScaleMode}
              onFontScaleChange={handleFontScaleChange}
              onFontScaleModeChange={handleFontScaleModeChange}
              iconEffect={iconEffect}
              onIconEffectChange={handleIconEffectChange}
              version={resolveHostVersion()}
            />
          </div>
        </AppSidePaneProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
