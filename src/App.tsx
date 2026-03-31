import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AudioLines, BookOpenText, ChartColumn, Tags, WholeWord, type LucideIcon } from 'lucide-react';
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
  const [themeMode] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem('jieyu-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    window.localStorage.setItem('jieyu-theme', themeMode);
  }, [themeMode]);

  const [isSidePaneCollapsed, setIsSidePaneCollapsed] = useState<boolean>(() => (
    window.localStorage.getItem('jieyu-side-pane-collapsed') === '1'
  ));

  useEffect(() => {
    window.localStorage.setItem('jieyu-side-pane-collapsed', isSidePaneCollapsed ? '1' : '0');
  }, [isSidePaneCollapsed]);

  const navGroups = useMemo<NavGroup[]>(() => [
    {
      id: 'workspace-core',
      title: '核心工作区',
      items: [
        {
          to: '/transcription',
          label: t(locale, 'app.nav.transcription'),
          icon: AudioLines,
          summary: '语音转写、切分、时间轴编辑',
        },
        {
          to: '/annotation',
          label: t(locale, 'app.nav.annotation'),
          icon: Tags,
          summary: '语义标注、实体与结构标签',
        },
        {
          to: '/analysis',
          label: t(locale, 'app.nav.analysis'),
          icon: ChartColumn,
          summary: '统计分析、质量评估与洞察',
        },
      ],
    },
    {
      id: 'workspace-language',
      title: '语言资产',
      items: [
        {
          to: '/writing',
          label: t(locale, 'app.nav.writing'),
          icon: WholeWord,
          summary: '释义撰写、文本润色与输出',
        },
        {
          to: '/lexicon',
          label: t(locale, 'app.nav.lexicon'),
          icon: BookOpenText,
          summary: '词典管理、词条规范与维护',
        },
      ],
    },
  ], [locale]);

  const navItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);

  const activeNavItem = useMemo(() => (
    navItems.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
    ?? navItems[0]
  ), [location.pathname, navItems]);

  return (
    <ErrorBoundary>
    <div className={`app-shell ${isTranscriptionRoute ? 'app-shell-transcription' : ''} ${isSidePaneCollapsed ? 'app-shell-side-pane-collapsed' : ''}`}>
      <aside className="app-left-rail" aria-label="功能区切换">
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
        <div id="left-rail-bottom-slot" className="app-left-rail-bottom-slot" aria-label="转写快捷操作区" />
      </aside>

      <aside className={`app-side-pane ${isSidePaneCollapsed ? 'app-side-pane-collapsed' : ''}`} aria-label="功能面板">
        <div className="app-side-pane-header">
          <p className="app-side-pane-title">{activeNavItem?.label ?? '工作台'}</p>
          <p className="app-side-pane-subtitle">{activeNavItem?.summary ?? '统一工作台入口'}</p>
        </div>

        <div className="app-side-pane-body">
          <div id="app-side-pane-body-slot" className="app-side-pane-body-slot" aria-label="功能面板内容区" />
        </div>
      </aside>
      <button
        type="button"
        className="app-side-pane-collapse-toggle"
        onClick={() => setIsSidePaneCollapsed((prev) => !prev)}
        aria-label={isSidePaneCollapsed ? '展开功能面板' : '折叠功能面板'}
        title={isSidePaneCollapsed ? '展开功能面板' : '折叠功能面板'}
      >
        <span aria-hidden="true">{isSidePaneCollapsed ? '›' : '‹'}</span>
      </button>

      <main
        className={`app-main ${isTranscriptionRoute ? 'app-main-transcription' : ''}`}
      >
        <AiPanelProvider>
          <Suspense fallback={null}>
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
      {import.meta.env.DEV ? <DevErrorAggregationPanel /> : null}
    </div>
    </ErrorBoundary>
  );
}
