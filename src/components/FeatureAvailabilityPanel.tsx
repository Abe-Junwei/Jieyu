import { Link } from 'react-router-dom';

interface FeatureAvailabilityPanelProps {
  title: string;
  summary: string;
  scope: string[];
}

export function FeatureAvailabilityPanel({ title, summary, scope }: FeatureAvailabilityPanelProps) {
  return (
    <section className="panel feature-availability-panel" aria-labelledby="feature-availability-title">
      <span className="feature-availability-badge">规划中</span>
      <h2 id="feature-availability-title">{title}</h2>
      <p className="feature-availability-summary">{summary}</p>
      <div className="feature-availability-block">
        <p className="feature-availability-label">当前状态</p>
        <p>该页面暂未纳入当前交付范围，已从主导航降级，避免与可用功能混淆。</p>
      </div>
      <div className="feature-availability-block">
        <p className="feature-availability-label">计划覆盖</p>
        <ul className="feature-availability-list">
          {scope.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="feature-availability-actions">
        <Link to="/transcription" className="feature-availability-link">返回当前可用工作台</Link>
      </div>
    </section>
  );
}