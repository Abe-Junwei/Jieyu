import { useEffect, useMemo, useState } from 'react';
import {
  getStructuredErrorAggregation,
  type ErrorAggregationEntry,
} from '../observability/errorAggregation';
import { useLocale } from '../i18n';
import { getDevErrorAggregationPanelMessages, type DevErrorAggregationPanelMessages } from '../i18n/devErrorAggregationPanelMessages';
import {
  computeAdaptivePanelWidth,
  readPersistedUiFontScale,
  resolveTextDirectionFromLocale,
} from '../utils/panelAdaptiveLayout';

function formatEntryLabel(entry: ErrorAggregationEntry, messages: DevErrorAggregationPanelMessages): string {
  const severity = entry.recoverable ? messages.recoverable : messages.fatal;
  return messages.entryLabel(entry.category, entry.action, entry.i18nKey ?? null, severity);
}

export function DevErrorAggregationPanel() {
  const locale = useLocale();
  const uiTextDirection = useMemo(() => resolveTextDirectionFromLocale(locale), [locale]);
  const uiFontScale = readPersistedUiFontScale(locale, uiTextDirection);
  const panelMinWidth = useMemo(
    () => computeAdaptivePanelWidth({
      baseWidth: 320,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: 'compact',
      minWidth: 280,
      maxWidth: 480,
      ...(typeof window !== 'undefined' ? { viewportWidth: window.innerWidth } : {}),
    }),
    [locale, uiFontScale, uiTextDirection],
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
      ...(typeof window !== 'undefined' ? { viewportWidth: window.innerWidth } : {}),
    }),
    [locale, uiFontScale, uiTextDirection],
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

  return (
    <details
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 2000,
        minWidth: panelMinWidth,
        maxWidth: panelMaxWidth,
        maxHeight: 260,
        overflow: 'auto',
        background: 'color-mix(in srgb, var(--surface-overlay) 86%, transparent)',
        color: 'var(--surface-panel)',
        borderRadius: 8,
        border: '1px solid color-mix(in srgb, var(--surface-panel) 16%, transparent)',
        padding: '6px 8px',
        fontSize: Math.max(11, Math.round(12 * uiFontScale)),
      }}
    >
      <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
        {messages.summary(entries.length)}
      </summary>
      <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
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
