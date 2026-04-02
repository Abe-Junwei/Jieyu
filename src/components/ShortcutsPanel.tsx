/**
 * Keyboard shortcuts reference panel.
 */
import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_KEYBINDINGS, formatKeyComboForDisplay } from '../services/KeybindingService';
import { useOptionalLocale } from '../i18n';
import { getShortcutsPanelMessages } from '../i18n/shortcutsPanelMessages';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';

interface ShortcutsPanelProps {
  onClose: () => void;
}

const CATEGORY_ORDER = ['playback', 'editing', 'navigation', 'view', 'voice'] as const;

export function ShortcutsPanel({ onClose }: ShortcutsPanelProps) {
  const locale = useOptionalLocale() ?? 'zh-CN';
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const panelWidth = useMemo(
    () => computeAdaptivePanelWidth({
      baseWidth: 480,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: 'standard',
      minWidth: 340,
      maxWidth: 760,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    }),
    [locale, uiFontScale, uiTextDirection, viewportWidth],
  );
  const messages = getShortcutsPanelMessages(locale);
  const categoryLabels: Record<string, string> = {
    playback: messages.categoryPlayback,
    editing: messages.categoryEditing,
    navigation: messages.categoryNavigation,
    view: messages.categoryView,
    voice: messages.categoryVoice,
  };
  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [onClose]);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: categoryLabels[cat] ?? cat,
    entries: DEFAULT_KEYBINDINGS.filter((b) => b.category === cat),
  })).filter((g) => g.entries.length > 0);

  return (
    <div
      className="dialog-overlay dialog-overlay-topmost"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
      dir={uiTextDirection}
    >
      <div
        className="shortcuts-panel dialog-card"
        role="dialog"
        aria-modal="true"
        aria-label={messages.panelAriaLabel}
        dir={uiTextDirection}
        style={{ width: `min(${panelWidth}px, 92vw)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-panel-header dialog-header">
          <h3 className="shortcuts-panel-title">{messages.panelTitle}</h3>
          <button
            type="button"
            className="shortcuts-panel-close icon-btn"
            onClick={onClose}
            aria-label={messages.closePanelAriaLabel}
          >
            <X size={16} />
          </button>
        </div>
        <div className="shortcuts-panel-body dialog-body">
          {grouped.map(({ cat, label, entries }) => (
            <div key={cat} className="shortcuts-panel-group">
              <div className="shortcuts-panel-group-label">{label}</div>
              <table className="shortcuts-panel-table">
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="shortcuts-panel-key">
                        <kbd>{formatKeyComboForDisplay(entry.defaultKey)}</kbd>
                      </td>
                      <td className="shortcuts-panel-desc">{entry.label}</td>
                      <td className="shortcuts-panel-scope">
                        {entry.scope === 'waveform' ? messages.scopeWaveform : messages.scopeGlobal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
