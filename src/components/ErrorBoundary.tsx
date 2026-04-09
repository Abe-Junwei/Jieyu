import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t, type Locale, useLocale } from '../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback renderer. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryImplProps extends ErrorBoundaryProps {
  locale: Locale;
}

class ErrorBoundaryImpl extends Component<ErrorBoundaryImplProps, { error: Error | null }> {
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
    const { locale } = this.props;

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return (
        <section className="panel app-error-boundary">
          <h2>{t(locale, 'app.errorBoundary.title')}</h2>
          <p className="app-error-boundary__message">{error.message}</p>
          <div className="app-error-boundary__actions">
            <button className="btn" onClick={this.reset}>
              {t(locale, 'app.errorBoundary.retry')}
            </button>
            <button
              className="btn app-error-boundary__reload-btn"
              onClick={() => window.location.reload()}
            >
              {t(locale, 'app.errorBoundary.reload')}
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  const locale = useLocale();
  return <ErrorBoundaryImpl {...props} locale={locale} />;
}
