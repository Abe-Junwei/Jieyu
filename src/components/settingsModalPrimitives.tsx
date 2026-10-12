import type { ReactNode } from 'react';

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
      <div className="settings-section-body">{children}</div>
    </section>
  );
}
