import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
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

  const navItems = useMemo(() => [
    { to: '/transcription', label: t(locale, 'app.nav.transcription') },
    { to: '/annotation', label: t(locale, 'app.nav.annotation') },
    { to: '/analysis', label: t(locale, 'app.nav.analysis') },
    { to: '/writing', label: t(locale, 'app.nav.writing') },
    { to: '/lexicon', label: t(locale, 'app.nav.lexicon') },
  ], [locale]);

  const transcriptionMainStyle = isTranscriptionRoute
    ? ({
        '--app-header-height': `${headerHeight}px`,
        position: 'fixed',
        left: 0,
        right: 0,
        top: `${headerHeight}px`,
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
      <header ref={headerRef} className={`app-header ${isTranscriptionRoute ? 'app-header-compact' : ''}`}>
        <div className="brand-block">
          <h1>{t(locale, 'app.title')}</h1>
          <p>{t(locale, 'app.subtitle')}</p>
        </div>
        <div className="app-header-actions">
          <nav className="tab-nav" aria-label="主功能标签页">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'tab-link tab-link-active' : 'tab-link'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="theme-toggle-btn"
            aria-label={themeMode === 'dark' ? t(locale, 'theme.toggle.light') : t(locale, 'theme.toggle.dark')}
            title={themeMode === 'dark' ? t(locale, 'theme.toggle.light') : t(locale, 'theme.toggle.dark')}
            onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
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
