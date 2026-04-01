import { useEffect, useState } from 'react';
import {
  getStructuredErrorAggregation,
  type ErrorAggregationEntry,
} from '../observability/errorAggregation';

function formatEntryLabel(entry: ErrorAggregationEntry): string {
  const i18n = entry.i18nKey ? ` · ${entry.i18nKey}` : '';
  const recoverable = entry.recoverable ? 'recoverable' : 'fatal';
  return `${entry.category} · ${entry.action}${i18n} · ${recoverable}`;
}

export function DevErrorAggregationPanel() {
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
        minWidth: 320,
        maxWidth: 520,
        maxHeight: 260,
        overflow: 'auto',
        background: 'color-mix(in srgb, var(--surface-overlay) 86%, transparent)',
        color: 'var(--surface-panel)',
        borderRadius: 8,
        border: '1px solid color-mix(in srgb, var(--surface-panel) 16%, transparent)',
        padding: '6px 8px',
        fontSize: 12,
      }}
    >
      <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
        Error Aggregation ({entries.length})
      </summary>
      <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
        {entries.slice(0, 20).map((entry) => (
          <div key={`${entry.category}:${entry.action}:${entry.i18nKey ?? ''}:${entry.recoverable}`}>
            <strong>{entry.count}x</strong>
            {' '}
            {formatEntryLabel(entry)}
          </div>
        ))}
      </div>
    </details>
  );
}
