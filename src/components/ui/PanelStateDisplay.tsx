import type { HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './classNames';

/**
 * 面板状态类型 | Panel state display variant
 */
export type PanelStateVariant = 'empty' | 'loading' | 'error';

interface PanelStateDisplayProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 状态类型 | State variant */
  variant: PanelStateVariant;
  /** 标题 | Title (optional) */
  title?: ReactNode;
  /** 说明文案 | Description text */
  description?: ReactNode;
  /** 操作按钮区 | Action slot (e.g. retry button) */
  action?: ReactNode;
  children?: ReactNode;
}

/**
 * 面板状态展示 | Panel state display
 *
 * 统一空态 / 加载态 / 错误态的展示结构，
 * 替代各面板自行实现的 *-empty-state / hint / error 模式。
 *
 * Unified empty / loading / error state display,
 * replacing custom *-empty-state / hint / error patterns across panels.
 */
export function PanelStateDisplay({
  variant,
  title,
  description,
  action,
  className,
  children,
  ...rest
}: PanelStateDisplayProps) {
  return (
    <div
      className={joinClassNames(
        'panel-state-display',
        `panel-state-display--${variant}`,
        className,
      )}
      role={variant === 'error' ? 'alert' : 'status'}
      {...rest}
    >
      {title != null && <strong className="panel-state-display-title">{title}</strong>}
      {description != null && <p className="panel-state-display-desc">{description}</p>}
      {children}
      {action != null && <div className="panel-state-display-action">{action}</div>}
    </div>
  );
}
