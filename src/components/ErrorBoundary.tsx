import { Component, type ErrorInfo, type ReactNode } from 'react';
import { detectLocale, t } from '../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback renderer. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return (
        <section className="panel" style={{ padding: '2rem' }}>
          <h2>{t(detectLocale(), 'app.errorBoundary.title')}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{error.message}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={this.reset}>
              {t(detectLocale(), 'app.errorBoundary.retry')}
            </button>
            <button
              className="btn"
              style={{ background: 'var(--border-soft)', color: 'var(--text-primary)' }}
              onClick={() => window.location.reload()}
            >
              {t(detectLocale(), 'app.errorBoundary.reload')}
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
