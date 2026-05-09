import { useState, useEffect } from 'react';
import {
  ExtensionsAuditList,
  ExtensionsItemsTable,
  SettingsSection,
} from '../settingsModalPrimitives';
import type {
  ExtensionCapabilityInvocationRecord,
  ExtensionListItem,
} from '../../extensions/extensionRegistry';
import type { SettingsModalMessages } from '../../i18n/messages';

type ExtensionsPanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      hostVersion: string;
      items: ExtensionListItem[];
      audit: ExtensionCapabilityInvocationRecord[];
    }
  | {
      kind: 'error';
      hostVersion: string;
      message: string;
      items: ExtensionListItem[];
      audit: ExtensionCapabilityInvocationRecord[];
    };

interface SettingsExtensionsTabProps {
  version?: string | undefined;
  msg: SettingsModalMessages;
}

export function SettingsExtensionsTab({ version, msg }: SettingsExtensionsTabProps) {
  const [extensionsPanel, setExtensionsPanel] = useState<ExtensionsPanelState>({ kind: 'idle' });

  useEffect(() => {
    setExtensionsPanel({ kind: 'loading' });
    let cancelled = false;
    const setError = (
      reason: unknown,
      snapshot?: {
        hostVersion: string;
        items: ExtensionListItem[];
        audit: ExtensionCapabilityInvocationRecord[];
      },
    ) => {
      if (cancelled) return;
      const errorText = reason instanceof Error ? reason.message : String(reason);
      setExtensionsPanel({
        kind: 'error',
        hostVersion: snapshot?.hostVersion ?? version ?? '—',
        message: errorText,
        items: snapshot?.items ?? [],
        audit: snapshot?.audit ?? [],
      });
    };
    void import('../../extensions/extensionRegistrySingleton')
      .then(async (mod) => {
        try {
          await mod.ensureBuiltinExtensionsLoaded();
          if (cancelled) return;
          const reg = mod.getExtensionRegistry();
          setExtensionsPanel({
            kind: 'ready',
            hostVersion: reg.getHostVersion(),
            items: reg.list(),
            audit: reg.getCapabilityAuditTail(12),
          });
        } catch (error) {
          const reg = mod.getExtensionRegistry();
          setError(error, {
            hostVersion: reg.getHostVersion(),
            items: reg.list(),
            audit: reg.getCapabilityAuditTail(12),
          });
        }
      })
      .catch((error) => {
        setError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <div className="settings-sections-stack">
      <SettingsSection title={msg.extensionsHostTitle}>
        <div className="settings-about-row">
          <strong>{msg.extensionsHostVersionLabel}</strong>
          <span>
            {extensionsPanel.kind === 'ready' || extensionsPanel.kind === 'error'
              ? extensionsPanel.hostVersion
              : (version ?? '—')}
          </span>
        </div>
        <p className="small-text settings-icon-effect-hint">{msg.extensionsBlurb}</p>
      </SettingsSection>

      <SettingsSection title={msg.tabExtensions}>
        {extensionsPanel.kind === 'loading' ? (
          <p className="small-text">{msg.extensionsLoading}</p>
        ) : extensionsPanel.kind === 'error' ? (
          <>
            <p className="small-text">
              {msg.extensionsLoadFailed}
              {extensionsPanel.message ? `: ${extensionsPanel.message}` : ''}
            </p>
            {extensionsPanel.items.length === 0 ? (
              <p className="small-text">{msg.extensionsNone}</p>
            ) : (
              <ExtensionsItemsTable items={extensionsPanel.items} msg={msg} />
            )}
          </>
        ) : extensionsPanel.kind === 'ready' && extensionsPanel.items.length === 0 ? (
          <p className="small-text">{msg.extensionsNone}</p>
        ) : extensionsPanel.kind === 'ready' ? (
          <ExtensionsItemsTable items={extensionsPanel.items} msg={msg} />
        ) : (
          <p className="small-text">{msg.extensionsLoading}</p>
        )}
      </SettingsSection>

      <SettingsSection title={msg.extensionsAuditTitle}>
        {extensionsPanel.kind === 'error' ? (
          <>
            <p className="small-text">
              {msg.extensionsLoadFailed}
              {extensionsPanel.message ? `: ${extensionsPanel.message}` : ''}
            </p>
            {extensionsPanel.audit.length === 0 ? (
              <p className="small-text">{msg.extensionsAuditEmpty}</p>
            ) : (
              <ExtensionsAuditList audit={extensionsPanel.audit} msg={msg} />
            )}
          </>
        ) : null}
        {extensionsPanel.kind === 'ready' && extensionsPanel.audit.length === 0 ? (
          <p className="small-text">{msg.extensionsAuditEmpty}</p>
        ) : extensionsPanel.kind === 'ready' ? (
          <ExtensionsAuditList audit={extensionsPanel.audit} msg={msg} />
        ) : (
          <p className="small-text">{msg.extensionsAuditEmpty}</p>
        )}
      </SettingsSection>
    </div>
  );
}
