import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './classNames';

/**
 * 面板按钮变体 | Panel button visual variant
 */
export type PanelButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'success';

/**
 * 面板按钮尺寸 | Panel button size
 */
export type PanelButtonSize = 'default' | 'sm' | 'compact';

interface PanelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PanelButtonVariant;
  size?: PanelButtonSize;
  children: ReactNode;
}

/**
 * 面板按钮组件 | Panel button component
 *
 * 自动拼接 panel-button / panel-button--{variant} / panel-button--{size} 类名，
 * 替代手动字符串拼接。
 *
 * Automatically composes panel-button CSS classes from variant and size props,
 * replacing manual string concatenation in consumer files.
 */
export function PanelButton({
  variant = 'default',
  size = 'default',
  className,
  children,
  ...rest
}: PanelButtonProps) {
  return (
    <button
      type="button"
      className={joinClassNames(
        'panel-button',
        variant !== 'default' && `panel-button--${variant}`,
        size !== 'default' && `panel-button--${size}`,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
