import type { HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './classNames';

/**
 * 操作按钮组对齐方式 | Action button group alignment
 */
export type ActionButtonGroupAlign = 'start' | 'end' | 'center' | 'space-between';

interface ActionButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** 对齐方式 | Alignment */
  align?: ActionButtonGroupAlign;
  /** 紧凑间距 | Compact gap */
  compact?: boolean;
  children: ReactNode;
}

/**
 * 操作按钮组 | Action button group
 *
 * 按钮行容器，自动应用 flex 布局 + 间距 + 对齐，
 * 替代各面板自定义的 *-actions / *-action-row / dialog-footer 容器。
 *
 * Flex row container for button groups, replacing custom
 * action-row / dialog-footer patterns across panels.
 */
export function ActionButtonGroup({
  align = 'end',
  compact,
  className,
  children,
  ...rest
}: ActionButtonGroupProps) {
  return (
    <div
      className={joinClassNames(
        'action-button-group',
        `action-button-group--${align}`,
        compact && 'action-button-group--compact',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
