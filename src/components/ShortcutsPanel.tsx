/**
 * 键盘快捷键速查面板 | Keyboard shortcuts reference panel
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_KEYBINDINGS, formatKeyComboForDisplay } from '../services/KeybindingService';

interface ShortcutsPanelProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  playback: '播放控制 | Playback',
  editing: '编辑操作 | Editing',
  navigation: '导航 | Navigation',
  view: '视图 | View',
  voice: '语音智能体 | Voice Agent',
};

const CATEGORY_ORDER = ['playback', 'editing', 'navigation', 'view', 'voice'] as const;

export function ShortcutsPanel({ onClose }: ShortcutsPanelProps) {
  // ESC 关闭 | Close on Escape
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
      aria-label="键盘快捷键"
    >
      <div className="shortcuts-panel">
        <div className="shortcuts-panel-header">
          <span className="shortcuts-panel-title">⌨ 键盘快捷键</span>
          <button
            type="button"
            className="shortcuts-panel-close icon-btn"
            onClick={onClose}
            aria-label="关闭快捷键面板"
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
                        {entry.scope === 'waveform' ? '波形区' : '全局'}
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
