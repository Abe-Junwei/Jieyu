import type { HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './classNames';

/**
 * 面板提示/备注变体 | Panel note visual variant
 */
export type PanelNoteVariant = 'default' | 'danger';

interface PanelNoteProps extends HTMLAttributes<HTMLParagraphElement> {
  variant?: PanelNoteVariant;
  children: ReactNode;
}

/**
 * 面板提示/备注组件 | Panel note / callout component
 *
 * 自动拼接 panel-note / panel-note--{variant} 类名。
 * Automatically composes panel-note CSS classes from variant prop.
 */
export function PanelNote({
  variant = 'default',
  className,
  children,
  ...rest
}: PanelNoteProps) {
  return (
    <p
      className={joinClassNames(
        'panel-note',
        variant !== 'default' && `panel-note--${variant}`,
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
}
