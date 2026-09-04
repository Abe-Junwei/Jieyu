import { useCallback, useEffect, useState } from 'react';
import { OptionGroup, SettingRow, SettingsSection } from '../settingsModalPrimitives';
import type { SettingsModalMessages } from '../../i18n/messages';
import type { ExternalMcpTrustDoc } from '../../db';
import type { ExternalMcpToolSchema } from '../../ai/mcp/client/externalMcpTrustRegistry';
import {
  listExternalMcpTrustEntries,
  setExternalMcpTrustEnabled,
} from '../../ai/mcp/client/externalMcpTrustRegistry';

function parseToolSchemaDraft(
  raw: string,
): { ok: true; tools?: ExternalMcpToolSchema[] } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return { ok: false };
    const tools: ExternalMcpToolSchema[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || !('name' in item) || typeof item.name !== 'string') {
        return { ok: false };
      }
      const description = 'description' in item ? item.description : undefined;
      tools.push({
        name: item.name,
        ...(typeof description === 'string' ? { description } : {}),
      });
    }
    return { ok: true, tools };
  } catch {
    return { ok: false };
  }
}

export function SettingsAiMcpTrustSection({ msg }: { msg: SettingsModalMessages }) {
  const [entries, setEntries] = useState<ExternalMcpTrustDoc[]>([]);
  const [originDraft, setOriginDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [schemaDraft, setSchemaDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setEntries(await listExternalMcpTrustEntries());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleOptions = [
    { value: 'off' as const, label: msg.toggleOff },
    { value: 'on' as const, label: msg.toggleOn },
  ];

  const handleAddEnable = async () => {
    if (busy) return;
    const parsed = parseToolSchemaDraft(schemaDraft);
    if (!parsed.ok) {
      setError(msg.aiMcpTrustSchemaInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await setExternalMcpTrustEnabled({
      origin: originDraft,
      enabled: true,
      ...(labelDraft.trim() ? { label: labelDraft.trim() } : {}),
      ...(parsed.tools ? { tools: parsed.tools } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      if (result.reason === 'invalid_origin') setError(msg.aiMcpTrustInvalidOrigin);
      else if (result.reason === 'schema_blocked') setError(msg.aiMcpTrustSchemaBlocked);
      else setError(msg.aiMcpTrustInvalidOrigin);
      return;
    }
    setOriginDraft('');
    setLabelDraft('');
    setSchemaDraft('');
    await reload();
  };

  const handleToggle = async (origin: string, enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await setExternalMcpTrustEnabled({ origin, enabled });
    setBusy(false);
    if (!result.ok) {
      if (result.reason === 'schema_blocked') setError(msg.aiMcpTrustSchemaBlocked);
      else setError(msg.aiMcpTrustInvalidOrigin);
      return;
    }
    await reload();
  };

  return (
    <SettingsSection title={msg.aiMcpTrustTitle}>
      <div data-testid="settings-ai-mcp-trust">
        <p className="settings-ai-note">{msg.aiMcpTrustHint}</p>
        <SettingRow label={msg.aiMcpTrustOriginLabel}>
          <input
            className="settings-input"
            value={originDraft}
            placeholder={msg.aiMcpTrustOriginPlaceholder}
            onChange={(e) => setOriginDraft(e.currentTarget.value)}
            aria-label={msg.aiMcpTrustOriginLabel}
          />
        </SettingRow>
        <SettingRow label={msg.aiMcpTrustLabelOptional}>
          <input
            className="settings-input"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.currentTarget.value)}
            aria-label={msg.aiMcpTrustLabelOptional}
          />
        </SettingRow>
        <SettingRow label={msg.aiMcpTrustSchemaOptional}>
          <textarea
            className="settings-input"
            rows={3}
            value={schemaDraft}
            onChange={(e) => setSchemaDraft(e.currentTarget.value)}
            aria-label={msg.aiMcpTrustSchemaOptional}
          />
        </SettingRow>
        <div className="settings-inline-row">
          <button
            type="button"
            className="settings-link-btn"
            onClick={() => void handleAddEnable()}
            disabled={busy}
          >
            {msg.aiMcpTrustAddEnableButton}
          </button>
        </div>
        {error ? <p className="settings-ai-note">{error}</p> : null}
        {entries.length === 0 ? (
          <p className="settings-ai-note">{msg.aiMcpTrustEmpty}</p>
        ) : (
          <ul className="small-text settings-modal-list">
            {entries.map((entry) => (
              <li key={entry.id} className="settings-inline-row">
                <span>{entry.label ? `${entry.label} · ${entry.origin}` : entry.origin}</span>
                <OptionGroup
                  value={entry.enabled ? 'on' : 'off'}
                  options={toggleOptions}
                  onChange={(value) => void handleToggle(entry.origin, value === 'on')}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsSection>
  );
}
