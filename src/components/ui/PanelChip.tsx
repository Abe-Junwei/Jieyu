import type { HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './classNames';

/**
 * 面板徽章/芯片变体 | Panel chip visual variant
 */
export type PanelChipVariant = 'default' | 'warning' | 'danger' | 'success';

interface PanelChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: PanelChipVariant;
  children: ReactNode;
}

/**
 * 面板徽章组件 | Panel chip / badge component
 *
 * 自动拼接 panel-chip / panel-chip--{variant} 类名。
 * Automatically composes panel-chip CSS classes from variant prop.
 */
export function PanelChip({
  variant = 'default',
  className,
  children,
  ...rest
}: PanelChipProps) {
  return (
    <span
      className={joinClassNames(
        'panel-chip',
        variant !== 'default' && `panel-chip--${variant}`,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
