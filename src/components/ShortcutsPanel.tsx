/**
 * Keyboard shortcuts reference panel.
 */
import { useMemo } from 'react';
import { DEFAULT_KEYBINDINGS, formatKeyComboForDisplay } from '../services/KeybindingService';
import { useOptionalLocale } from '../i18n';
import { getShortcutsPanelMessages } from '../i18n/shortcutsPanelMessages';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { ModalPanel, PanelSection } from './ui';

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

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: categoryLabels[cat] ?? cat,
    entries: DEFAULT_KEYBINDINGS.filter((b) => b.category === cat),
  })).filter((g) => g.entries.length > 0);

  return (
    <ModalPanel
      isOpen
      onClose={onClose}
      topmost
      dir={uiTextDirection}
      className="shortcuts-panel panel-design-match panel-design-match-dialog"
      ariaLabel={messages.panelAriaLabel}
      title={messages.panelTitle}
      headerClassName="shortcuts-panel-header"
      bodyClassName="shortcuts-panel-body"
      titleClassName="shortcuts-panel-title"
      closeLabel={messages.closePanelAriaLabel}
      style={{ width: `min(${panelWidth}px, 92vw)` }}
    >
          {grouped.map(({ cat, label, entries }) => (
            <PanelSection key={cat} className="shortcuts-panel-group" title={label}>
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
            </PanelSection>
          ))}
    </ModalPanel>
  );
}
