import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun, Search, User } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DevErrorAggregationPanel } from './components/DevErrorAggregationPanel';
import { AiPanelProvider } from './contexts/AiPanelContext';
import { detectLocale, t } from './i18n';

// 路由级代码分割，各页面按需加载 | Route-level code splitting, pages loaded on demand
const TranscriptionPage = lazy(() => import('./pages/TranscriptionPage').then(m => ({ default: m.TranscriptionPage })));
const AnnotationPage = lazy(() => import('./pages/AnnotationPage').then(m => ({ default: m.AnnotationPage })));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })));
const WritingPage = lazy(() => import('./pages/WritingPage').then(m => ({ default: m.WritingPage })));
const LexiconPage = lazy(() => import('./pages/LexiconPage').then(m => ({ default: m.LexiconPage })));

type ThemeMode = 'light' | 'dark';

function NotFound({ locale }: { locale: ReturnType<typeof detectLocale> }) {
  return (
    <section className="panel">
      <h2>{t(locale, 'app.notFound.title')}</h2>
      <p>{t(locale, 'app.notFound.desc')}</p>
    </section>
  );
}

export function App() {
  const location = useLocation();
  const isTranscriptionRoute = location.pathname.startsWith('/transcription');
  const locale = useMemo(() => detectLocale(), []);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem('jieyu-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    window.localStorage.setItem('jieyu-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeaderHeight = () => {
      setHeaderHeight(header.getBoundingClientRect().height);
    };

    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  useEffect(() => {
    if (isTranscriptionRoute) {
      setIsHeaderCompact(false);
      return;
    }

    const onScroll = () => {
      setIsHeaderCompact(window.scrollY > 10);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isTranscriptionRoute]);

  const navGroups = useMemo(() => [
    {
      id: 'workbench',
      items: [
        { to: '/transcription', label: t(locale, 'app.nav.transcription') },
        { to: '/annotation', label: t(locale, 'app.nav.annotation') },
        { to: '/analysis', label: t(locale, 'app.nav.analysis') },
      ],
    },
    {
      id: 'knowledge',
      items: [
        { to: '/writing', label: t(locale, 'app.nav.writing') },
        { to: '/lexicon', label: t(locale, 'app.nav.lexicon') },
      ],
    },
  ], [locale]);

  // Header is now fixed at top: 12px, so transcription content starts at headerHeight + 12
  const transcriptionMainStyle = isTranscriptionRoute
    ? ({
        '--app-header-height': `${headerHeight}px`,
        position: 'fixed',
        left: 0,
        right: 0,
        top: `${headerHeight + 12}px`,
        bottom: 0,
        width: '100%',
        maxWidth: 'none',
        margin: 0,
        display: 'flex',
        overflow: 'hidden',
      } as React.CSSProperties)
    : undefined;

  return (
    <ErrorBoundary>
    <div className={`app-shell ${isTranscriptionRoute ? 'app-shell-transcription' : ''}`}>
      <header ref={headerRef} className={`app-header ${isHeaderCompact ? 'app-header-compact' : ''}`}>
        <div className="header-brand">
          <img src="/favicon.svg" alt="" className="header-brand-icon" aria-hidden="true" />
          <p className="header-brand-name"><span>解语</span> Jieyu</p>
        </div>

        <nav className="header-nav" aria-label="主功能导航">
          {navGroups.map((group, groupIndex) => (
            <Fragment key={group.id}>
              <div className="header-nav-group">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      isActive ? 'header-nav-link header-nav-link-active' : 'header-nav-link'
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
              {groupIndex < navGroups.length - 1 ? (
                <span className="header-nav-separator" aria-hidden="true" />
              ) : null}
            </Fragment>
          ))}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="header-action-btn header-action-btn-search"
            title="搜索 (⌘K)"
            aria-label="搜索"
          >
            <Search size={15} />
          </button>
          <button
            type="button"
            className="header-action-btn"
            aria-label={themeMode === 'dark' ? t(locale, 'theme.toggle.light') : t(locale, 'theme.toggle.dark')}
            title={themeMode === 'dark' ? t(locale, 'theme.toggle.light') : t(locale, 'theme.toggle.dark')}
            onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            type="button"
            className="header-action-btn"
            title="用户"
            aria-label="用户"
          >
            <User size={15} />
          </button>
        </div>
      </header>

      <main
        className={`app-main ${isTranscriptionRoute ? 'app-main-transcription' : ''}`}
        style={transcriptionMainStyle}
      >
        <AiPanelProvider>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Navigate to="/transcription" replace />} />
              <Route path="/transcription" element={<TranscriptionPage />} />
              <Route path="/annotation" element={<AnnotationPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/writing" element={<WritingPage />} />
              <Route path="/lexicon" element={<LexiconPage />} />
              <Route path="*" element={<NotFound locale={locale} />} />
            </Routes>
          </Suspense>
        </AiPanelProvider>
      </main>
      {import.meta.env.DEV ? <DevErrorAggregationPanel /> : null}
    </div>
    </ErrorBoundary>
  );
}
