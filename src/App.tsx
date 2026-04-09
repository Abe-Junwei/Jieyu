import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AudioLines, BookType, Brain, FolderKanban, GitBranch, Languages, Settings, StickyNote, type LucideIcon } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevErrorAggregationPanel } from './components/DevErrorAggregationPanel';
import { AiPanelProvider } from './contexts/AiPanelContext';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from './contexts/AppSidePaneContext';
import { usePanelAutoCollapse } from './hooks/usePanelAutoCollapse';
import { SettingsModal } from './components/SettingsModal';
import { persistUiFontScalePreference, readPersistedUiFontScalePreference, type UiFontScaleMode } from './utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from './hooks/useUiFontScaleRuntime';
import { usePanelResize } from './hooks/usePanelResize';
import { LOCALE_PREFERENCE_STORAGE_KEY, LocaleProvider, detectLocale, setStoredLocalePreference, t, type Locale } from './i18n';
import { LanguageAssetRouteDialog } from './components/ui/LanguageAssetRouteDialog';

// 路由级代码分割，各页面按需加载 | Route-level code splitting, pages loaded on demand
const TranscriptionPage = lazy(() => import('./pages/TranscriptionPage').then(m => ({ default: m.TranscriptionPage })));
const AnnotationPage = lazy(() => import('./pages/AnnotationPage').then(m => ({ default: m.AnnotationPage })));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })));
const WritingPage = lazy(() => import('./pages/WritingPage').then(m => ({ default: m.WritingPage })));
const LexiconPage = lazy(() => import('./pages/LexiconPage').then(m => ({ default: m.LexiconPage })));
const LanguageMetadataWorkspacePage = lazy(() => import('./pages/LanguageMetadataWorkspacePage').then(m => ({ default: m.LanguageMetadataWorkspacePage })));
const OrthographyManagerPage = lazy(() => import('./pages/OrthographyManagerPage').then(m => ({ default: m.OrthographyManagerPage })));
const OrthographyBridgeWorkspacePage = lazy(() => import('./pages/OrthographyBridgeWorkspacePage').then(m => ({ default: m.OrthographyBridgeWorkspacePage })));

const LANGUAGE_ASSET_MODAL_PATHS = [
  '/assets/language-metadata',
  '/assets/orthographies',
  '/assets/orthography-bridges',
] as const;

type ThemeMode = 'light' | 'dark' | 'system';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
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
  const stored = readLocalStorageValue('jieyu-theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

/** 将主题模式解析为实际 data-theme 值 | Resolve theme mode to actual applied theme */
function resolveAppliedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
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

function RouteLoading({ locale }: { locale: Locale }) {
  return (
    <section className="panel" role="status" aria-live="polite" aria-busy="true">
      <p>{t(locale, 'transcription.status.loading')}</p>
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
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
  const isTranscriptionRoute = location.pathname.startsWith('/transcription');
  const isLanguageAssetModalOpen = LANGUAGE_ASSET_MODAL_PATHS.includes(location.pathname as typeof LANGUAGE_ASSET_MODAL_PATHS[number]);
  const fallbackLanguageAssetBackgroundLocation = useMemo<Location | null>(() => {
    if (!isLanguageAssetModalOpen || backgroundLocation) {
      return null;
    }

    return {
      pathname: '/transcription',
      search: '',
      hash: '',
      state: null,
      key: 'language-asset-modal-fallback',
    };
  }, [backgroundLocation, isLanguageAssetModalOpen]);
  const languageAssetModalBackgroundLocation = backgroundLocation ?? fallbackLanguageAssetBackgroundLocation;
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const shellBodyRef = useRef<HTMLDivElement | null>(null);
  const shellDragCleanupRef = useRef<(() => void) | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { uiFontScale, uiFontScaleMode } = useUiFontScaleRuntime(locale);

  useEffect(() => {
    const applied = resolveAppliedTheme(themeMode);
    document.documentElement.setAttribute('data-theme', applied);
    try {
      window.localStorage.setItem('jieyu-theme', themeMode);
    } catch {
      // Ignore theme persistence failures and keep the current session theme.
    }
  }, [themeMode]);

  // 跟随系统主题变化 | Listen for system color-scheme changes when mode is 'system'
  useEffect(() => {
    if (themeMode !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.setAttribute('data-theme', mql.matches ? 'dark' : 'light');
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
    // 首屏路由是转写页时，预热关键模块请求，避免懒加载链延后触发 | Prewarm transcription modules on first-route hit to avoid delayed lazy-chain fetches
    if (location.pathname !== '/' && !location.pathname.startsWith('/transcription')) {
      return;
    }
    void import('./pages/TranscriptionPage');
    void import('./pages/TranscriptionPage.Orchestrator');
  }, [location.pathname]);

  const navGroups = useMemo<NavGroup[]>(() => [
    {
      id: 'workspace-core',
      title: t(locale, 'app.navGroup.core'),
      items: [
        {
          to: '/transcription',
          label: t(locale, 'app.nav.transcription'),
          icon: AudioLines,
          summary: t(locale, 'app.nav.summary.transcription'),
        },
        {
          to: '/annotation',
          label: t(locale, 'app.nav.annotation'),
          icon: FolderKanban,
          summary: t(locale, 'app.nav.summary.annotation'),
        },
        {
          to: '/analysis',
          label: t(locale, 'app.nav.analysis'),
          icon: Brain,
          summary: t(locale, 'app.nav.summary.analysis'),
        },
        {
          to: '/writing',
          label: t(locale, 'app.nav.writing'),
          icon: StickyNote,
          summary: t(locale, 'app.nav.summary.writing'),
        },
        {
          to: '/lexicon',
          label: t(locale, 'app.nav.lexicon'),
          icon: Languages,
          summary: t(locale, 'app.nav.summary.lexicon'),
        },
      ],
    },
  ], [locale]);

  const secondaryNavItems = useMemo<NavItem[]>(() => [
    {
      to: '/assets/language-metadata',
      label: t(locale, 'app.nav.languageMetadata'),
      icon: Languages,
      summary: t(locale, 'app.nav.summary.languageMetadata'),
    },
    {
      to: '/assets/orthographies',
      label: t(locale, 'app.nav.orthographies'),
      icon: BookType,
      summary: t(locale, 'app.nav.summary.orthographies'),
    },
    {
      to: '/assets/orthography-bridges',
      label: t(locale, 'app.nav.orthographyBridges'),
      icon: GitBranch,
      summary: t(locale, 'app.nav.summary.orthographyBridges'),
    },
  ], [locale]);

  const primaryNavItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);
  const navItems = useMemo(() => [...primaryNavItems, ...secondaryNavItems], [primaryNavItems, secondaryNavItems]);
  const activePathname = languageAssetModalBackgroundLocation?.pathname ?? location.pathname;

  const activeNavItem = useMemo(() => (
    navItems.find((item) => activePathname === item.to || activePathname.startsWith(`${item.to}/`))
    ?? navItems[0]
  ), [activePathname, navItems]);

  const handleLanguageAssetModalClose = useCallback(() => {
    if (!isLanguageAssetModalOpen) {
      return;
    }

    if (backgroundLocation) {
      navigate({
        pathname: backgroundLocation.pathname,
        search: backgroundLocation.search,
        hash: backgroundLocation.hash,
      }, {
        replace: true,
        state: backgroundLocation.state,
      });
      return;
    }

    navigate(languageAssetModalBackgroundLocation?.pathname ?? '/transcription', {
      replace: true,
    });
  }, [backgroundLocation, isLanguageAssetModalOpen, languageAssetModalBackgroundLocation?.pathname, navigate]);

  const handleLanguageAssetModalToggle = useCallback((to: typeof LANGUAGE_ASSET_MODAL_PATHS[number]) => {
    if (location.pathname === to) {
      handleLanguageAssetModalClose();
      return;
    }

    navigate(to, {
      state: { backgroundLocation: languageAssetModalBackgroundLocation ?? location },
    });
  }, [handleLanguageAssetModalClose, languageAssetModalBackgroundLocation, location, navigate]);

  const isLanguageAssetRouteActive = useCallback((to: string) => {
    if (location.pathname === to) {
      return true;
    }

    return activePathname === to || activePathname.startsWith(`${to}/`);
  }, [activePathname, location.pathname]);

  const handleSidePaneToggle = useCallback((event?: React.SyntheticEvent<HTMLElement>) => {
    event?.stopPropagation();
    setIsSidePaneCollapsed((prev) => !prev);
  }, []);

  const handleLocaleToggle = useCallback(() => {
    const nextLocale: Locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
    setStoredLocalePreference(nextLocale);
    setLocale(nextLocale);
  }, [locale]);

  const handleLocaleChange = useCallback((nextLocale: Locale) => {
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
              <div className="app-left-rail-group">
                {primaryNavItems.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        isActive ? 'left-rail-btn left-rail-btn-active' : 'left-rail-btn'
                      }
                      title={item.label}
                      aria-label={item.label}
                    >
                      <ItemIcon size={17} aria-hidden="true" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
              <div className="app-left-rail-secondary" aria-label={t(locale, 'app.leftRail.aria.languageAssets')}>
                <p className="app-left-rail-section-label">{t(locale, 'app.navGroup.language')}</p>
                <div className="app-left-rail-group">
                  {secondaryNavItems.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.to}
                        type="button"
                        className={isLanguageAssetRouteActive(item.to) ? 'left-rail-btn left-rail-btn-active' : 'left-rail-btn'}
                        title={item.label}
                        aria-label={item.label}
                        onClick={() => handleLanguageAssetModalToggle(item.to as typeof LANGUAGE_ASSET_MODAL_PATHS[number])}
                      >
                        <ItemIcon size={17} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                id="left-rail-bottom-slot"
                className="app-left-rail-bottom-slot"
                aria-label={t(locale, 'app.leftRail.aria.quickActions')}
              />
              <button
                type="button"
                className="left-rail-btn left-rail-btn-utility"
                aria-label={locale === 'zh-CN' ? t(locale, 'app.locale.switchToEnglish') : t(locale, 'app.locale.switchToChinese')}
                title={locale === 'zh-CN' ? t(locale, 'app.locale.switchToEnglish') : t(locale, 'app.locale.switchToChinese')}
                onClick={handleLocaleToggle}
              >
                <Languages size={17} aria-hidden="true" />
                <span>{locale === 'zh-CN' ? 'EN' : 'ZH'}</span>
              </button>
              <button
                type="button"
                className="left-rail-btn left-rail-btn-utility"
                aria-label={locale === 'zh-CN' ? '设置' : 'Settings'}
                title={locale === 'zh-CN' ? '设置' : 'Settings'}
                onClick={handleSettingsOpen}
              >
                <Settings size={17} aria-hidden="true" />
              </button>
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
                <Suspense fallback={<RouteLoading locale={locale} />}>
                  <Routes location={languageAssetModalBackgroundLocation ?? location}>
                    <Route path="/" element={<Navigate to="/transcription" replace />} />
                    <Route
                      path="/transcription"
                      element={<TranscriptionPage />}
                    />
                    <Route path="/annotation" element={<AnnotationPage />} />
                    <Route path="/analysis" element={<AnalysisPage />} />
                    <Route path="/writing" element={<WritingPage />} />
                    <Route path="/lexicon" element={<LexiconPage />} />
                    <Route path="/assets/language-metadata" element={<LanguageMetadataWorkspacePage />} />
                    <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
                    {/* 旧路由重定向，保持外部链接兼容 | Legacy route redirect for backward compatibility */}
                    <Route path="/lexicon/orthographies" element={<Navigate to="/assets/orthographies" replace />} />
                    <Route path="*" element={<NotFound locale={locale} />} />
                  </Routes>
                  {isLanguageAssetModalOpen ? (
                    <Routes>
                      <Route
                        path="/assets/language-metadata"
                        element={(
                          <LanguageAssetRouteDialog
                            ariaLabel={t(locale, 'app.nav.languageMetadata')}
                            closeLabel={t(locale, 'transcription.importDialog.close')}
                            onClose={handleLanguageAssetModalClose}
                            surfaceVariant="workspace"
                          >
                            <LanguageMetadataWorkspacePage registerSidePane={false} />
                          </LanguageAssetRouteDialog>
                        )}
                      />
                      <Route
                        path="/assets/orthographies"
                        element={(
                          <LanguageAssetRouteDialog
                            ariaLabel={t(locale, 'app.nav.orthographies')}
                            closeLabel={t(locale, 'transcription.importDialog.close')}
                            onClose={handleLanguageAssetModalClose}
                            surfaceVariant="workspace"
                          >
                            <OrthographyManagerPage registerSidePane={false} />
                          </LanguageAssetRouteDialog>
                        )}
                      />
                      <Route
                        path="/assets/orthography-bridges"
                        element={(
                          <LanguageAssetRouteDialog
                            ariaLabel={t(locale, 'app.nav.orthographyBridges')}
                            closeLabel={t(locale, 'transcription.importDialog.close')}
                            onClose={handleLanguageAssetModalClose}
                            surfaceVariant="workspace"
                          >
                            <OrthographyBridgeWorkspacePage registerSidePane={false} />
                          </LanguageAssetRouteDialog>
                        )}
                      />
                    </Routes>
                  ) : null}
                </Suspense>
              </AiPanelProvider>
            </main>
            </div>
            {import.meta.env.DEV ? <DevErrorAggregationPanel /> : null}
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
            />
          </div>
        </AppSidePaneProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
