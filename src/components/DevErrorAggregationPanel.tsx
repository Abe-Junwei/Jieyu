import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getStructuredErrorAggregation, type ErrorAggregationEntry } from '../observability/errorAggregation';
import { useLocale } from '../i18n';
import { getDevErrorAggregationPanelMessages, type DevErrorAggregationPanelMessages } from '../i18n/messages';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import '../styles/panels/dev-error-aggregation.css';

function formatEntryLabel(entry: ErrorAggregationEntry, messages: DevErrorAggregationPanelMessages): string {
  const severity = entry.recoverable ? messages.recoverable : messages.fatal;
  return messages.entryLabel(entry.category, entry.action, entry.i18nKey ?? null, severity);
}

export function DevErrorAggregationPanel() {
  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const panelMinWidth = useMemo(
    () => computeAdaptivePanelWidth({
      baseWidth: 320,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: 'compact',
      minWidth: 280,
      maxWidth: 480,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    }),
    [locale, uiFontScale, uiTextDirection, viewportWidth],
  );
  const panelMaxWidth = useMemo(
    () => computeAdaptivePanelWidth({
      baseWidth: 520,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: 'data-dense',
      minWidth: 360,
      maxWidth: 760,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    }),
    [locale, uiFontScale, uiTextDirection, viewportWidth],
  );
  const messages = getDevErrorAggregationPanelMessages(locale);
  const [entries, setEntries] = useState<ErrorAggregationEntry[]>(() => getStructuredErrorAggregation());

  useEffect(() => {
    const refresh = () => setEntries(getStructuredErrorAggregation());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (entries.length === 0) return null;

  const panelStyle = {
    '--dev-error-panel-min-width': `${panelMinWidth}px`,
    '--dev-error-panel-max-width': `${panelMaxWidth}px`,
    '--dev-error-panel-font-size': `${Math.max(11, Math.round(12 * uiFontScale))}px`,
  } as CSSProperties;

  return (
    <details
      className="dev-error-aggregation-panel"
      dir={uiTextDirection}
      style={panelStyle}
    >
      <summary className="dev-error-aggregation-panel-summary">
        {messages.summary(entries.length)}
      </summary>
      <div className="dev-error-aggregation-panel-list">
        {entries.slice(0, 20).map((entry) => (
          <div key={`${entry.category}:${entry.action}:${entry.i18nKey ?? ''}:${entry.recoverable}`}>
            <strong>{entry.count}x</strong>
            {' '}
            {formatEntryLabel(entry, messages)}
          </div>
        ))}
      </div>
    </details>
  );
}
