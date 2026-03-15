import { Component, type ErrorInfo, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  AnalysisPage,
  AnnotationPage,
  LexiconPage,
  TranscriptionPage,
  WritingPage,
} from './pages';

const navItems = [
  { to: '/transcription', label: '转写' },
  { to: '/annotation', label: '标注' },
  { to: '/analysis', label: '分析' },
  { to: '/writing', label: '写作' },
  { to: '/lexicon', label: '词典' },
];

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <section className="panel" style={{ padding: '2rem' }}>
          <h2>应用出错</h2>
          <p>{this.state.error.message}</p>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            重试
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

function NotFound() {
  return (
    <section className="panel">
      <h2>404</h2>
      <p>页面不存在，请从导航栏选择功能。</p>
    </section>
  );
}

export function App() {
  return (
    <ErrorBoundary>
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <h1>解语 Jieyu</h1>
          <p>濒危语言科研协作平台</p>
        </div>
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
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/transcription" replace />} />
          <Route path="/transcription" element={<TranscriptionPage />} />
          <Route path="/annotation" element={<AnnotationPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/writing" element={<WritingPage />} />
          <Route path="/lexicon" element={<LexiconPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
    </ErrorBoundary>
  );
}
