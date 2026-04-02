import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AudioLines, Brain, FolderKanban, Languages, StickyNote, type LucideIcon } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevErrorAggregationPanel } from './components/DevErrorAggregationPanel';
import { AiPanelProvider } from './contexts/AiPanelContext';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from './contexts/AppSidePaneContext';
import { usePanelAutoCollapse } from './hooks/usePanelAutoCollapse';
import { usePanelResize } from './hooks/usePanelResize';
import { LOCALE_PREFERENCE_STORAGE_KEY, LocaleProvider, detectLocale, setStoredLocalePreference, t, type Locale } from './i18n';

// 路由级代码分割，各页面按需加载 | Route-level code splitting, pages loaded on demand
const TranscriptionPage = lazy(() => import('./pages/TranscriptionPage').then(m => ({ default: m.TranscriptionPage })));
const AnnotationPage = lazy(() => import('./pages/AnnotationPage').then(m => ({ default: m.AnnotationPage })));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })));
const WritingPage = lazy(() => import('./pages/WritingPage').then(m => ({ default: m.WritingPage })));
const LexiconPage = lazy(() => import('./pages/LexiconPage').then(m => ({ default: m.LexiconPage })));

type ThemeMode = 'light' | 'dark';

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
  if (stored === 'light' || stored === 'dark') return stored;
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
  const location = useLocation();
  const isTranscriptionRoute = location.pathname.startsWith('/transcription');
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const shellBodyRef = useRef<HTMLDivElement | null>(null);
  const shellDragCleanupRef = useRef<(() => void) | null>(null);
  const [themeMode] = useState<ThemeMode>(readInitialThemeMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    try {
      window.localStorage.setItem('jieyu-theme', themeMode);
    } catch {
      // Ignore theme persistence failures and keep the current session theme.
    }
  }, [themeMode]);

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

  const navItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);

  const activeNavItem = useMemo(() => (
    navItems.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
    ?? navItems[0]
  ), [location.pathname, navItems]);

  const handleSidePaneToggle = useCallback((event?: React.SyntheticEvent<HTMLElement>) => {
    event?.stopPropagation();
    setIsSidePaneCollapsed((prev) => !prev);
  }, []);

  const handleLocaleToggle = useCallback(() => {
    const nextLocale: Locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
    setStoredLocalePreference(nextLocale);
    setLocale(nextLocale);
  }, [locale]);

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
                {navItems.map((item) => {
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
                  <Routes>
                    <Route path="/" element={<Navigate to="/transcription" replace />} />
                    <Route
                      path="/transcription"
                      element={<TranscriptionPage />}
                    />
                    <Route path="/annotation" element={<AnnotationPage />} />
                    <Route path="/analysis" element={<AnalysisPage />} />
                    <Route path="/writing" element={<WritingPage />} />
                    <Route path="/lexicon" element={<LexiconPage />} />
                    <Route path="*" element={<NotFound locale={locale} />} />
                  </Routes>
                </Suspense>
              </AiPanelProvider>
            </main>
            </div>
            {import.meta.env.DEV ? <DevErrorAggregationPanel /> : null}
          </div>
        </AppSidePaneProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
