import type { ReactNode } from 'react';
import type { ExtensionCapabilityInvocationRecord, ExtensionListItem } from '../extensions/extensionRegistry';

export type SettingsModalMessagesLike = {
  tabExtensions: string;
  extensionsColExtension: string;
  extensionsColVersion: string;
  extensionsColState: string;
  extensionsColCapabilities: string;
  extensionsColCompatible: string;
  extensionsColCompatNote: string;
  extensionsColEntry: string;
  extensionsYes: string;
  extensionsNo: string;
};

export function SettingsTabBar<T extends string>({
  activeTab,
  onTabChange,
  tabs,
}: {
  activeTab: T;
  onTabChange: (tab: T) => void;
  tabs: { id: T; label: string }[];
}) {
  return (
    <div className="settings-tab-bar panel-edge-nav" role="tablist" aria-orientation="vertical">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <div
            key={tab.id}
            className={`panel-edge-nav-row${isActive ? ' panel-edge-nav-row-active' : ''}`}
          >
            <button
              type="button"
              role="tab"
              className="settings-tab-btn panel-edge-nav-btn"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="panel-edge-nav-label">
                <strong className="panel-edge-nav-title">{tab.label}</strong>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{label}</span>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function OptionGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-option-group" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="settings-option-btn"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsSection({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`settings-section${className ? ` ${className}` : ''}`} aria-label={title}>
      <div className="settings-section-rail" aria-hidden="true">
        <span className="settings-section-title panel-title-eyebrow">
          <span className="settings-section-title-text">{title}</span>
        </span>
      </div>
      <div className="settings-section-body">
        {children}
      </div>
    </section>
  );
}

export function ExtensionsItemsTable({
  items,
  msg,
}: {
  items: ExtensionListItem[];
  msg: SettingsModalMessagesLike;
}) {
  return (
    <table className="shortcuts-panel-table" aria-label={msg.tabExtensions}>
      <thead>
        <tr>
          <th scope="col">{msg.extensionsColExtension}</th>
          <th scope="col">{msg.extensionsColVersion}</th>
          <th scope="col">{msg.extensionsColState}</th>
          <th scope="col">{msg.extensionsColCapabilities}</th>
          <th scope="col">{msg.extensionsColCompatible}</th>
          <th scope="col">{msg.extensionsColCompatNote}</th>
          <th scope="col">{msg.extensionsColEntry}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr key={row.id}>
            <td>
              <span className="settings-data-value">{row.name}</span>
              <div className="small-text">{row.id}</div>
            </td>
            <td>{row.version}</td>
            <td><code>{row.state}</code></td>
            <td>{row.capabilities.join(', ')}</td>
            <td>{row.compatible ? msg.extensionsYes : msg.extensionsNo}</td>
            <td className="small-text">{row.compatibilityReason}</td>
            <td className="small-text"><code>{row.entryActivate}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ExtensionsAuditList({
  audit,
  msg,
}: {
  audit: ExtensionCapabilityInvocationRecord[];
  msg: SettingsModalMessagesLike;
}) {
  return (
    <ul className="small-text settings-modal-list">
      {audit.map((entry, idx) => (
        <li key={`${entry.at}-${idx}`} className="small-text">
          <code>{entry.extensionId}</code>
          {' · '}
          <code>{entry.capability}</code>
          {' · '}
          {entry.ok ? msg.extensionsYes : msg.extensionsNo}
          {' · '}
          {entry.durationMs}
          ms
          {entry.errorMessage ? ` — ${entry.errorMessage}` : ''}
        </li>
      ))}
    </ul>
  );
}