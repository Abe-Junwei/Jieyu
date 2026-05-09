import { useState, useEffect, useRef } from 'react';
import { SettingsSection } from '../settingsModalPrimitives';
import {
  DEFAULT_KEYBINDINGS,
  formatKeyComboForDisplay,
  loadUserOverrides,
  saveUserOverride,
  removeUserOverride,
  resetUserOverrides,
  type KeyCombo,
} from '../../services/KeybindingService';
import { keyEventToCombo } from './settingsHelpers';
import { SHORTCUT_CATEGORY_ORDER } from './settingsConstants';
import type { SettingsModalMessages, ShortcutsPanelMessages } from '../../i18n/messages';
import type { Locale } from '../../i18n';

interface SettingsShortcutsTabProps {
  locale: Locale;
  msg: SettingsModalMessages;
  shortcutsMsg: ShortcutsPanelMessages;
}

export function SettingsShortcutsTab({
  locale: _locale,
  msg,
  shortcutsMsg,
}: SettingsShortcutsTabProps) {
  const [editingKeybindingId, setEditingKeybindingId] = useState<string | null>(null);
  const [userOverrides, setUserOverrides] = useState<Map<string, KeyCombo>>(() =>
    loadUserOverrides(),
  );
  const editingIdRef = useRef(editingKeybindingId);
  editingIdRef.current = editingKeybindingId;

  useEffect(() => {
    if (!editingKeybindingId) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setEditingKeybindingId(null);
        return;
      }
      const combo = keyEventToCombo(e);
      if (!combo || !editingIdRef.current) return;
      saveUserOverride(editingIdRef.current, combo);
      setUserOverrides(loadUserOverrides());
      setEditingKeybindingId(null);
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [editingKeybindingId]);

  useEffect(() => {
    return () => {
      if (editingKeybindingId) {
        setEditingKeybindingId(null);
      }
    };
  }, [editingKeybindingId]);

  const handleResetKeybinding = (id: string) => {
    removeUserOverride(id);
    setUserOverrides(loadUserOverrides());
  };

  const handleResetAllKeybindings = () => {
    resetUserOverrides();
    setUserOverrides(new Map());
  };

  const shortcutCategoryLabels: Record<string, string> = {
    playback: shortcutsMsg.categoryPlayback,
    editing: shortcutsMsg.categoryEditing,
    navigation: shortcutsMsg.categoryNavigation,
    view: shortcutsMsg.categoryView,
    voice: shortcutsMsg.categoryVoice,
  };

  const shortcutGroups = SHORTCUT_CATEGORY_ORDER.map((cat) => ({
    cat,
    label: shortcutCategoryLabels[cat] ?? cat,
    entries: DEFAULT_KEYBINDINGS.filter((b) => b.category === cat),
  })).filter((g) => g.entries.length > 0);

  const hasAnyOverride = userOverrides.size > 0;

  return (
    <div className="settings-sections-stack">
      {hasAnyOverride && (
        <div className="settings-shortcuts-toolbar">
          <button type="button" className="settings-link-btn" onClick={handleResetAllKeybindings}>
            {msg.shortcutResetAll}
          </button>
        </div>
      )}
      {shortcutGroups.map(({ cat, label, entries }) => (
        <SettingsSection key={cat} title={label}>
          <table className="shortcuts-panel-table">
            <tbody>
              {entries.map((entry) => {
                const effective = userOverrides.get(entry.id) ?? entry.defaultKey;
                const isOverridden = userOverrides.has(entry.id);
                const isEditing = editingKeybindingId === entry.id;
                return (
                  <tr key={entry.id} className={isEditing ? 'shortcuts-row-editing' : ''}>
                    <td className="shortcuts-panel-key">
                      {isEditing ? (
                        <span className="shortcuts-recording-indicator">
                          {msg.shortcutRecording}
                          <span className="shortcuts-esc-hint">{msg.shortcutEscCancel}</span>
                        </span>
                      ) : (
                        <kbd
                          className={`shortcuts-kbd-editable${isOverridden ? ' shortcuts-kbd-customized' : ''}`}
                          role="button"
                          tabIndex={0}
                          title={msg.shortcutClickToEdit}
                          onClick={() => setEditingKeybindingId(entry.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setEditingKeybindingId(entry.id);
                          }}
                        >
                          {formatKeyComboForDisplay(effective)}
                        </kbd>
                      )}
                    </td>
                    <td className="shortcuts-panel-desc">
                      {entry.label}
                      {isOverridden && !isEditing && (
                        <span className="shortcuts-customized-badge">{msg.shortcutCustomized}</span>
                      )}
                    </td>
                    <td className="shortcuts-panel-scope">
                      {isOverridden && !isEditing ? (
                        <button
                          type="button"
                          className="settings-link-btn settings-link-btn-sm"
                          onClick={() => handleResetKeybinding(entry.id)}
                        >
                          {msg.shortcutReset}
                        </button>
                      ) : entry.scope === 'waveform' ? (
                        shortcutsMsg.scopeWaveform
                      ) : (
                        shortcutsMsg.scopeGlobal
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SettingsSection>
      ))}
    </div>
  );
}
