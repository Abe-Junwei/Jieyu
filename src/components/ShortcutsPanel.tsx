/**
 * Keyboard shortcuts reference panel.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_KEYBINDINGS, formatKeyComboForDisplay } from '../services/KeybindingService';

interface ShortcutsPanelProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  playback: '\u64ad\u653e\u63a7\u5236 | Playback',
  editing: '\u7f16\u8f91\u64cd\u4f5c | Editing',
  navigation: '\u5bfc\u822a | Navigation',
  view: '\u89c6\u56fe | View',
  voice: '\u8bed\u97f3\u667a\u80fd\u4f53 | Voice Agent',
};

const CATEGORY_ORDER = ['playback', 'editing', 'navigation', 'view', 'voice'] as const;

export function ShortcutsPanel({ onClose }: ShortcutsPanelProps) {
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
    label: CATEGORY_LABELS[cat] ?? cat,
    entries: DEFAULT_KEYBINDINGS.filter((b) => b.category === cat),
  })).filter((g) => g.entries.length > 0);

  return (
    <div
      className="shortcuts-panel-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={'\u952e\u76d8\u5feb\u6377\u952e'}
    >
      <div className="shortcuts-panel">
        <div className="shortcuts-panel-header">
          <span className="shortcuts-panel-title">{'\u2328 \u952e\u76d8\u5feb\u6377\u952e'}</span>
          <button
            type="button"
            className="shortcuts-panel-close icon-btn"
            onClick={onClose}
            aria-label={'\u5173\u95ed\u5feb\u6377\u952e\u9762\u677f'}
          >
            <X size={16} />
          </button>
        </div>
        <div className="shortcuts-panel-body">
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
                        {entry.scope === 'waveform' ? '\u6ce2\u5f62\u533a' : '\u5168\u5c40'}
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
