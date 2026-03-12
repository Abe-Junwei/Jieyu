import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AnalysisPage } from './pages/AnalysisPage';
import { AnnotationPage } from './pages/AnnotationPage';
import { LexiconPage } from './pages/LexiconPage';
import { TranscriptionPage } from './pages/TranscriptionPage';
import { WritingPage } from './pages/WritingPage';

const navItems = [
  { to: '/transcription', label: '转写' },
  { to: '/annotation', label: '标注' },
  { to: '/analysis', label: '分析' },
  { to: '/writing', label: '写作' },
  { to: '/lexicon', label: '词典' },
];

export function App() {
  return (
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
        </Routes>
      </main>
    </div>
  );
}
