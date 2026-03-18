import { useEffect, useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  AnalysisPage,
  AnnotationPage,
  LexiconPage,
  TranscriptionPage,
  WritingPage,
} from './pages';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AiPanelProvider } from './contexts/AiPanelContext';
import { detectLocale, t } from './i18n';

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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem('jieyu-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    window.localStorage.setItem('jieyu-theme', themeMode);
  }, [themeMode]);

  const navItems = useMemo(() => [
    { to: '/transcription', label: t(locale, 'app.nav.transcription') },
    { to: '/annotation', label: t(locale, 'app.nav.annotation') },
    { to: '/analysis', label: t(locale, 'app.nav.analysis') },
    { to: '/writing', label: t(locale, 'app.nav.writing') },
    { to: '/lexicon', label: t(locale, 'app.nav.lexicon') },
  ], [locale]);

  return (
    <ErrorBoundary>
    <div className="app-shell">
      <header className={`app-header ${isTranscriptionRoute ? 'app-header-compact' : ''}`}>
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

      <main className={`app-main ${isTranscriptionRoute ? 'app-main-transcription' : ''}`}>
        <AiPanelProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/transcription" replace />} />
            <Route path="/transcription" element={<TranscriptionPage />} />
            <Route path="/annotation" element={<AnnotationPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/writing" element={<WritingPage />} />
            <Route path="/lexicon" element={<LexiconPage />} />
            <Route path="*" element={<NotFound locale={locale} />} />
          </Routes>
        </AiPanelProvider>
      </main>
    </div>
    </ErrorBoundary>
  );
}
